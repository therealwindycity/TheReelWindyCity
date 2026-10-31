#!/usr/bin/env node
/** Discover and index record excerpts without asserting that proposed text proves enactment. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';
import { atomicWrite } from '../lib/atomic.mjs';
import { extractPdfLayout } from '../lib/pdf-layout.mjs';
import { runIfMain } from '../lib/cli.mjs';
import { safeSource } from './legal-audit.mjs';
import { download } from './legal-evidence.mjs';

const CACHE = '.sync/legal-support-cache.json';
const OUT = 'src/data/legal-support-generated.json';
const TOPICS = [
  { id:'notice', label:'Notice or service', pattern:/\b(?:notic(?:e|es|ed)|certified mail|first[ -]class mail|mail(?:ed|ing)|postal receipt)\b/gi },
  { id:'hearing', label:'Hearing', pattern:/\b(?:public hearing|planning commission|hearing date)\b/gi },
  { id:'publication', label:'Publication', pattern:/\b(?:affidavit of publication|proof of publication|published|publication|newspaper)\b/gi },
  { id:'enactment', label:'Passage or attestation', pattern:/\b(?:adopted|approved|passed|signed|attest(?:ed|ation)?|effective date)\b/gi },
  { id:'finances', label:'Budget or funding', pattern:/\b(?:reappropriat(?:ion|ed|e)|unencumbered|unexpended|revenue source|budget officer|fund balance)\b/gi },
];
export function safeSupportingUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.port && !u.username && !u.password && u.hostname === 'cheyenne.granicus.com' && u.pathname === '/MetaViewer.php' && /^\d+$/.test(u.searchParams.get('meta_id') || ''); } catch { return false; }
}
/** Strictly explicit citations, not bare section-like numbers. */
export function findCitations(text) {
  const hits = new Map();
  const p = /(?:W\.\s*S\.\s*(?:A\.\s*)?|Wyo\.\s*Stat\.?(?:\s*Ann\.)?|Wyoming\s+Statutes?)\s*(?:§+|sections?|sec\.)?\s*(\d{1,2}\s*-\s*\d{1,3}\s*-\s*\d{1,4}(?:\([a-z0-9]+\))*)/gi;
  const clean = s => s.replace(/\s+/g, '');
  for (const match of text.matchAll(p)) {
    const first=clean(match[1]); hits.set(first,first);
    const tail = text.slice((match.index ?? 0) + match[0].length);
    const additions = /^(?:\s*(?:,|&|and)\s*\d{1,2}\s*-\s*\d{1,3}\s*-\s*\d{1,4}(?:\([a-z0-9]+\))*){0,8}/i.exec(tail)?.[0] || '';
    for (const item of additions.matchAll(/\d{1,2}\s*-\s*\d{1,3}\s*-\s*\d{1,4}(?:\([a-z0-9]+\))*/gi)) hits.set(clean(item[0]),clean(item[0]));
    if (hits.size>=20) break;
  }
  return [...hits.values()].slice(0,20);
}
export function scanText(text) {
  const compact = String(text || '').replace(/\s+/g,' ').trim();
  if (compact.length < 100) throw new Error('Supporting document text is too short to index');
  const snippets=[];
  for (const topic of TOPICS) {
    topic.pattern.lastIndex=0;
    for (const m of compact.matchAll(topic.pattern)) {
      const start=Math.max(0,m.index-80), end=Math.min(compact.length,m.index+m[0].length+100);
      snippets.push({topic:topic.id,label:topic.label,excerpt:compact.slice(start,end)});
      if (snippets.filter(s=>s.topic===topic.id).length>=1) break;
    }
  }
  return { citations:findCitations(compact), snippets };
}
export async function fetchSupporting(document) {
  if (!safeSupportingUrl(document.url)) throw new Error('Supporting URL not on allowed Granicus document endpoint');
  let {url,bytes}=await download(document.url);
  if (bytes.subarray(0,5).toString('latin1') !== '%PDF-') {
    const root=parse(bytes.toString('utf8'));
    const node=root.querySelector('iframe[src],embed[src],object[data],a[href$=".pdf" i]');
    const ref=node?.getAttribute('src') || node?.getAttribute('data') || node?.getAttribute('href');
    if (!ref) throw new Error('Supporting document is not a PDF or a recognized PDF viewer');
    const resolved=new URL(ref,url).toString();
    if (!safeSource(resolved)) throw new Error('Supporting document viewer links to an unapproved host');
    ({url,bytes}=await download(resolved));
  }
  if (bytes.subarray(0,5).toString('latin1') !== '%PDF-') throw new Error('Supporting document is not a readable PDF');
  const layout=await extractPdfLayout(new Uint8Array(bytes));
  return { requestedUrl:document.url,sourceUrl:url,sha256:createHash('sha256').update(bytes).digest('hex'),fetchedAt:new Date().toISOString(),pages:layout.pageCount,...scanText(layout.text) };
}
export function documentQueue(agendas,cache,limit) {
  const seen=new Set(), docs=[];
  for (const record of Object.values(agendas.meetings || {})) for (const item of record.items || []) for (const doc of item.supporting || []) {
    if (!safeSupportingUrl(doc.url) || seen.has(doc.url)) continue;
    seen.add(doc.url); docs.push(doc);
  }
  return docs.sort((a,b)=>(cache[a.url]?.lastAttempt || '').localeCompare(cache[b.url]?.lastAttempt || '')).slice(0,limit);
}
export async function refreshSupport(agendas,cache,{limit=16,concurrency=4,get=fetchSupporting,now=()=>new Date().toISOString()}={}) {
  const docs=documentQueue(agendas,cache,limit); let cursor=0;
  await Promise.all(Array.from({length:Math.min(docs.length,concurrency)},async()=>{
    for (;;) {
      const doc=docs[cursor++]; if (!doc) return;
      const old=cache[doc.url]?.requestedUrl===doc.url ? cache[doc.url] : {};
      try {
        const record=await get(doc);
        if (record.requestedUrl!==doc.url || !Array.isArray(record.snippets) || !Array.isArray(record.citations)) throw new Error('Invalid supporting document extraction');
        cache[doc.url]={...record,lastAttempt:now(),lastError:null};
        console.log(`Legal support ${doc.url}: indexed`);
      } catch (error) {
        cache[doc.url]={...old,requestedUrl:doc.url,lastAttempt:now(),lastError:String(error?.message || error).slice(0,300)};
        console.warn(`Legal support ${doc.url}: ${cache[doc.url].lastError}`);
      }
    }
  }));
  return docs.length;
}
export function assembleSupport(agendas,cache) {
  const meetings={};
  for (const [meetingId,agenda] of Object.entries(agendas.meetings || {})) {
    const items={};
    for (const item of agenda.items || []) {
      const docs=(item.supporting || []).filter(doc=>safeSupportingUrl(doc.url));
      if (!docs.length) continue;
      items[String(item.number)]={itemText:item.text,documents:docs.map(doc=>{
        const entry=cache[doc.url];
        return { label:doc.label, url:doc.url, origin:entry?.origin ?? null, fetchedAt:entry?.fetchedAt ?? null, lastAttempt:entry?.lastAttempt ?? null, lastError:entry?.lastError ?? null, sha256:entry?.sha256 ?? null, citations:entry?.citations ?? [], snippets:entry?.snippets ?? [] };
      })};
    }
    if (Object.keys(items).length) meetings[meetingId]=items;
  }
  return {version:1,meetings};
}
async function main() {
  const agendas=JSON.parse(readFileSync('src/data/legal-audit-generated.json','utf8'));
  let cache={};
  if (existsSync(CACHE)) cache=JSON.parse(readFileSync(CACHE,'utf8'));
  if (process.argv.includes('--refresh')) {await refreshSupport(agendas,cache); atomicWrite(CACHE,JSON.stringify(cache));}
  // The bundled file is the fire department policy brief attached to item 6, not the ordinance draft.
  // It is a policy summary, not the ordinance adopted later; keep it queued for an online refresh.
  const bundledUrl='https://cheyenne.granicus.com/MetaViewer.php?view_id=2&clip_id=1053&meta_id=145738';
  const local='public/sources/2026-01-26-warrants.pdf';
  let available=cache;
  if (!cache[bundledUrl]?.fetchedAt && existsSync(local)) {
    const bytes=readFileSync(local);
    try {
      const layout=await extractPdfLayout(new Uint8Array(bytes));
      available={...cache,[bundledUrl]:{...cache[bundledUrl],requestedUrl:bundledUrl,sha256:createHash('sha256').update(bytes).digest('hex'),origin:'Bundled fire department policy brief; capture date not recorded. Not enacted ordinance text.',...scanText(layout.text)}};
    } catch (error) { console.warn(`Bundled supporting document unavailable: ${error.message}`); }
  }
  const output=assembleSupport(agendas,available);
  atomicWrite(OUT,JSON.stringify(output));
  const items=Object.values(output.meetings).reduce((n,m)=>n+Object.keys(m).length,0);
  console.log(`Legal supporting records: ${items} items with document links; ${Object.values(available).filter(r=>r.fetchedAt || r.origin).length} documents indexed.`);
}
runIfMain(import.meta.url,main);
