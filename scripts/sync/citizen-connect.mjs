#!/usr/bin/env node
/**
 * Citizen Connect ingest — Cheyenne PD / Laramie County Sheriff's Office.
 *
 * WHAT THIS PULLS
 *   The public "Citizen Connect" dashboard at
 *   https://laramiecounty-letmsp.connect.socrata.com/ is a Tyler Technologies
 *   (Socrata) app over two private CAD datasets. The datasets themselves are
 *   login-only (`/resource/<uid>.json` -> "You must be logged in"), but the
 *   dashboard's own JSON API is public — that is the access path the agencies
 *   published, so this script uses exactly that and nothing else.
 *
 *   Endpoints used (all GET, all public):
 *     /api/administrator/app_config.json      branding, category tree, date limits
 *     /api/shapes.json?only_meta=true         Wards / LE Response Area / Precinct
 *     /api/shapes.geojson                     boundary polygons (for point-in-shape)
 *     /api/tickets_trends/day_wise.json       day-of-week x hour-of-day counts
 *     /api/tickets_trends/historical_wise.json  daily counts per layer
 *     /api/tickets/other_pins_count.json      records with no usable location
 *     /api/tickets/details.json               record-level pins (heavy; opt-in)
 *
 * MODES
 *   --mode aggregates  (default)  ~10–15 requests. Exact rhythm grid, exact
 *                                 daily / monthly / yearly totals per layer,
 *                                 unverified-location counts and boundary names.
 *   --mode records                Also pull record-level pins for the chosen
 *                                 records window. Adds per-category, per-agency
 *                                 and per-boundary counts. The first full pull
 *                                 is ~1,400 day requests from 2023; checkpointed
 *                                 under .cache/citizen-connect for reruns.
 *   --mode all                    Alias for records (aggregates always run).
 *
 * SAFETY
 *   Fail-closed, like the rest of this repo's sync pipeline. A run that cannot
 *   reach the publisher, or that produces an artifact with no totals, exits
 *   non-zero and leaves the committed artifact untouched — a broken sync can
 *   never blank out the public page. Writes go through scripts/lib/atomic.mjs.
 *   The output is merged into any existing artifact, so running `aggregates`
 *   after a successful `records` run does not throw the record-derived fields
 *   away.
 *
 * USAGE
 *   node scripts/sync/citizen-connect.mjs                                # aggregates
 *   node scripts/sync/citizen-connect.mjs --mode records --records-start 2023-01-01
 *   node scripts/sync/citizen-connect.mjs --start 2020-01-01 --end 2026-10-04
 *   node scripts/sync/citizen-connect.mjs --dry-run --start 2020-01-01 --end 2026-10-04
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWrite } from "../lib/atomic.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_PATH = path.join(ROOT, "src", "data", "citizen-connect.json");
const PUBLIC_OUT_PATH = path.join(ROOT, "public", "data", "citizen-connect.json");
const CACHE_DIR = path.join(ROOT, ".cache", "citizen-connect");

const API_BASE = process.env.CITIZEN_CONNECT_API_BASE || "https://laramiecounty-letmsp.connect.socrata.com";

/**
 * The category selection the agencies' own published dashboard link uses.
 * Format is `<layerIndex>:<datasetEntryId>=<idRanges>&<datasetEntryId>=<idRanges>|…`
 * Layer 1 = Incidents (CAD activity), layer 2 = Cases (separate case records).
 * Categories deliberately withheld by the publisher (sexual assaults, juvenile
 * matters) are absent from these ranges and cannot be requested.
 */
const DEFAULT_CATEGORIES =
  "1:3130=2-107,109-127,130-300,302-359,367-385,404-411,413-451,453-495,497" +
  "&3145=2-93,95-111,114-277,279-326,334-353,370-447" +
  "|2:2056=1-27,34-100,107,111-125&2059=1-25,32-71,73-99,106,110-121";

/** Bounding box of Laramie County, Wyoming (with margin). */
const COUNTY_BBOX = { north: 41.65, south: 40.85, west: -105.35, east: -103.95 };

