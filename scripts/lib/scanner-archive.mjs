#!/usr/bin/env node
/**
 * Socrata ↔ Broadcastify scanner-archive linkage library.
 *
 * Links every record-level CAD log published by the Cheyenne / Laramie County
 * Citizen Connect dashboard (Socrata) to the Broadcastify scanner-archive
 * block that contains its initiation timestamp, so each public-safety log can
 * be traced to the recorded dispatch audio covering it — and every archive
 * block can be traced back to the logs it contains.
 *
 * Sources
 *   Socrata side (public, login-free dashboard API; the raw datasets are
 *   login-only, so the dashboard's own JSON API is the published access path):
 *     GET https://laramiecounty-letmsp.connect.socrata.com/api/tickets/details.json
 *         ?categories=<published set>&start_date=D&end_date=D&zoom=14
 *         &lat1=<north>&lat2=<south>&lng1=<west>&lng2=<east>
 *     Records carry ticket_id, ticket_created_at (America/Denver wall time),
 *     category (agency), sub_category (incident type), super_category (layer),
 *     dataset_id, ticket_dataset_entry_id and a 0.005°-snapped location point.
 *   Broadcastify side (public listing; playback/download is premium):
 *     GET https://www.broadcastify.com/archives/api/archives.php?feedId=<id>&date=MM/DD/YYYY
 *     Returns { archives: [{ id, start, end, startTs, endTs, duration, reqs }] }.
 *     Blocks are ~30-minute MP3 recordings; [startTs, endTs) is half-open.
 *
 * Time model
 *   Socrata `ticket_created_at` is local wall time in America/Denver (the
 *   publisher's app_config sets timezone_offset US/Mountain and the dashboard
 *   filters call_date_time by plain local dates). Broadcastify block bounds
 *   are Unix timestamps. wallTimeToUnix() converts between the two, including
 *   DST (MDT UTC-6 in summer / MST UTC-7 in winter).
 *
 * This module is pure: no network, no filesystem. The sync script in
 * scripts/sync/scanner-archive-links.mjs drives it, and
 * tests/sync/scanner-archive-links.test.mjs locks its behaviour down.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SOCRATA_TIMEZONE = "America/Denver";
export const BROADCASTIFY_BASE = "https://www.broadcastify.com";
export const DEFAULT_FEED_ID = "47003";

/**
 * The Broadcastify feeds that carry Laramie County public-safety traffic.
 * The legacy feeds are listed for completeness: the archive API answers
 * "Invalid feed" for them, so their audio history is no longer available
 * anywhere on Broadcastify.
 */
export const FEED_CATALOG = {
  "47003": {
    id: "47003",
    name: "Laramie County Law Enforcement",
    status: "active",
    carries: "Cheyenne PD, Laramie County SO, Pine Bluffs PD, Wyoming State Patrol",
    agencyPattern: /Cheyenne Police Department|Laramie County Sheriff|Pine Bluffs|Wyoming State Patrol|\bWHP\b/i,
  },
  "47019": {
    id: "47019",
    name: "Laramie County Public Safety",
    status: "active",
    carries: "Cheyenne PD, Laramie County SO, WSP, Laramie County fire districts, Cheyenne Fire, AMR",
    agencyPattern: /Cheyenne Police Department|Laramie County Sheriff|Wyoming State Patrol|\bWHP\b|Fire|EMS|AMR/i,
  },
  "46189": {
    id: "46189",
    name: "Laramie County Fire and EMS",
    status: "active",
    carries: "City & County fire departments and AMR (law enforcement migrated to 47003/47019)",
    agencyPattern: /Fire|EMS|AMR/i,
  },
  "31486": {
    id: "31486",
    name: "Cheyenne Police, Laramie County Sheriff, WHP (legacy)",
    status: 'discontinued — archives removed (archive API: "Invalid feed")',
    agencyPattern: /Cheyenne Police Department|Laramie County Sheriff|\bWHP\b/i,
  },
  "37907": {
    id: "37907",
    name: "Cheyenne Police, Laramie County Sheriff, Fire, EMS (legacy)",
    status: 'offline — archives removed (archive API: "Invalid feed")',
    agencyPattern: /Cheyenne Police Department|Laramie County Sheriff/i,
  },
  "44794": {
    id: "44794",
    name: "Cheyenne Police, Laramie County Sheriff, Fire, WHP and EMS (legacy)",
    status: 'deleted — archives removed (archive API: "Invalid feed")',
    agencyPattern: /Cheyenne Police Department|Laramie County Sheriff/i,
  },
};

