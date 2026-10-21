import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DENVER_TIME_ZONE,
  extractPublisherStatusAtCapture,
  latestTranscriptRecord,
  normalizeMeetingDate,
  parsePostedTime,
  resolveMeetingCalendar,
  resolveOutcomeStatus,
  snapshotAgeDays,
  zonedInstantIso,
  zonedIsoDate,
  zonedWallClock,
} from "../scripts/lib/civic-calendar.mjs";
import { collectMeetings } from "../scripts/build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DENVER_AFTERNOON = "2026-10-21T18:00:00Z"; // 12:00 p.m. MDT

function status(record, now = DENVER_AFTERNOON) {
  return resolveMeetingCalendar(record, { now: new Date(now) });
}

test("normalizes ISO and natural-language meeting dates, including weekday prefixes", () => {
  assert.equal(normalizeMeetingDate("2026-10-05"), "2026-10-05");
  assert.equal(normalizeMeetingDate("2026-10-05T18:00:00Z"), "2026-10-05");
  assert.equal(normalizeMeetingDate("October 5, 2026"), "2026-10-05");
  assert.equal(normalizeMeetingDate("Oct. 5, 2026"), "2026-10-05");
  assert.equal(normalizeMeetingDate("Monday, October 5, 2026"), "2026-10-05");
  assert.equal(normalizeMeetingDate("10/5/2026"), "2026-10-05");
  assert.equal(normalizeMeetingDate("2026-02-30"), null, "impossible dates must not roll over");
  assert.equal(normalizeMeetingDate("October 5"), null, "a date without a year is not resolvable");
  assert.equal(normalizeMeetingDate(""), null);
  assert.equal(normalizeMeetingDate(null), null);
});

test("parses every posted-time shape in the record, and refuses to guess invalid ones", () => {
  assert.equal(parsePostedTime("12:00 p.m."), 720);
  assert.equal(parsePostedTime("12:00 PM"), 720);
  assert.equal(parsePostedTime("6:00 p.m."), 1080);
  assert.equal(parsePostedTime("6 PM"), 1080);
  assert.equal(parsePostedTime("18:00"), 1080);
  assert.equal(parsePostedTime("noon"), 720);
  assert.equal(parsePostedTime("midnight"), 0);
  assert.equal(parsePostedTime(" 9:30 a.m. "), 570);
  assert.equal(parsePostedTime(""), null);
  assert.equal(parsePostedTime("after the pledge"), null);
  assert.equal(parsePostedTime("13:00 p.m."), null);
  assert.equal(parsePostedTime("25:00"), null);
});

test("resolves November 1, 2026 America/Denver DST fall-back accurately (2:00 a.m. MDT -> 1:00 a.m. MST)", () => {
  // Clocks fall back at 2:00 a.m. MDT -> 1:00 a.m. MST (1:00 a.m. repeats, NOT midnight):
  // - 2026-11-01T06:30:00Z -> Nov 1 00:30 MDT
  // - 2026-11-01T07:30:00Z -> Nov 1 01:30 MDT (first 1:30 a.m.)
  // - 2026-11-01T08:30:00Z -> Nov 1 01:30 MST (repeated 1:30 a.m.)
  const at0630 = zonedWallClock(new Date("2026-11-01T06:30:00Z"), DENVER_TIME_ZONE);
  const at0730 = zonedWallClock(new Date("2026-11-01T07:30:00Z"), DENVER_TIME_ZONE);
  const at0830 = zonedWallClock(new Date("2026-11-01T08:30:00Z"), DENVER_TIME_ZONE);

  assert.equal(at0630.isoDate, "2026-11-01");
  assert.equal(at0630.hour, 0);
  assert.equal(at0630.minute, 30);
  assert.equal(at0630.minutesOfDay, 30);
  assert.equal(at0630.timeZoneName, "MDT");

  assert.equal(at0730.isoDate, "2026-11-01");
  assert.equal(at0730.hour, 1);
  assert.equal(at0730.minute, 30);
  assert.equal(at0730.minutesOfDay, 90);
  assert.equal(at0730.timeZoneName, "MDT");

  assert.equal(at0830.isoDate, "2026-11-01");
  assert.equal(at0830.hour, 1);
  assert.equal(at0830.minute, 30);
  assert.equal(at0830.minutesOfDay, 90);
  assert.equal(at0830.timeZoneName, "MST");

  // Local midnight boundary in MDT vs MST:
  assert.equal(zonedIsoDate(new Date("2026-11-01T05:59:00Z"), DENVER_TIME_ZONE), "2026-10-31");
  assert.equal(zonedIsoDate(new Date("2026-11-01T06:00:00Z"), DENVER_TIME_ZONE), "2026-11-01");
  assert.equal(zonedIsoDate(new Date("2026-11-02T06:59:00Z"), DENVER_TIME_ZONE), "2026-11-01");
  assert.equal(zonedIsoDate(new Date("2026-11-02T07:00:00Z"), DENVER_TIME_ZONE), "2026-11-02");
});

