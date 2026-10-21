#!/usr/bin/env node
/**
 * Build-out script for Civic Cheyenne's public-record data.
 *
 * Assembles the static data served by the website from:
 *   1. Archive repository tree snapshots under `src/data/`
 *   2. Curated official-link snapshot `src/data/official-meetings.json`
 *   3. Validated pipeline extractions under `data/meetings/<year>/<id>/`
 *      (accepted ONLY when `validateMeetingDirectory()` reports zero problems;
 *      failed or corrupt extractions are never promoted into the index)
 *   4. Schedule discovery artifacts (`data/detected-upcoming.json`,
 *      `data/source-check.json`, `data/sync-state.json`, `data/sync-blocked.json`)
 *      with strict separation between discovery, download, validation, indexing,
 *      calendar evaluation, and outcome verification.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inferMeetingBodyFromFilename,
  parseArchiveDate,
  parseFilenameDate,
  parseMunicipalMeetingFilename,
} from "./lib/filename-dates.mjs";
import { sampleTranscriptCues, timestampedMarkdownCues, youtubeVideoId } from "./lib/transcript-harvest.mjs";
import {
  DENVER_TIME_ZONE,
  STATIC_BUILD_STALE_HOURS,
  latestTranscriptRecord,
  normalizeMeetingDate,
  resolveMeetingCalendar,
} from "./lib/civic-calendar.mjs";
import { validateMeetingDirectory } from "./lib/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DATA = path.join(ROOT, "src", "data");
const LOCAL_TRANSCRIPTS = path.join(SRC_DATA, "transcripts");
const VALIDATED_AGENDAS = path.join(ROOT, "data", "meetings");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const PUBLIC_SOURCES = path.join(ROOT, "public", "sources");
const PUBLIC_TRANSCRIPTS = path.join(ROOT, "public", "transcripts");
const LOCAL_TRANSCRIPT_REPO = "TheReelWindyCity";

const OWNER = "therealwindycity";
const REPOS = [
  { id: "cheyenne-archives-2025-2026", snapshot: "archive-tree.json" },
  { id: "The-Real-Windy-City-", snapshot: "transcript-tree.json" },
  { id: "cheyenne-archives-2023-2024", snapshot: "repos/cheyenne-archives-2023-2024.json" },
  { id: "cheyenne-archives-2022", snapshot: "repos/cheyenne-archives-2022.json" },
  { id: "cheyenne-archives-2018-2021", snapshot: "repos/cheyenne-archives-2018-2021.json" },
  { id: "cheyenne-archives-2014-2017", snapshot: "repos/cheyenne-archives-2014-2017.json" },
  { id: "cheyenne-archives-2008-2013", snapshot: "repos/cheyenne-archives-2008-2013.json" },
];

const OFFICIAL_SOURCES = {
  agenda: "sources/2026-01-26-agenda.html",
  minutes: "sources/2026-01-26-minutes.pdf",
  "2026-01-26-warrants": "sources/2026-01-26-warrants.pdf",
};

const BODY_LABELS = {
  "city-council": "City Council",
  "finance-committee": "Finance Committee",
  "public-services-committee": "Public Services Committee",
  "planning-commission": "Planning Commission",
  "board-of-adjustment": "Board of Adjustment",
  "historic-preservation-board": "Historic Preservation Board",
  "urban-renewal-authority": "Urban Renewal Authority",
  "work-sessions": "Work Sessions",
  "board-of-county-commissioners": "Board of County Commissioners",
};
const BODY_ORDER = Object.keys(BODY_LABELS);
const CITY_FILES = "https://www.cheyennecity.org/files/sharedassets/public/v/1/your-government/city-council/";
const GRANICUS = "https://cheyenne.granicus.com";
const LIVE_CHECK = path.join(ROOT, "data", "source-check.json");
const DETECTED_UPCOMING = path.join(ROOT, "data", "detected-upcoming.json");
const SYNC_STATE = path.join(ROOT, "data", "sync-state.json");
const SYNC_BLOCKED = path.join(ROOT, "data", "sync-blocked.json");
const OFFICIAL_SCHEDULE_URL = "https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas";
const GRANICUS_UPCOMING_URL = `${GRANICUS}/ViewPublisher.php?view_id=5&widget=upcoming`;
export const LIVE_CHECK_MAX_AGE_HOURS = 72;

function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`note: ignoring unreadable ${path.relative(ROOT, file)} (${error.message})`);
    return null;
  }
}

export function buildInstant(argv = process.argv.slice(2), env = process.env) {
  const index = argv.indexOf("--now");
  const raw = index !== -1 ? argv[index + 1] : env.CIVIC_BUILD_TIME;
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`--now / CIVIC_BUILD_TIME is not a valid instant: ${raw}`);
  return parsed;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function refreshSnapshots() {
  for (const { id, snapshot } of REPOS) {
    const target = path.join(SRC_DATA, snapshot);
    process.stdout.write(`Refreshing ${OWNER}/${id} … `);
    const tree = gh(["api", `repos/${OWNER}/${id}/git/trees/main?recursive=1`]);
    const parsed = JSON.parse(tree);
    if (!parsed.tree || parsed.truncated) throw new Error(`Incomplete tree for ${id}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(parsed, null, 2) + "\n");
    console.log(`${parsed.tree.length} entries (sha ${parsed.sha.slice(0, 10)})`);
  }
}

function dateLabel(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function shortDateLabel(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function weekdayOnlyLabel(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", timeZone: "UTC",
  });
}

function cityUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, CITY_FILES).toString();
}

function youtubeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://www.youtube.com/watch?v=${value}`;
}

function youtubeTimestampUrl(videoId, timestamp) {
  if (!videoId || !/^\d{2}:\d{2}:\d{2}$/.test(timestamp)) return undefined;
  const [hours, minutes, seconds] = timestamp.split(":").map(Number);
  if (minutes > 59 || seconds > 59) return undefined;
  const start = hours * 3600 + minutes * 60 + seconds;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${start}s`;
}

function noteFromFolderName(name) {
  const lower = name.toLowerCase();
  if (lower.includes("sine die")) return "Sine Die Meeting";
  if (lower.includes("first regular")) return "First Regular Meeting";
  if (lower.includes("special")) {
    if (lower.includes("public hearing")) return "Special Meeting and Public Hearing";
    if (lower.includes("budget")) return "Special Meeting (budget)";
    return "Special Meeting";
  }
  if (lower.includes("cancelled") || lower.includes("canceled")) return "Meeting Cancelled";
  if (lower.includes("no video")) return "No video available";
  return undefined;
}

function eventSuffix(note) {
  const lower = (note || "").toLowerCase();
  if (lower.includes("sine die")) return "sine-die";
  if (lower.includes("first regular")) return "first-regular";
  if (lower.includes("special")) return "special";
  return "";
}

function bodyFromFolderName(name) {
  const lower = name.toLowerCase();
  if (lower.includes("board-of-adjustment") || lower.includes("board of adjustment")) return "board-of-adjustment";
  if (lower.includes("planning-commission") || lower.includes("planning commission")) return "planning-commission";
  if (lower.includes("historic-preservation")) return "historic-preservation-board";
  if (lower.includes("urban-renewal")) return "urban-renewal-authority";
  if (lower.includes("work-session") || lower.includes("work session") || lower.includes("-cow") || lower.includes("committee-of-the-whole") || lower.includes("committee of the whole")) return "work-sessions";
  if (lower.includes("county")) return "board-of-county-commissioners";
  return "city-council";
}

function bodyFromRoot(root, folder) {
  const slug = root.toLowerCase().replaceAll("_", "-");
  if (BODY_LABELS[slug]) return slug;
  return bodyFromFolderName(folder);
}

function parseBodyAndDateFromMeetingId(meetingId) {
  const match = String(meetingId || "").match(/^([a-z0-9-]+)-(\d{4}-\d{2}-\d{2})$/);
  if (!match || !BODY_LABELS[match[1]]) return null;
  const date = normalizeMeetingDate(match[2]);
  if (!date) return null;
  return { id: meetingId, body: match[1], bodyLabel: BODY_LABELS[match[1]], date };
}

function listMeetingArtifactDirs(rootDir) {
  if (!rootDir || !existsSync(rootDir)) return [];
  const results = [];
  for (const yearEntry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!yearEntry.isDirectory()) continue;
    const yearDir = path.join(rootDir, yearEntry.name);
    for (const meetingEntry of readdirSync(yearDir, { withFileTypes: true })) {
      if (meetingEntry.isDirectory()) results.push(path.join(yearDir, meetingEntry.name));
    }
  }
  return results.sort();
}

/**
 * Assemble the meeting index with explicit provenance stages, orthogonal status
 * axes, preserved raw source notes, and non-promotion of failed downloads.
 */
