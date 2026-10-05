/**
 * Citizen Connect incident-record test suite.
 *
 * Locks down the two things that would quietly produce a *wrong* public number:
 *
 *   1. Aggregation correctness — bucketing, per-occurrence normalisation, and
 *      point-in-polygon shape assignment. Every headline figure on the signals
 *      desk derives from these helpers.
 *   2. Fail-closed ingest — an unreachable publisher, or a response with no
 *      totals, must leave the committed artifact untouched and exit non-zero.
 *      A blank or zeroed public page is worse than a stale one.
 *
 * Plus the artifact's own internal consistency: the rhythm grid must sum to the
 * published totals, or the two halves of the panel disagree in public.
 *
 * Run: npm run test:citizen-connect
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  buildTrend,
  rhythmFromCells,
  flattenCategories,
  tallyRecords,
  assignShapes,
  pointInGeometry,
  dayRange,
} from "../../scripts/sync/citizen-connect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT = path.join(ROOT, "src", "data", "citizen-connect.json");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "citizen_connect_sync.yml");

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));

// ---------------------------------------------------------------------------

describe("bundled artifact", () => {
  test("exists and declares its schema, source and window", () => {
    assert.equal(artifact.schema, 2);
    assert.ok(artifact.source?.appUrl?.startsWith("https://"), "source.appUrl must be absolute");
    assert.match(artifact.source.publisher, /Cheyenne Police Department/);
    assert.match(artifact.coverage.requestedStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(artifact.coverage.requestedEnd, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(artifact.coverage.days > 0);
  });

  test("day count matches the requested window (inclusive)", () => {
    assert.equal(dayRange(artifact.coverage.requestedStart, artifact.coverage.requestedEnd).length, artifact.coverage.days);
  });

  test("rhythm grid is complete: 7 weekdays x 24 hours, no negative or missing cells", () => {
    assert.equal(artifact.rhythm.dowOrder.length, 7);
    for (const dow of artifact.rhythm.dowOrder) {
      const row = artifact.rhythm.cells[dow];
      assert.ok(Array.isArray(row), `missing row for ${dow}`);
      assert.equal(row.length, 24, `${dow} must have 24 hourly cells`);
      for (const [total, incidents, cases] of row) {
        assert.ok(Number.isFinite(total) && total >= 0);
        assert.ok(Number.isFinite(incidents) && incidents >= 0);
        assert.ok(Number.isFinite(cases) && cases >= 0);
        // The two layers must reconcile to the cell total, or the panel's
        // "incidents vs cases" split silently disagrees with its own headline.
        assert.equal(incidents + cases, total, `${dow} cell layers do not sum to total`);
      }
    }
  });

  test("rhythm grid sums exactly to the published totals", () => {
    let all = 0, incidents = 0, cases = 0;
    for (const dow of artifact.rhythm.dowOrder) {
      for (const [t, i, c] of artifact.rhythm.cells[dow]) { all += t; incidents += i; cases += c; }
    }
    assert.equal(all, artifact.totals.all);
    assert.equal(incidents, artifact.totals.incidents);
    assert.equal(cases, artifact.totals.cases);
    assert.equal(incidents + cases, all);
  });

  test("weekday occurrence counts sum to the window length", () => {
    const occ = artifact.coverage.weekdayOccurrences;
    assert.ok(occ, "weekdayOccurrences is required for fair per-occurrence comparison");
    assert.equal(Object.values(occ).reduce((s, n) => s + n, 0), artifact.coverage.days);
    // A 2469-day window cannot contain more than a one-occurrence spread.
    const vals = Object.values(occ);
    assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, "weekday occurrences differ by more than one");
  });

  test("completeness flags agree with what is actually present", () => {
    const c = artifact.completeness;
    assert.equal(Boolean(c.rhythm), artifact.rhythm.dowOrder.length === 7);
    assert.equal(Boolean(c.totals), artifact.totals.all > 0);
    assert.equal(Boolean(c.trend), (artifact.trend?.yearly ?? []).length > 0);
    assert.equal(Boolean(c.categoryCounts), (artifact.categories?.counts ?? []).length > 0);
    assert.equal(Boolean(c.sample), (artifact.sample ?? []).length > 0);
  });

  test("every view the artifact claims to have is renderable", () => {
    // Guards against the UI announcing a series and then drawing an empty chart.
    if (artifact.completeness.trend) {
      assert.ok(artifact.trend.yearly.every((y) => y.total > 0 && y.days > 0));
    }
    if (artifact.completeness.geographyCounts) {
      assert.ok(artifact.geography.groups.some((g) => g.shapes.some((s) => typeof s.count === "number")));
    }
  });

  test("sample records carry a location inside the county bounding box", () => {
    for (const r of artifact.sample ?? []) {
      assert.ok(r.lat > 40.8 && r.lat < 41.7, `${r.id} latitude out of range`);
      assert.ok(r.lng > -105.5 && r.lng < -103.9, `${r.id} longitude out of range`);
      assert.ok(r.type && r.agency && r.at);
    }
  });

  test("publisher-privating detail never leaks into the artifact", () => {
    // The agencies state names and street addresses are withheld. Nothing in
    // this file should reintroduce them.
    const text = JSON.stringify(artifact);
    assert.ok(!/"address"\s*:/.test(text), "artifact must not carry a street address field");
    assert.ok(!/street|block \d|intersection/i.test(text), "artifact must not carry street-level detail");
  });
});

// ---------------------------------------------------------------------------

describe("buildTrend — daily rows to month and year buckets", () => {
  const rows = [
    { date: "2024-01-01", layer: "Incidents", datasetId: "a", count: 10 },
    { date: "2024-01-01", layer: "Cases", datasetId: "b", count: 2 },
    { date: "2024-01-02", layer: "Incidents", datasetId: "a", count: 20 },
    { date: "2024-02-01", layer: "Incidents", datasetId: "a", count: 5 },
    { date: "2025-06-15", layer: "Cases", datasetId: "b", count: 7 },
  ];
  const trend = buildTrend(rows, "2024-01-01", "2025-06-15");

  test("fills zero-count dates and merges layers onto sorted daily rows", () => {
    assert.equal(trend.daily[0].date, "2024-01-01");
    assert.equal(trend.daily.at(-1).date, "2025-06-15");
    assert.equal(trend.daily.length, dayRange("2024-01-01", "2025-06-15").length);
    assert.deepEqual(trend.daily[0], { date: "2024-01-01", total: 12, incidents: 10, cases: 2 });
    assert.deepEqual(trend.daily[1], { date: "2024-01-02", total: 20, incidents: 20, cases: 0 });
    assert.deepEqual(trend.daily[2], { date: "2024-01-03", total: 0, incidents: 0, cases: 0 });
  });

  test("monthly and yearly rates divide by elapsed calendar days, not active days", () => {
    const jan = trend.monthly.find((m) => m.label === "2024-01");
    assert.equal(jan.total, 32);
    assert.equal(jan.days, 31);
    assert.equal(jan.perDay, 1);
    const y2024 = trend.yearly.find((y) => y.label === "2024");
    assert.equal(y2024.total, 37);
    assert.equal(y2024.days, 366);
    assert.equal(y2024.perDay, 0.1);
  });

  test("a partial year reports its actual elapsed calendar coverage", () => {
    const y2025 = trend.yearly.find((y) => y.label === "2025");
    assert.equal(y2025.days, 166);
    assert.equal(y2025.total, 7);
    assert.equal(y2025.perDay, 0);
  });

  test("no rows produces empty series rather than a crash", () => {
    const empty = buildTrend([]);
    assert.deepEqual(empty.daily, []);
    assert.deepEqual(empty.yearly, []);
  });
});

// ---------------------------------------------------------------------------

describe("rhythmFromCells — per-occurrence normalisation", () => {
  const cells = {
    Su: Array.from({ length: 24 }, () => [10, 9, 1]),
    Mo: Array.from({ length: 24 }, () => [20, 18, 2]),
    Tu: Array.from({ length: 24 }, () => [0, 0, 0]),
    We: Array.from({ length: 24 }, () => [0, 0, 0]),
    Th: Array.from({ length: 24 }, () => [0, 0, 0]),
    Fr: Array.from({ length: 24 }, () => [0, 0, 0]),
    Sa: Array.from({ length: 24 }, () => [0, 0, 0]),
  };
  const dowOrder = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  test("totals reconcile across hours, weekdays and layers", () => {
    const r = rhythmFromCells({ dowOrder, cells }, { Su: 5, Mo: 5, Tu: 5, We: 5, Th: 5, Fr: 5, Sa: 5 });
    assert.equal(r.totals.all, 24 * 10 + 24 * 20);
    assert.equal(r.totals.incidents, 24 * 9 + 24 * 18);
    assert.equal(r.totals.cases, 24 * 1 + 24 * 2);
    assert.equal(r.totals.incidents + r.totals.cases, r.totals.all);
    assert.equal(r.hour[0].total, 30);
  });

  test("per-occurrence divides by how many times that weekday fell in the window", () => {
    const r = rhythmFromCells({ dowOrder, cells }, { Su: 50, Mo: 10, Tu: 1, We: 1, Th: 1, Fr: 1, Sa: 1 });
    // Same raw total for Sunday, but 50 occurrences vs Monday's 10.
    assert.equal(r.dowTotals.Su.perOccurrence, (24 * 10) / 50);
    assert.equal(r.dowTotals.Mo.perOccurrence, (24 * 20) / 10);
    assert.ok(r.dowTotals.Mo.perOccurrence > r.dowTotals.Su.perOccurrence * 9);
  });

  test("a missing occurrence count degrades to the raw total, not to zero", () => {
    const r = rhythmFromCells({ dowOrder, cells }, undefined);
    assert.equal(r.dowTotals.Su.occurrences, null);
    assert.equal(r.dowTotals.Su.perOccurrence, null);
    assert.equal(r.dowTotals.Su.total, 240);
  });
});

// ---------------------------------------------------------------------------

describe("pointInGeometry — shape assignment without extra API calls", () => {
  const square = { type: "Polygon", coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] };
  const withHole = {
    type: "Polygon",
    coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]],
  };
  const multi = {
    type: "MultiPolygon",
    coordinates: [[[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]], [[[20, 20], [20, 21], [21, 21], [21, 20], [20, 20]]]],
  };

  test("classifies interior, exterior and edge-adjacent points", () => {
    assert.equal(pointInGeometry(5, 5, square), true);
    assert.equal(pointInGeometry(15, 5, square), false);
    assert.equal(pointInGeometry(-1, -1, square), false);
    assert.equal(pointInGeometry(0.001, 0.001, square), true);
  });

  test("a hole excludes the point it encloses", () => {
    assert.equal(pointInGeometry(5, 5, withHole), false, "centre of the hole must not be inside");
    assert.equal(pointInGeometry(2, 2, withHole), true, "outside the hole but inside the ring");
  });

  test("multipolygons match any member", () => {
    assert.equal(pointInGeometry(0.5, 0.5, multi), true);
    assert.equal(pointInGeometry(20.5, 20.5, multi), true);
    assert.equal(pointInGeometry(10, 10, multi), false);
  });

  test("degenerate geometry never throws", () => {
    assert.equal(pointInGeometry(1, 1, null), false);
    assert.equal(pointInGeometry(1, 1, { type: "Polygon", coordinates: [] }), false);
    assert.equal(pointInGeometry(1, 1, { type: "LineString", coordinates: [[0, 0], [1, 1]] }), false);
  });

  test("assignShapes counts every record once and reports the unmatched", () => {
    const geometries = [
      { shapeId: "1", name: "North", geometry: { type: "Polygon", coordinates: [[[0, 40], [0, 50], [10, 50], [10, 40], [0, 40]]] } },
      { shapeId: "2", name: "South", geometry: { type: "Polygon", coordinates: [[[0, 30], [0, 40], [10, 40], [10, 30], [0, 30]]] } },
    ];
    const records = [
      { location: { coordinates: [5, 45] } },
      { location: { coordinates: [5, 45] } },
      { location: { coordinates: [5, 35] } },
      { location: { coordinates: [99, 99] } },
      { location: null },
      {},
    ];
    const out = assignShapes(records, geometries);
    assert.equal(out.shapes.find((s) => s.shapeId === "1").count, 2);
    assert.equal(out.shapes.find((s) => s.shapeId === "2").count, 1);
    assert.equal(out.unassigned, 3);
  });

  test("duplicate publisher shape ids remain separate by visible shape name", () => {
    const geometries = [
      { shapeId: "2", name: "2-1", geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] } },
      { shapeId: "2", name: "2-2", geometry: { type: "Polygon", coordinates: [[[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]]] } },
    ];
    const out = assignShapes([
      { location: { coordinates: [5, 5] } },
      { location: { coordinates: [25, 25] } },
    ], geometries);
    assert.equal(out.shapes.length, 2);
    assert.equal(out.shapes.find((s) => s.name === "2-1").count, 1);
    assert.equal(out.shapes.find((s) => s.name === "2-2").count, 1);
  });

  test("assignShapes with no boundaries yields nothing rather than fake zeros", () => {
    assert.deepEqual(assignShapes([{ location: { coordinates: [1, 1] } }], []), []);
    assert.deepEqual(assignShapes([{ location: { coordinates: [1, 1] } }], null), []);
  });
});

// ---------------------------------------------------------------------------

describe("tallyRecords — record-level rollup", () => {
  const records = [
    { super_category: "Incidents", category: "Cheyenne Police Department - WY0110100", sub_category: "Security Check" },
    { super_category: "Incidents", category: "Cheyenne Police Department - WY0110100", sub_category: "Security Check" },
    { super_category: "Incidents", category: "Cheyenne Police Department - WY0110100", sub_category: "Disturbance" },
    { super_category: "Cases", category: "Laramie County Sheriff's Department - WY0110000", sub_category: "Burglary - Residence" },
    { super_category: "Cases" },
  ];
  const t = tallyRecords(records);

  test("counts, ranks and shares every dimension", () => {
    assert.equal(t.categories[0].type, "Security Check");
    assert.equal(t.categories[0].count, 2);
    assert.equal(t.categories[0].share, 40);
    assert.equal(t.agencies[0].name, "Cheyenne Police Department - WY0110100");
    assert.equal(t.agencies[0].count, 3);
    assert.deepEqual(t.layers, [{ name: "Incidents", count: 3 }, { name: "Cases", count: 2 }]);
  });

  test("missing fields fall back to an explicit label, never to a dropped record", () => {
    const unlabelled = t.categories.find((c) => c.type === "Uncategorised");
    assert.ok(unlabelled, "a record with no sub_category must still be counted");
    assert.equal(unlabelled.agency, "Unknown agency");
    const total = t.categories.reduce((s, c) => s + c.count, 0);
    assert.equal(total, records.length, "no record may be lost in the rollup");
  });

  test("the same call type at two agencies stays two rows", () => {
    const split = tallyRecords([
      { super_category: "Incidents", category: "A", sub_category: "Alarm" },
      { super_category: "Incidents", category: "B", sub_category: "Alarm" },
    ]);
    assert.equal(split.categories.length, 2);
  });
});

// ---------------------------------------------------------------------------

describe("flattenCategories — the publisher's 3-tier tree", () => {
  test("walks nested categories and keeps parentage", () => {
    const tree = {
      categories: [
        {
          id: "1", name: "Incidents", show: true,
          sub_categories: [
            { id: "2", name: "Alarm", display_name: "Alarms", show: true },
            { id: "3", name: "Hidden", show: false },
          ],
        },
      ],
    };
    const flat = flattenCategories(tree);
    assert.equal(flat.length, 3);
    assert.deepEqual(flat[1], { id: "2", name: "Alarms", parent: "Incidents", hidden: false });
    assert.equal(flat[2].hidden, true, "publisher-hidden categories must stay flagged, not dropped");
  });

  test("display_name wins over name, and absent trees yield []", () => {
    assert.deepEqual(flattenCategories(null), []);
    assert.deepEqual(flattenCategories({}), []);
    assert.deepEqual(flattenCategories([]), []);
  });
});

// ---------------------------------------------------------------------------

describe("ingest fail-closed behaviour", () => {
  const tmpOut = path.join(os.tmpdir(), `cc-artifact-${process.pid}.json`);

  test("dry run with an explicit window needs no network and exits 0", () => {
    const res = spawnSync(process.execPath, [
      path.join(ROOT, "scripts/sync/citizen-connect.mjs"),
      "--dry-run", "--start", "2020-01-01", "--end", "2026-01-01",
    ], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /"mode": "aggregates"/);
    assert.match(res.stdout, /"days": 2193/);
  });

  test("dry run without dates uses the offline 2020-to-yesterday default", () => {
    const res = spawnSync(process.execPath, [path.join(ROOT, "scripts/sync/citizen-connect.mjs"), "--dry-run"], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /offline plan/);
    assert.match(res.stdout, /"start": "2020-01-01"/);
    assert.match(res.stdout, /"end": "\d{4}-\d{2}-\d{2}"/);
  });

  test("an unreachable publisher exits non-zero and leaves the artifact byte-identical", () => {
    copyFileSync(ARTIFACT, tmpOut);
    const before = readFileSync(tmpOut, "utf8");
    const res = spawnSync(process.execPath, [
      path.join(ROOT, "scripts/sync/citizen-connect.mjs"),
      "--out", tmpOut, "--start", "2024-01-01", "--end", "2024-01-02",
    ], {
      encoding: "utf8",
      env: { ...process.env, CITIZEN_CONNECT_API_BASE: "https://127.0.0.1:9/", CITIZEN_CONNECT_MAX_RETRIES: "0" },
    });
    assert.notEqual(res.status, 0, "an unreachable publisher must fail the run");
    assert.match(res.stderr, /citizen-connect sync failed/);
    assert.equal(readFileSync(tmpOut, "utf8"), before, "a failed sync must not touch the committed artifact");
  });

  test("importing the module for helpers does not start a sync", () => {
    const res = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import { buildTrend } from ${JSON.stringify(path.join(ROOT, "scripts/sync/citizen-connect.mjs"))}; process.stdout.write(typeof buildTrend);`,
    ], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, "function");
  });
});

// ---------------------------------------------------------------------------

describe("scheduled workflow", () => {
  const yaml = parseYaml(readFileSync(WORKFLOW, "utf8"));
  const steps = yaml.jobs.sync.steps;
  const run = steps.filter((s) => s.run).map((s) => s.run).join("\n");

  test("shares the municipal write lane so two runners never push concurrently", () => {
    assert.equal(yaml.concurrency.group, "municipal-data-sync");
    assert.equal(yaml.concurrency["cancel-in-progress"], false);
  });

  test("scopes write access to the sync job and Pages permissions to deployment jobs", () => {
    assert.deepEqual(yaml.permissions, { contents: "read" });
    assert.deepEqual(yaml.jobs.sync.permissions, { contents: "write" });
    assert.equal(yaml.jobs.build.permissions.pages, "write");
    assert.equal(yaml.jobs.build.permissions["id-token"], "write");
    assert.deepEqual(yaml.jobs.deploy.permissions, { pages: "write", "id-token": "write" });
  });

  test("commits only on a real diff, and rebases before pushing", () => {
    assert.match(run, /git diff --cached --quiet/);
    assert.match(run, /git pull --rebase origin/);
    assert.match(run, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
  });

  test("never pushes to a hardcoded branch — it follows the ref it ran on", () => {
    assert.ok(!/git push origin main\b/.test(run), "must not hardcode main");
  });

  test("dispatch inputs reach the script through env, not the command line", () => {
    // Expression-injection hardening: nothing from github.event lands inside run:.
    for (const step of steps) {
      if (!step.run) continue;
      assert.ok(!/\$\{\{\s*github\.event/.test(step.run), `step "${step.name}" interpolates an event payload into a shell`);
      assert.ok(!/\$\{\{\s*inputs\./.test(step.run), `step "${step.name}" interpolates an input into a shell`);
    }
    assert.equal(yaml.jobs.sync.env.CC_MODE, "${{ github.event.inputs.mode || 'records' }}");
    assert.equal(yaml.jobs.sync.env.CC_RECORDS_START, "${{ github.event.inputs.records_start || '2023-01-01' }}");
  });

  test("rebuilds public/data so the bundled copy cannot drift from src/data", () => {
    assert.match(run, /node scripts\/build-data\.mjs/);
  });

  test("deploys the refreshed default-branch artifact despite GITHUB_TOKEN's push recursion guard", () => {
    assert.match(run, /git add src\/data\/citizen-connect\.json/);
    assert.ok(!/git add[^\n]*public\/data\/citizen-connect\.json/.test(run), "generated ignored copy must not be staged");
    assert.match(yaml.jobs.build.if, /outputs\.changed == 'true'/);
    assert.match(yaml.jobs.build.if, /default_branch/);
    assert.match(yaml.jobs.build.steps.map((s) => s.uses ?? "").join(" "), /actions\/upload-pages-artifact/);
    assert.match(yaml.jobs.deploy.steps.map((s) => s.uses ?? "").join(" "), /actions\/deploy-pages/);
  });

  test("caches the record-level checkpoint only for the heavy modes", () => {
    const cache = steps.find((s) => String(s.uses).startsWith("actions/cache"));
    assert.ok(cache, "record mode must be resumable across runs");
    assert.equal(cache.if, "env.CC_MODE == 'records' || env.CC_MODE == 'all'");
    assert.equal(cache.with.path, ".cache/citizen-connect");
  });

  test("the record cache directory is gitignored", () => {
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.match(ignore, /\.cache\//);
    const publicCopy = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.match(publicCopy, /public\/data\/citizen-connect\.json/);
  });
});

// ---------------------------------------------------------------------------

describe("site wiring", () => {
  test("the lens renders inside the signals desk, alongside the scanner feeds", () => {
    const pulse = readFileSync(path.join(ROOT, "src/components/pulse-broadcast.tsx"), "utf8");
    assert.match(pulse, /import IncidentRecordLens from "\.\/incident-record-lens"/);
    assert.match(pulse, /<IncidentRecordLens \/>/);
    // It must sit between the scanner console and the live feed, not float elsewhere.
    const scannerAt = pulse.indexOf("pulse-scanner-section");
    const lensAt = pulse.indexOf("<IncidentRecordLens />");
    const feedAt = pulse.indexOf('className="pulse-feed-section"');
    assert.ok(scannerAt > 0 && lensAt > scannerAt && feedAt > lensAt, "lens must render between the scanner console and the live feed");
  });

  test("the lens always links back to the publisher's own dashboard", () => {
    const lens = readFileSync(path.join(ROOT, "src/components/incident-record-lens.tsx"), "utf8");
    assert.match(lens, /source\.dashboardUrl \?\? a\.source\.appUrl/);
    assert.match(lens, /rel="noopener noreferrer"/);
    assert.match(lens, /call 911/i);
  });

  test("the built signals page carries the record and the interpretation tabs", () => {
    const built = path.join(ROOT, "out/hub/signals/index.html");
    if (!existsSync(built)) return; // build not run in this environment
    const html = readFileSync(built, "utf8");
    assert.match(html, /irl-section/);
    assert.match(html, /The incident record, interpreted/);
    assert.ok(html.includes(artifact.totals.all.toLocaleString("en-US")), "headline total missing from the built page");
  });

  test("package.json exposes the ingest as named scripts", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.scripts["data:citizen-connect"], "node scripts/sync/citizen-connect.mjs");
    assert.equal(pkg.scripts["data:citizen-connect:full"], "node scripts/sync/citizen-connect.mjs --mode all --records-start 2023-01-01");
    assert.ok(pkg.scripts["test:citizen-connect"]);
  });
});
