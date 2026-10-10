#!/usr/bin/env node
/**
 * Daily Wyoming watch.
 *
 * Covers every county and incorporated municipality in the catalog. It fetches
 * only a calibrated posting URL, or the pinned county-clerk host. Cheyenne's
 * view_id=5 stays on the hourly municipal watcher. A town with no opened agenda
 * page is recorded and not requested. Nothing here promotes a meeting into the
 * public snapshot or calls the Cheyenne PDF sync.
 *
 *   --seed                  write the roster baseline, no network
 *   --check                 compare each surface with the baseline
 *   --update-state          store hashes for surfaces that parsed
 *   --from-dir <dir>        offline fixtures named <target-id>.html or .json
 *   --state <path>          default data/wyoming-sync-state.json
 *   --out <path>            write the JSON report
 *   --delay <ms>            pause between network fetches (default 1500)
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { contentHash } from "../lib/canonical.mjs";
import { atomicWrite } from "../lib/atomic.mjs";
import { runIfMain } from "../lib/cli.mjs";
import { COUNTIES, MUNICIPALITIES } from "../data/wyoming-ecosystem-catalog.mjs";
import {
  STRUCTURAL_CODES,
  emptyState,
  fail,
  parseSurface,
  siteHost,
  watchTargets,
} from "../lib/wyoming-adapters.mjs";

const DEFAULT_STATE = path.join("data", "wyoming-sync-state.json");
const UA = "CivicCheyenne-Watcher/1.0 (statewide public-record check; +https://therealwindycity.github.io/TheReelWindyCity/)";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function loadState(statePath) {
  if (!existsSync(statePath)) return emptyState(watchTargets(COUNTIES, MUNICIPALITIES));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (!state || state.version !== 1 || !state.targets) throw new Error(`${statePath} is not a Wyoming watch baseline`);
  return state;
}

function judge(previousHash, nextHash) {
  if (!nextHash) return { changed: null, reason: "not-hashed" };
  if (!previousHash) return { changed: false, reason: "baseline-established" };
  if (previousHash !== nextHash) return { changed: true, reason: "content-changed" };
  return { changed: false, reason: "unchanged" };
}

async function fetchPinned(url, fetchImpl, hops = 0) {
  if (hops > 3) throw fail("ENO_HOST", `Too many redirects from ${url}`);
  const response = await fetchImpl(url, {
    redirect: "manual",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf" },
  });
  const status = response.status;
  if (status >= 300 && status < 400) {
    const location = response.headers.get("location");
    if (!location) throw fail("ENO_HOST", `Redirect from ${url} had no Location`);
    const next = new URL(location, url);
    if (siteHost(next.toString()) !== siteHost(url)) {
      const error = fail("ENO_HOST", `Pinned host ${siteHost(url)} redirected to ${siteHost(next.toString())}`);
      error.finalUrl = next.toString();
      throw error;
    }
    return fetchPinned(next.toString(), fetchImpl, hops + 1);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from ${url}`);
  }
  const body = typeof response.text === "function" ? await response.text() : "";
  return { status, finalUrl: url, body, contentType: response.headers.get("content-type") || "" };
}

async function readFixture(dir, target) {
  const htmlPath = path.join(dir, `${target.id}.html`);
  const jsonPath = path.join(dir, `${target.id}.json`);
  if (existsSync(htmlPath)) {
    return { status: 200, finalUrl: target.url, body: readFileSync(htmlPath, "utf8"), contentType: "text/html" };
  }
  if (existsSync(jsonPath)) return JSON.parse(readFileSync(jsonPath, "utf8"));
  throw new Error(`No fixture for ${target.id} in ${dir}`);
}

function idle(target) {
  return {
    id: target.id,
    governmentId: target.governmentId,
    layer: target.layer,
    name: target.name,
    architectureId: target.architectureId,
    mode: target.mode,
    url: target.url,
    fetched: false,
    changed: false,
    structural: false,
    reason: target.reason || (target.mode === "delegate" ? "owned-by-municipal-watch" : "no-calibrated-surface"),
    contentHash: null,
  };
}

function hostHash(url, status) {
  const klass = status >= 200 && status < 300 ? "2xx" : String(status);
  return contentHash([{ body: "clerk-host", date: "", time: "", agendaUrl: `${siteHost(url)}|${klass}` }]);
}

async function watchOne(target, previous, source) {
  const base = {
    id: target.id,
    governmentId: target.governmentId,
    layer: target.layer,
    name: target.name,
    architectureId: target.architectureId,
    mode: target.mode,
    url: target.url,
    fetched: true,
  };
  try {
    const fetched = await source(target);
    if (target.mode === "host-check") {
      if (fetched.hostDrift) throw fail("ENO_HOST", fetched.error || "host drift");
      const hash = hostHash(fetched.finalUrl || target.url, fetched.status);
      return { ...base, ...judge(previous?.contentHash, hash), structural: false, contentHash: hash, status: fetched.status };
    }
    if (/pdf/i.test(fetched.contentType || "") || String(fetched.body || "").startsWith("%PDF")) {
      throw fail("ENO_SURFACE", "Expected an HTML listing and received a PDF");
    }
    const records = parseSurface(target.architectureId, fetched.body, fetched.finalUrl || target.url);
    const hash = contentHash(records);
    return {
      ...base,
      ...judge(previous?.contentHash, hash),
      structural: false,
      contentHash: hash,
      records: records.length,
    };
  } catch (error) {
    const structural = STRUCTURAL_CODES.has(error.code);
    return {
      ...base,
      changed: null,
      structural,
      reason: structural ? error.code : "source-unavailable",
      error: error.message,
      contentHash: null,
    };
  }
}

export async function runWatch({ targets, state, fetchImpl, fixtureDir, delayMs = 0 }) {
  const results = [];
  let network = 0;
  for (const target of targets) {
    if (target.mode === "record" || target.mode === "delegate") {
      results.push(idle(target));
      continue;
    }
    if (network > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    network += 1;
    const source = fixtureDir
      ? () => readFixture(fixtureDir, target)
      : () => fetchPinned(target.url, fetchImpl);
    results.push(await watchOne(target, state.targets?.[target.id], source));
  }
  const structural = results.filter((item) => item.structural);
  return {
    checkedAt: new Date().toISOString(),
    governments: new Set(results.map((item) => `${item.layer}:${item.governmentId}`)).size,
    surfaces: results.length,
    fetched: results.filter((item) => item.fetched).length,
    recorded: results.filter((item) => item.mode === "record").length,
    delegated: results.filter((item) => item.mode === "delegate").length,
    changed: results.some((item) => item.changed === true),
    structural: structural.length,
    results,
  };
}

export function nextState(previous, report) {
  const targets = { ...previous.targets };
  for (const result of report.results) {
    if (!result.contentHash || result.structural) continue;
    targets[result.id] = {
      architectureId: result.architectureId,
      mode: result.mode,
      url: result.url,
      contentHash: result.contentHash,
      checkedAt: report.checkedAt,
    };
  }
  return { version: 1, updatedAt: report.checkedAt, targets };
}

async function main() {
  const statePath = flag("--state") || DEFAULT_STATE;
  const targets = watchTargets(COUNTIES, MUNICIPALITIES);
  if (process.argv.includes("--seed")) {
    atomicWrite(statePath, `${JSON.stringify(emptyState(targets), null, 2)}\n`);
    console.log(`Seeded ${targets.length} surfaces to ${statePath}`);
    return;
  }
  if (!process.argv.includes("--check")) {
    console.error("Use --seed or --check");
    process.exitCode = 2;
    return;
  }
  const state = loadState(statePath);
  const report = await runWatch({
    targets,
    state,
    fetchImpl: globalThis.fetch,
    fixtureDir: flag("--from-dir"),
    delayMs: flag("--from-dir") ? 0 : Number(flag("--delay") ?? 1500),
  });
  const out = flag("--out");
  if (out) atomicWrite(out, `${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes("--update-state")) atomicWrite(statePath, `${JSON.stringify(nextState(state, report), null, 2)}\n`);
  console.log(JSON.stringify({
    governments: report.governments,
    surfaces: report.surfaces,
    fetched: report.fetched,
    recorded: report.recorded,
    delegated: report.delegated,
    changed: report.changed,
    structural: report.structural,
  }));
  if (report.structural > 0) process.exitCode = 2;
}

runIfMain(import.meta.url, main);
