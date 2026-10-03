#!/usr/bin/env node
/**
 * Build-out script for Civic Cheyenne's public-record data.
 *
 * Assembles the static data served by the website from the archive snapshots
 * in src/data/ (which mirror therealwindycity's cheyenne-archives-* and
 * The-Real-Windy-City- transcript repositories on GitHub).
 *
 * Usage:
 *   node scripts/build-data.mjs            # assemble public/ data from src/data
 *   node scripts/build-data.mjs --refresh  # first refresh snapshots from GitHub (requires gh CLI)
 *
 * What it produces:
 *   public/data/<repo>.json              full git-tree index for each archive repo (7 repos)
 *   public/data/jan-26-transcript.md     bundled copy of the guided-session transcript
 *   public/sources/2026-01-26-agenda.html     official agenda capture (archived HTML page)
 *   public/sources/2026-01-26-minutes.pdf    official Record of Proceedings, Jan 26, 2026
 *   public/sources/2026-01-26-warrants.pdf   supporting policy brief (Chapter 1.28)
 *   src/data/official-sources.json       manifest of locally bundled official documents
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DATA = path.join(ROOT, "src", "data");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const PUBLIC_SOURCES = path.join(ROOT, "public", "sources");

const OWNER = "therealwindycity";
/** Repository id -> snapshot file under src/data/ */
const REPOS = [
  { id: "cheyenne-archives-2025-2026", snapshot: "archive-tree.json" },
  { id: "The-Real-Windy-City-", snapshot: "transcript-tree.json" },
  { id: "cheyenne-archives-2023-2024", snapshot: "repos/cheyenne-archives-2023-2024.json" },
  { id: "cheyenne-archives-2022", snapshot: "repos/cheyenne-archives-2022.json" },
  { id: "cheyenne-archives-2018-2021", snapshot: "repos/cheyenne-archives-2018-2021.json" },
  { id: "cheyenne-archives-2014-2017", snapshot: "repos/cheyenne-archives-2014-2017.json" },
  { id: "cheyenne-archives-2008-2013", snapshot: "repos/cheyenne-archives-2008-2013.json" },
];

/** Locally bundled official documents for the guided January 26, 2026 session. */
const OFFICIAL_SOURCES = {
  agenda: "sources/2026-01-26-agenda.html",
  minutes: "sources/2026-01-26-minutes.pdf",
  "2026-01-26-warrants": "sources/2026-01-26-warrants.pdf",
};

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function refreshSnapshots() {
  for (const { id, snapshot } of REPOS) {
    const target = path.join(SRC_DATA, snapshot);
    process.stdout.write(`Refreshing ${OWNER}/${id} … `);
    const tree = gh(["api", `repos/${OWNER}/${id}/git/trees/main?recursive=1`]);
    const parsed = JSON.parse(tree);
    if (!parsed.tree || parsed.truncated) throw new Error(`Incomplete tree for ${id}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(parsed, null, 2) + "\n");
    console.log(`${parsed.tree.length} entries (sha ${parsed.sha.slice(0, 10)})`);
  }
}

function assemble() {
  mkdirSync(PUBLIC_DATA, { recursive: true });
  mkdirSync(PUBLIC_SOURCES, { recursive: true });

  // 1. Repository indexes for the source library (client-side fetch).
  for (const { id, snapshot } of REPOS) {
    const from = path.join(SRC_DATA, snapshot);
    if (!existsSync(from)) throw new Error(`Missing snapshot ${from}; run with --refresh`);
    copyFileSync(from, path.join(PUBLIC_DATA, `${id}.json`));
  }

  // 2. Bundled transcript for the guided session.
  const transcript = path.join(SRC_DATA, "jan-26-transcript.md");
  if (existsSync(transcript)) copyFileSync(transcript, path.join(PUBLIC_DATA, "jan-26-transcript.md"));

  // 3. Official source documents are curated into public/sources (see README).
  //    Keep only entries whose backing file actually exists.
  const available = {};
  for (const [id, rel] of Object.entries(OFFICIAL_SOURCES)) {
    if (existsSync(path.join(ROOT, "public", rel))) available[id] = rel;
    else console.warn(`note: official source "${id}" has no local copy (${rel}); the site will link the original source`);
  }
  writeFileSync(path.join(SRC_DATA, "official-sources.json"), JSON.stringify(available, null, 2) + "\n");

  const files = readdirSync(PUBLIC_DATA);
  console.log(`Assembled public/data (${files.length} files) and official-sources manifest (${Object.keys(available).length} documents).`);
}

const refresh = process.argv.includes("--refresh");
if (refresh) refreshSnapshots();
assemble();
