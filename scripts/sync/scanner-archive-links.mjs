#!/usr/bin/env node
/**
 * Socrata ↔ Broadcastify scanner-archive linkage sync.
 *
 * WHAT THIS BUILDS
 *   A record-level link table joining every CAD log published by the Cheyenne /
 *   Laramie County Citizen Connect dashboard (Socrata) to the Broadcastify
 *   scanner-archive block that contains its initiation timestamp — each log
 *   gets its dispatch audio block (id, time range, offset into the recording,
 *   download URL), and every archive block is accounted for in the summary.
 *
 * SOURCES (all public; see scripts/lib/scanner-archive.mjs for the model)
 *   Socrata:  GET {apiBase}/api/tickets/details.json
 *               ?categories=<published set>&start_date=D&end_date=D&zoom=14
 *               &lat1=<north>&lat2=<south>&lng1=<west>&lng2=<east>
 *             One call per day, subdividing the bounding box if the publisher's
 *             row cap (4000) is approached, exactly like the citizen-connect
 *             record-mode pull. The raw datasets are login-only; the
 *             dashboard's own JSON API is the published access path.
 *   Broadcastify: GET https://www.broadcastify.com/archives/api/archives.php
 *               ?feedId=<id>&date=MM/DD/YYYY
 *             One call per feed per date (±1 day beyond the window, because a
 *             block listed under date D can cover early D+1). Listing is
 *             public; playback/download requires a Premium subscription.
 *
 * SCOPES
 *   Default: a bounded recent window (committed artifact, small).
 *   Full history: --start 2020-01-01 links every Socrata log back to the
 *   publisher's 2020 start. Broadcastify feed archives only retain ~6 months
 *   (earliest probed block: 2026-04-13 on feed 47003), so older logs are
 *   linked-or-explained: each carries an explicit unlinkedReason. The
 *   artifact's historySummary rolls up, per year, how many logs are linkable.
 *   A full-history link table is hundreds of thousands of rows — pass --out
 *   (or --allow-large) so it does not land in the committed artifact.
 *
 * MODES
 *   (network)   pull both sides for the window, cache raw inputs, join, write
 *   --offline   rebuild the artifact from the cache only — no network. This
 *               is how the committed seed artifact is reproduced.
 *   --dry-run   print the request plan, touch nothing.
 *
 * SAFETY
 *   Fail-closed, like the rest of this repo's sync pipeline. A missing cache
 *   entry in --offline mode, an unreachable publisher, or a link table that
 *   fails validation exits non-zero and leaves the committed artifact
 *   untouched. Writes go through scripts/lib/atomic.mjs.
 *
 * USAGE
 *   node scripts/sync/scanner-archive-links.mjs --start 2026-07-18 --end 2026-07-20 \
 *       --bbox 41.1125,41.0975,-104.8075,-104.7925
 *   node scripts/sync/scanner-archive-links.mjs --start 2020-01-01 --out public/data/scanner-archive-links-full.json
 *   node scripts/sync/scanner-archive-links.mjs --offline            # rebuild from cache
 *   node scripts/sync/scanner-archive-links.mjs --dry-run
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWrite } from "../lib/atomic.mjs";
import { API_BASE, DEFAULT_CATEGORIES, COUNTY_BBOX, dayRange } from "./citizen-connect.mjs";
import {
  BROADCASTIFY_BASE,
  DEFAULT_FEED_ID,
  FEED_CATALOG,
  SOCRATA_TIMEZONE,
  archiveListUrl,
  buildFeedIndex,
  dedupeRecords,
  historySummaryFromTrend,
  linkLogs,
  normalizeSocrataRecord,
  socrataDetailsUrl,
  summarizeLinks,
} from "../lib/scanner-archive.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_PATH = path.join(ROOT, "src", "data", "scanner-archive-links.json");
const PUBLIC_OUT_PATH = path.join(ROOT, "public", "data", "scanner-archive-links.json");
const CITIZEN_CONNECT_ARTIFACT = path.join(ROOT, "src", "data", "citizen-connect.json");
const CACHE_DIR = process.env.SCANNER_ARCHIVE_CACHE_DIR || path.join(ROOT, ".cache", "scanner-archive-links");

/** details.json returns everything in a window; subdivide past this many. */
const RECORD_CAP = 4000;
const MAX_SUBDIVISIONS = 4;
/** Socrata records are re-fetched inside this window (late records arrive). */
const CACHE_REVALIDATE_DAYS = 14;
const MAX_RETRIES = Number(process.env.SCANNER_ARCHIVE_MAX_RETRIES ?? 3);
/** Refuse to commit a link table bigger than this without --out/--allow-large. */
const MAX_COMMITTED_LINKS = Number(process.env.SCANNER_ARCHIVE_MAX_COMMITTED_LINKS ?? 50000);

