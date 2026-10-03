#!/usr/bin/env node
/**
 * Build-out script for Civic Cheyenne's public-record data.
 *
 * Assembles the static data served by the website from the archive snapshots
 * in src/data/ (which mirror therealwindycity's cheyenne-archives-* and
 * The-Real-Windy-City- transcript repositories on GitHub) and the curated
 * official-meetings snapshot in src/data/official-meetings.json.
 *
 * Usage:
 *   node scripts/build-data.mjs            # assemble public/ data from src/data
 *   node scripts/build-data.mjs --refresh  # first refresh snapshots from GitHub (requires gh CLI)
 *
 * What it produces:
 *   public/data/<repo>.json              full git-tree index for each archive repo (7 repos)
 *   public/data/jan-26-transcript.md     bundled copy of the guided-session transcript
 *   public/sources/2026-01-26-agenda.html     official agenda capture (archived HTML page)
 *   public/sources/2026-01-26-minutes.pdf    official Record of Proceedings, Jan 26, 2026
 *   public/sources/2026-01-26-warrants.pdf   supporting policy brief (Chapter 1.28)
 *   src/data/official-sources.json       manifest of locally bundled official documents
 *   src/data/meetings.json               unified index generated from archive snapshots
 *   public/data/meetings.json            copy of the index for the static website
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DATA = path.join(ROOT, "src", "data");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const PUBLIC_SOURCES = path.join(ROOT, "public", "sources");

const OWNER = "therealwindycity";
/** Repository id -> snapshot file under src/data/ */
const REPOS = [
  { id: "cheyenne-archives-2025-2026", snapshot: "archive-tree.json" },
  { id: "The-Real-Windy-City-", snapshot: "transcript-tree.json" },
  { id: "cheyenne-archives-2023-2024", snapshot: "repos/cheyenne-archives-2023-2024.json" },
  { id: "cheyenne-archives-2022", snapshot: "repos/cheyenne-archives-2022.json" },
  { id: "cheyenne-archives-2018-2021", snapshot: "repos/cheyenne-archives-2018-2021.json" },
  { id: "cheyenne-archives-2014-2017", snapshot: "repos/cheyenne-archives-2014-2017.json" },
  { id: "cheyenne-archives-2008-2013", snapshot: "repos/cheyenne-archives-2008-2013.json" },
];

/** Locally bundled official documents for the guided January 26, 2026 session. */
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

/* ------------------------------------------------------------------ */
/* Unified meeting index                                               */
/* ------------------------------------------------------------------ */

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

function cityUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, CITY_FILES).toString();
}

function youtubeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://www.youtube.com/watch?v=${value}`;
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

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** Parse archive folder dates, ISO folders, and municipal-docs date filenames. */
function parseMeetingDate(raw) {
  let match = raw.match(/^\d{10}([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (match) {
    const [, month, day, year] = match;
    const monthNumber = MONTHS[month];
    return monthNumber ? `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
  }
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function collectMeetings() {
  /** @type {Map<string, any>} */
  const meetings = new Map();
  let documentCount = 0;
  let transcriptCount = 0;

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

  for (const { id: repo, snapshot } of REPOS) {
    const tree = JSON.parse(readFileSync(path.join(SRC_DATA, snapshot), "utf8")).tree;
    for (const entry of tree) {
      if (entry.type !== "blob") continue;

      const transcript = entry.path.match(/^cheyenne-\d{4}-transcripts\/([^/]+)\/(\d{4}-\d{2}-\d{2})(?:-[^/]*)?\.md$/);
      if (transcript && BODY_LABELS[transcript[1]]) {
        const meeting = ensure(transcript[1], transcript[2]);
        const candidate = { repo, path: entry.path };
        // Prefer the explicitly cleaned copy when both transcript variants exist.
        meeting.transcripts ||= [];
        if (!meeting.transcripts.some((item) => item.repo === repo && item.path === entry.path)) {
          meeting.transcripts.push(candidate);
          transcriptCount += 1;
        }
        // Keep the explicitly cleaned copy as the primary transcript when variants coexist.
        if (!meeting.transcript || entry.path.endsWith(".clean.md")) meeting.transcript = candidate;
        continue;
      }

      // Committee/work-session PDFs are flat inside municipal-docs/ in these snapshots.
      const file = entry.path.split("/").pop();
      const municipal = entry.path.match(/(?:^|\/)municipal-docs\/(?:[^/]+\/)?([^/]+)$/i);
      const loose = municipal && file.match(/^(psc|fc|ws|cow)-(\d{1,2})-(\d{1,2})-(\d{2})/i);
      if (loose) {
        const [, prefix, month, day, year] = loose;
        const date = `20${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const body = { psc: "public-services-committee", fc: "finance-committee", ws: "work-sessions", cow: "work-sessions" }[prefix.toLowerCase()];
        addDoc(ensure(body, date), repo, entry.path);
        continue;
      }

      // Dates may be top-level council folders or body-specific ISO subfolders.
      const parts = entry.path.split("/");
      let folderIndex = -1;
      for (let i = 0; i < parts.length - 1; i += 1) {
        if (/^\d{10}[A-Z][a-z]{2}/.test(parts[i]) || /^\d{4}-\d{2}-\d{2}/.test(parts[i])) {
          folderIndex = i;
          break;
        }
      }
      if (folderIndex === -1) continue;
      const folder = parts[folderIndex];
      const date = parseMeetingDate(folder);
      if (!date) continue;
      const body = bodyFromRoot(parts[0], folder);
      const note = noteFromFolderName(folder);
      const meeting = ensure(body, date, note);
      addNote(meeting, note);
      addDoc(meeting, repo, entry.path);
    }
  }

  const official = JSON.parse(readFileSync(path.join(SRC_DATA, "official-meetings.json"), "utf8"));
  const mergeOfficial = (body, row) => {
    const meeting = ensure(body, row.d, row.n);
    if (row.c) {
      // Granicus publishes archive entries by clip_id; event IDs are not interchangeable.
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

  for (const upcoming of official.upcoming) {
    const meeting = ensure(upcoming.body, upcoming.date);
    meeting.upcoming = true;
    meeting.dayLabel = upcoming.dayLabel;
    meeting.time = upcoming.time;
    meeting.location = upcoming.location;
    meeting.items = upcoming.items;
    meeting.zoom = upcoming.zoom;
    meeting.official.agenda = cityUrl(upcoming.agendaPath);
    if (upcoming.granicusUrl) meeting.official.granicus = upcoming.granicusUrl;
  }

  const list = [...meetings.values()].map((meeting) => {
    if (!meeting.notes.length) delete meeting.notes;
    meeting.docs.sort((a, b) => a.path.localeCompare(b.path));
    return meeting;
  });
  list.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
    if (a.date !== b.date) return a.upcoming ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    const bodyDelta = BODY_ORDER.indexOf(a.body) - BODY_ORDER.indexOf(b.body);
    return bodyDelta || a.id.localeCompare(b.id);
  });

  const byBody = {};
  for (const meeting of list) {
    const stats = (byBody[meeting.body] ||= { label: BODY_LABELS[meeting.body] || meeting.body, count: 0, first: meeting.date, last: meeting.date });
    stats.count += 1;
    if (meeting.date < stats.first) stats.first = meeting.date;
    if (meeting.date > stats.last) stats.last = meeting.date;
  }
  const pastDates = list.filter((meeting) => !meeting.upcoming).map((meeting) => meeting.date);
  const stats = {
    totalMeetings: list.length,
    pastMeetings: pastDates.length,
    upcomingMeetings: list.length - pastDates.length,
    earliest: pastDates.length ? pastDates.reduce((a, b) => (a < b ? a : b)) : null,
    latest: pastDates.length ? pastDates.reduce((a, b) => (a > b ? a : b)) : null,
    totalDocuments: documentCount,
    totalTranscripts: transcriptCount,
    byBody,
  };

  return { meetings: list, stats, captured: official.captured, schedules: official.schedules };
}

function assemble() {
  mkdirSync(PUBLIC_DATA, { recursive: true });
  mkdirSync(PUBLIC_SOURCES, { recursive: true });

  // 1. Repository indexes for the source library (client-side fetch).
  for (const { id, snapshot } of REPOS) {
    const from = path.join(SRC_DATA, snapshot);
    if (!existsSync(from)) throw new Error(`Missing snapshot ${from}; run with --refresh`);
    copyFileSync(from, path.join(PUBLIC_DATA, `${id}.json`));
  }

  // 2. Bundled transcript for the guided session.
  const transcript = path.join(SRC_DATA, "jan-26-transcript.md");
  if (existsSync(transcript)) copyFileSync(transcript, path.join(PUBLIC_DATA, "jan-26-transcript.md"));

  // 3. Official source documents are curated into public/sources (see README).
  //    Keep only entries whose backing file actually exists.
  const available = {};
  for (const [id, rel] of Object.entries(OFFICIAL_SOURCES)) {
    if (existsSync(path.join(ROOT, "public", rel))) available[id] = rel;
    else console.warn(`note: official source "${id}" has no local copy (${rel}); the site will link the original source`);
  }
  writeFileSync(path.join(SRC_DATA, "official-sources.json"), JSON.stringify(available, null, 2) + "\n");

  // 4. Unified meeting index (current first; distinct same-day sessions stay separate).
  const meetingIndex = collectMeetings();
  const meetingsJson = JSON.stringify(meetingIndex, null, 2) + "\n";
  writeFileSync(path.join(SRC_DATA, "meetings.json"), meetingsJson);
  writeFileSync(path.join(PUBLIC_DATA, "meetings.json"), meetingsJson);

  const files = readdirSync(PUBLIC_DATA);
  console.log(
    `Assembled public/data (${files.length} files) · official-sources manifest (${Object.keys(available).length} documents) · ` +
      `meetings index (${meetingIndex.stats.totalMeetings} meetings: ${meetingIndex.stats.upcomingMeetings} upcoming, ` +
      `${meetingIndex.stats.pastMeetings} past, earliest ${meetingIndex.stats.earliest}, latest ${meetingIndex.stats.latest}).`,
  );
}

const refresh = process.argv.includes("--refresh");
if (refresh) refreshSnapshots();
assemble();
