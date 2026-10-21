#!/usr/bin/env node
/**
 * Bounded snapshot of the city's *posted upcoming-meetings table*.
 *
 * Why: the archived meeting index is a curated snapshot. It is honest about
 * what it contains, but it cannot know about a meeting posted after it was
 * captured. The deploy workflow runs this script before the static build so the
 * homepage can show the city's own current postings — or say plainly that the
 * check failed and fall back to the snapshot.
 *
 * Rules this script keeps (see DEPLOYMENT-REPAIR-HANDOFF.md, projects B/C):
 *   - Bounded: one URL, explicit connect/read deadline, a small attempt count.
 *   - Fail-open for publishing, fail-loud for diagnostics: a failure writes an
 *     explicit `ok: false` record with the real error and exits 0 unless
 *     `--strict` is passed. The build then uses the committed snapshot and says
 *     the live check failed; it never invents postings.
 *   - No fabrication: `observedAt` is the real completion time; records keep the
 *     publisher's body/date/time/agenda link and nothing else.
 *   - No writes outside the requested output. This never advances the watcher
 *     baseline and never triggers a sync.
 *
 * Usage:
 *   node scripts/sync/snapshot-upcoming.mjs --out data/source-check.json
 *   node scripts/sync/snapshot-upcoming.mjs --from-file tests/sync/fixtures/upcoming.html --out /tmp/check.json
 *   node scripts/sync/snapshot-upcoming.mjs --strict
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractUpcomingRecords } from "../lib/upcoming-table.mjs";
import { normalizeDate, normalizeTime, normalizeUrl } from "../lib/canonical.mjs";

export const DEFAULT_URL = "https://cheyenne.granicus.com/ViewPublisher.php?view_id=5&widget=upcoming";
export const DEFAULT_OUT = path.join("data", "source-check.json");
const USER_AGENT = "CivicCheyenne-LiveCheck/1.0 (bounded build-time check; +https://therealwindycity.github.io/TheReelWindyCity/)";

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

/**
 * Run one bounded source check.
 *
 * @param {{url?: string, fromFile?: string, timeoutMs?: number, attempts?: number, now?: Date, fetchImpl?: typeof fetch}} options
 */
export async function checkPostedMeetings({ url = DEFAULT_URL, fromFile = null, timeoutMs = 10_000, attempts = 2, now = new Date(), fetchImpl = fetch } = {}) {
  const startedAt = new Date(now instanceof Date ? now : new Date(now));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      let html;
      if (fromFile) {
        html = readFileSync(fromFile, "utf8");
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, {
            signal: controller.signal,
            redirect: "follow",
            headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status} from the city's meeting table`);
          html = await response.text();
        } finally {
          clearTimeout(timer);
        }
      }
      const records = extractUpcomingRecords(html).map((record) => ({
        body: record.body,
        bodyLabel: record.bodyLabel,
        date: record.date,
        time: record.time,
        agendaUrl: record.agendaUrl,
      }));
      return {
        version: 1,
        ok: true,
        observedAt: new Date().toISOString(),
        sourceUrl: fromFile ? null : url,
        attempts: attempt,
        error: null,
        meetings: records,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    }
  }
  return {
    version: 1,
    ok: false,
    observedAt: new Date().toISOString(),
    sourceUrl: fromFile ? null : url,
    attempts,
    error: lastError?.message || "unknown source-check failure",
    meetings: [],
  };
}

function normalizeRecord(record) {
  return {
    body: record.body,
    bodyLabel: record.bodyLabel,
    date: normalizeDate(record.date),
    time: normalizeTime(record.time || ""),
    agendaUrl: normalizeUrl(record.agendaUrl || ""),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const out = path.resolve(flag(argv, "--out") || process.env.SOURCE_CHECK_OUT || DEFAULT_OUT);
  const result = await checkPostedMeetings({
    url: flag(argv, "--url") || process.env.SOURCE_CHECK_URL || DEFAULT_URL,
    fromFile: flag(argv, "--from-file"),
    timeoutMs: clampInteger(flag(argv, "--timeout-ms") ?? process.env.SOURCE_CHECK_TIMEOUT_MS, 10_000, 1_000, 60_000),
    attempts: clampInteger(flag(argv, "--attempts") ?? process.env.SOURCE_CHECK_ATTEMPTS, 2, 1, 5),
  });
  result.meetings = result.meetings.map(normalizeRecord);

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  if (result.ok) {
    console.log(`Posted-meeting table checked: ${result.meetings.length} meeting(s) at ${result.observedAt} → ${path.relative(process.cwd(), out)}`);
  } else {
    console.warn(`⚠ posted-meeting check failed (${result.error}); wrote an explicit unavailable record to ${path.relative(process.cwd(), out)}`);
    if (argv.includes("--strict")) process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((error) => {
    console.error(`✗ source-check script crashed: ${error.message}`);
    process.exit(1);
  });
}
