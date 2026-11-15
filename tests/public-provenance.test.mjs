import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const base = { id: 'fixture', body: 'fixture', bodyLabel: 'Fixture', date: '2026-11-16', dateLabel: 'November 16, 2026', shortDate: 'Nov 16', docs: [], official: {}, upcoming: true, calendarStatus: 'upcoming', snapshotCapturedAt: '2026-10-03' };
const index = { meetings: [base], captured: '2026-10-03', schedules: {}, stats: { totalMeetings: 1, pastMeetings: 0, upcomingMeetings: 1, totalDocuments: 0, totalTranscripts: 0, byBody: {} } };
const compiled = ts.transpileModule(readFileSync('src/lib/civic-data.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)((id) => {
  if (id === '@/data/official-sources.json') return {};
  if (id === '@/data/meetings.json') return index;
  throw new Error('Unexpected import: ' + id);
}, mod, mod.exports);
const api = mod.exports;
test('official posting labels use the actual source-check timestamp, not archive capture', () => {
  const row = { ...base, postedOnOfficialTable: true, sourceObservedAt: '2026-11-14T21:51:23Z' };
  const label = api.meetingCalendarLabel(row);
  assert.match(label, /Official schedule posting checked/);
  assert.match(label, /Nov 14, 2026/);
  assert.doesNotMatch(label, /2026-10-03|Next posted/);
});
test('unverified fallback retains archive date and does not imply a current check', () => {
  assert.match(api.meetingScheduleProvenance(base), /2026-10-03/);
  assert.match(api.meetingScheduleProvenance(base), /current posting not verified/);
});
test('missing or invalid source timestamps do not become checked claims', () => {
  for (const sourceObservedAt of [undefined, 'invalid']) {
    assert.doesNotMatch(api.meetingScheduleProvenance({ ...base, postedOnOfficialTable: true, sourceObservedAt }), /Official schedule posting checked/);
  }
});
test('discovered-only records include provenance without implying archived agenda contents', () => {
  const label = api.meetingCalendarLabel({ ...base, archiveUnavailable: true, postedOnOfficialTable: true, sourceObservedAt: '2026-11-14T21:51:23Z' });
  assert.match(label, /Official schedule posting checked/);
  assert.match(label, /agenda archive unavailable/);
});