/** details.json returns everything in a window; if we hit this many we subdivide. */
const RECORD_CAP = 4000;
const MAX_SUBDIVISIONS = 4;
const CACHE_REVALIDATE_DAYS = 14;
const MAX_RETRIES = Number(process.env.CITIZEN_CONNECT_MAX_RETRIES ?? 3);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(name);

const MODE = arg("--mode", "aggregates");
const DRY_RUN = flag("--dry-run");
const THROTTLE_MS = Number(arg("--throttle", "450"));
const OUT = arg("--out", OUT_PATH);

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
function dayRange(startIso, endIso) {
  const out = [];
  for (let t = new Date(`${startIso}T00:00:00Z`).getTime(); t <= new Date(`${endIso}T00:00:00Z`).getTime(); t += 86400000) {
    out.push(isoDay(new Date(t)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP — one polite, retrying fetcher for the whole script
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

function query(params) {
  return new URLSearchParams(params).toString();
}

/** Shared filter block every tickets endpoint expects. */
function filterParams({ start, end, categories = DEFAULT_CATEGORIES, shapeGroupId = "", shapeIds = "", zoom = "9" }) {
  return {
    categories,
    start_date: start,
    end_date: end,
    shape_group_id: shapeGroupId,
    shape_ids: shapeIds,
    search_field: "",
    search_value: "",
    statusFilter: "",
    zoom,
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

async function fetchConfig() {
  const cfg = await getJson(`${API_BASE}/api/administrator/app_config.json`);
  return cfg;
}

/**
 * The 3-tier category tree is shipped inside app_config as an escaped JSON
 * string under a key that has moved between app versions. Rather than hardcode
 * the key, walk the config and take any string that parses into something with
 * recognisable category/sub-category arrays.
 */
function extractCategoryTree(cfg) {
  const found = [];
  const looksLikeTree = (v) =>
    v && typeof v === "object" && (Array.isArray(v.categories) || Array.isArray(v.sub_categories) || Array.isArray(v.children));

  const visit = (node, depth = 0) => {
    if (!node || depth > 6 || found.length) return;
    if (typeof node === "string" && node.length > 200 && (node.includes("sub_categories") || node.includes('"categories"'))) {
      try {
        const parsed = JSON.parse(node);
        if (looksLikeTree(parsed) || Array.isArray(parsed)) found.push(parsed);
        else if (parsed && typeof parsed === "object") {
          for (const v of Object.values(parsed)) if (looksLikeTree(v) || Array.isArray(v)) { found.push(v); break; }
        }
      } catch { /* not JSON after all — keep walking */ }
      return;
    }
    if (Array.isArray(node)) { for (const v of node) visit(v, depth + 1); return; }
    if (typeof node === "object") {
      if (looksLikeTree(node)) { found.push(node); return; }
      for (const v of Object.values(node)) visit(v, depth + 1);
    }
  };
  visit(cfg);
  return found[0] ?? null;
}

function flattenCategories(tree) {
  if (!tree) return [];
  const out = [];
  const walk = (nodes, parent) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const id = String(n.id ?? n.category_id ?? "");
      const name = n.display_name || n.name || "";
      if (id && name) out.push({ id, name, parent: parent ?? null, hidden: n.show === false });
      const kids = n.sub_categories ?? n.children ?? n.categories;
      if (kids) walk(kids, name);
    }
  };
  const roots = Array.isArray(tree) ? tree : tree.categories ?? tree.sub_categories ?? [];
  walk(roots, null);
  return out;
}

async function fetchShapeGroups() {
  const raw = await getJson(`${API_BASE}/api/shapes.json?only_meta=true`);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("shapes.json did not return any boundary groups");
  const groups = raw.map((g) => ({
    id: String(g.shape_group_id ?? ""),
    name: String(g.shape_group_name ?? ""),
    color: g.color ?? null,
    complete: true,
    shapes: (g.shapes ?? []).map((s) => ({ id: String(s.shape_id), name: s.shape_text || s.shape_description || String(s.shape_id) })),
  }));
  if (groups.some((g) => !g.id || !g.name || g.shapes.length === 0)) {
    throw new Error("shapes.json returned a boundary group without an id, name, or shapes");
  }
  return groups;
}

/**
 * Boundary polygons, used to assign record-level pins to a ward / response area
 * without making one API call per shape.
 */
async function fetchShapeGeometry(groupId) {
  const url = `${API_BASE}/api/shapes.geojson?${query({ shape_group_id: groupId, simplify_for_zoom: "0" })}`;
  try {
    const gj = await getJson(url);
    if (!gj || !Array.isArray(gj.features)) return null;
    return gj.features.map((f) => ({
      shapeId: String(f.properties?.shape_id ?? f.properties?.shapeId ?? ""),
      name: String(f.properties?.shape_text ?? f.properties?.shape_description ?? f.properties?.name ?? ""),
      geometry: f.geometry,
    })).filter((g) => g.name && g.geometry);
  } catch {
    return null; // boundaries are an enrichment, never a hard requirement
  }
}

/** day_wise -> the exact 7 x 24 rhythm grid for a window. */
async function fetchRhythm({ start, end }) {
  const json = await getJson(`${API_BASE}/api/tickets_trends/day_wise.json?${query(filterParams({ start, end }))}`);
  const data = json?.api_data;
  if (!data || typeof data !== "object") throw new Error("day_wise.json returned no api_data");
  const dowOrder = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const cells = {};
  for (const d of dowOrder) {
    const row = data[d];
    if (!row) throw new Error(`day_wise.json is missing weekday ${d}`);
    cells[d] = Array.from({ length: 24 }, (_, h) => {
      const cell = row[String(h).padStart(2, "0")];
      const split = cell?.split_up ?? {};
      return [Number(cell?.total ?? 0), Number(split.Incidents ?? 0), Number(split.Cases ?? 0)];
    });
  }
  return { dowOrder, cells };
}

/** historical_wise -> one row per (day, layer). The backbone of every trend. */
async function fetchDailySeries({ start, end }) {
  const json = await getJson(`${API_BASE}/api/tickets_trends/historical_wise.json?${query(filterParams({ start, end }))}`);
  const records = json?.api_data?.records;
  if (!Array.isArray(records)) throw new Error("historical_wise.json returned no records array");
  return records.map((r) => ({
    date: String(r.date).slice(0, 10),
    layer: r.super_category,
    datasetId: r.dataset_id,
    count: Number(r.count),
  }));
}

/** Records that matched the filters but carry no usable location. */
async function fetchUnmappableCount({ start, end }) {
  const json = await getJson(`${API_BASE}/api/tickets/other_pins_count.json?${query(filterParams({ start, end }))}`);
  const n = Number(json?.tickets_count);
  return Number.isFinite(n) ? n : null;
}

/**
 * Record-level pull for one window, subdividing the bounding box whenever the
 * publisher returns suspiciously close to its own row cap. Without this a busy
 * day silently truncates and the artifact would understate reality.
 */
async function fetchRecords({ start, end, bbox = COUNTY_BBOX, depth = 0 }) {
  const params = filterParams({ start, end, zoom: "14" });
  const url = `${API_BASE}/api/tickets/details.json?${query({
    ...params,
    lat1: String(bbox.north),
    lat2: String(bbox.south),
    lng1: String(bbox.west),
    lng2: String(bbox.east),
  })}`;
  const json = await getJson(url);
  const records = json?.api_data?.records;
  if (!Array.isArray(records)) throw new Error(`${start}..${end} details.json did not return a records array`);

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
    for (const q of quadrants) merged.push(...(await fetchRecords({ start, end, bbox: q, depth: depth + 1 })));
    // Quadrants share their border; the publisher snaps locations to a grid, so
    // a record can land exactly on that line. De-duplicate by source row id so
    // such a pin never inflates the category / ward counts.
    const seen = new Set();
    return merged.filter((r) => {
      const id = r[":id"] ?? r.ticket_id ?? r.ticket_primary_key;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  if (records.length >= RECORD_CAP) {
    throw new Error(`${start}..${end} hit the publisher row cap after ${MAX_SUBDIVISIONS} spatial subdivisions; refusing to publish incomplete category/shape counts`);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Geometry — point in polygon, so ward counts need no extra API calls
// ---------------------------------------------------------------------------

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng, lat, geometry) {
  const polygons = polygonsOf(geometry);
  if (!polygons.length) return false;
  // In GeoJSON each polygon's first ring is the shell; any later ring is a
  // hole. Apply the even-odd test within each polygon, then OR polygons so two
  // disjoint components can never cancel each other out.
  return polygons.some((rings) => {
    if (!rings?.length || !pointInRing(lng, lat, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(lng, lat, hole));
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function buildTrend(dailyRows, windowStart, windowEnd) {
  // historical_wise omits zero-count dates. Fill every calendar day in the
  // requested window before bucketing, otherwise its "days" field would be
  // active-data days, not elapsed days, and its per-day rates would be biased
  // upward. This also keeps a partial year honest instead of turning it into a
  // false collapse when compared with a full year.
  const rowDates = dailyRows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const start = windowStart ?? rowDates[0];
  const end = windowEnd ?? rowDates[rowDates.length - 1];
  if (!start || !end) return { granularity: "day", daily: [], monthly: [], yearly: [] };

  const byDay = new Map();
  for (const r of dailyRows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(r.count) || r.count < 0) {
      throw new Error(`historical_wise returned an invalid row: ${JSON.stringify(r)}`);
    }
    const e = byDay.get(r.date) ?? { date: r.date, incidents: 0, cases: 0 };
    if (r.layer === "Cases") e.cases += r.count;
    else if (r.layer === "Incidents") e.incidents += r.count;
    else throw new Error(`historical_wise returned an unknown layer: ${r.layer}`);
    byDay.set(r.date, e);
  }

  const daily = dayRange(start, end).map((date) => {
    const d = byDay.get(date) ?? { date, incidents: 0, cases: 0 };
    return { date, total: d.incidents + d.cases, incidents: d.incidents, cases: d.cases };
  });

  const bucket = (key) => {
    const m = new Map();
    for (const d of daily) {
      const k = key(d.date);
      const e = m.get(k) ?? { label: k, incidents: 0, cases: 0, days: 0 };
      e.incidents += d.incidents;
      e.cases += d.cases;
      e.days += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => (a.label < b.label ? -1 : 1)).map((e) => ({
      label: e.label,
      total: e.incidents + e.cases,
      incidents: e.incidents,
      cases: e.cases,
      days: e.days,
      perDay: e.days ? +((e.incidents + e.cases) / e.days).toFixed(1) : 0,
    }));
  };

  return {
    granularity: "day",
    daily,
    monthly: bucket((d) => d.slice(0, 7)),
    yearly: bucket((d) => d.slice(0, 4)),
  };
}

function rhythmFromCells({ dowOrder, cells }, weekdayOccurrences) {
  const hour = Array.from({ length: 24 }, (_, h) => {
    let total = 0, incidents = 0, cases = 0;
    for (const d of dowOrder) { total += cells[d][h][0]; incidents += cells[d][h][1]; cases += cells[d][h][2]; }
    return { hour: h, total, incidents, cases };
  });
  const dowTotals = {};
  for (const d of dowOrder) {
    let total = 0, incidents = 0, cases = 0;
    for (const c of cells[d]) { total += c[0]; incidents += c[1]; cases += c[2]; }
    const n = weekdayOccurrences?.[d] ?? null;
    dowTotals[d] = { total, incidents, cases, occurrences: n, perOccurrence: n ? +(total / n).toFixed(1) : null };
  }
  const all = hour.reduce((s, h) => s + h.total, 0);
  return {
    dowOrder,
    cells,
    hour,
    dowTotals,
    totals: {
      all,
      incidents: hour.reduce((s, h) => s + h.incidents, 0),
      cases: hour.reduce((s, h) => s + h.cases, 0),
    },
  };
}

function tallyRecords(records) {
  const categories = new Map();
  const agencies = new Map();
  const layers = new Map();
  for (const r of records) {
    const layer = r.super_category ?? "Unknown";
    layers.set(layer, (layers.get(layer) ?? 0) + 1);

    const agency = r.category ?? "Unknown agency";
    agencies.set(agency, (agencies.get(agency) ?? 0) + 1);

    const type = r.sub_category ?? "Uncategorised";
    const key = `${layer}::${agency}::${type}`;
    categories.set(key, (categories.get(key) ?? 0) + 1);
  }
  const total = records.length || 1;
  return {
    categories: [...categories.entries()]
      .map(([k, count]) => {
        const [layer, agency, type] = k.split("::");
        return { layer, agency, type, count, share: +((count / total) * 100).toFixed(3) };
      })
      .sort((a, b) => b.count - a.count),
    agencies: [...agencies.entries()].map(([name, count]) => ({ name, count, share: +((count / total) * 100).toFixed(2) })).sort((a, b) => b.count - a.count),
    layers: [...layers.entries()].map(([name, count]) => ({ name, count })),
  };
}

function assignShapes(records, geometries) {
  if (!geometries?.length) return [];
  // `shape_id` is not unique in the precinct layer (multiple precinct labels
  // share the same parent id), so use the publisher's unique visible label as
  // the primary key and retain shape_id only as metadata.
  const keyOf = (g) => g.name ? `name:${g.name}` : `id:${g.shapeId}`;
  const counts = new Map(geometries.map((g) => [keyOf(g), { shapeId: g.shapeId, name: g.name, count: 0 }]));
  let unassigned = 0;
  for (const r of records) {
    const [lng, lat] = r.location?.coordinates ?? [];
    if (typeof lng !== "number" || typeof lat !== "number") { unassigned += 1; continue; }
    let hit = null;
    for (const g of geometries) {
      if (pointInGeometry(lng, lat, g.geometry)) { hit = keyOf(g); break; }
    }
    if (hit) counts.get(hit).count += 1;
    else unassigned += 1;
  }
  return { shapes: [...counts.values()].sort((a, b) => b.count - a.count), unassigned };
}

// ---------------------------------------------------------------------------
// Record-mode cache (checkpointed so a partial run is never wasted)
// ---------------------------------------------------------------------------

function cacheFile(day) {
  return path.join(CACHE_DIR, `${day}.json`);
}
function readCache(day) {
  const f = cacheFile(day);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}
function writeCache(day, payload) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile(day), JSON.stringify(payload));
}

async function runRecordsMode({ start, end, shapeGroups }) {
  const days = dayRange(start, end);
  const recordCoverage = { start, end, days: days.length, source: "record-level details.json pull" };
  const revalidateFrom = isoDay(addDays(end, -(CACHE_REVALIDATE_DAYS - 1)));
  const all = [];
  let fetched = 0;
  let cached = 0;
  for (const [i, day] of days.entries()) {
    const hit = readCache(day);
    const shouldRevalidate = day >= revalidateFrom;
    let recs;
    if (hit && Array.isArray(hit.records) && !shouldRevalidate) {
      recs = hit.records;
      cached += 1;
    } else {
      recs = await fetchRecords({ start: day, end: day });
      writeCache(day, { day, fetchedAt: new Date().toISOString(), records: recs });
      fetched += 1;
    }
    all.push(...recs);
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  records: ${i + 1}/${days.length} days (${fetched} fetched, ${cached} cached, ${all.length.toLocaleString()} rows)\n`);
    }
  }
  process.stdout.write(`  records: done — ${all.length.toLocaleString()} rows (${fetched} fetched, ${cached} cached)\n`);
  if (all.length === 0) {
    throw new Error(`record-level window ${start}..${end} returned no pin records; refusing to replace any previous category or boundary breakdown with an empty result`);
  }

  const tally = tallyRecords(all);

  // Per-shape counts, computed locally from the boundary polygons.
  const geography = [];
  for (const group of shapeGroups) {
    const geoms = await fetchShapeGeometry(group.id);
    const assigned = assignShapes(all, geoms);
    const countByName = new Map((assigned.shapes ?? []).map((s) => [s.name, s.count]));
    const allShapesMatched = Boolean(geoms?.length)
      && group.shapes.length === geoms.length
      && group.shapes.every((shape) => countByName.has(shape.name));
    geography.push({
      id: group.id,
      name: group.name,
      color: group.color,
      complete: allShapesMatched,
      coverage: recordCoverage,
      unassigned: assigned.unassigned ?? null,
      shapes: group.shapes.map((shape) => countByName.has(shape.name)
        ? { ...shape, count: countByName.get(shape.name) }
        : shape),
    });
  }

  // A bounded, most-recent-first sample for the panel's live strip.
  const sample = [...all]
    .filter((r) => r.location?.coordinates && r.ticket_created_at)
    .sort((a, b) => (a.ticket_created_at < b.ticket_created_at ? 1 : -1))
    .slice(0, 60)
    .map((r) => ({
      id: r.ticket_id ?? r.ticket_primary_key,
      at: r.ticket_created_at,
      agency: r.category,
      layer: r.super_category,
      type: r.sub_category,
      lat: r.location.coordinates[1],
      lng: r.location.coordinates[0],
    }));

  return {
    categories: { counts: tally.categories, agencies: tally.agencies, layers: tally.layers },
    geography,
    sample,
    recordCoverage,
  };
}

// ---------------------------------------------------------------------------
// Merge + write
// ---------------------------------------------------------------------------

function loadExisting(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function buildArtifact({ existing, config, shapeGroups, rhythm, trend, unmappable, recordDerived, start, end, days, weekdayOccurrences }) {
  const prev = existing ?? {};
  const categories = recordDerived?.categories ?? prev.categories ?? { counts: [], tree: [] };
  const recordCoverage = recordDerived?.recordCoverage ?? prev.recordCoverage ?? null;
  const previousGroups = prev.geography?.groups ?? [];
  const refreshedGroups = shapeGroups.map((group) => {
    const old = previousGroups.find((item) => item.id === group.id);
    const oldCounted = old?.shapes?.filter((item) => typeof item.count === "number") ?? [];
    const priorCountsComplete = Boolean(old?.complete)
      && oldCounted.length === group.shapes.length
      && group.shapes.every((shape) => oldCounted.some((item) => item.id === shape.id && item.name === shape.name));
    return {
      ...group,
      ...(priorCountsComplete ? {
        unassigned: old.unassigned,
        stale: old.stale,
        coverage: old.coverage ?? prev.geography?.coverage ?? null,
      } : {}),
      shapes: group.shapes.map((shape) => {
        const oldShape = priorCountsComplete ? oldCounted.find((item) => item.id === shape.id && item.name === shape.name) : null;
        return oldShape ? { ...shape, count: oldShape.count } : shape;
      }),
    };
  });
  const geography = recordDerived
    ? recordDerived.geography.map((group) => {
      const old = previousGroups.find((item) => item.id === group.id);
      const oldCountsComplete = Boolean(old?.complete)
        && (old?.shapes?.filter((shape) => typeof shape.count === "number").length ?? 0) === (old?.shapes?.length ?? 0)
        && Boolean(old?.shapes?.length);
      if (group.complete || !oldCountsComplete) return group;
      return {
        ...old,
        coverage: old.coverage ?? prev.geography?.coverage ?? null,
        stale: true,
      };
    })
    : refreshedGroups;
  const sample = recordDerived ? recordDerived.sample : prev.sample ?? [];
  const tree = flattenCategories(extractCategoryTree(config));

  const artifact = {
    ...prev,
    schema: 2,
    generatedBy: "sync",
    // Filled after the semantic comparison below so a scheduled no-op does not
    // create a daily commit merely because the wall clock moved.
    capturedAt: prev.capturedAt ?? new Date().toISOString(),
    source: {
      ...(prev.source ?? {}),
      name: config?.branding?.browser_title ?? prev.source?.name ?? "Cheyenne / Laramie County Citizen Connect",
      publisher: "Cheyenne Police Department & Laramie County Sheriff's Office",
      platform: "Tyler Technologies (Socrata) Citizen Connect",
      appUrl: `${API_BASE}/`,
      apiBase: API_BASE,
      refreshCadence: "Publisher states the underlying data refreshes roughly every three days.",
      timezone: "America/Denver",
    },
    coverage: {
      ...(prev.coverage ?? {}),
      requestedStart: start,
      requestedEnd: end,
      days,
      weekdayOccurrences,
    },
    recordCoverage,
    layers: prev.layers ?? [],
    agencies: prev.agencies ?? [],
    totals: rhythm.totals,
    rhythm: { dowOrder: rhythm.dowOrder, cells: rhythm.cells, dowTotals: rhythm.dowTotals, hour: rhythm.hour },
    trend,
    categories: {
      ...(prev.categories ?? {}),
      counts: categories.counts ?? [],
      tree: tree.length ? tree : categories.tree ?? [],
      agencies: categories.agencies ?? [],
      layers: categories.layers ?? [],
      coverage: recordCoverage,
    },
    geography: { groups: geography, coverage: recordCoverage },
    dataQuality: { ...(prev.dataQuality ?? {}), unmappableByWindow: unmappable },
    sample,
    sampleDescription: recordDerived
      ? recordDerived.sample.length
        ? "Most recent 60 located records returned by the publisher's public pin endpoint; subject to the stated refresh delay."
        : "No located sample records were returned for the selected record-level window."
      : prev.sampleDescription,
    completeness: {
      totals: true,
      rhythm: true,
      trend: Boolean(trend?.daily?.length),
      categoryCounts: Boolean(categories.counts?.length),
      geographyCounts: Boolean(geography?.some?.((g) => g.shapes?.some?.((s) => typeof s.count === "number"))),
      sample: Boolean(sample.length),
    },
  };

  delete artifact.captureNote;
  const comparable = (value) => {
    const clone = structuredClone(value);
    delete clone.capturedAt;
    delete clone.generatedBy;
    delete clone.captureNote;
    return JSON.stringify(clone);
  };
  artifact.capturedAt = prev.capturedAt && comparable(artifact) === comparable(prev)
    ? prev.capturedAt
    : new Date().toISOString();
  return artifact;
}

/** Guard: never overwrite a good artifact with an empty one. */
function validate(artifact) {
  const problems = [];
  if (!artifact.totals || !(artifact.totals.all > 0)) problems.push("totals.all is zero or missing");
  if (!artifact.rhythm?.cells?.Su?.length) problems.push("rhythm grid is missing");
  if (!artifact.coverage?.days) problems.push("coverage window is missing");
  if (artifact.totals.incidents + artifact.totals.cases !== artifact.totals.all) {
    problems.push("incident and case totals do not reconcile to the all-record total");
  }
  if (artifact.trend?.daily?.length) {
    const trendTotals = artifact.trend.daily.reduce((s, d) => ({
      total: s.total + d.total,
      incidents: s.incidents + d.incidents,
      cases: s.cases + d.cases,
    }), { total: 0, incidents: 0, cases: 0 });
    if (trendTotals.total !== artifact.totals.all || trendTotals.incidents !== artifact.totals.incidents || trendTotals.cases !== artifact.totals.cases) {
      problems.push(`daily trend totals (${trendTotals.total}/${trendTotals.incidents}/${trendTotals.cases}) do not reconcile to the rhythm totals (${artifact.totals.all}/${artifact.totals.incidents}/${artifact.totals.cases})`);
    }
  }
  if (artifact.completeness?.geographyCounts && !artifact.geography?.groups?.some((g) => g.shapes?.some((s) => typeof s.count === "number"))) {
    problems.push("geographyCounts is marked complete but no shape counts are present");
  }
  return problems;
}

// ---------------------------------------------------------------------------

async function main() {
  if (!["aggregates", "records", "all"].includes(MODE)) {
    process.stderr.write(`unknown --mode "${MODE}" (use aggregates | records | all)\n`);
    process.exit(2);
  }

  const existing = loadExisting(OUT);
  const startArg = arg("--start");
  const endArg = arg("--end");
  const recordsStartArg = arg("--records-start");

  // Pull the publisher's own date limits first so the default window matches
  // what the dashboard actually offers, rather than a guess baked in here.
  // A dry run skips the network entirely, so the plan can be smoke-tested in CI
  // or from a laptop without reaching the publisher.
  const offlinePlan = DRY_RUN;
  let config = null;
  if (!offlinePlan) {
    process.stdout.write(`Citizen Connect ingest — mode=${MODE}\n  fetching app config …\n`);
    config = await fetchConfig();
  } else {
    process.stdout.write(`Citizen Connect ingest — mode=${MODE} (offline plan)\n`);
  }
  const configStartYear = Number(config?.date_filter_start_year) || 2020;
  const start = startArg ?? `${configStartYear}-01-01`;
  const end = endArg ?? isoDay(addDays(isoDay(todayUtc()), -1));
  const recordsStart = recordsStartArg ?? start;
  for (const value of [start, end, recordsStart]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) || isoDay(new Date(`${value}T00:00:00Z`)) !== value) {
      throw new Error(`invalid date "${value}"; expected YYYY-MM-DD`);
    }
  }
  const days = dayRange(start, end).length;
  const recordDays = dayRange(recordsStart, end).length;
  if (!days) throw new Error(`window end ${end} is before start ${start}`);
  if ((MODE === "records" || MODE === "all") && !recordDays) {
    throw new Error(`record window end ${end} is before records start ${recordsStart}`);
  }

  const weekdayOccurrences = { Su: 0, Mo: 0, Tu: 0, We: 0, Th: 0, Fr: 0, Sa: 0 };
  for (const d of dayRange(start, end)) weekdayOccurrences[["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(`${d}T00:00:00Z`).getUTCDay()]] += 1;

  const years = new Set(dayRange(start, end).map((d) => d.slice(0, 4))).size;
  const aggregateRequests = 4 + years;
  const recordMode = MODE === "records" || MODE === "all";
  const plan = {
    apiBase: API_BASE,
    window: { start, end, days },
    ...(recordMode ? { recordWindow: { start: recordsStart, end, days: recordDays } } : {}),
    mode: MODE,
    throttleMs: THROTTLE_MS,
    estimatedRequests: aggregateRequests + (recordMode ? recordDays + 3 : 0),
    out: path.relative(ROOT, OUT),
  };
  process.stdout.write(`  window ${start} → ${end} (${days} days)\n`);
  if (DRY_RUN) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  process.stdout.write("  fetching shape groups …\n");
  const shapeGroups = await fetchShapeGroups();

  process.stdout.write("  fetching rhythm grid (day-of-week x hour) …\n");
  const rhythm = rhythmFromCells(await fetchRhythm({ start, end }), weekdayOccurrences);
  process.stdout.write(`    ${rhythm.totals.all.toLocaleString()} records (${rhythm.totals.incidents.toLocaleString()} incidents / ${rhythm.totals.cases.toLocaleString()} cases)\n`);

  process.stdout.write("  fetching daily series …\n");
  const trend = buildTrend(await fetchDailySeries({ start, end }), start, end);
  process.stdout.write(`    ${trend.daily.length} days, ${trend.monthly.length} months, ${trend.yearly.length} years\n`);

  process.stdout.write("  fetching unverified-location counts …\n");
  const unmappable = [];
  for (const y of trend.yearly) {
    const ys = y.label === start.slice(0, 4) && start > `${y.label}-01-01` ? start : `${y.label}-01-01`;
    const yearEnd = `${y.label}-12-31`;
    const ye = y.label === end.slice(0, 4) && end < yearEnd ? end : yearEnd;
    const n = await fetchUnmappableCount({ start: ys, end: ye });
    if (n !== null) unmappable.push({ window: `${ys}/${ye}`, year: y.label, count: n, label: "Unverified Locations" });
  }

  let recordDerived = null;
  if (recordMode) {
    process.stdout.write(`  fetching record-level pins for ${recordDays} days (${recordsStart} → ${end}; throttle ${THROTTLE_MS}ms) …\n`);
    recordDerived = await runRecordsMode({ start: recordsStart, end, shapeGroups });
  }

  const artifact = buildArtifact({ existing, config, shapeGroups, rhythm, trend, unmappable, recordDerived, start, end, days, weekdayOccurrences });

  const problems = validate(artifact);
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
    `  ${requestCount} requests · completeness ${JSON.stringify(artifact.completeness)}\n`,
  );
}

// Exported so tests/sync/citizen-connect.test.mjs can exercise the aggregation
// and geometry helpers directly, without a network round-trip.
export {
  API_BASE,
  DEFAULT_CATEGORIES,
  COUNTY_BBOX,
  buildTrend,
  rhythmFromCells,
  flattenCategories,
  extractCategoryTree,
  tallyRecords,
  assignShapes,
  pointInGeometry,
  dayRange,
  filterParams,
};

// Only run when invoked directly — `node scripts/sync/citizen-connect.mjs`.
// Importing the module for its helpers must never start a sync.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`citizen-connect sync failed: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}