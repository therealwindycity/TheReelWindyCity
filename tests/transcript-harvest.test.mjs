import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyVideoUrl,
  parseWebVtt,
  renderTranscriptMarkdown,
  sampleTranscriptCues,
  timestampedMarkdownCues,
  transcriptGapWorklist,
  youtubeVideoId,
} from "../scripts/lib/transcript-harvest.mjs";

const meetingsIndex = JSON.parse(readFileSync(new URL("../src/data/meetings.json", import.meta.url), "utf8"));

test("WebVTT import preserves timestamped source text and strips formatting", () => {
  const cues = parseWebVtt(`WEBVTT\n\n1\n00:00:01.200 --> 00:00:02.000 align:start\n<v Chair>We &amp; you</v><br>can read this.\n\n2\n00:01:00.700 --> 00:01:01.000\nWe & you can read this.\n\n3\n00:02:05.000 --> 00:02:07.000\nFinal <i>sentence</i>.\n`);
  assert.deepEqual(cues, [
    { timestamp: "00:00:01", text: "We & you can read this." },
    { timestamp: "00:01:00", text: "We & you can read this." },
    { timestamp: "00:02:05", text: "Final sentence." },
  ]);
});

test("invalid and empty caption payloads do not create transcript cues", () => {
  assert.deepEqual(parseWebVtt("WEBVTT\n\nNOTE nothing here\n"), []);
  assert.deepEqual(parseWebVtt("not a caption file"), []);
});

test("provider detection and YouTube ID parsing are restricted to recognized hosts", () => {
  assert.equal(classifyVideoUrl("https://www.youtube.com/watch?v=5e9RkW1YWNc"), "youtube");
  assert.equal(classifyVideoUrl("https://cheyenne.granicus.com/Archive.php?view_id=5&clip_id=100"), "granicus");
  assert.equal(classifyVideoUrl("https://example.com/video"), "other");
  assert.equal(youtubeVideoId("https://youtu.be/5e9RkW1YWNc?t=12"), "5e9RkW1YWNc");
  assert.equal(youtubeVideoId("https://example.com/watch?v=5e9RkW1YWNc"), null);
});

test("worklist excludes transcripts already attached to meetings", () => {
  const gaps = transcriptGapWorklist([
    { id: "covered", date: "2025-01-01", body: "city-council", bodyLabel: "City Council", dateLabel: "January 1, 2025", official: { video: "https://youtu.be/5e9RkW1YWNc" }, transcripts: [{ path: "a.md" }] },
    { id: "yt", date: "2025-02-01", body: "city-council", bodyLabel: "City Council", dateLabel: "February 1, 2025", official: { video: "https://youtu.be/5e9RkW1YWNc" } },
    { id: "granicus", date: "2025-03-01", body: "planning-commission", bodyLabel: "Planning Commission", dateLabel: "March 1, 2025", official: { video: "https://cheyenne.granicus.com/Archive.php?clip_id=1" } },
  ]);
  assert.deepEqual(gaps.map(({ meetingId, provider }) => [meetingId, provider]), [["granicus", "granicus"], ["yt", "youtube"]]);
});

test("snapshot gap audit matches the committed meeting and caption coverage", () => {
  const { stats, meetings } = meetingsIndex;
  const gaps = transcriptGapWorklist(meetings);
  assert.equal(stats.totalMeetings, 1003);
  assert.equal(stats.totalDocuments, 5118);
  assert.equal(stats.totalTranscripts, 84);
  assert.equal(stats.totalTranscriptFiles, 85);
  assert.equal(meetings.filter((meeting) => meeting.transcripts?.length || meeting.transcript).length, 82);
  assert.equal(gaps.length, 83);
  assert.equal(gaps.filter((gap) => gap.provider === "youtube").length, 46);
  assert.equal(gaps.filter((gap) => gap.provider === "granicus").length, 37);
});

test("transcript markdown round-trips timestamped text and carries provenance", () => {
  const meeting = { id: "city-council-2025-01-13", bodyLabel: "City Council", dateLabel: "Monday, January 13, 2025" };
  const markdown = renderTranscriptMarkdown({
    meeting,
    videoUrl: "https://www.youtube.com/watch?v=5e9RkW1YWNc",
    sourceLabel: "YouTube auto-generated captions (en)",
    capturedAt: "2026-10-05",
    cues: [{ timestamp: "00:00:01", text: "The minutes are part of the public record." }],
  });
  assert.match(markdown, /\*\*Meeting ID:\*\* `city-council-2025-01-13`/);
  assert.match(markdown, /YouTube auto-generated captions/);
  assert.match(markdown, /\[00:00:01\] The minutes are part of the public record\./);
  assert.deepEqual(timestampedMarkdownCues(markdown), [{ timestamp: "00:00:01", text: "The minutes are part of the public record." }]);
  assert.throws(() => renderTranscriptMarkdown({ meeting, videoUrl: "https://example.com/video", cues: [{ timestamp: "00:00:01", text: "No" }] }), /recognized YouTube or Granicus/);
  assert.throws(() => renderTranscriptMarkdown({ meeting, videoUrl: "https://youtu.be/5e9RkW1YWNc", cues: [] }), /No timestamped caption cues/);
});

test("static meeting excerpts are sampled evenly without modifying source cues", () => {
  const cues = Array.from({ length: 30 }, (_, index) => ({ timestamp: String(index), text: String(index) }));
  const excerpt = sampleTranscriptCues(cues, 4);
  assert.deepEqual(excerpt.map((cue) => cue.timestamp), ["0", "10", "19", "29"]);
  assert.equal(cues.length, 30);
});