// ---------------------------------------------------------------------------
// Timezone helpers (wall time ↔ Unix, via Intl — no dependencies)
// ---------------------------------------------------------------------------

const dtfCache = new Map();

function getDtf(timeZone) {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
export function tzOffsetMs(timeZone, instant) {
  const parts = getDtf(timeZone).formatToParts(instant);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - instant.getTime();
}

/**
 * Convert a Socrata wall-time string ("2026-07-19T16:40:08" or with millis,
 * no offset) to a Unix timestamp, interpreting it in `timeZone`.
 * Two-pass so DST-edge wall times resolve with the offset in effect at the
 * resolved instant. Returns null when the string is unparseable.
 */
export function wallTimeToUnix(wallISO, timeZone = SOCRATA_TIMEZONE) {
  if (typeof wallISO !== "string" || !wallISO) return null;
  const naive = new Date(`${wallISO}Z`); // wall numbers treated as UTC
  if (Number.isNaN(naive.getTime())) return null;
  const first = naive.getTime() - tzOffsetMs(timeZone, naive);
  const refined = naive.getTime() - tzOffsetMs(timeZone, new Date(first));
  return Math.floor(refined / 1000);
}

/** Calendar date (YYYY-MM-DD) of a Unix timestamp in `timeZone`. */
export function dateInZone(atUnix, timeZone = SOCRATA_TIMEZONE) {
  if (!Number.isFinite(atUnix)) return null;
  const parts = getDtf(timeZone).formatToParts(new Date(atUnix * 1000));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise one details.json record (either layer) to the shape the linker
 * works with. Returns null when the record has no identity or timestamp.
 */
export function normalizeSocrataRecord(r) {
  if (!r || typeof r !== "object") return null;
  const id = r.ticket_id ?? r.ticket_primary_key ?? r[":id"];
  const at = r.ticket_created_at;
  if (id === undefined || id === null || at === undefined || at === null) return null;
  const [lng, lat] = Array.isArray(r.location?.coordinates) ? r.location.coordinates : [];
  return {
    id: String(id),
    at: String(at),
    atUnix: wallTimeToUnix(String(at)),
    agency: String(r.category ?? ""),
    type: String(r.sub_category ?? ""),
    layer: String(r.super_category ?? ""),
    datasetId: String(r.dataset_id ?? ""),
    entryId: String(r.ticket_dataset_entry_id ?? ""),
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
  };
}

/** Normalise one archives.php block. Returns null when bounds are unusable. */
export function normalizeArchiveBlock(b, feedId) {
  if (!b || typeof b !== "object") return null;
  const startTs = Number(b.startTs);
  const endTs = Number(b.endTs);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return null;
  const id = String(b.id ?? `${feedId}-${startTs}`);
  const duration = Number(b.duration);
  return {
    feedId: String(feedId),
    id,
    start: String(b.start ?? ""),
    end: String(b.end ?? ""),
    startTs,
    endTs,
    duration: Number.isFinite(duration) ? duration : endTs - startTs,
    reqs: Number.isFinite(Number(b.reqs)) ? Number(b.reqs) : 0,
    url: `${BROADCASTIFY_BASE}/archives/download/${id}`,
    archivePageUrl: `${BROADCASTIFY_BASE}/archives/feed/?feedId=${encodeURIComponent(feedId)}&archive=${encodeURIComponent(id)}`,
  };
}

/**
 * De-duplicate raw details.json records by ticket id. Quadrant subdivision
 * can return a border record twice; a pin must never be counted twice.
 */
export function dedupeRecords(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const id = r?.ticket_id ?? r?.ticket_primary_key ?? r?.[":id"];
    if (id !== undefined && id !== null) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Archive index + lookup
// ---------------------------------------------------------------------------

/**
 * Build a per-feed index from a Map<dateISO, raw archives.php listing>.
 * Blocks from all dates are merged into one startTs-sorted array so lookups
 * work across midnight (a block listed under date D can cover early D+1).
 * `dates` = dates with at least one block; `emptyDates` = dates the API
 * answered with an empty listing (feed offline or retention expired).
 */
export function buildFeedIndex(listingsByDate, feedId) {
  const blocks = [];
  const dates = new Set();
  const emptyDates = new Set();
  for (const [date, listing] of listingsByDate) {
    const arr = Array.isArray(listing?.archives) ? listing.archives : [];
    if (arr.length === 0) {
      emptyDates.add(date);
      continue;
    }
    dates.add(date);
    for (const raw of arr) {
      const block = normalizeArchiveBlock(raw, feedId);
      if (block) blocks.push(block);
    }
  }
  blocks.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
  return { feedId, blocks, dates, emptyDates };
}

/**
 * Find the block containing `atUnix` in a startTs-sorted block array.
 * Blocks are half-open [startTs, endTs). Returns null when the timestamp
 * falls in a gap (feed offline) or outside every block.
 */
export function findBlock(sortedBlocks, atUnix) {
  if (!Number.isFinite(atUnix) || !Array.isArray(sortedBlocks) || sortedBlocks.length === 0) return null;
  let lo = 0;
  let hi = sortedBlocks.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedBlocks[mid].startTs <= atUnix) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate === -1) return null;
  const block = sortedBlocks[candidate];
  return atUnix < block.endTs ? block : null;
}

// ---------------------------------------------------------------------------
// Linkage
// ---------------------------------------------------------------------------

/** Reorder feed ids so the feed whose catalog matches the agency leads. */
export function orderedFeedsForAgency(agency, feedIds) {
  const matching = [];
  const rest = [];
  for (const feedId of feedIds) {
    const feed = FEED_CATALOG[feedId];
    if (feed?.agencyPattern?.test(agency)) matching.push(feedId);
    else rest.push(feedId);
  }
  return [...matching, ...rest];
}

/**
 * Link one normalised log to its scanner archive block(s).
 * `feedIndexes` is a Map<feedId, index from buildFeedIndex>; `feedIds` is the
 * priority-ordered list of feeds to try. The first covering feed becomes the
 * primary `archive`; additional covering feeds are recorded in
 * `alsoArchivedOn`. Unlinked logs carry an explicit `unlinkedReason`:
 *   missing_timestamp            — the log has no parseable timestamp
 *   no_archive_listing           — no listing was loaded for the log's date
 *   archive_unavailable_for_date — the date's listing exists but is empty
 *                                  (feed offline / retention expired)
 *   outside_block_coverage       — listings exist but a gap covers the log
 */
export function linkLog(log, feedIndexes, feedIds) {
  const link = {
    ...log,
    feedId: null,
    linkStatus: "unlinked",
    archive: null,
    alsoArchivedOn: [],
    unlinkedReason: null,
  };
  if (!Number.isFinite(log.atUnix)) {
    link.unlinkedReason = "missing_timestamp";
    return link;
  }
  const date = dateInZone(log.atUnix);
  let sawListedDate = false;
  let sawEmptyDate = false;
  for (const feedId of feedIds) {
    const index = feedIndexes.get(feedId);
    if (!index) continue;
    if (index.dates.has(date)) sawListedDate = true;
    if (index.emptyDates.has(date)) sawEmptyDate = true;
    const block = findBlock(index.blocks, log.atUnix);
    if (!block) continue;
    const entry = { ...block, offsetSeconds: log.atUnix - block.startTs };
    if (!link.archive) {
      link.archive = entry;
      link.feedId = feedId;
      link.linkStatus = "linked";
    } else {
      link.alsoArchivedOn.push(entry);
    }
  }
  if (!link.archive) {
    if (!sawListedDate && !sawEmptyDate) link.unlinkedReason = "no_archive_listing";
    else if (!sawListedDate) link.unlinkedReason = "archive_unavailable_for_date";
    else link.unlinkedReason = "outside_block_coverage";
  }
  return link;
}

/** Link every log. Returns the link records in input order. */
export function linkLogs(logs, feedIndexes, feedIds) {
  return logs.map((log) => linkLog(log, feedIndexes, feedIds));
}

/**
 * Roll links up into the artifact's summary. Also accounts for every archive
 * block (how many carry at least one log) so "each and every scanner archive"
 * is reconciled, not just the logs.
 */
export function summarizeLinks(links, feedIndexes) {
  const total = links.length;
  let linkedCount = 0;
  const unlinkedByReason = {};
  const byDay = {};
  const agencyMap = new Map();
  const typeMap = new Map();
  const blockLogCount = new Map();
  let offsetMin = Infinity;
  let offsetMax = -Infinity;
  let offsetSum = 0;

  for (const link of links) {
    if (link.linkStatus === "linked") {
      linkedCount += 1;
      const offset = link.archive.offsetSeconds;
      if (offset < offsetMin) offsetMin = offset;
      if (offset > offsetMax) offsetMax = offset;
      offsetSum += offset;
      const key = `${link.archive.feedId}:${link.archive.id}`;
      blockLogCount.set(key, (blockLogCount.get(key) ?? 0) + 1);
    } else {
      unlinkedByReason[link.unlinkedReason] = (unlinkedByReason[link.unlinkedReason] ?? 0) + 1;
    }
    const day = String(link.at).slice(0, 10);
    const dayEntry = byDay[day] ?? (byDay[day] = { total: 0, linked: 0 });
    dayEntry.total += 1;
    if (link.linkStatus === "linked") dayEntry.linked += 1;

    const agencyEntry = agencyMap.get(link.agency) ?? { name: link.agency, total: 0, linked: 0 };
    agencyEntry.total += 1;
    if (link.linkStatus === "linked") agencyEntry.linked += 1;
    agencyMap.set(link.agency, agencyEntry);

    const typeEntry = typeMap.get(link.type) ?? { type: link.type, total: 0, linked: 0 };
    typeEntry.total += 1;
    if (link.linkStatus === "linked") typeEntry.linked += 1;
    typeMap.set(link.type, typeEntry);
  }

  let blocksTotal = 0;
  let blocksWithLogs = 0;
  for (const index of feedIndexes.values()) {
    blocksTotal += index.blocks.length;
    for (const block of index.blocks) {
      if (blockLogCount.has(`${index.feedId}:${block.id}`)) blocksWithLogs += 1;
    }
  }

  const welfareChecks = [];
  for (const link of links) {
    if (!/welfare check/i.test(link.type)) continue;
    welfareChecks.push({
      id: link.id,
      at: link.at,
      type: link.type,
      agency: link.agency,
      linkStatus: link.linkStatus,
      archiveId: link.archive?.id ?? null,
      offsetSeconds: link.archive?.offsetSeconds ?? null,
      url: link.archive?.url ?? null,
    });
  }

  return {
    total,
    linked: linkedCount,
    unlinked: total - linkedCount,
    unlinkedByReason,
    byDay,
    byAgency: [...agencyMap.values()].sort((a, b) => b.total - a.total),
    byType: [...typeMap.values()].sort((a, b) => b.total - a.total).slice(0, 25),
    archiveBlocks: { total: blocksTotal, withLogs: blocksWithLogs, empty: blocksTotal - blocksWithLogs },
    linkedOffsetSeconds: linkedCount
      ? { min: offsetMin, max: offsetMax, mean: Math.round(offsetSum / linkedCount) }
      : null,
    welfareChecks,
  };
}

// ---------------------------------------------------------------------------
// Full-history rollup
// ---------------------------------------------------------------------------

/**
 * Per-year rollup of how much of the Socrata history can be linked to
 * scanner audio. Socrata log counts come from the committed
 * citizen-connect artifact's daily trend (publisher totals); archive
 * availability comes from probed retention (see the sync script's
 * ARCHIVE_AVAILABILITY). Years before `availability.from` have no public
 * audio counterpart and are reported as unlinkable, with the reason.
 */
export function historySummaryFromTrend(trendDaily, availability) {
  const byYear = new Map();
  for (const row of trendDaily ?? []) {
    const date = String(row?.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const year = date.slice(0, 4);
    const entry = byYear.get(year) ?? { year, socrataLogs: 0, incidents: 0, cases: 0, linkableLogs: 0 };
    const total = Number(row.total) || 0;
    entry.socrataLogs += total;
    entry.incidents += Number(row.incidents) || 0;
    entry.cases += Number(row.cases) || 0;
    if (availability?.from && date >= availability.from && date <= (availability.to ?? "9999-12-31")) {
      entry.linkableLogs += total;
    }
    byYear.set(year, entry);
  }
  return {
    source: "src/data/citizen-connect.json daily trend (publisher totals per day)",
    scannerAudioAvailability: availability ?? null,
    perYear: [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year)),
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/** archives.php listing URL for one feed on one date (date ISO YYYY-MM-DD). */
export function archiveListUrl(feedId, dateISO) {
  const [y, m, d] = String(dateISO).split("-");
  return `${BROADCASTIFY_BASE}/archives/api/archives.php?feedId=${encodeURIComponent(feedId)}&date=${encodeURIComponent(`${m}/${d}/${y}`)}`;
}

/** details.json URL for one Socrata day over a bounding box. */
export function socrataDetailsUrl({ apiBase, day, bbox, categories, zoom = "14" }) {
  const params = new URLSearchParams({
    categories,
    start_date: day,
    end_date: day,
    shape_group_id: "",
    shape_ids: "",
    search_field: "",
    search_value: "",
    statusFilter: "",
    zoom,
    lat1: String(bbox.north),
    lat2: String(bbox.south),
    lng1: String(bbox.west),
    lng2: String(bbox.east),
  });
  return `${apiBase}/api/tickets/details.json?${params.toString()}`;
}
