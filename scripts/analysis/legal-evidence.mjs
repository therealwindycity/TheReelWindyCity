#!/usr/bin/env node
/** Automatic evidence collection: candidate connections, not legal determinations. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { extractPdfLayout } from '../lib/pdf-layout.mjs';
import { atomicWrite } from '../lib/atomic.mjs';
import { runIfMain } from '../lib/cli.mjs';
import { safeSource, bodyMatches, dateMatches } from './legal-audit.mjs';

const CACHE = '.sync/legal-evidence-cache.json';
const OUT = 'src/data/legal-evidence-generated.json';
const LOCAL_MINUTES = 'pipeline/notebooklm/cheyenne_minutes_2026.md';
const MAX_BYTES = 20 * 1024 * 1024;

export function minutesSource(meeting) {
  if (safeSource(meeting.official?.minutes)) return meeting.official.minutes;
  const doc = (meeting.docs || []).find(d => /^cheyenne-archives-(?:2025-2026|2023-2024|2022|2018-2021|2014-2017|2008-2013)$/.test(d.repo) && /\.pdf$/i.test(d.path) && /(?:^minutes(?:[_. -]|$)|(?:[_ -]minutes)(?:[_. -]|$))/i.test(path.posix.basename(d.path)));
  return doc ? `https://raw.githubusercontent.com/therealwindycity/${doc.repo}/main/${doc.path.split('/').map(encodeURIComponent).join('/')}` : null;
}

/** Bounded downloads, HTTPS allowlist at every redirect, and no implicit proxy. */
async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    for (let i = 0; i < 5; i++) {
      if (!safeSource(url)) throw new Error('Minutes URL is outside the allowed source hosts');
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'CivicCheyenne-SyncBot/1.0', accept: 'application/pdf,text/html;q=0.9' } });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { url = new URL(response.headers.get('location'), url).toString(); continue; }
      if (!response.ok) throw new Error(`Minutes HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Minutes exceed size limit');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Minutes response has no body');
      const chunks = []; let size = 0;
      while (true) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Minutes exceed size limit'); } chunks.push(value); }
      return { url, bytes: Buffer.concat(chunks) };
    }
    throw new Error('Too many minutes redirects');
  } finally { clearTimeout(timer); }
}

export async function fetchMinutes(meeting) {
  const source = minutesSource(meeting);
  if (!source) throw new Error('No indexed minutes source');
  let {url, bytes} = await download(source);
  if (bytes.subarray(0,5).toString('latin1') !== '%PDF-') {
    const html = bytes.toString('utf8');
    const doc = parse(html);
    const raw = doc.querySelector('iframe[src], embed[src], object[data], a[href$=".pdf" i]');
    const link = raw?.getAttribute('src') || raw?.getAttribute('data') || raw?.getAttribute('href');
    if (link && safeSource(new URL(link, url).toString())) ({url, bytes} = await download(new URL(link, url).toString()));
    else {
      doc.querySelectorAll('script,style,noscript').forEach(n=>n.remove());
      const text = doc.text.replace(/\s+/g, ' ');
      if (!dateMatches(text, meeting.date) || !bodyMatches(text, meeting.body) || text.length < 300) throw new Error('Minutes HTML identity or content could not be verified');
      return { requestedUrl:source, sourceUrl:url, sourceSha256:createHash('sha256').update(bytes).digest('hex'), fetchedAt:new Date().toISOString(), text };
    }
  }
  if (bytes.subarray(0,5).toString('latin1') !== '%PDF-') throw new Error('Minutes is not a readable PDF');
  const layout = await extractPdfLayout(new Uint8Array(bytes));
  if (!dateMatches(layout.text, meeting.date) || !bodyMatches(layout.text, meeting.body)) throw new Error('Minutes date or governing body could not be verified');
  return { requestedUrl:source, sourceUrl:url, sourceSha256:createHash('sha256').update(bytes).digest('hex'), fetchedAt:new Date().toISOString(), text:layout.text };
}

/** Cached transcriptions retain exact clip/date identity and links to the publisher. */
export function bundledMinutes(meetings, text) {
  const result = {};
  const pattern = /^MEETING:.*?\| DATE: (\d{4}-\d\d-\d\d) \| CLIP_ID: (\d+).*$/gm;
  const markers = [...text.matchAll(pattern)];
  for (const [index, match] of markers.entries()) {
    const id = `city-council-${match[1]}`;
    const m = meetings.find(x => x.id === id && x.official?.minutes && new URL(x.official.minutes).searchParams.get('clip_id') === match[2]);
    if (!m) continue;
    const content = text.slice(match.index + match[0].length, markers[index+1]?.index ?? text.length).trim();
    if (!dateMatches(content,m.date) || !bodyMatches(content,m.body)) continue;
    result[id] = { requestedUrl:m.official.minutes, sourceUrl:m.official.minutes, fetchedAt:null, text:content, transcription:'Bundled machine-extracted minutes; compare with the official PDF.' };
  }
  return result;
}
export function candidates(meetings, cache, limit) {
  return meetings.filter(m => minutesSource(m)).sort((a,b) => (cache[a.id]?.lastAttempt || '').localeCompare(cache[b.id]?.lastAttempt || '') || b.date.localeCompare(a.date)).slice(0,limit);
}
export async function refreshEvidence(meetings, cache, {limit=12, concurrency=3, get=fetchMinutes, now=()=>new Date().toISOString()}={}) {
  const list = candidates(meetings,cache,limit); let index=0;
  await Promise.all(Array.from({length:Math.min(list.length,concurrency)}, async()=>{
    for (;;) {
      const m = list[index++]; if (!m) return;
      const old = cache[m.id]?.requestedUrl === minutesSource(m) ? cache[m.id] : {};
      try {
        const data = await get(m);
        if (!data.text || data.text.length < 300 || data.requestedUrl !== minutesSource(m)) throw new Error('Minutes extraction incomplete');
        cache[m.id] = {...data,lastAttempt:now(),lastError:null};
        console.log(`Legal evidence ${m.id}: minutes captured`);
      } catch (error) {
        cache[m.id] = {...old,requestedUrl:minutesSource(m),lastAttempt:now(),lastError:String(error?.message || error).slice(0,300)};
        console.warn(`Legal evidence ${m.id}: ${cache[m.id].lastError}`);
      }
    }
  }));
}

function words(s) { return s.toLowerCase().replace(/[\u2010-\u2015-]/g,' ').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean); }
function itemSubject(text) {
  return String(text).replace(/^\s*(?:\[CA\]\s*)?ORDINANCE\s*[–—-]\s*[123]\s*(?:st|nd|rd)\s*READING\s*[–—-]\s*/i,'').replace(/\s*\((?:SPONSORS?|PUBLIC SERVICES COMMITTEE|FINANCE COMMITTEE)[\s\S]*$/i,'');
}
/** Identify distinct ordinance blocks rather than using an unrelated vote elsewhere in minutes. */
export function ordinanceBlocks(text) {
  const pattern = /\bORDINANCE\s*[–—-]\s*([123])\s*(?:st|nd|rd)\s*READING\s*[–—-]\s*/gi;
  const markers = [...text.matchAll(pattern)];
  return markers.map((m,i)=>{
    const slice=text.slice(m.index,markers[i+1]?.index ?? text.length);
    // Other kinds of agenda business cannot supply a vote for this ordinance.
    const boundary=/\n\s*(?:\[CA\]\s*)?(?:RESOLUTION|LEASES\/CONTRACTS|CONTRACT MODIFICATIONS|CONSIDERATION OF BIDS|ANNOUNCEMENTS\/REPORTS|OTHER BUSINESS)\s*[:–—-]/i.exec(slice);
    return { reading:Number(m[1]), text:(boundary ? slice.slice(0,boundary.index) : slice).trim() };
  });
}
export function matchMeasure(itemText, blocks) {
  const tokens=words(itemSubject(itemText));
  if (tokens.length < 12) return null;
  const matches=[];
  for (const block of blocks) {
    // Stop at the first motion: discussion and other items must not inflate similarity.
    const heading=block.text.split(/\b(?:moved|moves)\s+to\s+(?:approve|postpone|amend|refer|table)/i)[0];
    const body=words(itemSubject(heading));
    let i=0; for (const token of body) if (tokens[i]===token) i++;
    const score=i/tokens.length;
    if (score>=0.94 && i>=12) matches.push({...block, score});
  }
  matches.sort((a,b)=>b.score-a.score);
  if (!matches.length || (matches[1] && matches[1].score>=matches[0].score-0.02)) return null;
  return matches[0];
}
export function actionEvidence(block) {
  const compact=block.text.replace(/\s+/g,' ').trim();
  const motion=/\bmoved to approve on (first|second|third)(?: and final)?\s+reading\b/i.exec(compact);
  const expected = ['first','second','third'][block.reading - 1];
  if (!motion || motion[1].toLowerCase() !== expected) return { outcome:'not established', excerpt:compact.slice(0,900) };
  const after=compact.slice(motion.index);
  const main=/\bmain motion(?:\s+as amend\s*ed(?:\s+by substitute)?(?:,?\s+as amend\s*ed)?)?,?\s+carried\b/i.exec(after);
  if (main) return {outcome:'main approval motion recorded as carried', excerpt:compact.slice(Math.max(0,motion.index+main.index-180),Math.min(compact.length,motion.index+main.index+main[0].length+300))};
  const simple=/\bmotion carried\b/i.exec(after);
  if (simple && !/\b(?:postpone|amend|substitute|refer|table|reconsider)\b/i.test(after.slice(0,simple.index))) return {outcome:'approval motion recorded as carried', excerpt:compact.slice(Math.max(0,motion.index-70),Math.min(compact.length,motion.index+simple.index+simple[0].length+250)).slice(0,1200)};
  return {outcome:'not established', excerpt:compact.slice(0,900)};
}
/** Same-meeting exact phrase discovery for non-ordinance business; never infer a vote. */
export function matchSameMeeting(item, text) {
  const subject=String(item.text || '').replace(/^\s*(?:\[CA\]\s*)?(?:RESOLUTION|CONTRACT|AGREEMENT)\s*[–—-]\s*/i,'').replace(/\s*\((?:SPONSORS?|PUBLIC SERVICES COMMITTEE|FINANCE COMMITTEE)[\s\S]*$/i,'');
  const tokens=words(subject);
  if (tokens.length<12) return null;
  const phrase=tokens.slice(0,Math.min(tokens.length,24)).join(' ');
  if (phrase.length<60) return null;
  const matches=[...text.matchAll(/[a-z0-9]+/gi)];
  const haystack=matches.map(x=>x[0].toLowerCase());
  const needle=phrase.split(' '); const found=[];
  for (let i=0; i<=haystack.length-needle.length; i++) {
    if (needle.every((w,j)=>haystack[i+j]===w)) found.push(i);
  }
  if (found.length!==1) return null;
  const offset=matches[found[0]].index;
  return text.slice(Math.max(0,offset-80),Math.min(text.length,offset+750)).replace(/\s+/g,' ').trim();
}
export function buildEvidence(meetings, agendas, minutes) {
  const result={};
  const sources=meetings.filter(m=>minutes[m.id]?.text).map(m=>({meeting:m,record:minutes[m.id],blocks:ordinanceBlocks(minutes[m.id].text)}));
  for (const meeting of meetings) {
    const items = agendas.meetings[meeting.id]?.items ?? meeting.items ?? [];
    const output={};
    for (const item of items) {
      const ordinance=meeting.body === 'city-council' && (/^ordinance\b/i.test(item.kind || '') || /^(?:\[CA\]\s*)?ordinance\b/i.test(item.text || '')); 
      const evidence=[];
      for (const source of sources) {
        if (source.meeting.body !== meeting.body || Math.abs(Date.parse(source.meeting.date)-Date.parse(meeting.date))>180*86400000) continue;
        if (!ordinance) {
          if (source.meeting.id !== meeting.id) continue;
          const excerpt=matchSameMeeting(item,source.record.text);
          if (excerpt) evidence.push({date:source.meeting.date,reading:null,outcome:'text mention only; action not established',excerpt,url:source.record.sourceUrl,transcription:[source.record.transcription, source.record.fetchedAt ? `Minutes captured ${source.record.fetchedAt}.` : null, source.record.lastError ? `Latest refresh failed ${source.record.lastAttempt}: ${source.record.lastError}` : null].filter(Boolean).join(' ') || null});
          continue;
        }
        const match=matchMeasure(item.text,source.blocks);
        if (!match) continue;
        const action=actionEvidence(match);
        evidence.push({date:source.meeting.date,reading:match.reading,outcome:action.outcome,excerpt:action.excerpt,url:source.record.sourceUrl,transcription:[source.record.transcription, source.record.fetchedAt ? `Minutes captured ${source.record.fetchedAt}.` : null, source.record.lastError ? `Latest refresh failed ${source.record.lastAttempt}: ${source.record.lastError}` : null].filter(Boolean).join(' ') || null});
      }
      if (evidence.length) output[String(item.number)]={itemText:item.text,evidence:evidence.sort((a,b)=>a.date.localeCompare(b.date))};
    }
    if (Object.keys(output).length) result[meeting.id]=output;
  }
  const sourceStatus={};
  for (const m of meetings) {
    const rec=minutes[m.id];
    sourceStatus[m.id] = { sourceUrl:rec?.sourceUrl ?? minutesSource(m), fetchedAt:rec?.fetchedAt ?? null, lastAttempt:rec?.lastAttempt ?? null, lastError:rec?.lastError ?? null, available:Boolean(rec?.text) };
  }
  return {version:1,meetings:result,sources:sourceStatus};
}
async function main() {
  const meetings=JSON.parse(readFileSync('src/data/meetings.json','utf8')).meetings;
  const agendas=JSON.parse(readFileSync('src/data/legal-audit-generated.json','utf8'));
  let cache={};
  if (existsSync(CACHE)) cache=JSON.parse(readFileSync(CACHE,'utf8'));
  if (process.argv.includes('--refresh')) { await refreshEvidence(meetings,cache); atomicWrite(CACHE,JSON.stringify(cache)); }
  const local=existsSync(LOCAL_MINUTES) ? bundledMinutes(meetings,readFileSync(LOCAL_MINUTES,'utf8')) : {};
  const merged={...local};
  for (const meeting of meetings) {
    const item=cache[meeting.id];
    if (item?.requestedUrl!==minutesSource(meeting)) continue;
    if (item.text) merged[meeting.id]=item;
    else if (merged[meeting.id]) merged[meeting.id]={...merged[meeting.id], lastAttempt:item.lastAttempt, lastError:item.lastError};
    else merged[meeting.id]=item;
  }
  const output=buildEvidence(meetings,agendas,merged);
  atomicWrite(OUT,JSON.stringify(output));
  console.log(`Legal evidence: ${Object.values(merged).filter(record=>record.text).length} minutes records, ${Object.values(output.meetings).reduce((n,items)=>n+Object.keys(items).length,0)} agenda entries with candidate matches.`);
}
runIfMain(import.meta.url,main);