export function collectMeetings(options = {}) {
  const {
    now = new Date(),
    official: officialOverride = null,
    repos = REPOS,
    localTranscriptsDir = LOCAL_TRANSCRIPTS,
    validatedAgendasDir = VALIDATED_AGENDAS,
    liveCheck: liveCheckOverride = undefined,
    detectedTable: detectedTableOverride = undefined,
    syncState: syncStateOverride = undefined,
    syncBlocked: syncBlockedOverride = undefined,
  } = options;
  const nowDate = now instanceof Date ? now : new Date(now);
  const indexedAt = nowDate.toISOString();

  /** @type {Map<string, any>} */
  const meetings = new Map();
  let documentCount = 0;
  let transcriptCount = 0;
  let transcriptFileCount = 0;
  let localValidatedTranscriptCount = 0;

  const ensure = (body, date, note) => {
    const suffix = eventSuffix(note);
    const key = `${body}|${date}|${suffix}`;
    if (!meetings.has(key)) {
      meetings.set(key, {
        id: `${body}-${date}${suffix ? `-${suffix}` : ""}`,
        body,
        bodyLabel: BODY_LABELS[body] || body,
        date,
        dateLabel: dateLabel(date),
        shortDate: shortDateLabel(date),
        notes: [],
        docs: [],
        official: {},
        ingestionStage: "meeting-indexed",
        timestamps: {
          discoveredAt: null,
          downloadedAt: null,
          validatedAt: null,
          indexedAt,
          outcomeVerifiedAt: null,
        },
      });
    }
    return meetings.get(key);
  };

  const addNote = (meeting, note) => {
    if (!note || meeting.notes.includes(note)) return;
    const genericSpecial = "Special Meeting";
    const isGenericSpecial = note === genericSpecial;
    const isSpecificSpecial = note.startsWith("Special Meeting") && !isGenericSpecial;
    if (isGenericSpecial && meeting.notes.some((existing) => existing.startsWith("Special Meeting") && existing !== genericSpecial)) return;
    if (isSpecificSpecial) {
      const genericIndex = meeting.notes.indexOf(genericSpecial);
      if (genericIndex >= 0) meeting.notes.splice(genericIndex, 1);
    }
    meeting.notes.push(note);
  };

  const addDoc = (meeting, repo, docPath) => {
    if (!meeting.docs.some((doc) => doc.repo === repo && doc.path === docPath)) {
      meeting.docs.push({ repo, path: docPath });
      documentCount += 1;
    }
  };

  const pendingFilenameDocs = [];

  for (const { id: repo, snapshot } of repos) {
    const tree = JSON.parse(readFileSync(path.join(SRC_DATA, snapshot), "utf8")).tree;
    for (const entry of tree) {
      if (entry.type !== "blob") continue;
      if (repo === "The-Real-Windy-City-" && entry.path.startsWith("cheyenne-2026-transcripts/")
        && entry.path.toLowerCase().endsWith(".md") && entry.path !== "cheyenne-2026-transcripts/README.md") {
        transcriptFileCount += 1;
      }

      const transcript = entry.path.match(/^cheyenne-\d{4}-transcripts\/([^/]+)\/(\d{4}-\d{2}-\d{2})(?:-[^/]*)?\.md$/);
      if (transcript && BODY_LABELS[transcript[1]]) {
        const date = parseArchiveDate(transcript[2]);
        if (date) {
          const meeting = ensure(transcript[1], date);
          const candidate = { repo, path: entry.path };
          meeting.transcripts ||= [];
          if (!meeting.transcripts.some((item) => item.repo === repo && item.path === entry.path)) {
            meeting.transcripts.push(candidate);
            transcriptCount += 1;
          }
          if (!meeting.transcript || entry.path.endsWith(".clean.md")) meeting.transcript = candidate;
        }
        continue;
      }

      const file = entry.path.split("/").pop();
      const municipal = entry.path.match(/(?:^|\/)municipal-docs\/(?:[^/]+\/)?([^/]+)$/i);
      if (municipal) {
        const datedMunicipal = parseMunicipalMeetingFilename(file);
        if (datedMunicipal?.date && datedMunicipal.body) {
          const meeting = ensure(datedMunicipal.body, datedMunicipal.date, datedMunicipal.note);
          addNote(meeting, datedMunicipal.note);
          addDoc(meeting, repo, entry.path);
          continue;
        }
        if (datedMunicipal?.date) {
          pendingFilenameDocs.push({ repo, path: entry.path, date: datedMunicipal.date });
          continue;
        }
      }

      const parts = entry.path.split("/");
      let folderIndex = -1;
      let folderDate = null;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const date = parseArchiveDate(parts[i]);
        if (date) {
          folderIndex = i;
          folderDate = date;
          break;
        }
      }
      if (folderIndex !== -1 && folderDate) {
        const folder = parts[folderIndex];
        const body = bodyFromRoot(parts[0], folder);
        const note = noteFromFolderName(folder);
        const meeting = ensure(body, folderDate, note);
        addNote(meeting, note);
        addDoc(meeting, repo, entry.path);
        continue;
      }

      if (entry.path.startsWith("agenda-packets/")) {
        const date = parseFilenameDate(file);
        if (date) {
          const body = inferMeetingBodyFromFilename(file) || "city-council";
          const note = noteFromFolderName(file);
          const meeting = ensure(body, date, note);
          addNote(meeting, note);
          addDoc(meeting, repo, entry.path);
        }
      }
    }
  }

  const official = officialOverride ?? JSON.parse(readFileSync(path.join(SRC_DATA, "official-meetings.json"), "utf8"));
  const snapshotCapturedAt = official.captured ?? null;

  const mergeOfficial = (body, row) => {
    const meeting = ensure(body, row.d, row.n);
    if (row.c) {
      meeting.official.agenda = `${GRANICUS}/AgendaViewer.php?view_id=5&clip_id=${row.c}`;
      meeting.official.video = `${GRANICUS}/Archive.php?view_id=5&clip_id=${row.c}`;
      if (row.minutes !== false) meeting.official.minutes = `${GRANICUS}/MinutesViewer.php?view_id=5&clip_id=${row.c}`;
    }
    if (row.a) meeting.official.agenda = cityUrl(row.a);
    if (row.m) meeting.official.minutes = cityUrl(row.m);
    if (row.v) meeting.official.video = youtubeUrl(row.v);
    if (row.n) addNote(meeting, row.n);
  };

  for (const row of official.cityCouncil) mergeOfficial("city-council", row);
  for (const row of official.financeCommittee) mergeOfficial("finance-committee", row);
  for (const row of official.publicServicesCommittee) mergeOfficial("public-services-committee", row);

  // Curated postings from snapshot capture (both current `upcoming[]` and any relocated `posted[]`).
  for (const upcoming of [...(official.upcoming ?? []), ...(official.posted ?? [])]) {
    if (!normalizeMeetingDate(upcoming.date)) {
      console.warn(`note: skipped a curated upcoming row with no resolvable date (${upcoming.id ?? upcoming.body})`);
      continue;
    }
    const isoDate = normalizeMeetingDate(upcoming.date);
    const meeting = ensure(upcoming.body, isoDate);
    meeting.dayLabel ||= upcoming.dayLabel || weekdayOnlyLabel(isoDate);
    meeting.time ||= upcoming.time;
    meeting.location ||= upcoming.location;
    meeting.items = upcoming.items ?? meeting.items;
    meeting.zoom = upcoming.zoom ?? meeting.zoom;
    if (upcoming.agendaPath) meeting.official.agenda ||= cityUrl(upcoming.agendaPath);
    if (upcoming.granicusUrl) meeting.official.granicus ||= upcoming.granicusUrl;
    if (upcoming.status) meeting.status = String(upcoming.status).toLowerCase();
    if (upcoming.rescheduledTo) meeting.rescheduledTo = upcoming.rescheduledTo;
    if (upcoming.canceled === true) meeting.canceled = true;
    meeting.agendaPosted = true;
    meeting.postedInCapture = true;
    meeting.ingestionStage = "agenda-validated";
  }

  // Stage 3 & 4 bridge: ingest pipeline extractions under `data/meetings/<year>/<id>/`
  // ONLY when `validateMeetingDirectory()` confirms verbatim contiguous source quotes
  // and structural soundness. Any invalid/partial directory is rejected without
  // mutating or erasing last-known-good records.
  const rejectedExtractions = [];
  const validatedExtractions = [];
  for (const dir of listMeetingArtifactDirs(validatedAgendasDir)) {
    const problems = validateMeetingDirectory(dir, { requireAnalysis: false });
    if (problems.length > 0) {
      const name = path.basename(dir);
      rejectedExtractions.push({ meetingId: name, dir: path.relative(ROOT, dir), problems });
      console.warn(`note: rejected unvalidated agenda extraction in ${dir}: ${problems[0]}`);
      continue;
    }
    const agenda = JSON.parse(readFileSync(path.join(dir, "agenda.json"), "utf8"));
    const parsedId = parseBodyAndDateFromMeetingId(agenda.meetingId);
    if (!parsedId) {
      rejectedExtractions.push({ meetingId: agenda.meetingId, dir: path.relative(ROOT, dir), problems: [`unrecognized body/date id: ${agenda.meetingId}`] });
      continue;
    }
    const meeting = ensure(parsedId.body, parsedId.date);
    meeting.dayLabel ||= weekdayOnlyLabel(parsedId.date);
    meeting.items = agenda.items.map((item) => ({
      number: String(item.number),
      kind: item.kind || "Other",
      text: item.text,
    }));
    if (/granicus\.com/i.test(agenda.sourceUrl)) {
      meeting.official.granicus ||= agenda.sourceUrl;
      meeting.official.agenda ||= agenda.sourceUrl;
    } else if (agenda.sourceUrl) {
      meeting.official.agenda ||= agenda.sourceUrl;
    }
    meeting.agendaPosted = true;
    meeting.archiveUnavailable = undefined;
    meeting.ingestionStage = "meeting-indexed";
    meeting.timestamps.downloadedAt = agenda.fetchedAt ?? null;
    meeting.timestamps.validatedAt = agenda.fetchedAt ?? indexedAt;
    validatedExtractions.push({
      meetingId: agenda.meetingId,
      downloadedAt: agenda.fetchedAt ?? null,
      items: agenda.items.length,
    });
  }

  // Stage 1: Schedule discovery artifacts (`data/detected-upcoming.json` from watcher
  // and `data/source-check.json` from bounded build-time check).
  // Discovered rows lacking validated agenda items are marked `posting-discovered` +
  // `archiveUnavailable: true` and NEVER acquire invented items, Zoom credentials,
  // locations, or outcomes.
  const discoveredPostings = [];
  const mergeDiscoveredSource = (records, observedAt, sourceKind) => {
    for (const record of records) {
      const date = normalizeMeetingDate(record.date);
      if (!date) continue;
      const body = record.body || "unknown";
      const hasKnownBody = Boolean(BODY_LABELS[body]);
      const bodyLabel = BODY_LABELS[body] || record.bodyLabel || body;
      const existing = hasKnownBody ? meetings.get(`${body}|${date}|`) : null;
      const hasValidatedItems = Boolean(existing?.items?.length || existing?.docs?.length);
      const meeting = ensure(body, date);
      meeting.bodyLabel ||= bodyLabel;
      meeting.dayLabel ||= weekdayOnlyLabel(date);
      meeting.time ||= record.time || undefined;
      if (record.agendaUrl) {
        meeting.official.agenda ||= record.agendaUrl;
        meeting.official.granicus ||= record.agendaUrl;
        meeting.agendaPosted = true;
      }
      meeting.postedOnOfficialTable = true;
      meeting.sourceObservedAt = observedAt ?? undefined;
      meeting.timestamps.discoveredAt ||= observedAt ?? null;
      if (!hasValidatedItems) {
        meeting.ingestionStage = "posting-discovered";
        meeting.archiveUnavailable = true;
      }
      const resolvedCal = resolveMeetingCalendar({ ...meeting, date }, { now: nowDate });
      discoveredPostings.push({
        meetingId: meeting.id,
        body,
        bodyLabel,
        scheduledDate: date,
        scheduledTime: record.time || null,
        agendaUrl: record.agendaUrl || null,
        discoveredAt: observedAt ?? null,
        source: sourceKind,
        archiveStatus: hasValidatedItems ? "validated" : "archive-unavailable",
        promotedWithValidatedItems: hasValidatedItems,
        calendarStatus: resolvedCal.status,
        outcomeStatus: resolvedCal.outcomeStatus,
      });
    }
  };

  const detectedTable = detectedTableOverride !== undefined
    ? detectedTableOverride
    : readJsonIfPresent(DETECTED_UPCOMING);
  let detectedTableMeta = null;
  if (detectedTable) {
    const discoveredAt = typeof detectedTable.discoveredAt === "string"
      ? detectedTable.discoveredAt
      : typeof detectedTable.checkedAt === "string"
        ? detectedTable.checkedAt
        : null;
    const usable = Array.isArray(detectedTable.meetings);
    detectedTableMeta = {
      discoveredAt,
      sourceUrl: detectedTable.sourceUrl ?? detectedTable.source ?? GRANICUS_UPCOMING_URL,
      meetings: usable ? detectedTable.meetings.length : 0,
      used: usable,
    };
    if (usable) mergeDiscoveredSource(detectedTable.meetings, discoveredAt, "watcher-table");
  }

  const liveCheck = liveCheckOverride !== undefined
    ? liveCheckOverride
    : readJsonIfPresent(LIVE_CHECK);
  let liveCheckMeta = null;
  if (liveCheck) {
    const observedAt = typeof liveCheck.observedAt === "string" ? liveCheck.observedAt : null;
    const observedMs = observedAt ? Date.parse(observedAt) : Number.NaN;
    const ageHours = Number.isFinite(observedMs) ? Math.max(0, Math.round((nowDate.getTime() - observedMs) / 3_600_000)) : null;
    const usable = liveCheck.ok === true
      && Array.isArray(liveCheck.meetings)
      && ageHours !== null
      && ageHours <= LIVE_CHECK_MAX_AGE_HOURS;
    liveCheckMeta = {
      observedAt,
      ok: liveCheck.ok === true,
      used: usable,
      stale: ageHours !== null && ageHours > LIVE_CHECK_MAX_AGE_HOURS,
      ageHours,
      sourceUrl: liveCheck.sourceUrl ?? GRANICUS_UPCOMING_URL,
      error: liveCheck.error ?? null,
      meetings: Array.isArray(liveCheck.meetings) ? liveCheck.meetings.length : 0,
    };
    if (!usable) {
      console.warn(
        `note: posted-meeting check is not being used (ok=${liveCheck.ok === true}, age=${ageHours ?? "unknown"}h); ` +
        "the captured snapshot is the public source of record.",
      );
    } else {
      mergeDiscoveredSource(liveCheck.meetings, liveCheckMeta.observedAt, "build-live-check");
    }
  }

  // Record failed sync / blocked discovery markers honestly WITHOUT promoting failed
  // downloads into the `meetings[]` catalog or inventing items, URLs, or outcomes.
  const syncBlocked = syncBlockedOverride !== undefined
    ? syncBlockedOverride
    : readJsonIfPresent(SYNC_BLOCKED);
  let blockedSyncMeta = null;
  if (syncBlocked && typeof syncBlocked.meetingIds === "string" && syncBlocked.meetingIds.trim()) {
    const attemptedAt = typeof syncBlocked.attemptedAt === "string" && Number.isFinite(Date.parse(syncBlocked.attemptedAt))
      ? syncBlocked.attemptedAt
      : null;
    const ids = syncBlocked.meetingIds.split(",").map((id) => id.trim()).filter(Boolean);
    const entries = ids.map((id) => {
      const parsed = parseBodyAndDateFromMeetingId(id);
      const cal = resolveMeetingCalendar({ date: parsed?.date ?? null }, { now: nowDate });
      return {
        meetingId: id,
        body: parsed?.body ?? "unknown",
        bodyLabel: parsed?.bodyLabel ?? id,
        scheduledDate: parsed?.date ?? null,
        scheduledTime: null,
        agendaUrl: null,
        discoveredAt: attemptedAt,
        source: "sync-blocked",
        archiveStatus: "download-failed",
        promotedWithValidatedItems: false,
        calendarStatus: cal.status,
        outcomeStatus: "unverified",
      };
    });
    for (const entry of entries) discoveredPostings.push(entry);
    blockedSyncMeta = {
      attemptedAt,
      attempts: Number.isFinite(Number(syncBlocked.attempts)) ? Number(syncBlocked.attempts) : 1,
      reason: syncBlocked.reason ?? "sync-failed",
      meetingIds: ids,
      entries,
    };
  }

  // Locally harvested or supplied caption files under `src/data/transcripts`.
  if (existsSync(localTranscriptsDir)) {
    const byId = new Map([...meetings.values()].map((meeting) => [meeting.id, meeting]));
    for (const file of readdirSync(localTranscriptsDir).filter((name) => name.toLowerCase().endsWith(".md") && name !== "README.md").sort()) {
      const meetingId = file.slice(0, -3);
      const meeting = byId.get(meetingId);
      if (!meeting) throw new Error(`Local transcript ${file} does not match a meeting ID in the archive snapshot`);
      const markdown = readFileSync(path.join(localTranscriptsDir, file), "utf8");
      const cues = timestampedMarkdownCues(markdown);
      const videoUrl = markdown.match(/^\*\*Video:\*\*\s*(https?:\/\/\S+)/m)?.[1] || meeting.official.video;
      const videoId = youtubeVideoId(videoUrl);
      const publicPath = `transcripts/${file}`;
      const candidate = { repo: LOCAL_TRANSCRIPT_REPO, path: `src/data/transcripts/${file}`, local: true, publicPath, size: Buffer.byteLength(markdown) };
      meeting.transcripts ||= [];
      if (!meeting.transcripts.some((item) => item.repo === candidate.repo && item.path === candidate.path)) {
        meeting.transcripts.push(candidate);
        transcriptCount += 1;
        transcriptFileCount += 1;
        localValidatedTranscriptCount += 1;
      }
      if (!meeting.transcript) meeting.transcript = candidate;
      if (cues.length) {
        meeting.transcriptExcerpts = sampleTranscriptCues(cues).map((cue, index) => ({
          id: `local:${meeting.id}:${cue.timestamp}:${index}`,
          timestamp: cue.timestamp,
          text: cue.text,
          sourceUrl: publicPath,
          videoUrl: youtubeTimestampUrl(videoId, cue.timestamp),
        }));
      }
    }
  }

  for (const document of pendingFilenameDocs) {
    const sameDayMeetings = [...meetings.values()].filter((meeting) => meeting.date === document.date);
    if (sameDayMeetings.length === 1) {
      addDoc(sameDayMeetings[0], document.repo, document.path);
    } else {
      console.warn(`note: left filename-dated document unlinked because its meeting body is ambiguous (${document.path})`);
    }
  }

  // Evaluate orthogonal statuses at `nowDate` in America/Denver WITHOUT deleting or
  // rewriting raw source notes. Historical notes (e.g. "Upcoming — agenda posted")
  // remain preserved verbatim in `meeting.notes` AND extracted into
  // `meeting.publisherStatusAtCapture`.
  for (const meeting of meetings.values()) {
    const resolved = resolveMeetingCalendar(meeting, { now: nowDate });
    meeting.snapshotCapturedAt = snapshotCapturedAt;
    meeting.scheduledDate = resolved.scheduledDate;
    meeting.scheduledTime = resolved.scheduledTime;
    meeting.publisherStatusAtCapture = resolved.publisherStatusAtCapture;
    meeting.calendarStatus = resolved.status;
    meeting.calendarStatusEvaluatedAt = resolved.evaluatedAt;
    meeting.calendarStatusValidUntil = resolved.validUntil;
    meeting.outcomeStatus = resolved.outcomeStatus;
    meeting.upcoming = resolved.upcoming;
    if (resolved.outcomeStatus === "minutes-linked" && meeting.ingestionStage === "meeting-indexed") {
      meeting.ingestionStage = "outcome-verified";
    }

    const hadUpcomingNote = meeting.notes.some((note) => /^upcoming\b/i.test(note));
    if ((hadUpcomingNote || meeting.postedInCapture || meeting.postedOnOfficialTable) && (meeting.official.agenda || meeting.official.granicus)) {
      meeting.agendaPosted = true;
    }
    if (resolved.status === "canceled" || resolved.status === "rescheduled") {
      meeting.agendaPosted = false;
    }
    delete meeting.status;
    delete meeting.canceled;
  }

  const list = [...meetings.values()].map((meeting) => {
    if (!meeting.notes.length) delete meeting.notes;
    if (!meeting.agendaPosted) delete meeting.agendaPosted;
    meeting.docs.sort((a, b) => a.path.localeCompare(b.path));
    return meeting;
  });
  list.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
    if (a.date !== b.date) return a.upcoming ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    const bodyDelta = BODY_ORDER.indexOf(a.body) - BODY_ORDER.indexOf(b.body);
    return bodyDelta || a.id.localeCompare(b.id);
  });

  // Count distinct meetings with compiled excerpt text in transcript-vectors.json.
  const vectorsJson = readJsonIfPresent(path.join(SRC_DATA, "transcript-vectors.json"));
  const excerptMeetingIds = new Set(
    (vectorsJson?.items ?? [])
      .filter((item) => item?.kind === "transcript" && item?.meetingId)
      .map((item) => item.meetingId),
  );
  for (const meeting of list) {
    if (meeting.transcriptExcerpts?.length) excerptMeetingIds.add(meeting.id);
  }

  const byBody = {};
  for (const meeting of list) {
    const stats = (byBody[meeting.body] ||= { label: BODY_LABELS[meeting.body] || meeting.body, count: 0, first: meeting.date, last: meeting.date });
    stats.count += 1;
    if (meeting.date < stats.first) stats.first = meeting.date;
    if (meeting.date > stats.last) stats.last = meeting.date;
  }
  const pastDates = list.filter((meeting) => !meeting.upcoming).map((meeting) => meeting.date);
  const sameDayUnverifiedMeetings = list.filter((meeting) => meeting.calendarStatus === "same-day-time-unverified").length;
  const stats = {
    totalMeetings: list.length,
    pastMeetings: pastDates.length,
    upcomingMeetings: list.length - pastDates.length,
    sameDayUnverifiedMeetings,
    earliest: pastDates.length ? pastDates.reduce((a, b) => (a < b ? a : b)) : null,
    latest: pastDates.length ? pastDates.reduce((a, b) => (a > b ? a : b)) : null,
    totalDocuments: documentCount,
    /** Listed transcript files linked to dated meeting records in this catalog. */
    totalTranscripts: transcriptCount,
    /** Total transcript `.md` files listed across repository tree + local captions (includes undated files). */
    totalTranscriptFiles: transcriptFileCount,
    /** Locally stored caption files read and cue-parsed directly during this build. */
    localValidatedTranscripts: localValidatedTranscriptCount,
    /** Distinct dated meetings with compiled text excerpts available in the static site. */
    excerptIndexedMeetings: excerptMeetingIds.size,
    /** Transcripts verified against official audio/minutes (none — captions are unverified). */
    audioVerifiedTranscripts: 0,
    byBody,
  };

  const syncState = syncStateOverride !== undefined
    ? syncStateOverride
    : readJsonIfPresent(SYNC_STATE);
  const watcherBaselineCheckedAt = typeof syncState?.checkedAt === "string" && Number.isFinite(Date.parse(syncState.checkedAt))
    ? syncState.checkedAt
    : null;

  return {
    meetings: list,
    stats,
    captured: snapshotCapturedAt,
    schedules: official.schedules ?? {},
    resolvedAt: indexedAt,
    buildValidUntil: new Date(nowDate.getTime() + STATIC_BUILD_STALE_HOURS * 3_600_000).toISOString(),
    timeZone: DENVER_TIME_ZONE,
    scheduleUrl: official.sources?.officialPage ?? OFFICIAL_SCHEDULE_URL,
    granicusUpcomingUrl: official.sources?.granicusUpcoming ?? GRANICUS_UPCOMING_URL,
    /** Preserved for callers; distinct from `captured` (`snapshotCapturedAt`). */
    watcherBaselineCheckedAt,
    liveCheck: liveCheckMeta,
    detectedTable: detectedTableMeta,
    pipeline: {
      snapshotCapturedAt,
      watcherBaselineCheckedAt,
      scheduleCheckedAt: liveCheckMeta?.ok ? liveCheckMeta.observedAt : (detectedTableMeta?.discoveredAt ?? null),
      blockedSync: blockedSyncMeta,
      validatedExtractions,
      rejectedExtractions,
      discoveredPostings,
    },
    latestTranscript: latestTranscriptRecord(list),
  };
}

