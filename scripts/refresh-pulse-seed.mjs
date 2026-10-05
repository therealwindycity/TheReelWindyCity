#!/usr/bin/env node
/**
 * Append newly verified publisher stories to the curated Wyoming Pulse seed.
 *
 * The seed is what the desk falls back to when a publisher feed is unreachable
 * at build time, so it must only ever contain real, source-linked stories. Run
 * it with a JSON file holding an array of stories:
 *
 *   node scripts/refresh-pulse-seed.mjs new-stories.json [--captured-at YYYY-MM-DD]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeSeedStories } from "./lib/pulse-seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = path.join(ROOT, "src", "data", "wyoming-pulse-seed.json");

const [inputPath, ...flags] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: node scripts/refresh-pulse-seed.mjs <new-stories.json> [--captured-at YYYY-MM-DD]");
  process.exit(1);
}
const capturedAtIndex = flags.indexOf("--captured-at");
const capturedAt = capturedAtIndex >= 0 ? flags[capturedAtIndex + 1] : null;
if (capturedAt && !/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
  console.error(`--captured-at must be YYYY-MM-DD, received "${capturedAt}"`);
  process.exit(1);
}

const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
const incoming = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
const { seed: next, accepted, rejected } = mergeSeedStories(seed, incoming, { capturedAt });

await writeFile(SEED_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");

console.log(`Seed now holds ${next.alerts.length} source-linked stories (added ${accepted.length}, captured ${next.capturedAt}).`);
if (rejected.length) console.log(`Skipped ${rejected.length}:\n - ${rejected.join("\n - ")}`);
