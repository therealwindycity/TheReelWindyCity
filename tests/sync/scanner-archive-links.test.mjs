/**
 * Scanner-archive linkage test suite.
 *
 * Locks down the two things that would quietly produce a *wrong* link:
 *
 *   1. Join correctness — wall-time→Unix conversion (DST included), half-open
 *      block boundaries, cross-midnight blocks, gap/offline/retention-expired
 *      dates, multi-feed priority, and summary reconciliation. Every headline
 *      figure in the artifact derives from these helpers.
 *   2. Fail-closed ingest — a missing cache entry in --offline mode, or an
 *      unreachable publisher, must leave the committed artifact untouched and
 *      exit non-zero. A blank or half-linked public artifact is worse than a
 *      stale one.
 *
 * Plus the bundled seed artifact's own internal consistency: every linked log
 * must fall inside its archive block, and the welfare-check records from the
 * Prosser / South Greeley window must point at the exact blocks found by hand.
 *
 * Run: npm run test:scanner-archive-links
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FEED_CATALOG,
  archiveListUrl,
  buildFeedIndex,
  dateInZone,
  dedupeRecords,
  findBlock,
  historySummaryFromTrend,
  linkLog,
  linkLogs,
  normalizeArchiveBlock,
  normalizeSocrataRecord,
  orderedFeedsForAgency,
  socrataDetailsUrl,
  summarizeLinks,
  wallTimeToUnix,
} from "../../scripts/lib/scanner-archive.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT = path.join(ROOT, "src", "data", "scanner-archive-links.json");
const CC_ARTIFACT = path.join(ROOT, "src", "data", "citizen-connect.json");
const SYNC = path.join(ROOT, "scripts", "sync", "scanner-archive-links.mjs");

const SEED = {
  start: "2026-07-18",
  end: "2026-07-20",
  bbox: "41.1125,41.0975,-104.8075,-104.7925",
};

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const ccArtifact = JSON.parse(readFileSync(CC_ARTIFACT, "utf8"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A realistic 2026 block: 2026-07-19 4:13:41–4:43:41 PM MDT. */
const REAL_BLOCK_A = { id: "47003-1784499221", start: "04:13 PM", end: "04:43 PM", startTs: 1784499221, endTs: 1784501021, duration: 1800, reqs: 0 };
/** A later block with a deliberate gap before it (feed restart). */
const REAL_BLOCK_B = { id: "47003-1784502000", start: "04:43 PM", end: "05:13 PM", startTs: 1784502000, endTs: 1784503800, duration: 1800, reqs: 0 };

const mkLog = (over = {}) => ({
  id: "2026-00023988",
  at: "2026-07-19T16:40:08.000",
  atUnix: 1784500808,
  agency: "Laramie County Sheriff's Department - WY0110000",
  type: "Welfare Check - Routine",
  layer: "Incidents",
  datasetId: "35sf-bu8v",
  entryId: "pds_5",
  lat: 41.105,
  lng: -104.8,
  ...over,
});

// ---------------------------------------------------------------------------
// wall time ↔ Unix (America/Denver, DST included)
// ---------------------------------------------------------------------------

describe("wallTimeToUnix — America/Denver wall time to Unix", () => {
  test("summer (MDT, UTC-6): the Prosser/S Greeley welfare check", () => {
    assert.equal(wallTimeToUnix("2026-07-19T16:40:08"), 1784500808);
    assert.equal(wallTimeToUnix("2026-07-19T16:40:08.000"), 1784500808);
  });

  test("winter (MST, UTC-7) uses the other offset", () => {
    // 2026-01-15 12:00:00 MST = 19:00:00 UTC
    assert.equal(wallTimeToUnix("2026-01-15T12:00:00"), 1768503600);
  });

  test("unparseable input yields null, never a fabricated timestamp", () => {
    assert.equal(wallTimeToUnix("not a date"), null);
    assert.equal(wallTimeToUnix(""), null);
    assert.equal(wallTimeToUnix(null), null);
  });
});