/**
 * Probed Broadcastify archive retention (2026-10-09, via
 * /archives/api/archives.php). Feed archives are a rolling ~6-month window;
 * the legacy Laramie County feeds answer "Invalid feed". Broadcastify Calls
 * retains a full year per system but is login/API-key gated, and no other
 * public archive of WyoLink audio exists (Wayback Machine, Common Crawl and
 * arquivo.pt hold no Broadcastify archive captures).
 */
const ARCHIVE_AVAILABILITY = {
  feeds: ["47003", "47019", "46189"],
  from: "2026-04-13",
  to: "2026-10-09",
  probed: {
    "47003": {
      empty: ["2024-07-19", "2025-10-09", "2026-01-15", "2026-04-09", "2026-04-10", "2026-04-12"],
      full: ["2026-04-13", "2026-04-14", "2026-04-15", "2026-05-15", "2026-06-01", "2026-06-15", "2026-07-01", "2026-07-18", "2026-07-19"],
    },
    "47019": { empty: ["2025-10-09", "2026-01-15"], full: ["2026-04-15", "2026-07-19"] },
    "46189": { empty: [], full: ["2026-07-19"] },
  },
  legacyFeedsRemoved: ["31486", "37907", "44794"],
  deeperHistory:
    "Broadcastify Calls retains a full year of per-transmission calls per system but requires a login and a paid Calls Client API key (bcfy.io/dev). Legacy Broadcastify feeds 31486/37907/44794 answer \"Invalid feed\" — their archives are removed. No other public archive of WyoLink scanner audio was found.",
};

const SOCRATA_LAYERS = [
  { layer: "Incidents", datasetId: "35sf-bu8v", entryId: "pds_5", dateField: "call_date_time", typeField: "incident_type" },
  { layer: "Cases", datasetId: "cvz7-2j69", entryId: "pds_4", dateField: "reported_date_time", typeField: "occurred_incident_type" },
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(name);

const DRY_RUN = flag("--dry-run");
const OFFLINE = flag("--offline");
const ALLOW_LARGE = flag("--allow-large");
const THROTTLE_MS = Number(arg("--throttle", "450"));
const OUT = arg("--out", OUT_PATH);

function parseBbox(raw) {
  if (!raw) return { ...COUNTY_BBOX };
  const parts = String(raw).split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`invalid --bbox "${raw}"; expected north,south,west,east`);
  }
  const [north, south, west, east] = parts;
  if (!(north > south && east > west)) throw new Error(`invalid --bbox "${raw}"; expected north>south and east>west`);
  return { north, south, west, east };
}

function parseFeeds(raw) {
  const feeds = String(raw ?? DEFAULT_FEED_ID)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!feeds.length) throw new Error("invalid --feeds; expected a comma-separated feed id list");
  for (const feedId of feeds) {
    if (!FEED_CATALOG[feedId]) throw new Error(`unknown feed id "${feedId}" (known: ${Object.keys(FEED_CATALOG).join(", ")})`);
  }
  return feeds;
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
function todayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const BBOX = parseBbox(arg("--bbox"));
const FEEDS = parseFeeds(arg("--feeds"));
const end = arg("--end") ?? isoDay(addDays(isoDay(todayUtc()), -1));
const start = arg("--start") ?? isoDay(addDays(end, -6));
for (const value of [start, end]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`invalid date "${value}"; expected YYYY-MM-DD`);
  }
}
const days = dayRange(start, end);
if (!days.length) throw new Error(`window end ${end} is before start ${start}`);
// Archive listings are pulled one day beyond each side: a block listed under
// date D can cover the first minutes of D+1 (blocks are ~30 min and the
// listing is keyed by the block's start date).
const archiveDates = dayRange(isoDay(addDays(start, -1)), isoDay(addDays(end, 1)));

// ---------------------------------------------------------------------------
// HTTP — one polite, retrying fetcher
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
let requestCount = 0;