function assemble({ now = new Date() } = {}) {
  mkdirSync(PUBLIC_DATA, { recursive: true });
  mkdirSync(PUBLIC_SOURCES, { recursive: true });

  for (const { id, snapshot } of REPOS) {
    const from = path.join(SRC_DATA, snapshot);
    if (!existsSync(from)) throw new Error(`Missing snapshot ${from}; run with --refresh`);
    copyFileSync(from, path.join(PUBLIC_DATA, `${id}.json`));
  }

  const transcript = path.join(SRC_DATA, "jan-26-transcript.md");
  if (existsSync(transcript)) copyFileSync(transcript, path.join(PUBLIC_DATA, "jan-26-transcript.md"));

  const available = {};
  for (const [id, rel] of Object.entries(OFFICIAL_SOURCES)) {
    if (existsSync(path.join(ROOT, "public", rel))) available[id] = rel;
    else console.warn(`note: official source "${id}" has no local copy (${rel}); the site will link the original source`);
  }
  writeFileSync(path.join(SRC_DATA, "official-sources.json"), JSON.stringify(available, null, 2) + "\n");

  rmSync(PUBLIC_TRANSCRIPTS, { recursive: true, force: true });
  if (existsSync(LOCAL_TRANSCRIPTS)) {
    mkdirSync(PUBLIC_TRANSCRIPTS, { recursive: true });
    for (const file of readdirSync(LOCAL_TRANSCRIPTS).filter((name) => name.toLowerCase().endsWith(".md") && name !== "README.md")) {
      copyFileSync(path.join(LOCAL_TRANSCRIPTS, file), path.join(PUBLIC_TRANSCRIPTS, file));
    }
  }

  const meetingIndex = collectMeetings({ now });
  const meetingsJson = JSON.stringify(meetingIndex, null, 2) + "\n";
  writeFileSync(path.join(SRC_DATA, "meetings.json"), meetingsJson);
  writeFileSync(path.join(PUBLIC_DATA, "meetings.json"), meetingsJson);

  const vectors = path.join(SRC_DATA, "transcript-vectors.json");
  if (existsSync(vectors)) copyFileSync(vectors, path.join(PUBLIC_DATA, "transcript-vectors.json"));

  const citizenConnect = path.join(SRC_DATA, "citizen-connect.json");
  let ccRecords = 0;
  if (existsSync(citizenConnect)) {
    copyFileSync(citizenConnect, path.join(PUBLIC_DATA, "citizen-connect.json"));
    try { ccRecords = JSON.parse(readFileSync(citizenConnect, "utf8"))?.totals?.all ?? 0; } catch { /* leave at 0 */ }
  } else {
    console.warn('note: no citizen-connect artifact; run "npm run data:citizen-connect"');
  }

  const scannerLinks = path.join(SRC_DATA, "scanner-archive-links.json");
  let linkCount = 0;
  if (existsSync(scannerLinks)) {
    copyFileSync(scannerLinks, path.join(PUBLIC_DATA, "scanner-archive-links.json"));
    try { linkCount = JSON.parse(readFileSync(scannerLinks, "utf8"))?.summary?.total ?? 0; } catch { /* leave at 0 */ }
  } else {
    console.warn('note: no scanner-archive-links artifact; run "npm run data:scanner-archive-links"');
  }

  const files = readdirSync(PUBLIC_DATA);
  const live = meetingIndex.liveCheck
    ? ` · posted-table check ${meetingIndex.liveCheck.used ? "used" : "not used"} (${meetingIndex.liveCheck.ok ? "ok" : "failed"}, ${meetingIndex.liveCheck.ageHours ?? "?"}h old)`
    : " · posted-table check absent (snapshot only)";
  console.log(
    `Assembled public/data (${files.length} files) · official-sources manifest (${Object.keys(available).length} documents) · ` +
      `meetings index (${meetingIndex.stats.totalMeetings} meetings: ${meetingIndex.stats.upcomingMeetings} upcoming, ` +
      `${meetingIndex.stats.sameDayUnverifiedMeetings} same-day time-unverified, ` +
      `${meetingIndex.stats.pastMeetings} non-upcoming, ${meetingIndex.stats.totalDocuments} archived documents, ` +
      `${meetingIndex.stats.totalTranscriptFiles} transcript files (${meetingIndex.stats.totalTranscripts} linked to dated meetings, ${meetingIndex.stats.excerptIndexedMeetings} excerpt-indexed, ${meetingIndex.stats.audioVerifiedTranscripts} audio-verified), ` +
      `earliest ${meetingIndex.stats.earliest}, latest ${meetingIndex.stats.latest}, resolved ${meetingIndex.resolvedAt} ${meetingIndex.timeZone}) · ` +
      `latest transcript ${meetingIndex.latestTranscript?.meetingId ?? "none"} · ` +
      `citizen-connect (${ccRecords.toLocaleString("en-US")} records) · ` +
      `scanner-archive-links (${linkCount.toLocaleString("en-US")} logs)${live}.`,
  );
  return meetingIndex;
}

export { assemble, refreshSnapshots, SRC_DATA, PUBLIC_DATA };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const refresh = process.argv.includes("--refresh");
  if (refresh) refreshSnapshots();
  assemble({ now: buildInstant() });
}