describe("dateInZone — Unix to Denver calendar date", () => {
  test("maps instants to the right local date", () => {
    assert.equal(dateInZone(1784500808), "2026-07-19");
    assert.equal(dateInZone(1784409755), "2026-07-18");
    assert.equal(dateInZone(1784534400), "2026-07-20"); // 02:00 MDT past midnight
  });
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

describe("normalizeSocrataRecord", () => {
  test("maps a details.json incident record to the link shape", () => {
    const log = normalizeSocrataRecord({
      ":id": "row-x",
      category: "Laramie County Sheriff's Department - WY0110000",
      sub_category: "Welfare Check - Routine",
      ticket_id: "2026-00023988",
      ticket_created_at: "2026-07-19T16:40:08.000",
      dataset_id: "35sf-bu8v",
      ticket_dataset_entry_id: "pds_5",
      ticket_primary_key: "2026-00023988",
      location: { type: "Point", coordinates: [-104.8, 41.105] },
      super_category: "Incidents",
    });
    assert.equal(log.id, "2026-00023988");
    assert.equal(log.atUnix, 1784500808);
    assert.equal(log.agency, "Laramie County Sheriff's Department - WY0110000");
    assert.equal(log.type, "Welfare Check - Routine");
    assert.equal(log.layer, "Incidents");
    assert.equal(log.lat, 41.105);
    assert.equal(log.lng, -104.8);
  });

  test("keeps a record whose timestamp is unparseable (atUnix null) for honest reporting", () => {
    const log = normalizeSocrataRecord({ ticket_id: "t", ticket_created_at: "garbage" });
    assert.equal(log.atUnix, null);
  });

  test("drops records with no identity or no timestamp", () => {
    assert.equal(normalizeSocrataRecord({ ticket_created_at: "2026-07-19T16:40:08" }), null);
    assert.equal(normalizeSocrataRecord({ ticket_id: "t" }), null);
    assert.equal(normalizeSocrataRecord(null), null);
  });
});

describe("normalizeArchiveBlock", () => {
  test("builds the block shape with download and page URLs", () => {
    const b = normalizeArchiveBlock(REAL_BLOCK_A, "47003");
    assert.equal(b.id, "47003-1784499221");
    assert.equal(b.startTs, 1784499221);
    assert.equal(b.duration, 1800);
    assert.equal(b.url, "https://www.broadcastify.com/archives/download/47003-1784499221");
    assert.match(b.archivePageUrl, /feedId=47003/);
  });

  test("rejects blocks with unusable bounds", () => {
    assert.equal(normalizeArchiveBlock({ id: "x", startTs: 100, endTs: 100 }, "47003"), null);
    assert.equal(normalizeArchiveBlock({ id: "x", startTs: 200, endTs: 100 }, "47003"), null);
    assert.equal(normalizeArchiveBlock(null, "47003"), null);
  });
});

describe("dedupeRecords", () => {
  test("a border record returned by two quadrants is counted once", () => {
    const out = dedupeRecords([
      { ticket_id: "a", ticket_created_at: "2026-07-19T01:00:00" },
      { ticket_id: "a", ticket_created_at: "2026-07-19T01:00:00" },
      { ticket_id: "b", ticket_created_at: "2026-07-19T02:00:00" },
    ]);
    assert.equal(out.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Index + lookup
// ---------------------------------------------------------------------------

describe("buildFeedIndex + findBlock", () => {
  const listings = new Map([
    ["2026-07-19", { archives: [REAL_BLOCK_A, REAL_BLOCK_B] }],
    ["2026-07-18", { archives: [] }], // feed offline / retention-expired day
  ]);
  const index = buildFeedIndex(listings, "47003");

  test("merges dates into one sorted array and classifies empty dates", () => {
    assert.equal(index.blocks.length, 2);
    assert.equal(index.blocks[0].id, "47003-1784499221");
    assert.ok(index.dates.has("2026-07-19"));
    assert.ok(index.emptyDates.has("2026-07-18"));
  });

  test("finds the block containing a timestamp (half-open interval)", () => {
    assert.equal(findBlock(index.blocks, 1784500808).id, "47003-1784499221");
    assert.equal(findBlock(index.blocks, 1784499221).id, "47003-1784499221", "startTs is inclusive");
  });

  test("endTs is exclusive and startTs is inclusive at block edges", () => {
    assert.equal(findBlock(index.blocks, 1784501021), null, "A's endTs is not inside A (it falls in the gap here)");
    assert.equal(findBlock(index.blocks, 1784502000).id, "47003-1784502000", "B's startTs is inside B");
    assert.equal(findBlock(index.blocks, 1784503800), null, "B's endTs is not inside B");
    const pair = [
      normalizeArchiveBlock({ id: "x-1", startTs: 1000, endTs: 2000, duration: 1000 }, "47003"),
      normalizeArchiveBlock({ id: "x-2", startTs: 2000, endTs: 3000, duration: 1000 }, "47003"),
    ];
    assert.equal(findBlock(pair, 2000).id, "x-2", "a timestamp exactly at a shared boundary belongs to the later block");
  });

  test("a gap between blocks yields null (feed restart)", () => {
    assert.equal(findBlock(index.blocks, 1784501500), null);
  });

  test("before the first block or in an empty index yields null", () => {
    assert.equal(findBlock(index.blocks, 1784499220), null);
    assert.equal(findBlock([], 1784500808), null);
    assert.equal(findBlock(index.blocks, null), null);
  });
});

// ---------------------------------------------------------------------------
// Linkage
// ---------------------------------------------------------------------------

describe("linkLog — every log gets a link or an explicit reason", () => {
  const listings = new Map([
    ["2026-07-19", { archives: [REAL_BLOCK_A, REAL_BLOCK_B] }],
    ["2026-07-18", { archives: [] }],
    // 2026-07-17 intentionally absent (no listing loaded)
  ]);
  const indexes = new Map([["47003", buildFeedIndex(listings, "47003")]]);
  const feeds = ["47003"];

  test("links a log to its block with the offset into the recording", () => {
    const link = linkLog(mkLog(), indexes, feeds);
    assert.equal(link.linkStatus, "linked");
    assert.equal(link.archive.id, "47003-1784499221");
    assert.equal(link.archive.offsetSeconds, 1587, "16:40:08 is 26m27s into the 4:13 PM block");
    assert.equal(link.feedId, "47003");
  });

  test("a gap inside a listed day is outside_block_coverage", () => {
    const link = linkLog(mkLog({ at: "2026-07-19T16:45:00.000", atUnix: 1784501500 }), indexes, feeds);
    assert.equal(link.linkStatus, "unlinked");
    assert.equal(link.unlinkedReason, "outside_block_coverage");
  });

  test("an empty listing (feed offline / retention expired) is archive_unavailable_for_date", () => {
    const link = linkLog(mkLog({ at: "2026-07-18T15:22:35.000", atUnix: 1784409755 }), indexes, feeds);
    assert.equal(link.unlinkedReason, "archive_unavailable_for_date");
  });

  test("a date with no listing at all is no_archive_listing", () => {
    const link = linkLog(mkLog({ at: "2026-07-17T14:26:40.000", atUnix: 1784320000 }), indexes, feeds);
    assert.equal(link.unlinkedReason, "no_archive_listing");
  });

  test("a log without a parseable timestamp is missing_timestamp", () => {
    const link = linkLog(mkLog({ at: "garbage", atUnix: null }), indexes, feeds);
    assert.equal(link.unlinkedReason, "missing_timestamp");
  });

  test("with two feeds the first covering feed is primary and the rest are recorded", () => {
    const indexes2 = new Map([
      ["47003", buildFeedIndex(new Map([["2026-07-19", { archives: [REAL_BLOCK_A] }]]), "47003")],
      ["47019", buildFeedIndex(new Map([["2026-07-19", { archives: [{ ...REAL_BLOCK_A, id: "47019-1784499221" }] }]]), "47019")],
    ]);
    const link = linkLog(mkLog(), indexes2, ["47003", "47019"]);
    assert.equal(link.archive.feedId, "47003");
    assert.equal(link.alsoArchivedOn.length, 1);
    assert.equal(link.alsoArchivedOn[0].feedId, "47019");
  });
});

describe("orderedFeedsForAgency", () => {
  test("the feed whose catalog matches the agency leads", () => {
    assert.deepEqual(
      orderedFeedsForAgency("Cheyenne Fire Department", ["47003", "47019"]),
      ["47019", "47003"],
    );
    assert.deepEqual(
      orderedFeedsForAgency("Laramie County Sheriff's Department - WY0110000", ["47019", "47003"]),
      ["47019", "47003"],
      "both feeds carry the sheriff; input order is preserved",
    );
  });
});

describe("summarizeLinks", () => {
  test("reconciles totals and accounts for every archive block", () => {
    const listings = new Map([["2026-07-19", { archives: [REAL_BLOCK_A, REAL_BLOCK_B] }]]);
    const indexes = new Map([["47003", buildFeedIndex(listings, "47003")]]);
    const logs = [
      mkLog(),
      mkLog({ id: "2026-00023874", at: "2026-07-19T16:45:00.000", atUnix: 1784501500, type: "Welfare Check - Routine" }),
      mkLog({ id: "x1", at: "2026-07-19T17:00:00.000", atUnix: 1784502500, type: "Traffic Stop" }),
      mkLog({ id: "x2", at: "2026-07-19T18:00:00.000", atUnix: 1784506000, type: "Traffic Stop" }), // past all blocks
    ];
    const links = linkLogs(logs, indexes, ["47003"]);
    const summary = summarizeLinks(links, indexes);
    assert.equal(summary.total, 4);
    assert.equal(summary.linked, 2);
    assert.equal(summary.unlinked, 2);
    assert.equal(summary.linked + summary.unlinked, summary.total);
    assert.deepEqual(summary.unlinkedByReason, { outside_block_coverage: 2 });
    assert.deepEqual(summary.archiveBlocks, { total: 2, withLogs: 2, empty: 0 });
    assert.deepEqual(summary.linkedOffsetSeconds, { min: 500, max: 1587, mean: 1044 });
    assert.equal(summary.welfareChecks.length, 2);
    assert.equal(summary.welfareChecks[0].id, "2026-00023988");
    assert.ok(summary.byDay["2026-07-19"].total === 4);
    assert.equal(summary.byAgency[0].name, "Laramie County Sheriff's Department - WY0110000");
  });
});

// ---------------------------------------------------------------------------
// Full-history rollup
// ---------------------------------------------------------------------------

describe("historySummaryFromTrend", () => {
  test("rolls per-year totals and counts only archive-covered days as linkable", () => {
    const trend = [
      { date: "2025-12-31", total: 10, incidents: 8, cases: 2 },
      { date: "2026-04-12", total: 5, incidents: 5, cases: 0 },
      { date: "2026-04-13", total: 7, incidents: 6, cases: 1 },
      { date: "2026-07-19", total: 3, incidents: 3, cases: 0 },
    ];
    const s = historySummaryFromTrend(trend, { from: "2026-04-13", to: "2026-10-09" });
    const y2025 = s.perYear.find((r) => r.year === "2025");
    const y2026 = s.perYear.find((r) => r.year === "2026");
    assert.equal(y2025.socrataLogs, 10);
    assert.equal(y2025.linkableLogs, 0, "no public audio before the retention window");
    assert.equal(y2026.socrataLogs, 15);
    assert.equal(y2026.linkableLogs, 10, "only days from 2026-04-13 onward are linkable");
  });
});

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

describe("URL builders", () => {
  test("archiveListUrl uses the MM/DD/YYYY listing format", () => {
    assert.equal(
      archiveListUrl("47003", "2026-07-19"),
      "https://www.broadcastify.com/archives/api/archives.php?feedId=47003&date=07%2F19%2F2026",
    );
  });

  test("socrataDetailsUrl pins one day and the bounding box", () => {
    const url = socrataDetailsUrl({
      apiBase: "https://laramiecounty-letmsp.connect.socrata.com",
      day: "2026-07-19",
      bbox: { north: 41.1125, south: 41.0975, west: -104.8075, east: -104.7925 },
      categories: "1:3130=2-107",
    });
    assert.match(url, /\/api\/tickets\/details\.json\?/);
    assert.match(url, /start_date=2026-07-19/);
    assert.match(url, /end_date=2026-07-19/);
    assert.match(url, /lat1=41\.1125/);
    assert.match(url, /lat2=41\.0975/);
    assert.match(url, /lng1=-104\.8075/);
    assert.match(url, /lng2=-104\.7925/);
    assert.match(url, /categories=1%3A3130/);
  });
});

// ---------------------------------------------------------------------------
// Feed catalog
// ---------------------------------------------------------------------------

describe("FEED_CATALOG", () => {
  test("the law-enforcement feed is active and matches both county agencies", () => {
    const feed = FEED_CATALOG["47003"];
    assert.equal(feed.status, "active");
    assert.ok(feed.agencyPattern.test("Cheyenne Police Department - WY0110100"));
    assert.ok(feed.agencyPattern.test("Laramie County Sheriff's Department - WY0110000"));
  });

  test("legacy feeds are documented as removed, not silently dropped", () => {
    for (const id of ["31486", "37907", "44794"]) {
      assert.match(FEED_CATALOG[id].status, /Invalid feed|removed/);
    }
  });
});

// ---------------------------------------------------------------------------
// Bundled seed artifact
// ---------------------------------------------------------------------------

describe("bundled seed artifact", () => {
  test("exists and declares its schema, sources and window", () => {
    assert.equal(artifact.schema, 1);
    assert.equal(artifact.generatedBy, "sync");
    assert.equal(artifact.source.socrata.apiBase, "https://laramiecounty-letmsp.connect.socrata.com");
    assert.equal(artifact.source.socrata.layers.length, 2);
    assert.equal(artifact.source.socrata.timezone, "America/Denver");
    assert.equal(artifact.source.broadcastify.feeds[0].id, "47003");
    assert.equal(artifact.coverage.requestedStart, SEED.start);
    assert.equal(artifact.coverage.requestedEnd, SEED.end);
    assert.equal(artifact.coverage.days, 3);
    assert.deepEqual(artifact.coverage.feeds, ["47003"]);
    assert.equal(artifact.coverage.socrataLogCount, artifact.links.length);
  });

  test("every log in the window is linked to the archive block containing it", () => {
    assert.equal(artifact.links.length, 45, "the Prosser/S Greeley 3-day window holds 45 CAD logs");
    assert.equal(artifact.summary.total, 45);
    assert.equal(artifact.summary.unlinked, 0, "all three days have full archive coverage");
    assert.equal(artifact.summary.linked, 45);
    for (const link of artifact.links) {
      assert.equal(link.linkStatus, "linked", `log ${link.id} must be linked`);
      assert.ok(link.archive.startTs <= link.atUnix && link.atUnix < link.archive.endTs,
        `log ${link.id} must fall inside block ${link.archive.id}`);
      assert.ok(link.archive.offsetSeconds >= 0);
      assert.match(link.archive.url, /^https:\/\/www\.broadcastify\.com\/archives\/download\//);
    }
  });

  test("the July 19 welfare check points at the exact block found by hand", () => {
    const link = artifact.links.find((l) => l.id === "2026-00023988");
    assert.ok(link, "welfare check #2026-00023988 must be in the artifact");
    assert.equal(link.at, "2026-07-19T16:40:08.000");
    assert.equal(link.type, "Welfare Check - Routine");
    assert.equal(link.agency, "Laramie County Sheriff's Department - WY0110000");
    assert.equal(link.archive.id, "47003-1784499221");
    assert.equal(link.archive.start, "04:13 PM");
    assert.equal(link.archive.end, "04:43 PM");
    assert.equal(link.archive.offsetSeconds, 1587);
    assert.equal(link.archive.url, "https://www.broadcastify.com/archives/download/47003-1784499221");
  });

  test("the July 18 welfare check points at its exact block", () => {
    const link = artifact.links.find((l) => l.id === "2026-00023874");
    assert.ok(link, "welfare check #2026-00023874 must be in the artifact");
    assert.equal(link.at, "2026-07-18T15:22:35.000");
    assert.equal(link.archive.id, "47003-1784409721");
    assert.equal(link.archive.offsetSeconds, 34);
  });

  test("summary accounts for every archive block loaded for the window", () => {
    assert.equal(artifact.summary.archiveBlocks.total, artifact.coverage.archiveBlockCount);
    assert.ok(artifact.summary.archiveBlocks.withLogs > 0);
    assert.equal(
      artifact.summary.archiveBlocks.withLogs + artifact.summary.archiveBlocks.empty,
      artifact.summary.archiveBlocks.total,
    );
    assert.equal(artifact.summary.welfareChecks.length, 2);
  });

  test("historySummary reconciles with the citizen-connect publisher totals", () => {
    const hs = artifact.historySummary;
    assert.equal(hs.scannerAudioAvailability.from, "2026-04-13");
    const years = hs.perYear.map((r) => r.year);
    assert.deepEqual(years, ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
    const sum = hs.perYear.reduce((s, r) => s + r.socrataLogs, 0);
    assert.equal(sum, ccArtifact.totals.all, "per-year logs must sum to the publisher's all-time total");
    for (const row of hs.perYear) {
      if (row.year === "2026") {
        assert.ok(row.linkableLogs > 0 && row.linkableLogs < row.socrataLogs);
      } else {
        assert.equal(row.linkableLogs, 0, `no public scanner audio before 2026-04-13 (${row.year})`);
      }
    }
    // Independent recomputation of the 2026 linkable share from the trend.
    const ccStart = ccArtifact.coverage.requestedStart;
    const ccEnd = ccArtifact.coverage.requestedEnd;
    const expected = ccArtifact.trend.daily
      .filter((r) => r.date >= "2026-04-13" && r.date <= ccEnd)
      .reduce((s, r) => s + r.total, 0);
    assert.equal(hs.perYear.find((r) => r.year === "2026").linkableLogs, expected);
    assert.ok(ccStart === "2020-01-01", "sanity: the trend reaches the publisher's 2020 start");
  });
});

// ---------------------------------------------------------------------------
// Ingest fail-closed behaviour
// ---------------------------------------------------------------------------

describe("ingest fail-closed behaviour", () => {
  const tmpOut = path.join(os.tmpdir(), `sal-artifact-${process.pid}.json`);
  const tmpOut2 = path.join(os.tmpdir(), `sal-artifact-rebuild-${process.pid}.json`);

  test("dry run needs no network and exits 0", () => {
    const res = spawnSync(process.execPath, [
      SYNC, "--dry-run", "--start", SEED.start, "--end", SEED.end, "--bbox", SEED.bbox,
    ], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /window 2026-07-18 → 2026-07-20/);
    assert.match(res.stdout, /feeds 47003/);
    assert.match(res.stdout, /"offline": false/);
  });

  test("an unreachable publisher exits non-zero and leaves the artifact byte-identical", () => {
    copyFileSync(ARTIFACT, tmpOut);
    const before = readFileSync(tmpOut, "utf8");
    const emptyCache = mkdtempSync(path.join(os.tmpdir(), "sal-empty-"));
    const res = spawnSync(process.execPath, [
      SYNC, "--out", tmpOut, "--start", SEED.start, "--end", SEED.start, "--bbox", SEED.bbox,
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        CITIZEN_CONNECT_API_BASE: "https://127.0.0.1:9/",
        SCANNER_ARCHIVE_MAX_RETRIES: "0",
        SCANNER_ARCHIVE_CACHE_DIR: emptyCache,
      },
    });
    assert.notEqual(res.status, 0, "an unreachable publisher must fail the run");
    assert.match(res.stderr, /scanner-archive-links sync failed/);
    assert.equal(readFileSync(tmpOut, "utf8"), before, "a failed sync must not touch the artifact");
    rmSync(emptyCache, { recursive: true, force: true });
  });

  test("offline mode without a cached window exits non-zero and touches nothing", () => {
    copyFileSync(ARTIFACT, tmpOut);
    const before = readFileSync(tmpOut, "utf8");
    const emptyCache = mkdtempSync(path.join(os.tmpdir(), "sal-empty-"));
    const res = spawnSync(process.execPath, [
      SYNC, "--offline", "--out", tmpOut, "--start", "2026-07-10", "--end", "2026-07-11", "--bbox", SEED.bbox,
    ], { encoding: "utf8", env: { ...process.env, SCANNER_ARCHIVE_CACHE_DIR: emptyCache } });
    assert.notEqual(res.status, 0, "a missing cache entry must fail the run");
    assert.match(res.stderr, /offline mode: no cached/);
    assert.equal(readFileSync(tmpOut, "utf8"), before, "a failed sync must not touch the artifact");
    rmSync(emptyCache, { recursive: true, force: true });
  });

  test("offline mode rebuilds an artifact from a seeded cache alone", () => {
    // Hermetic: CI checkouts have no .cache/scanner-archive-links (gitignored),
    // so this test seeds its own cache via SCANNER_ARCHIVE_CACHE_DIR.
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "sal-cache-"));
    const day = "2026-07-19";
    mkdirSync(path.join(cacheDir, "socrata"), { recursive: true });
    mkdirSync(path.join(cacheDir, "broadcastify", "47003"), { recursive: true });
    writeFileSync(
      path.join(cacheDir, "socrata", `${day}.json`),
      JSON.stringify({
        source: "details.json",
        day,
        count: 2,
        incomplete: false,
        fetchedAt: "2026-10-09T12:00:00.000Z",
        records: [
          { ticket_id: "2026-00023988", ticket_created_at: "2026-07-19T16:40:08.000", category: "Laramie County Sheriff's Department - WY0110000", sub_category: "Welfare Check - Routine", super_category: "Incidents", dataset_id: "35sf-bu8v", ticket_dataset_entry_id: "pds_5", location: { type: "Point", coordinates: [-104.8, 41.105] } },
          { ticket_id: "-559020", ticket_created_at: "2026-07-19T17:10:00.000", category: "Laramie County Sheriff's Department - WY0110000", sub_category: "Accident - Hit and Run", super_category: "Cases", dataset_id: "cvz7-2j69", ticket_dataset_entry_id: "pds_4", location: { type: "Point", coordinates: [-104.8, 41.105] } },
        ],
      }),
    );
    for (const d of ["2026-07-18", day, "2026-07-20"]) {
      writeFileSync(
        path.join(cacheDir, "broadcastify", "47003", `${d}.json`),
        JSON.stringify({ archives: [REAL_BLOCK_A, REAL_BLOCK_B], timezone: "America/Denver", tzDisplay: "MDT", trimAudio: false, fetchedAt: "2026-10-09T12:00:00.000Z" }),
      );
    }
    const res = spawnSync(process.execPath, [
      SYNC, "--offline", "--out", tmpOut2, "--start", day, "--end", day, "--bbox", SEED.bbox,
    ], { encoding: "utf8", env: { ...process.env, SCANNER_ARCHIVE_CACHE_DIR: cacheDir } });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /2 logs → 2 linked/);
    const rebuilt = JSON.parse(readFileSync(tmpOut2, "utf8"));
    assert.equal(rebuilt.schema, 1);
    assert.equal(rebuilt.links.length, 2);
    assert.equal(rebuilt.summary.unlinked, 0);
    const wf = rebuilt.links.find((l) => l.id === "2026-00023988");
    assert.equal(wf.archive.id, "47003-1784499221");
    assert.equal(wf.archive.offsetSeconds, 1587);
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("importing the sync module for helpers does not start a sync", () => {
    const res = spawnSync(process.execPath, [
      "-e", `import(${JSON.stringify(`file://${SYNC}`)}).then(() => console.log("imported"))`,
    ], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /imported/);
    assert.doesNotMatch(res.stdout, /Scanner-archive linkage/);
  });
});
