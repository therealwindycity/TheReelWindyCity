#!/usr/bin/env node
/**
 * Phase 1 — upcoming-meetings watcher (the DOM-hash replacement).
 *
 * Red-team context (Order of Magnitude 1, finding 2 — "The DOM-Hashing Fallacy"):
 * hashing the DOM of the Granicus "upcoming meetings" table fires on every request
 * because the portal decorates markup with session ids, nonces and tracking
 * params. This watcher instead:
 *   1. parses the table into semantic records (body / date / time / agenda URL),
 *   2. normalizes each field (see scripts/lib/canonical.mjs),
 *   3. hashes ONLY the canonical record set (sha256 over stable JSON),
 *   4. compares against the committed baseline data/sync-state.json.
 * Identical meeting data ⇒ identical hash ⇒ no trigger, no matter how much the
 * markup churned. A real change (new meeting, moved time, new agenda link) ⇒
 * different hash ⇒ one queued sync run (serialized by the shared concurrency
 * group — see the workflows).
 *
 * Modes:
 *   --check                 fetch + compare; print JSON result; exit 0 (changed is
 *                           data, not an error). Exit 1 only on fetch/parse failure
 *                           (fail closed: a broken watcher must never look like
 *                           "no changes").
 *   --check --update-state  additionally write the refreshed baseline (used by the
 *                           sync workflow after a successful pipeline run).
 *   --seed                  build the baseline from src/data/official-meetings.json
 *                           (no network) — run once when enabling the pipeline.
 *   --from-file <html>      offline input for tests / forensic re-checks.
 *   --url <url>             override the watched endpoint.
 *   --state <path>          override the baseline file (default data/sync-state.json).
 *   --out <path>            also write the JSON result to a file (used by the watch
 *                           workflow to pass outputs along).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { contentHash } from "../lib/canonical.mjs";
import { extractUpcomingRecords, recordsFromOfficialSnapshot } from "../lib/upcoming-table.mjs";
import { atomicWrite } from "../lib/atomic.mjs";
import { runIfMain } from "../lib/cli.mjs";

const DEFAULT_URL = "https://cheyenne.granicus.com/ViewPublisher.php?view_id=5&widget=upcoming";
const DEFAULT_STATE = path.join("data", "sync-state.json");
const SNAPSHOT = path.join("src", "data", "official-meetings.json");
const UA = "CivicCheyenne-Watcher/1.0 (automated change detection; +https://therealwindycity.github.io/TheReelWindyCity/)";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function loadState(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof state.contentHash !== "string") throw new Error("missing contentHash");
    return state;
  } catch (error) {
    throw new Error(`baseline ${statePath} is not a valid sync state (${error.message}) — re-run with --seed`);
  }
}

async function fetchUpcoming(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url} — portal down, blocked, or moved (fix before re-enabling sync)`);
    }
    return await response.text();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout after 30s fetching ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Which records are new or changed vs the baseline (drives which URLs get synced). */
export function changedRecords(records, previousRecords) {
  if (!previousRecords?.length) return records;
  const key = (record) => `${record.body}|${record.date}`;
  const previous = new Map(previousRecords.map((record) => [key(record), record]));
  return records.filter((record) => {
    const before = previous.get(key(record));
    return !before || before.time !== record.time || before.agendaUrl !== record.agendaUrl || before.bodyLabel !== record.bodyLabel;
  });
}

async function main() {
  const statePath = flag("--state") || DEFAULT_STATE;
  const updateState = process.argv.includes("--update-state");
  const seed = process.argv.includes("--seed");
  const outFile = flag("--out");

  let records;
  if (seed) {
    if (!existsSync(SNAPSHOT)) throw new Error(`missing ${SNAPSHOT}`);
    records = recordsFromOfficialSnapshot(JSON.parse(readFileSync(SNAPSHOT, "utf8")));
    console.log(`Seeded baseline from curated snapshot: ${records.length} upcoming meeting(s).`);
  } else {
    const html = flag("--from-file") ? readFileSync(flag("--from-file"), "utf8") : await fetchUpcoming(flag("--url") || DEFAULT_URL);
    records = extractUpcomingRecords(html); // throws ENO_TABLE / ENO_ROWS on structural surprises
  }

  const hash = contentHash(records);
  const previous = seed ? null : loadState(statePath);
  const changed = !previous || previous.contentHash !== hash;
  const changedList = changed ? changedRecords(records, previous?.meetings) : [];

  const result = {
    checkedAt: new Date().toISOString(),
    changed,
    contentHash: hash,
    previousHash: previous?.contentHash ?? null,
    reason: seed ? "seed" : changed ? (previous ? "content-changed" : "no-baseline") : "unchanged",
    meetings: records,
    changedMeetings: changedList,
  };

  if (seed || (updateState && changed)) {
    atomicWrite(statePath, `${JSON.stringify({ version: 1, checkedAt: result.checkedAt, contentHash: hash, meetings: records }, null, 2)}\n`);
    console.log(`Baseline written: ${statePath} (hash ${hash.slice(0, 12)}…).`);
  }
  if (outFile) atomicWrite(outFile, `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify({ ...result, meetings: records.length, changedMeetings: changedList.length }));
  if (!seed && changed) {
    console.log(
      changedList.length
        ? `Content change detected in: ${changedList.map((record) => `${record.bodyLabel} ${record.date}`).join("; ")}`
        : "Content change detected (baseline absent or replaced).",
    );
  } else if (!seed) {
    console.log("No semantic change — markup churn ignored by design.");
  }
}

main().catch((error) => {
  console.error(`✗ watcher failed: ${error.message}`);
  console.error("  Failing closed: a broken watcher must never read as “no changes”. No sync will be triggered.");
  process.exit(1);
});
