#!/usr/bin/env node
/**
 * One-time transcript snapshot tool. It never downloads meeting video/audio.
 * YouTube caption retrieval is opt-in; ordinary builds and page views are local.
 *
 *   node scripts/harvest-transcripts.mjs --report
 *   node scripts/harvest-transcripts.mjs --fetch-youtube [--limit 10]
 *   node scripts/harvest-transcripts.mjs --import-vtt captions.vtt --meeting <meeting-id>
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyVideoUrl, parseWebVtt, renderTranscriptMarkdown, transcriptGapWorklist } from "./lib/transcript-harvest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEETINGS_PATH = path.join(ROOT, "src", "data", "meetings.json");
const LOCAL_DIR = path.join(ROOT, "src", "data", "transcripts");
const args = process.argv.slice(2);

function option(name, fallback = undefined) {
  const equals = args.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function optionNumber(name, fallback = 0) {
  const parsed = Number(option(name, fallback));
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function ensureMeetingIndex() {
  if (existsSync(MEETINGS_PATH)) return;
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-data.mjs")], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Unable to build the local meeting index");
}

function loadData() {
  ensureMeetingIndex();
  const index = JSON.parse(readFileSync(MEETINGS_PATH, "utf8"));
  return { index, meetings: index.meetings || [], gaps: transcriptGapWorklist(index.meetings || []) };
}

function report({ index, meetings, gaps }) {
  const videoMeetings = meetings.filter((meeting) => meeting.official?.video);
  const coveredMeetingCount = meetings.filter((meeting) => meeting.transcripts?.length || meeting.transcript).length;
  const attachedFiles = meetings.reduce((count, meeting) => count + (meeting.transcripts?.length || (meeting.transcript ? 1 : 0)), 0);
  const counts = Object.fromEntries(["youtube", "granicus", "other", "unknown"].map((provider) => [provider, gaps.filter((item) => item.provider === provider).length]));
  console.log(`Transcript coverage: ${coveredMeetingCount}/${index.stats.totalMeetings} meetings have a linked transcript (${attachedFiles} dated files).`);
  console.log(`Video coverage: ${videoMeetings.length} meetings have a video link; ${gaps.length} of those have no linked transcript.`);
  console.log(`Missing-caption sources: ${counts.youtube} YouTube · ${counts.granicus} Granicus · ${counts.other + counts.unknown} other/unclassified.`);
  if (gaps.length) {
    console.log("\nMeetings without a transcript:");
    for (const item of gaps) console.log(`${item.date}  ${item.bodyLabel}  ${item.meetingId}  [${item.provider}]  ${item.videoUrl}`);
  }
}

function meetingById(meetings, meetingId) {
  const meeting = meetings.find((item) => item.id === meetingId);
  if (!meeting) throw new Error(`Unknown meeting ID: ${meetingId}`);
  return meeting;
}

function transcriptPath(meeting) {
  return path.join(LOCAL_DIR, `${meeting.id}.md`);
}

function storeTranscript(meeting, { videoUrl, language, sourceLabel, cues, force = false }) {
  const output = transcriptPath(meeting);
  if (existsSync(output) && !force) {
    console.log(`skip ${meeting.id}: a local transcript file already exists (use --force to replace it)`);
    return false;
  }
  const markdown = renderTranscriptMarkdown({
    meeting,
    videoUrl,
    language,
    sourceLabel,
    capturedAt: new Date().toISOString().slice(0, 10),
    cues,
  });
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(output, markdown);
  console.log(`saved ${path.relative(ROOT, output)} (${cues.length} caption cues)`);
  return true;
}

function importVtt(data) {
  const source = option("--import-vtt");
  const meetingId = option("--meeting");
  if (!source || !meetingId) throw new Error("Usage: --import-vtt <file.vtt> --meeting <meeting-id> [--language en] [--video-url URL]");
  const meeting = meetingById(data.meetings, meetingId);
  const videoUrl = option("--video-url", meeting.official?.video);
  if (!videoUrl) throw new Error(`${meetingId} has no video URL; provide one with --video-url`);
  const cues = parseWebVtt(readFileSync(path.resolve(source), "utf8"));
  const provider = classifyVideoUrl(videoUrl);
  const sourceLabel = option("--source-label", `Imported ${provider} WebVTT captions`);
  storeTranscript(meeting, { videoUrl, language: option("--language", "en"), sourceLabel, cues, force: args.includes("--force") });
}

function findVtt(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".vtt"))
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b))[0] || null;
}

function runYtDlp(url, destination, subtitleMode) {
  const result = spawnSync("yt-dlp", [
    "--no-warnings",
    "--ignore-errors",
    "--skip-download",
    "--sub-langs", "en.*,en",
    "--sub-format", "vtt",
    subtitleMode,
    "--sleep-requests", "1",
    "--sleep-subtitles", "1",
    "--output", path.join(destination, "%(id)s.%(ext)s"),
    url,
  ], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") throw new Error("yt-dlp is required for --fetch-youtube (install yt-dlp, then retry)");
  const diagnostic = result.error?.message || [result.stderr, result.stdout]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(ERROR|WARNING):/i.test(line))
    .at(-1);
  return { ok: result.status === 0, diagnostic };
}

function fetchYouTube(data) {
  const limit = optionNumber("--limit", 0);
  const pending = data.gaps.filter((item) => item.provider === "youtube");
  const selected = limit ? pending.slice(0, limit) : pending;
  if (!selected.length) {
    console.log("No missing YouTube captions are available in the current snapshot.");
    return;
  }

  console.log(`Opt-in caption-only fetch: ${selected.length} YouTube meeting${selected.length === 1 ? "" : "s"}; no video/audio will be downloaded.`);
  let saved = 0;
  let unavailable = 0;
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const meeting = meetingById(data.meetings, item.meetingId);
    const output = transcriptPath(meeting);
    if (existsSync(output)) {
      console.log(`skip ${meeting.id}: local transcript file already exists`);
      continue;
    }

    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "cheyenne-captions-"));
    try {
      process.stdout.write(`[${index + 1}/${selected.length}] ${meeting.date} ${meeting.bodyLabel} · creator captions … `);
      let request = runYtDlp(item.videoUrl, temporaryDirectory, "--write-subs");
      let captionPath = findVtt(temporaryDirectory);
      let sourceLabel = "YouTube creator captions (en)";
      if (!captionPath) {
        process.stdout.write("not published; trying auto-captions … ");
        request = runYtDlp(item.videoUrl, temporaryDirectory, "--write-auto-subs");
        captionPath = findVtt(temporaryDirectory);
        sourceLabel = "YouTube auto-generated captions (en)";
      }
      if (!captionPath) {
        unavailable += 1;
        const detail = request.diagnostic ? ` (${request.diagnostic})` : "";
        console.log(`${request.ok ? "no English VTT captions" : "caption request failed or was unavailable"}${detail}`);
        continue;
      }
      const cues = parseWebVtt(readFileSync(captionPath, "utf8"));
      if (!cues.length) {
        unavailable += 1;
        console.log("empty/unparseable VTT; no transcript file written");
        continue;
      }
      if (storeTranscript(meeting, { videoUrl: item.videoUrl, language: "en", sourceLabel, cues })) saved += 1;
    } catch (error) {
      if (String(error.message).includes("yt-dlp is required")) throw error;
      unavailable += 1;
      console.log(`failed safely: ${error.message}`);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  console.log(`\nCaption harvest finished: ${saved} saved, ${unavailable} unavailable. Granicus recordings are not fetched; import their supplied VTT with --import-vtt.`);
}

try {
  const data = loadData();
  if (args.includes("--import-vtt")) importVtt(data);
  else if (args.includes("--fetch-youtube")) fetchYouTube(data);
  else report(data);
} catch (error) {
  console.error(`Transcript tool stopped: ${error.message}`);
  process.exitCode = 1;
}
