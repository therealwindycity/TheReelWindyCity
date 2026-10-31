#!/usr/bin/env node
/** Bounded, source-linked agenda discovery. Never treats a missing record as a legal finding. */
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'node-html-parser';
import { atomicWrite } from '../lib/atomic.mjs';
import { validateMeetingDirectory } from '../lib/validate.mjs';
import { runIfMain } from '../lib/cli.mjs';

const exec = promisify(execFile);
const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.sync/legal-audit-cache.json');
const OUT = path.join(ROOT, 'src/data/legal-audit-generated.json');
const meetingsPath = path.join(ROOT, 'src/data/meetings.json');
const seed = JSON.parse(readFileSync(path.join(ROOT, 'src/data/jan-26-agenda-items.json'), 'utf8'));

const ARCHIVES = new Set(['cheyenne-archives-2025-2026', 'cheyenne-archives-2023-2024', 'cheyenne-archives-2022', 'cheyenne-archives-2018-2021', 'cheyenne-archives-2014-2017', 'cheyenne-archives-2008-2013']);
export function safeSource(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (['cheyenne.granicus.com', 'www.cheyennecity.org', 'cheyennecity.org'].includes(u.hostname)) return true;
    const segments = u.pathname.split('/');
    return u.hostname === 'raw.githubusercontent.com' && segments[1] === 'therealwindycity' && ARCHIVES.has(segments[2]) && segments[3] === 'main';
  } catch { return false; }
}
export function agendaSource(meeting) {
  if (safeSource(meeting.official?.agenda)) return meeting.official.agenda;
  const doc = (meeting.docs || []).find(d => ARCHIVES.has(d.repo) && /\.pdf$/i.test(d.path) && /(?:^agenda(?:[_. -]|$)|(?:[_ -]agenda)(?:[_. -]|$))/i.test(path.posix.basename(d.path)));
  return doc ? `https://raw.githubusercontent.com/therealwindycity/${doc.repo}/main/${doc.path.split('/').map(encodeURIComponent).join('/')}` : null;
}
function agendaHeading(text) { return String(text).split(/(?:^|\n)\s*1\s*[.)]\s+/)[0].slice(0, 1500); }
export function bodyMatches(text, body) {
  const head = agendaHeading(text).toLowerCase().replace(/\s+/g, ' ');
  const terms = { 'city-council': /city council|governing body.{0,100}city of cheyenne|city of cheyenne.{0,100}governing body/, 'finance-committee': /finance committee/, 'public-services-committee': /public services committee/, 'work-sessions': /work session/, 'planning-commission': /planning commission/, 'board-of-adjustment': /board of adjustment/, 'board-of-county-commissioners': /board of county commissioners|county commissioners/, 'historic-preservation-board': /historic preservation board/, 'urban-renewal-authority': /urban renewal authority/ };
  return Boolean(terms[body]?.test(head));
}
export function validItems(items) {
  if (!Array.isArray(items) || items.length < 3 || items.length > 500) return false;
  const numbers = new Set();
  for (const item of items) {
    if (!item.number || !item.text || item.text.trim().length < 4 || numbers.has(item.number)) return false;
    numbers.add(item.number);
  }
  return true;
}
/** Granicus HTML tables preserve parent/subitem association that plain PDF extraction can lose. */
export function parseHtmlItems(html) {
  const document = parse(html); const result = []; let parent = '';
  for (const table of document.querySelectorAll('table')) {
    const cells = table.querySelector('tr')?.querySelectorAll('td') ?? [];
    if (cells.length !== 2) continue;
    const n = cells[0].text.trim(); let number;
    if (/^\d{1,3}\.$/.test(n)) { parent = n.slice(0, -1); number = parent; }
    else if (/^[a-z]\)$/i.test(n) && parent) number = `${parent}(${n}`;
    else continue;
    const text = cells[1].text.replace(/\s*ACTION\s*:.*/s, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const kind = /^(?:\[CA\]\s*)?(ORDINANCE|RESOLUTION)/i.exec(text)?.[1] || 'Agenda item';
    result.push({ number, kind, text });
  }
  return validItems(result) ? result : [];
}
export function dateMatches(text, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  // Require a date on the first part of the agenda, not just a date in its later business.
  const head = agendaHeading(text).toLowerCase().replace(/\s+/g, ' ');
  const name = months[month - 1];
  if (!name) return false;
  return new RegExp(`\\b${name}(?:\\s+|\\.\\s*)${day},?\\s+${year}\\b`).test(head)
    || new RegExp(`\\b${month}[/-]${day}[/-](?:${year}|${String(year).slice(-2)})\\b`).test(head)
    || head.includes(iso);
}
export async function harvest(meeting) {
  const source = agendaSource(meeting);
  if (!source) throw new Error('No known agenda URL');
  const dir = mkdtempSync(path.join(tmpdir(), 'civic-legal-'));
  try {
    await exec(process.execPath, ['scripts/extractors/parse_agenda_pdf.mjs', '--url', source, '--meeting-id', meeting.id, '--out', dir, '--retain-html'], { cwd: ROOT, timeout: 90000, maxBuffer: 1024 * 1024 });
    const problems = validateMeetingDirectory(dir, { requireAnalysis: false });
    if (problems.length) throw new Error(`Extraction validation failed: ${problems[0]}`);
    const extracted = JSON.parse(readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
    if (!safeSource(extracted.sourceUrl)) throw new Error('Agenda redirected outside allowed source hosts');
    if (!dateMatches(extracted.text, meeting.date)) throw new Error('Agenda date could not be matched to the meeting');
    if (!bodyMatches(extracted.text, meeting.body)) throw new Error('Agenda governing body could not be matched to the meeting');
    let items = extracted.items.map(({ number, kind, text }) => ({ number: String(number), kind, text }));
    let limitation = 'Automated PDF extraction may combine subitems; compare the official agenda.';
    const htmlPath = path.join(dir, 'agenda-source.html');
    if (existsSync(htmlPath)) {
      const granular = parseHtmlItems(readFileSync(htmlPath, 'utf8'));
      const parentNumbers = granular.filter(item => !item.number.includes('(')).map(item => item.number);
      const validatedNumbers = items.map(item => item.number);
      const allPresent = granular.every(item => extracted.text.replace(/\s+/g, ' ').includes(item.text));
      if (granular.length && allPresent && JSON.stringify(parentNumbers) === JSON.stringify(validatedNumbers)) {
        items = granular;
        limitation = 'Automated HTML extraction; compare the official agenda for completeness and later amendments.';
      }
    }

    if (!validItems(items)) throw new Error('Agenda items failed uniqueness or content checks');
    return { requestedUrl: source, sourceUrl: extracted.sourceUrl, sourceSha256: extracted.sourceSha256, fetchedAt: extracted.fetchedAt, extraction: extracted.extraction.engine, items, limitation };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
export function selectCandidates(meetings, cache, limit) {
  return meetings.filter(m => agendaSource(m) && m.id !== 'city-council-2026-01-26')
    .sort((a,b) => (cache[a.id]?.lastAttempt || '').localeCompare(cache[b.id]?.lastAttempt || '') || b.date.localeCompare(a.date)).slice(0, limit);
}
export async function refresh(meetings, cache, { limit = 12, concurrency = 3, now = () => new Date().toISOString(), get = harvest } = {}) {
  const candidates = selectCandidates(meetings, cache, limit); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    for (;;) {
      const meeting = candidates[cursor++]; if (!meeting) break;
      const previous = cache[meeting.id] || {};
      const old = previous.requestedUrl === agendaSource(meeting) ? previous : {}; const attemptedAt = now();
      try {
        const result = await get(meeting);
        if (!validItems(result.items)) throw new Error('Invalid or empty extraction');
        cache[meeting.id] = { ...result, lastAttempt: attemptedAt, lastError: null };
        console.log(`Legal agenda ${meeting.id}: ${result.items.length} entries`);
      } catch (err) {
        // Never overwrite the last good extraction on a transient failure.
        cache[meeting.id] = { ...old, requestedUrl: agendaSource(meeting), lastAttempt: attemptedAt, lastError: String(err?.message || err).slice(0, 300) };
        console.warn(`Legal agenda ${meeting.id}: unavailable (${cache[meeting.id].lastError})`);
      }
    }
  }));
  return candidates.length;
}
export function assemble(meetings, cache) {
  const records = {};
  for (const m of meetings) {
    const saved = cache[m.id];
    if (m.id === 'city-council-2026-01-26') {
      records[m.id] = { sourceUrl: 'https://cheyenne.granicus.com/GeneratedAgendaViewer.php?view_id=5&event_id=1382', fetchedAt: null, extraction: 'bundled official agenda', items: seed, limitation: 'Captured agenda; verify subsequent amendments and final records.' };
    } else if (saved?.requestedUrl === agendaSource(m) && saved?.items?.length && validItems(saved.items)) {
      records[m.id] = saved;
    } else if (m.items?.length && validItems(m.items)) {
      records[m.id] = { sourceUrl: m.official?.agenda || null, fetchedAt: m.snapshotCapturedAt || null, extraction: 'existing indexed agenda', items: m.items, limitation: 'Indexed extraction may combine subitems; compare the official agenda.', lastAttempt: saved?.lastAttempt || null, lastError: saved?.lastError || null };
    } else if (saved?.lastAttempt && saved.requestedUrl === agendaSource(m)) records[m.id] = saved;
  }
  return { version: 1, meetings: records };
}
async function main() {
  if (!existsSync(meetingsPath)) throw new Error('Run npm run data:assemble before the legal audit');
  const meetings = JSON.parse(readFileSync(meetingsPath, 'utf8')).meetings;
  let cache = {};
  try { if (existsSync(CACHE)) cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { throw new Error('Legal audit cache is invalid; refusing to overwrite it'); }
  if (process.argv.includes('--refresh')) {
    const i = process.argv.indexOf('--limit'); const limit = i >= 0 ? Number(process.argv[i + 1]) : 12;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('--limit must be between 1 and 50');
    await refresh(meetings, cache, { limit });
    mkdirSync(path.dirname(CACHE), { recursive: true });
    atomicWrite(CACHE, JSON.stringify(cache));
  }
  const output = assemble(meetings, cache);
  atomicWrite(OUT, JSON.stringify(output));
  const available = Object.values(output.meetings).filter(r => r.items?.length).length;
  const failures = Object.values(output.meetings).filter(r => r.lastError).length;
  console.log(`Legal audit: ${available}/${meetings.length} meeting agendas indexed; ${failures} latest attempts unavailable. Requirements remain unverified unless linked evidence supports them.`);
}
runIfMain(import.meta.url, main);