async function getJson(url, { attempt = 0 } = {}) {
  const wait = lastRequestAt + THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  requestCount += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "civic-cheyenne-sync/1.0 (+https://github.com/therealwindycity/TheReelWindyCity)" },
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    return JSON.parse(text);
  } catch (err) {
    clearTimeout(timer);
    if (attempt >= MAX_RETRIES) throw err;
    const backoff = 1500 * 2 ** attempt;
    process.stderr.write(`  retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms — ${err.message}\n`);
    await new Promise((r) => setTimeout(r, backoff));
    return getJson(url, { attempt: attempt + 1 });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cache (raw inputs, so an offline rebuild never re-hits the publishers)
// ---------------------------------------------------------------------------

function socrataCacheFile(day) {
  return path.join(CACHE_DIR, "socrata", `${day}.json`);
}
function archiveCacheFile(feedId, date) {
  return path.join(CACHE_DIR, "broadcastify", feedId, `${date}.json`);
}
function readCache(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeCache(file, payload) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Socrata pull — one day at a time, subdividing the bbox at the row cap
// ---------------------------------------------------------------------------

async function fetchSocrataDay({ day, bbox, depth = 0 }) {
  const url = socrataDetailsUrl({ apiBase: API_BASE, day, bbox, categories: DEFAULT_CATEGORIES, zoom: "14" });
  const json = await getJson(url);
  const records = json?.api_data?.records;
  if (!Array.isArray(records)) throw new Error(`${day} details.json did not return a records array`);
  const count = Number(json?.api_data?.count);
  const incomplete = Boolean(json?.api_data?.incomplete);

  if (records.length >= RECORD_CAP && depth < MAX_SUBDIVISIONS) {
    const midLat = (bbox.north + bbox.south) / 2;
    const midLng = (bbox.west + bbox.east) / 2;
    const quadrants = [
      { north: bbox.north, south: midLat, west: bbox.west, east: midLng },
      { north: bbox.north, south: midLat, west: midLng, east: bbox.east },
      { north: midLat, south: bbox.south, west: bbox.west, east: midLng },
      { north: midLat, south: bbox.south, west: midLng, east: bbox.east },
    ];
    const merged = [];
    for (const q of quadrants) merged.push(...(await fetchSocrataDay({ day, bbox: q, depth: depth + 1 })));
    return { count, incomplete, records: dedupeRecords(merged) };
  }
  if (records.length >= RECORD_CAP) {
    throw new Error(`${day} hit the publisher row cap after ${MAX_SUBDIVISIONS} spatial subdivisions; refusing to link a silently truncated day`);
  }
  return { count, incomplete, records };
}

async function loadSocrataDay(day) {
  const revalidateFrom = isoDay(addDays(end, -(CACHE_REVALIDATE_DAYS - 1)));
  const shouldRevalidate = day >= revalidateFrom;
  const hit = readCache(socrataCacheFile(day));
  if (!OFFLINE && hit && Array.isArray(hit.records) && !shouldRevalidate) return { ...hit, cached: true };
  if (OFFLINE) {
    if (!hit || !Array.isArray(hit.records)) {
      throw new Error(`offline mode: no cached Socrata records for ${day} (run without --offline first)`);
    }
    return { ...hit, cached: true };
  }
  const payload = await fetchSocrataDay({ day, bbox: BBOX });
  const cached = {
    source: "details.json",
    day,
    count: payload.count,
    incomplete: payload.incomplete,
    records: payload.records,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(socrataCacheFile(day), cached);
  return { ...cached, cached: false };
}

// ---------------------------------------------------------------------------
// Broadcastify pull — one listing per feed per date (immutable once past)
// ---------------------------------------------------------------------------

async function loadArchiveListing(feedId, date) {
  const hit = readCache(archiveCacheFile(feedId, date));
  if (!OFFLINE && hit && Array.isArray(hit.archives)) return { ...hit, cached: true };
  if (OFFLINE) {
    if (!hit || !Array.isArray(hit.archives)) {
      throw new Error(`offline mode: no cached archive listing for feed ${feedId} on ${date} (run without --offline first)`);
    }
    return { ...hit, cached: true };
  }
  const listing = await getJson(archiveListUrl(feedId, date));
  if (!listing || typeof listing !== "object" || Array.isArray(listing)) {
    throw new Error(`feed ${feedId} ${date}: archive listing was not a JSON object`);
  }
  if (typeof listing.error === "string") {
    throw new Error(`feed ${feedId} ${date}: archive API answered "${listing.error}"`);
  }
  if (!Array.isArray(listing.archives)) {
    throw new Error(`feed ${feedId} ${date}: archive listing has no archives array`);
  }
  const cached = { ...listing, fetchedAt: new Date().toISOString() };
  writeCache(archiveCacheFile(feedId, date), cached);
  return { ...cached, cached: false };
}

// ---------------------------------------------------------------------------
// Build + validate + write
// ---------------------------------------------------------------------------

function loadCitizenConnectTrend() {
  try {
    const artifact = JSON.parse(readFileSync(CITIZEN_CONNECT_ARTIFACT, "utf8"));
    return Array.isArray(artifact?.trend?.daily) ? artifact.trend.daily : null;
  } catch {
    return null;
  }
}

function validateArtifact(artifact) {
  const problems = [];
  const { links, summary, coverage } = artifact;
  if (!Array.isArray(links) || links.length === 0) problems.push("links is empty — refusing to publish");
  if (summary.total !== links.length) problems.push("summary.total does not match links.length");
  if (summary.linked + summary.unlinked !== summary.total) problems.push("summary linked+unlinked does not reconcile");
  if (coverage.socrataLogCount !== links.length) problems.push("coverage.socrataLogCount does not match links.length");
  for (const link of links) {
    if (link.linkStatus === "linked") {
      const a = link.archive;
      if (!a || !a.id || !a.url) { problems.push(`linked log ${link.id} has no archive reference`); break; }
      if (!(a.startTs <= link.atUnix && link.atUnix < a.endTs)) {
        problems.push(`linked log ${link.id} falls outside its archive block ${a.id}`);
        break;
      }
      if (!(a.offsetSeconds >= 0)) { problems.push(`linked log ${link.id} has a negative archive offset`); break; }
    } else if (!link.unlinkedReason) {
      problems.push(`unlinked log ${link.id} has no unlinkedReason`);
      break;
    }
  }
  if (links.length > MAX_COMMITTED_LINKS && !ALLOW_LARGE && path.resolve(OUT) === path.resolve(OUT_PATH)) {
    problems.push(
      `link table has ${links.length} rows (> ${MAX_COMMITTED_LINKS}); pass --out <path> (or --allow-large) so the full table does not land in the committed artifact`,
    );
  }
  return problems;
}

async function main() {
  const plan = {
    apiBase: API_BASE,
    window: { start, end, days: days.length },
    bbox: BBOX,
    feeds: FEEDS,
    archiveDates: { from: archiveDates[0], to: archiveDates[archiveDates.length - 1], count: archiveDates.length },
    offline: OFFLINE,
    dryRun: DRY_RUN,
    throttleMs: THROTTLE_MS,
    estimatedRequests: days.length + archiveDates.length * FEEDS.length,
    out: path.relative(ROOT, OUT),
  };
  process.stdout.write(
    `Scanner-archive linkage — window ${start} → ${end} (${days.length} days), bbox N${BBOX.north}/S${BBOX.south}/W${BBOX.west}/E${BBOX.east}, feeds ${FEEDS.join(", ")}\n` +
      `  archive listings ${archiveDates[0]} → ${archiveDates[archiveDates.length - 1]} (${archiveDates.length} dates × ${FEEDS.length} feed(s))\n`,
  );
  if (DRY_RUN) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  // --- pull (or read cache) -------------------------------------------------
  const dayPayloads = [];
  for (const [i, day] of days.entries()) {
    const payload = await loadSocrataDay(day);
    dayPayloads.push(payload);
    if ((i + 1) % 25 === 0 || i === days.length - 1) {
      const rows = dayPayloads.reduce((s, p) => s + p.records.length, 0);
      process.stdout.write(`  socrata: ${i + 1}/${days.length} days (${rows.toLocaleString()} rows)\n`);
    }
  }

  const listingsByFeed = new Map(FEEDS.map((feedId) => [feedId, new Map()]));
  for (const feedId of FEEDS) {
    for (const [i, date] of archiveDates.entries()) {
      const listing = await loadArchiveListing(feedId, date);
      listingsByFeed.get(feedId).set(date, listing);
      if ((i + 1) % 50 === 0 || i === archiveDates.length - 1) {
        process.stdout.write(`  broadcastify ${feedId}: ${i + 1}/${archiveDates.length} dates\n`);
      }
    }
  }

  // --- join -----------------------------------------------------------------
  const rawRecords = dedupeRecords(dayPayloads.flatMap((p) => p.records));
  const logs = rawRecords.map(normalizeSocrataRecord).filter(Boolean);
  const feedIndexes = new Map();
  for (const feedId of FEEDS) {
    feedIndexes.set(feedId, buildFeedIndex(listingsByFeed.get(feedId), feedId));
  }
  const links = linkLogs(logs, feedIndexes, FEEDS);
  const summary = summarizeLinks(links, feedIndexes);
  const historySummary = historySummaryFromTrend(loadCitizenConnectTrend(), ARCHIVE_AVAILABILITY);

  const archiveBlockCount = [...feedIndexes.values()].reduce((s, idx) => s + idx.blocks.length, 0);
  const artifact = {
    schema: 1,
    generatedBy: "sync",
    capturedAt: new Date().toISOString(),
    source: {
      socrata: {
        name: "Cheyenne / Laramie County Citizen Connect",
        publisher: "Cheyenne Police Department & Laramie County Sheriff's Office",
        platform: "Tyler Technologies (Socrata) Citizen Connect",
        appUrl: `${API_BASE}/`,
        apiBase: API_BASE,
        recordEndpoint: "/api/tickets/details.json",
        layers: SOCRATA_LAYERS,
        timezone: SOCRATA_TIMEZONE,
        timestampNote: "ticket_created_at is local wall time (America/Denver); converted to Unix for the join.",
      },
      broadcastify: {
        base: BROADCASTIFY_BASE,
        feeds: FEEDS.map((feedId) => ({
          id: feedId,
          name: FEED_CATALOG[feedId]?.name ?? feedId,
          status: FEED_CATALOG[feedId]?.status ?? "unknown",
          carries: FEED_CATALOG[feedId]?.carries ?? null,
          listEndpoint: `/archives/api/archives.php?feedId=${feedId}&date=MM/DD/YYYY`,
          downloadEndpoint: "/archives/download/<archiveId>",
          archivePageUrl: `${BROADCASTIFY_BASE}/archives/feed/?feedId=${feedId}`,
          playback: "Archive playback and downloads require a Broadcastify Premium subscription; the listing (ids, time ranges) is public.",
        })),
        archiveAvailability: ARCHIVE_AVAILABILITY,
      },
    },
    coverage: {
      requestedStart: start,
      requestedEnd: end,
      days: days.length,
      bbox: BBOX,
      feeds: FEEDS,
      archiveDates: { from: archiveDates[0], to: archiveDates[archiveDates.length - 1], count: archiveDates.length },
      socrataLogCount: logs.length,
      archiveBlockCount,
      recordWindowNote:
        "Record-level link table for the requested window. Socrata history reaches 2020-01-01; run with --start 2020-01-01 for the full table (pass --out for large outputs). See historySummary for the linkable share per year.",
    },
    historySummary,
    summary,
    links,
  };

  const problems = validateArtifact(artifact);
  if (problems.length) {
    process.stderr.write(`refusing to write artifact:\n  - ${problems.join("\n  - ")}\n`);
    process.exit(1);
  }

  atomicWrite(OUT, `${JSON.stringify(artifact, null, 1)}\n`);
  const wrote = [path.relative(ROOT, OUT)];
  if (path.resolve(OUT) === path.resolve(OUT_PATH)) {
    mkdirSync(path.dirname(PUBLIC_OUT_PATH), { recursive: true });
    atomicWrite(PUBLIC_OUT_PATH, `${JSON.stringify(artifact)}\n`);
    wrote.push(path.relative(ROOT, PUBLIC_OUT_PATH));
  }

  process.stdout.write(
    `  wrote ${wrote.join(" and ")}\n` +
      `  ${links.length.toLocaleString()} logs → ${summary.linked.toLocaleString()} linked, ${summary.unlinked.toLocaleString()} unlinked; ${archiveBlockCount} archive blocks (${summary.archiveBlocks.withLogs} carrying logs)\n` +
      `  ${requestCount} requests\n`,
  );
}

// Only run when invoked directly — importing this module must not start a sync.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`scanner-archive-links sync failed: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
