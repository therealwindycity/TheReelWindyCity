import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DENVER_TIME_ZONE, extractPublisherStatusAtCapture, latestTranscriptRecord, normalizeMeetingDate, parsePostedTime, resolveMeetingCalendar, resolveOutcomeStatus, snapshotAgeDays, zonedInstantIso, zonedIsoDate, zonedWallClock } from '../scripts/lib/civic-calendar.mjs';
import { collectMeetings } from '../scripts/build-data.mjs';

const NOW = '2026-10-21T18:00:00Z';
const status = (record, now = NOW) => resolveMeetingCalendar(record, { now: new Date(now) });

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'cm-calendar-'));
  const official = {
    captured: '2026-10-03', schedules: {},
    cityCouncil: [],
    financeCommittee: [{ d: '2026-10-06', n: 'Upcoming — agenda posted' }],
    publicServicesCommittee: [{ d: '2026-10-05', n: 'Upcoming — agenda posted' }],
    upcoming: [
      { body: 'public-services-committee', date: '2026-10-05', time: '12:00 p.m.', items: [{ number: '1', kind: 'Other', text: 'Synthetic test agenda item.' }] },
      { body: 'finance-committee', date: '2026-10-06', time: '8:00 a.m.' },
      { body: 'city-council', date: '2026-10-25', time: '6:00 p.m.' },
    ],
  };
  const options = {
    now: new Date(NOW), official, repos: [],
    localTranscriptsDir: path.join(root, 'transcripts'),
    validatedAgendasDir: path.join(root, 'agendas'),
    liveCheck: null, detectedTable: null, syncState: null, syncBlocked: null,
  };
  try { return run(options, root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('normalizes ISO and natural-language dates without rolling impossible dates', () => {
  for (const value of ['2026-10-05', '2026-10-05T18:00:00Z', 'October 5, 2026', 'Oct. 5, 2026', 'Monday, October 5, 2026', '10/5/2026']) assert.equal(normalizeMeetingDate(value), '2026-10-05');
  for (const value of ['2026-02-30', 'October 5', '', null]) assert.equal(normalizeMeetingDate(value), null);
});

test('parses posted times without guessing invalid strings', () => {
  for (const [value, expected] of [['12:00 p.m.',720],['12:00 PM',720],['6:00 p.m.',1080],['6 PM',1080],['18:00',1080],['noon',720],['midnight',0],[' 9:30 a.m. ',570]]) assert.equal(parsePostedTime(value), expected);
  for (const value of ['', 'after the pledge', '13:00 p.m.', '25:00']) assert.equal(parsePostedTime(value), null);
});

test('resolves Denver fall-back and local midnight boundaries', () => {
  for (const [instant, hour, zone] of [['2026-11-01T06:30:00Z',0,'MDT'],['2026-11-01T07:30:00Z',1,'MDT'],['2026-11-01T08:30:00Z',1,'MST']]) {
    const wall = zonedWallClock(new Date(instant), DENVER_TIME_ZONE);
    assert.equal(wall.isoDate, '2026-11-01');
    assert.equal(wall.hour, hour);
    assert.equal(wall.minute, 30);
    assert.equal(wall.minutesOfDay, hour * 60 + 30);
    assert.equal(wall.timeZoneName, zone);
  }
  for (const [instant, date] of [['2026-11-01T05:59:00Z','2026-10-31'],['2026-11-01T06:00:00Z','2026-11-01'],['2026-11-02T06:59:00Z','2026-11-01'],['2026-11-02T07:00:00Z','2026-11-02']]) assert.equal(zonedIsoDate(new Date(instant), DENVER_TIME_ZONE), date);
});

test('known start expires without implying a held meeting or verified outcome', () => {
  const meeting = { date: '2026-10-05', time: '12:00 p.m.', body: 'public-services-committee' };
  const before = status(meeting, '2026-10-05T16:00:00Z');
  assert.equal(before.status, 'upcoming');
  assert.equal(before.upcoming, true);
  assert.equal(before.validUntil, '2026-10-05T18:00:00.000Z');
  assert.equal(before.evaluatedAt, '2026-10-05T16:00:00.000Z');
  for (const [instant, expected] of [['2026-10-05T18:00:00Z','start-time-passed'],['2026-10-06T06:30:00Z','date-passed']]) {
    const result = status(meeting, instant);
    assert.equal(result.status, expected);
    assert.equal(result.upcoming, false);
    assert.equal(result.outcomeStatus, 'unverified');
  }
  assert.equal(before.outcomeStatus, 'unverified');
});

test('date-only same-day postings are not confirmed future meetings', () => {
  const meeting = { date: '2026-10-21' };
  const before = status(meeting, '2026-10-21T05:30:00Z');
  assert.equal(before.upcoming, true);
  assert.equal(before.validUntil, zonedInstantIso('2026-10-21', 0, DENVER_TIME_ZONE));
  assert.equal(before.validUntil, '2026-10-21T06:00:00.000Z');
  for (const instant of ['2026-10-21T06:30:00Z','2026-10-22T05:30:00Z']) {
    const result = status(meeting, instant);
    assert.equal(result.status, 'same-day-time-unverified');
    assert.equal(result.upcoming, false);
    assert.equal(result.timeKnown, false);
    assert.equal(result.outcomeStatus, 'unverified');
  }
  assert.equal(status(meeting, '2026-10-22T06:30:00Z').status, 'date-passed');
});

test('cancellation, rescheduling, minutes links and historical notes remain distinct', () => {
  const canceled = status({ date: '2026-10-25', status: 'canceled' });
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.outcomeStatus, 'canceled');
  assert.equal(canceled.upcoming, false);
  const moved = status({ date: '2026-10-25', status: 'rescheduled', rescheduledTo: '2026-10-29' });
  assert.equal(moved.status, 'rescheduled');
  assert.equal(moved.outcomeStatus, 'rescheduled');
  assert.equal(moved.rescheduledTo, '2026-10-29');
  assert.equal(moved.upcoming, false);
  assert.equal(resolveOutcomeStatus({ official: { minutes: 'https://example.org/minutes.pdf' } }), 'minutes-linked');
  assert.equal(resolveOutcomeStatus({ official: { agenda: 'https://example.org/agenda.pdf' } }), 'unverified');
  assert.equal(extractPublisherStatusAtCapture({ notes: ['Upcoming — agenda posted'] }), 'Upcoming — agenda posted');
});

test('isolated collection preserves notes and distinct provenance without production counts', () => fixture((options) => {
  const built = collectMeetings(options);
  assert.equal(built.stats.totalMeetings, 3);
  assert.equal(built.stats.totalMeetings, built.meetings.length);
  assert.equal(built.stats.upcomingMeetings, 1);
  assert.equal(built.stats.totalDocuments, 0);
  assert.equal(built.stats.totalTranscripts, 0);
  assert.equal(built.captured, '2026-10-03');
  assert.equal(built.liveCheck, null);
  assert.equal(built.resolvedAt, '2026-10-21T18:00:00.000Z');
  assert.equal(built.pipeline.blockedSync, null);
  for (const id of ['public-services-committee-2026-10-05','finance-committee-2026-10-06']) {
    const row = built.meetings.find(m => m.id === id);
    assert.ok(row);
    assert.deepEqual(row.notes, ['Upcoming — agenda posted']);
    assert.equal(row.publisherStatusAtCapture, 'Upcoming — agenda posted');
    assert.equal(row.snapshotCapturedAt, '2026-10-03');
    assert.equal(row.calendarStatus, 'date-passed');
    assert.equal(row.outcomeStatus, 'unverified');
    assert.equal(row.upcoming, false);
  }
}));

test('injected blocked sync remains a failed discovery, not invented archived content', () => fixture((options) => {
  const marker = { attemptedAt: '2026-10-20T12:00:00Z', attempts: 2, reason: 'synthetic-test-failure', meetingIds: 'finance-committee-2026-11-03' };
  const built = collectMeetings({ ...options, syncBlocked: marker });
  assert.equal(built.pipeline.blockedSync.attemptedAt, marker.attemptedAt);
  assert.deepEqual(built.pipeline.blockedSync.meetingIds, [marker.meetingIds]);
  const entry = built.pipeline.discoveredPostings.find(row => row.meetingId === marker.meetingIds && row.source === 'sync-blocked');
  assert.ok(entry);
  assert.equal(entry.archiveStatus, 'download-failed');
  assert.equal(entry.promotedWithValidatedItems, false);
  assert.equal(entry.outcomeStatus, 'unverified');
  assert.equal(built.meetings.some(row => row.id === marker.meetingIds), false);
}));

test('corrupt extraction is rejected without touching production files or good fixture records', () => fixture((options) => {
  const baseline = collectMeetings(options);
  const dir = path.join(options.validatedAgendasDir, '2026', 'city-council-2026-10-26');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agenda.json'), JSON.stringify({ schemaVersion: 1, meetingId: 'city-council-2026-10-26', items: [{ number: '1', quote: 'Synthetic invalid test payload' }] }));
  const built = collectMeetings(options);
  assert.ok(built.pipeline.rejectedExtractions.some(row => row.meetingId === 'city-council-2026-10-26'));
  assert.deepEqual(built.meetings, baseline.meetings);
  assert.equal(built.stats.totalMeetings, baseline.stats.totalMeetings);
}));

test('unknown capture age remains unknown rather than fabricated', () => {
  assert.equal(snapshotAgeDays(null, new Date(NOW)), null);
  assert.equal(snapshotAgeDays('', new Date(NOW)), null);
  assert.equal(snapshotAgeDays('2026-10-03', new Date(NOW)), 18);
  assert.equal(snapshotAgeDays('2026-10-25', new Date(NOW)), 0);
});

test('latest transcript follows dated holdings rather than future or empty entries', () => {
  const rows = [
    { id: 'a', date: '2026-09-14', bodyLabel: 'City Council', transcript: { path: 'a.md' }, transcripts: [{ path: 'a.md' }] },
    { id: 'b', date: '2026-09-22', bodyLabel: 'Finance Committee', transcript: { path: 'b.md' }, transcripts: [{ path: 'b.md' }] },
    { id: 'future', date: '2026-10-05', upcoming: true, transcript: { path: 'c.md' }, transcripts: [{ path: 'c.md' }] },
    { id: 'undated', transcript: { path: 'undated.md' }, transcripts: [{ path: 'undated.md' }] },
    { id: 'empty', date: '2026-10-06', transcripts: [] },
  ];
  assert.equal(latestTranscriptRecord(rows)?.meetingId, 'b');
  assert.equal(latestTranscriptRecord(rows)?.date, '2026-09-22');
});
