import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DENVER_TIME_ZONE, extractPublisherStatusAtCapture, latestTranscriptRecord, normalizeMeetingDate, parsePostedTime, resolveMeetingCalendar, resolveOutcomeStatus, snapshotAgeDays, zonedInstantIso, zonedIsoDate, zonedWallClock } from "../scripts/lib/civic-calendar.mjs";
import { collectMeetings } from "../scripts/build-data.mjs";

const NOW = "2026-10-21T18:00:00Z";
const status = (record, now = NOW) => resolveMeetingCalendar(record, { now: new Date(now) });

function withFixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "civic-calendar-"));
  try {
    const agendas = path.join(root, "agendas");
    const transcripts = path.join(root, "transcripts");
    mkdirSync(agendas);
    mkdirSync(transcripts);
    const options = {
      now: new Date(NOW), repos: [], validatedAgendasDir: agendas, localTranscriptsDir: transcripts,
      liveCheck: null, detectedTable: null, syncState: { checkedAt: "2026-10-20T12:00:00Z" }, syncBlocked: null,
      official: {
        captured: "2026-10-03", cityCouncil: [], financeCommittee: [], publicServicesCommittee: [],
        upcoming: [
          { id: "public-services-committee-2026-10-05", body: "public-services-committee", date: "2026-10-05", time: "12:00 p.m.", items: [{ number: "1", text: "Recorded agenda item" }] },
          { id: "finance-committee-2026-11-03", body: "finance-committee", date: "2026-11-03", time: "12:00 p.m." },
        ],
        posted: [],
      },
    };
    return run(options, agendas);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("normalizes dates and rejects missing years and impossible dates", () => {
  for (const value of ["2026-10-05", "2026-10-05T18:00:00Z", "October 5, 2026", "Oct. 5, 2026", "Monday, October 5, 2026", "10/5/2026"]) assert.equal(normalizeMeetingDate(value), "2026-10-05");
  for (const value of ["2026-02-30", "October 5", "", null]) assert.equal(normalizeMeetingDate(value), null);
});

test("parses recognized posted times without guessing invalid values", () => {
  for (const [value, expected] of [["12:00 p.m.", 720], ["12:00 PM", 720], ["6:00 p.m.", 1080], ["6 PM", 1080], ["18:00", 1080], ["noon", 720], ["midnight", 0], [" 9:30 a.m. ", 570]]) assert.equal(parsePostedTime(value), expected);
  for (const value of ["", "after the pledge", "13:00 p.m.", "25:00"]) assert.equal(parsePostedTime(value), null);
});

test("Denver fall-back repeats 1 a.m. and preserves local midnight boundaries", () => {
  for (const [instant, hour, zone] of [["2026-11-01T06:30:00Z", 0, "MDT"], ["2026-11-01T07:30:00Z", 1, "MDT"], ["2026-11-01T08:30:00Z", 1, "MST"]]) {
    const wall = zonedWallClock(new Date(instant), DENVER_TIME_ZONE);
    assert.equal(wall.isoDate, "2026-11-01"); assert.equal(wall.hour, hour); assert.equal(wall.minute, 30); assert.equal(wall.minutesOfDay, hour * 60 + 30); assert.equal(wall.timeZoneName, zone);
  }
  for (const [instant, date] of [["2026-11-01T05:59:00Z", "2026-10-31"], ["2026-11-01T06:00:00Z", "2026-11-01"], ["2026-11-02T06:59:00Z", "2026-11-01"], ["2026-11-02T07:00:00Z", "2026-11-02"]]) assert.equal(zonedIsoDate(new Date(instant), DENVER_TIME_ZONE), date);
});

test("known start time expires without inferring a held outcome", () => {
  const meeting = { date: "2026-10-05", time: "12:00 p.m.", body: "public-services-committee" };
  const before = status(meeting, "2026-10-05T16:00:00Z");
  assert.equal(before.status, "upcoming"); assert.equal(before.upcoming, true); assert.equal(before.validUntil, "2026-10-05T18:00:00.000Z"); assert.equal(before.evaluatedAt, "2026-10-05T16:00:00.000Z"); assert.equal(before.outcomeStatus, "unverified");
  for (const [instant, expected] of [["2026-10-05T18:00:00Z", "start-time-passed"], ["2026-10-06T06:30:00Z", "date-passed"]]) {
    const result = status(meeting, instant); assert.equal(result.status, expected); assert.equal(result.upcoming, false); assert.equal(result.outcomeStatus, "unverified");
  }
});

test("same-day unknown-time records are not confirmed future meetings", () => {
  const record = { date: "2026-10-21" };
  const before = status(record, "2026-10-21T05:30:00Z");
  assert.equal(before.status, "upcoming"); assert.equal(before.upcoming, true); assert.equal(before.validUntil, zonedInstantIso(record.date, 0, DENVER_TIME_ZONE)); assert.equal(before.validUntil, "2026-10-21T06:00:00.000Z");
  for (const instant of ["2026-10-21T06:30:00Z", "2026-10-22T05:30:00Z"]) {
    const result = status(record, instant); assert.equal(result.status, "same-day-time-unverified"); assert.equal(result.upcoming, false); assert.equal(result.timeKnown, false); assert.equal(result.outcomeStatus, "unverified");
  }
  const after = status(record, "2026-10-22T06:30:00Z"); assert.equal(after.status, "date-passed"); assert.equal(after.upcoming, false);
});

test("cancellation, rescheduling and minutes remain distinct from inferred outcomes", () => {
  const canceled = status({ date: "2026-10-25", status: "canceled" }); assert.equal(canceled.status, "canceled"); assert.equal(canceled.outcomeStatus, "canceled"); assert.equal(canceled.upcoming, false);
  const moved = status({ date: "2026-10-25", status: "rescheduled", rescheduledTo: "2026-10-29" }); assert.equal(moved.status, "rescheduled"); assert.equal(moved.outcomeStatus, "rescheduled"); assert.equal(moved.rescheduledTo, "2026-10-29"); assert.equal(moved.upcoming, false);
  assert.equal(resolveOutcomeStatus({ official: { minutes: "https://example.org/minutes.pdf" } }), "minutes-linked"); assert.equal(resolveOutcomeStatus({ official: { agenda: "https://example.org/agenda.pdf" } }), "unverified");
  assert.equal(extractPublisherStatusAtCapture({ notes: ["Upcoming — agenda posted"] }), "Upcoming — agenda posted");
});

test("injected capture, watcher and blocked states preserve provenance and source-specific status", () => withFixture((options) => {
  options.official.publicServicesCommittee = [{ d: "2026-10-05", n: "Upcoming — agenda posted" }];
  options.detectedTable = { discoveredAt: "2026-10-20T13:00:00Z", meetings: [{ body: "finance-committee", date: "2026-11-03", agendaUrl: "https://example.org/agenda" }] };
  options.syncBlocked = { attemptedAt: "2026-10-20T14:00:00Z", meetingIds: "finance-committee-2026-11-03", attempts: 1, reason: "fixture-download-failure" };
  const built = collectMeetings(options);
  assert.equal(built.stats.totalMeetings, 2); assert.equal(built.stats.upcomingMeetings, 1); assert.equal(built.stats.sameDayUnverifiedMeetings, 0); assert.equal(built.stats.totalDocuments, 0); assert.equal(built.stats.totalTranscripts, 0); assert.equal(built.stats.totalTranscriptFiles, 0);
  assert.equal(built.captured, "2026-10-03"); assert.equal(built.watcherBaselineCheckedAt, options.syncState.checkedAt); assert.notEqual(built.watcherBaselineCheckedAt, built.captured); assert.equal(built.liveCheck, null); assert.equal(built.resolvedAt, "2026-10-21T18:00:00.000Z");
  const past = built.meetings.find((meeting) => meeting.id === "public-services-committee-2026-10-05");
  assert.ok(past); assert.deepEqual(past.notes, ["Upcoming — agenda posted"]); assert.equal(past.publisherStatusAtCapture, "Upcoming — agenda posted"); assert.equal(past.snapshotCapturedAt, built.captured); assert.equal(past.scheduledDate, "2026-10-05"); assert.equal(past.scheduledTime, "12:00 p.m."); assert.equal(past.calendarStatus, "date-passed"); assert.equal(past.calendarStatusEvaluatedAt, built.resolvedAt); assert.equal(past.outcomeStatus, "unverified"); assert.equal(past.upcoming, false);
  assert.equal(built.pipeline.blockedSync.attemptedAt, options.syncBlocked.attemptedAt); assert.deepEqual(built.pipeline.blockedSync.meetingIds, ["finance-committee-2026-11-03"]);
  const entries = built.pipeline.discoveredPostings.filter((entry) => entry.meetingId === "finance-committee-2026-11-03");
  const blocked = entries.find((entry) => entry.source === "sync-blocked"); const discovered = entries.find((entry) => entry.source === "watcher-table");
  assert.ok(blocked); assert.ok(discovered); assert.equal(blocked.archiveStatus, "download-failed"); assert.equal(discovered.archiveStatus, "archive-unavailable");
  for (const entry of [blocked, discovered]) { assert.equal(entry.promotedWithValidatedItems, false); assert.equal(entry.outcomeStatus, "unverified"); }
}));

test("rejects isolated corrupt extraction without touching tracked meeting directories", () => withFixture((options, agendas) => {
  const baseline = collectMeetings(options);
  const corrupt = path.join(agendas, "2026", "city-council-2026-10-26"); mkdirSync(corrupt, { recursive: true });
  writeFileSync(path.join(corrupt, "agenda.json"), JSON.stringify({ schemaVersion: 1, meetingId: "city-council-2026-10-26", items: [{ number: "1", quote: "fabricated" }] }));
  const built = collectMeetings(options);
  assert.ok(built.pipeline.rejectedExtractions.some((entry) => entry.meetingId === "city-council-2026-10-26"));
  assert.equal(built.meetings.find((meeting) => meeting.id === "city-council-2026-10-26"), undefined);
  assert.equal(built.stats.totalMeetings, baseline.stats.totalMeetings); assert.deepEqual(built.meetings, baseline.meetings);
}));

test("missing capture timestamps yield no fabricated age", () => {
  assert.equal(snapshotAgeDays(null, new Date(NOW)), null); assert.equal(snapshotAgeDays("", new Date(NOW)), null); assert.equal(snapshotAgeDays("2026-10-03", new Date(NOW)), 18); assert.equal(snapshotAgeDays("2026-10-25", new Date(NOW)), 0);
});

test("latest transcript follows dated holdings rather than future or empty rows", () => {
  const meetings = [
    { id: "a", date: "2026-09-14", bodyLabel: "City Council", transcript: { path: "a.md" }, transcripts: [{ path: "a.md" }] },
    { id: "b", date: "2026-09-22", bodyLabel: "Finance Committee", transcript: { path: "b.md" }, transcripts: [{ path: "b.md" }] },
    { id: "future", date: "2026-10-05", bodyLabel: "Public Services Committee", upcoming: true, transcript: { path: "c.md" }, transcripts: [{ path: "c.md" }] },
    { id: "no-date", bodyLabel: "Work Sessions", transcript: { path: "undated.md" }, transcripts: [{ path: "undated.md" }] },
    { id: "empty", date: "2026-10-06", bodyLabel: "Finance Committee", transcripts: [] },
  ];
  const latest = latestTranscriptRecord(meetings); assert.equal(latest.meetingId, "b"); assert.equal(latest.date, "2026-09-22");
});
