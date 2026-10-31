import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dateMatches, bodyMatches, agendaSource, validItems, parseHtmlItems, selectCandidates, refresh, assemble, safeSource } from '../scripts/analysis/legal-audit.mjs';
import { validateMeetingDirectory } from '../scripts/lib/validate.mjs';

const html = readFileSync('public/sources/2026-01-26-agenda.html', 'utf8');
const meeting = (id, date = '2026-01-26') => ({ id, date, official: { agenda: `https://cheyenne.granicus.com/AgendaViewer.php?event_id=${id}` } });
const items = [{ number:'1', text:'First agenda entry', kind:'Other' }, {number:'2', text:'Second agenda entry', kind:'Other'}, {number:'3', text:'Third agenda entry', kind:'Other'}];

test('HTML extraction finds unique parent and lettered subitems in the real saved agenda', () => {
  const parsed = parseHtmlItems(html);
  assert.equal(parsed.length, 38);
  assert(parsed.some(x => x.number === '22(d)'));
  assert(validItems(parsed));
  assert(!validItems([...parsed, parsed[0]]));
});
test('extractor produces validated official HTML and retains the optional source only when requested', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'legal-audit-test-'));
  try {
    execFileSync(process.execPath, ['scripts/extractors/parse_agenda_pdf.mjs', '--file', 'public/sources/2026-01-26-agenda.html', '--meeting-id', 'city-council-2026-01-26', '--out', out, '--retain-html'], { stdio:'pipe' });
    assert.deepEqual(validateMeetingDirectory(out, { requireAnalysis:false }), []);
    const agenda = JSON.parse(readFileSync(path.join(out, 'agenda.json')));
    assert(dateMatches(agenda.text, '2026-01-26'));
    assert(!dateMatches(agenda.text, '2026-01-27'));
    assert(bodyMatches(agenda.text, 'city-council'));
    assert(!bodyMatches(agenda.text, 'finance-committee'));
    assert.equal(parseHtmlItems(readFileSync(path.join(out, 'agenda-source.html'), 'utf8')).length, 38);
  } finally { rmSync(out, {recursive:true, force:true}); }
});
test('queue selects never attempted then oldest attempts and official sources only', () => {
  const a = meeting('a'), b = meeting('b'), c = meeting('c');
  const bad = { ...meeting('bad'), official: { agenda: 'https://example.com/agenda' } };
  assert(safeSource(a.official.agenda)); assert(!safeSource('https://evilcheyenne.granicus.com/'));
  assert.deepEqual(selectCandidates([a,b,c,bad], { a:{lastAttempt:'2026-01-01'}, b:{lastAttempt:'2026-01-02'} }, 3).map(m=>m.id), ['c','a','b']);
});
test('retry failures preserve last good record but changed source cannot reuse unrelated content', async () => {
  const a=meeting('a'), b=meeting('b');
  const cache = { a:{requestedUrl:a.official.agenda, sourceUrl:a.official.agenda, items, fetchedAt:'old'}, b:{requestedUrl:'https://cheyenne.granicus.com/old', items, fetchedAt:'old'} };
  await refresh([a,b], cache, { limit:2, now:()=> '2026-01-30T00:00:00Z', get:async()=>{throw new Error('network down');} });
  assert.equal(cache.a.items.length, 3); assert.equal(cache.a.lastError, 'network down');
  assert.equal(cache.b.items, undefined);
  assert.equal(assemble([a,b], cache).meetings.a.items.length, 3);
  assert.equal(assemble([a,b], cache).meetings.b.items, undefined);
});
test('successful refresh is published, invalid extraction is rejected, and never-used January agenda is bundled', async () => {
  const a=meeting('a'), b=meeting('b'); const cache={};
  await refresh([a,b], cache, {limit:2, now:()=> '2026-01-30T00:00:00Z', get:async(m)=> ({requestedUrl:m.official.agenda, sourceUrl:m.official.agenda, items: m.id === 'a' ? items : []}) });
  const result = assemble([a,b, meeting('city-council-2026-01-26')], cache);
  assert.equal(result.meetings.a.items.length, 3);
  assert.match(result.meetings.b.lastError, /Invalid/);
  assert.equal(result.meetings['city-council-2026-01-26'].items.length, 38);
});

test('archive discovery uses allowlisted repositories and agenda filenames only', () => {
  const m = { official:{}, docs:[{repo:'cheyenne-archives-2025-2026',path:'agenda-packets/a/Supporting Document.pdf'}, {repo:'cheyenne-archives-2025-2026',path:'planning/Agenda.pdf'}] };
  const url = agendaSource(m);
  assert.match(url, /planning\/Agenda\.pdf$/);
  assert(safeSource(url));
  assert.equal(agendaSource({official:{},docs:[{repo:'unknown',path:'Agenda.pdf'}]}), null);
  assert(!safeSource('https://raw.githubusercontent.com/evil/repo/main/Agenda.pdf'));
});
