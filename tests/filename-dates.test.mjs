import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  inferMeetingBodyFromFilename,
  parseArchiveDate,
  parseFilenameDate,
  parseMunicipalMeetingFilename,
} from "../scripts/lib/filename-dates.mjs";

const meetingsIndex = JSON.parse(await readFile(new URL("../src/data/meetings.json", import.meta.url), "utf8"));

function meetingForDocument(path) {
  return meetingsIndex.meetings.find((meeting) => meeting.docs.some((document) => document.path === path));
}

test("parses Granicus timestamp folders and ISO meeting folders as real calendar dates", () => {
  assert.equal(parseArchiveDate("1740384000Feb 24, 2025 - City Council Meeting"), "2025-02-24");
  assert.equal(parseArchiveDate("2025-6-4-work-session"), "2025-06-04");
  assert.equal(parseArchiveDate("2025-02-30-special-meeting"), null);
  assert.equal(parseArchiveDate("municipal-docs"), null);
});

test("parses ISO and filename-only municipal dates without truncating four-digit years", () => {
  assert.equal(parseFilenameDate("agenda-packets/CHEY-2022-11-01_packet-17.pdf"), "2022-11-01");
  assert.equal(parseFilenameDate("municipal-docs/psc-sm-05-22-23-agenda.pdf"), "2023-05-22");
  assert.equal(parseFilenameDate("municipal-docs/cow-06-04-2025-agenda.pdf"), "2025-06-04");
  assert.equal(parseFilenameDate("municipal-docs/2025.10.10_reed-ave-corridor.pdf"), "2025-10-10");
  assert.equal(parseFilenameDate("municipal-docs/city-council-work-session_12122025.pdf"), "2025-12-12");
  assert.equal(parseFilenameDate("municipal-docs/cow-02-30-2025-agenda.pdf"), null);
  assert.equal(parseFilenameDate("municipal-docs/agenda-fy-2025.pdf"), null);
});

test("preserves sub-prefix body and special-meeting semantics", () => {
  assert.deepEqual(parseMunicipalMeetingFilename("psc-sm-05-22-23-agenda.pdf"), {
    date: "2023-05-22",
    body: "public-services-committee",
    note: "Special Meeting",
  });
  assert.deepEqual(parseMunicipalMeetingFilename("cow-06-04-2025-agenda.pdf"), {
    date: "2025-06-04",
    body: "work-sessions",
  });
  assert.equal(inferMeetingBodyFromFilename("city-council-work-session_12122025.pdf"), "work-sessions");
});

test("build index retains filename-dated municipal records under their correct meeting IDs", () => {
  assert.ok(meetingsIndex.stats.totalDocuments >= 5_118, `expected at least 5,118 indexed files; got ${meetingsIndex.stats.totalDocuments}`);
  assert.ok(meetingsIndex.stats.totalMeetings >= 1_003, `expected the current source snapshots' 1,003+ meeting records; got ${meetingsIndex.stats.totalMeetings}`);

  const packet = meetingForDocument("agenda-packets/CHEY-2022-11-01_packet-17.pdf");
  assert.equal(packet?.date, "2022-11-01");

  const specialPsc = meetingForDocument("municipal-docs/psc-sm-05-22-23-agenda.pdf");
  assert.equal(specialPsc?.id, "public-services-committee-2023-05-22-special");

  const cowAgenda = meetingForDocument("municipal-docs/cow-06-04-2025-agenda.pdf");
  assert.equal(cowAgenda?.id, "work-sessions-2025-06-04");
  assert.equal(
    meetingsIndex.meetings.some((meeting) => meeting.docs.some((document) => document.path === "municipal-docs/cow-06-04-2025-agenda.pdf") && meeting.date.startsWith("2020-")),
    false,
    "four-digit years must not be truncated to 20xx",
  );

  assert.equal(meetingForDocument("municipal-docs/2025.10.10_reed-ave-corridor-6th-pennypresentation.pdf")?.id, "work-sessions-2025-10-10");
  assert.equal(meetingForDocument("municipal-docs/city-council-work-session_12122025.pdf")?.id, "work-sessions-2025-12-12");
});