test("known future start time sets an explicit validity boundary and transitions to start-time-passed without inferring held outcome", () => {
  const meeting = { date: "2026-10-05", time: "12:00 p.m.", body: "public-services-committee" };

  const beforeStart = status(meeting, "2026-10-05T16:00:00Z"); // 10:00 a.m. MDT
  assert.equal(beforeStart.status, "upcoming");
  assert.equal(beforeStart.upcoming, true);
  assert.equal(beforeStart.validUntil, "2026-10-05T18:00:00.000Z");
  assert.equal(beforeStart.evaluatedAt, "2026-10-05T16:00:00.000Z");
  assert.equal(beforeStart.outcomeStatus, "unverified");

  const atStart = status(meeting, "2026-10-05T18:00:00Z"); // 12:00 p.m. MDT
  assert.equal(atStart.status, "start-time-passed");
  assert.equal(atStart.upcoming, false);
  assert.equal(atStart.outcomeStatus, "unverified");

  const nextDay = status(meeting, "2026-10-06T06:30:00Z"); // 12:30 a.m. MDT next day
  assert.equal(nextDay.status, "date-passed");
  assert.equal(nextDay.upcoming, false);
  assert.equal(nextDay.outcomeStatus, "unverified");
});

test("same-day records without a verified start time are never advertised as confirmed future meetings", () => {
  const dateOnly = { date: "2026-10-21" };

  // Day before (Oct 20 11:30 p.m. MDT): still genuinely ahead of local midnight -> upcoming until 2026-10-21T06:00:00.000Z
  const nightBefore = status(dateOnly, "2026-10-21T05:30:00Z");
  assert.equal(nightBefore.status, "upcoming");
  assert.equal(nightBefore.upcoming, true);
  assert.equal(nightBefore.validUntil, zonedInstantIso("2026-10-21", 0, DENVER_TIME_ZONE));
  assert.equal(nightBefore.validUntil, "2026-10-21T06:00:00.000Z");

  // Once the Denver day begins (Oct 21 00:30 MDT through 23:30 MDT): same-day-time-unverified, NOT upcoming!
  const earlyMorning = status(dateOnly, "2026-10-21T06:30:00Z");
  assert.equal(earlyMorning.status, "same-day-time-unverified");
  assert.equal(earlyMorning.upcoming, false);
  assert.equal(earlyMorning.timeKnown, false);
  assert.equal(earlyMorning.outcomeStatus, "unverified");

  const lateNight = status(dateOnly, "2026-10-22T05:30:00Z");
  assert.equal(lateNight.status, "same-day-time-unverified");
  assert.equal(lateNight.upcoming, false);

  const dayAfter = status(dateOnly, "2026-10-22T06:30:00Z");
  assert.equal(dayAfter.status, "date-passed");
  assert.equal(dayAfter.upcoming, false);
});

test("cancelled, rescheduled, and minutes-linked records keep calendar status and outcome verification separate", () => {
  const canceled = status({ date: "2026-10-25", time: "12:00 p.m.", status: "canceled" });
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.outcomeStatus, "canceled");
  assert.equal(canceled.upcoming, false);

  const moved = status({ date: "2026-10-25", status: "rescheduled", rescheduledTo: "2026-10-29" });
  assert.equal(moved.status, "rescheduled");
  assert.equal(moved.outcomeStatus, "rescheduled");
  assert.equal(moved.rescheduledTo, "2026-10-29");
  assert.equal(moved.upcoming, false);

  assert.equal(resolveOutcomeStatus({ official: { minutes: "https://example.org/minutes.pdf" } }), "minutes-linked");
  assert.equal(resolveOutcomeStatus({ official: { agenda: "https://example.org/agenda.pdf" } }), "unverified");
  assert.equal(extractPublisherStatusAtCapture({ notes: ["Upcoming — agenda posted"] }), "Upcoming — agenda posted");
});

