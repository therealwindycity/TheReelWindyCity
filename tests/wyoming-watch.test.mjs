import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { COUNTIES, MUNICIPALITIES } from "../scripts/data/wyoming-ecosystem-catalog.mjs";
import { contentHash } from "../scripts/lib/canonical.mjs";
import {
  packetFolderUrl,
  parseSurface,
  watchTargets,
} from "../scripts/lib/wyoming-adapters.mjs";
import { nextState, runWatch } from "../scripts/monitor/wyoming-watch.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("the roster covers every government and does not invent a URL", () => {
  const targets = watchTargets(COUNTIES, MUNICIPALITIES);
  const governments = new Set(targets.map((target) => `${target.layer}:${target.governmentId}`));
  assert.equal(governments.size, 122);
  assert.equal(targets.filter((target) => target.layer === "county").length, 23);
  assert.equal(targets.filter((target) => target.mode === "delegate").map((target) => target.id).join(), "place-cheyenne");
  assert.equal(targets.filter((target) => target.mode === "parse").length, 8);
  assert.ok(targets.some((target) => target.id === "place-casper-older-portal"));
  for (const target of targets.filter((item) => item.mode === "record")) {
    assert.equal(target.url, null, target.id);
  }
  const gillette = targets.find((target) => target.id === "place-gillette");
  assert.equal(gillette.url, packetFolderUrl(MUNICIPALITIES.find((place) => place.id === "gillette").posting.url));
  assert.equal(targets.find((target) => target.id === "county-teton").mode, "host-check");
});

test("Agenda Center hashing ignores viewstate and rejects a Granicus table", () => {
  const page = (token) => `<html><input name="__VIEWSTATE" value="${token}"><h2>City Council</h2>
    <a href="/AgendaCenter/ViewFile/Agenda/_10072026-12">Agenda</a></html>`;
  const url = "https://cityoflaramie.org/AgendaCenter";
  const first = parseSurface("civicplus-agenda-center", page("aaa"), url);
  const second = parseSurface("civicplus-agenda-center", page("bbb"), url);
  assert.equal(contentHash(first), contentHash(second));
  assert.equal(first[0].date, "2026-10-07");
  assert.equal(first[0].body, "city-council");
  assert.throws(() => parseSurface("civicplus-agenda-center", `<table><tr><td>Name</td><td>Date</td><td>Agenda</td></tr></table>`, url), /view_id=5/);
});

test("a packet folder ignores a Granicus invoice and a single PDF", () => {
  const html = `<html><p>Payment to Granicus LLC</p><a href="11.04.2025-council-packet.pdf">packet</a></html>`;
  const records = parseSurface("pdf-packet-folder", html, "https://www.gillettewy.gov/files/full-agenda/");
  assert.equal(records.length, 1);
  assert.equal(records[0].date, "2025-11-04");
  assert.equal(records[0].kind, "packet");
  assert.throws(() => parseSurface("pdf-packet-folder", "%PDF-1.7 fake", "https://www.gillettewy.gov/files/full-agenda/"), /single PDF/);
});

test("the runner does not fetch uncalibrated governments or Cheyenne", async () => {
  const targets = watchTargets(COUNTIES, MUNICIPALITIES);
  const fetched = [];
  const dir = mkdtempSync(path.join(tmpdir(), "wy-watch-"));
  for (const target of targets.filter((item) => item.mode === "parse" || item.mode === "host-check")) {
    if (target.mode === "host-check") {
      writeFileSync(path.join(dir, `${target.id}.json`), JSON.stringify({ status: 200, finalUrl: target.url }));
    } else if (target.architectureId === "pdf-packet-folder") {
      writeFileSync(path.join(dir, `${target.id}.html`), `<a href="11.04.2025-council-packet.pdf">packet</a>`);
    } else if (target.architectureId === "civicplus-agenda-center") {
      writeFileSync(path.join(dir, `${target.id}.html`), `<h2>City Council</h2><a href="/AgendaCenter/ViewFile/Agenda/_10072026-1">Agenda</a>`);
    } else {
      writeFileSync(path.join(dir, `${target.id}.html`), `<a href="/agendas/2026-10-07-council.pdf">City Council agenda</a>`);
    }
  }
  const report = await runWatch({
    targets,
    state: { version: 1, targets: {} },
    fixtureDir: dir,
    fetchImpl: async (url) => {
      fetched.push(url);
      throw new Error("network");
    },
  });
  assert.equal(fetched.length, 0);
  assert.equal(report.governments, 122);
  assert.equal(report.delegated, 1);
  assert.equal(report.recorded, targets.filter((target) => target.mode === "record").length);
  assert.equal(report.structural, 0);
  assert.equal(report.results.find((item) => item.id === "place-cheyenne").reason, "owned-by-municipal-watch");
  assert.equal(report.results.find((item) => item.id === "place-lost-springs").fetched, false);
  const again = await runWatch({ targets, state: nextState({ version: 1, targets: {} }, report), fixtureDir: dir, fetchImpl: async () => { throw new Error("network"); } });
  assert.equal(again.changed, false);
});

test("host drift is structural and does not parse the foreign page", async () => {
  const target = watchTargets(COUNTIES, MUNICIPALITIES).find((item) => item.id === "county-teton");
  const report = await runWatch({
    targets: [target],
    state: { version: 1, targets: {} },
    fetchImpl: async () => ({
      status: 302,
      headers: { get: (name) => (name === "location" ? "https://example.invalid/other" : "") },
      text: async () => "should not be parsed",
    }),
  });
  assert.equal(report.structural, 1);
  assert.equal(report.results[0].reason, "ENO_HOST");
  assert.equal(report.changed, false);
});

test("the scheduled workflow does not call the Cheyenne sync", async () => {
  const { parse: parseYaml } = await import("yaml");
  const workflow = parseYaml(readFileSync(path.join(root, ".github/workflows/live_wyoming_watch.yml"), "utf8"));
  assert.equal(workflow.concurrency.group, "wyoming-ecosystem-watch");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(workflow.on.schedule[0].cron);
  const steps = workflow.jobs.watch.steps;
  const watch = steps.find((step) => step.name === "Watch every Wyoming government");
  assert.match(watch.run, /wyoming-watch\.mjs --check/);
  assert.doesNotMatch(JSON.stringify(workflow), /live_city_sync/);
  for (const step of steps) {
    if (step.run) assert.doesNotMatch(step.run, /\$\{\{/);
  }
  const built = spawnSync(process.execPath, ["scripts/monitor/wyoming-watch.mjs", "--seed", "--state", path.join(root, "data/wyoming-sync-state.json")], { cwd: root, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});