test("preserves raw notes verbatim while keeping snapshot, watcher, schedule-check, and blocked-sync timestamps distinct", () => {
  const built = collectMeetings({ now: new Date(DENVER_AFTERNOON) });
  assert.equal(built.stats.totalMeetings, 1003);
  assert.equal(built.stats.upcomingMeetings, 0);
  assert.equal(built.stats.sameDayUnverifiedMeetings, 0);
  assert.equal(built.stats.totalDocuments, 5118);
  assert.equal(built.stats.totalTranscriptFiles, 85);
  assert.equal(built.stats.totalTranscripts, 84);
  assert.equal(built.stats.excerptIndexedMeetings, 82);
  assert.equal(built.stats.audioVerifiedTranscripts, 0);
  assert.equal(built.latestTranscript?.meetingId, "finance-committee-2026-09-22");

  // Distinct timestamps: never substitute watcher/schedule check for snapshot capture date.
  assert.equal(built.captured, "2026-10-03");
  assert.equal(built.watcherBaselineCheckedAt, "2026-10-04T01:51:19.660Z");
  assert.equal(built.liveCheck, null);
  assert.equal(built.resolvedAt, "2026-10-21T18:00:00.000Z");

  // Historical raw notes remain verbatim in `meetings.json`, separated from current status fields.
  const oct5 = built.meetings.find((m) => m.id === "public-services-committee-2026-10-05");
  const oct6 = built.meetings.find((m) => m.id === "finance-committee-2026-10-06");
  assert.deepEqual(oct5?.notes, ["Upcoming — agenda posted"]);
  assert.deepEqual(oct6?.notes, ["Upcoming — agenda posted"]);
  assert.equal(oct5?.publisherStatusAtCapture, "Upcoming — agenda posted");
  assert.equal(oct5?.snapshotCapturedAt, "2026-10-03");
  assert.equal(oct5?.scheduledDate, "2026-10-05");
  assert.equal(oct5?.scheduledTime, "12:00 p.m.");
  assert.equal(oct5?.calendarStatus, "date-passed");
  assert.equal(oct5?.calendarStatusEvaluatedAt, "2026-10-21T18:00:00.000Z");
  assert.equal(oct5?.outcomeStatus, "unverified");
  assert.equal(oct5?.upcoming, false);

  // Blocked download from `data/sync-blocked.json` is recorded as unarchived discovery without fake items.
  assert.equal(built.pipeline?.blockedSync?.attemptedAt, "2026-10-19T20:56:47Z");
  assert.deepEqual(built.pipeline?.blockedSync?.meetingIds, ["finance-committee-2026-10-20"]);
  const blockedEntry = built.pipeline?.discoveredPostings?.find((entry) => entry.meetingId === "finance-committee-2026-10-20");
  assert.ok(blockedEntry);
  assert.equal(blockedEntry.archiveStatus, "download-failed");
  assert.equal(blockedEntry.promotedWithValidatedItems, false);
  assert.equal(blockedEntry.outcomeStatus, "unverified");
});

test("rejects corrupt extracted directories under data/meetings without mutating last-known-good records", () => {
  const corruptDir = path.join(ROOT, "data", "meetings", "2026", "city-council-2026-10-26");
  try {
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(
      path.join(corruptDir, "agenda.json"),
      JSON.stringify({ schemaVersion: 1, meetingId: "city-council-2026-10-26", items: [{ number: "1", quote: "fabricated" }] }),
    );
    const built = collectMeetings({ now: new Date(DENVER_AFTERNOON) });
    assert.ok(
      built.pipeline.rejectedExtractions.some((entry) => entry.meetingId === "city-council-2026-10-26"),
      "corrupt extraction directory must be flagged in pipeline.rejectedExtractions",
    );
    assert.equal(
      built.meetings.find((m) => m.id === "city-council-2026-10-26"),
      undefined,
      "unvalidated extraction must never be promoted into published meeting records",
    );
    // Last-known-good snapshot records remain completely intact.
    assert.equal(built.stats.totalMeetings, 1003);
    assert.equal(built.meetings.find((m) => m.id === "public-services-committee-2026-10-05")?.items?.length, 11);
  } finally {
    rmSync(path.join(ROOT, "data", "meetings"), { recursive: true, force: true });
  }
});

test("a missing capture timestamp yields no age rather than a fabricated one", () => {
  assert.equal(snapshotAgeDays(null, new Date(DENVER_AFTERNOON)), null);
  assert.equal(snapshotAgeDays("", new Date(DENVER_AFTERNOON)), null);
  assert.equal(snapshotAgeDays("2026-10-03", new Date(DENVER_AFTERNOON)), 18);
  assert.equal(snapshotAgeDays("2026-10-25", new Date(DENVER_AFTERNOON)), 0);
});

test("latest transcript follows dated holdings, not the newest row or an empty catalog entry", () => {
  const meetings = [
    { id: "a", date: "2026-09-14", bodyLabel: "City Council", transcript: { path: "a.md" }, transcripts: [{ path: "a.md" }] },
    { id: "b", date: "2026-09-22", bodyLabel: "Finance Committee", transcript: { path: "b.md" }, transcripts: [{ path: "b.md" }] },
    { id: "future", date: "2026-10-05", bodyLabel: "Public Services Committee", upcoming: true, transcript: { path: "c.md" }, transcripts: [{ path: "c.md" }] },
    { id: "no-date", bodyLabel: "Work Sessions", transcript: { path: "undated.md" }, transcripts: [{ path: "undated.md" }] },
    { id: "empty", date: "2026-10-06", bodyLabel: "Finance Committee", transcripts: [] },
  ];
  const latest = latestTranscriptRecord(meetings);
  assert.equal(latest?.meetingId, "b");
  assert.equal(latest?.date, "2026-09-22");
});
