#!/usr/bin/env node
/**
 * Verify the sitemap and robots.txt that the deployed site is actually serving.
 *
 * Search Console reads the published files, not the ones in `out/`, so this
 * checks the live URLs — after a deploy, or any time you want to confirm what
 * Google sees:
 *
 *   npm run seo:live                              # checks the GitHub Pages site
 *   LIVE_SITE_URL=https://example.com/ npm run seo:live
 *   npm run seo:live -- --site http://127.0.0.1:3000/TheReelWindyCity/ --mirror
 *
 * It fails (exit 1) when the sitemap is missing, malformed, advertises the
 * wrong host, is shorter than the archive requires, or when the pages it lists
 * do not resolve. `--mirror` relaxes the host check so a local copy of the same
 * export can be audited; production checks must not use it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const MIRROR = args.includes("--mirror");
function flag(name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
}

const SITE_URL = (flag("site", process.env.LIVE_SITE_URL) || "https://therealwindycity.github.io/TheReelWindyCity/").replace(/\/?$/, "/");
const RETRIES = Number(flag("retries", process.env.SEO_LIVE_RETRIES || 3));
const RETRY_DELAY_MS = Number(flag("delay", process.env.SEO_LIVE_DELAY_MS || 10_000));
// Home, meetings, transcripts and the four hub routes are the sitemap entries
// that are not meeting records.
const STATIC_PAGES = ["", "meetings/", "transcripts/", "hub/", "hub/meetings/", "hub/signals/", "hub/learn/"];

const failures = [];
const notes = [];

/** Minimum URL count from this checkout's archive, so a stale sitemap is caught. */
function archiveMinimum() {
  const declared = Number(flag("min-urls", 0));
  if (declared > 0) return declared;
  const indexFile = path.join(process.cwd(), "src", "data", "meetings.json");
  if (!existsSync(indexFile)) return null;
  const index = JSON.parse(readFileSync(indexFile, "utf8"));
  const meetings = Array.isArray(index.meetings) ? index.meetings.length : 0;
  return meetings ? meetings + STATIC_PAGES.length : null;
}

async function fetchWithRetry(url, { attempts = RETRIES } = {}) {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "CivicCheyenneSEO/1.0 (+https://therealwindycity.github.io/TheReelWindyCity/)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.name === "TimeoutError" || error.name === "AbortError" ? "timed out after 30s" : error.message;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(lastError);
}

const sitemapUrl = new URL("sitemap.xml", SITE_URL).toString();
const robotsUrl = new URL("robots.txt", SITE_URL).toString();

/* 1. The sitemap itself. */
let locations = [];
try {
  const body = await fetchWithRetry(sitemapUrl);
  if (!/<urlset[\s>]/.test(body)) failures.push(`${sitemapUrl} is not a sitemap <urlset> document`);
  locations = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1].trim());
  if (!locations.length) failures.push(`${sitemapUrl} lists no URLs`);
} catch (error) {
  failures.push(`${sitemapUrl} is not reachable (${error.message}) — Search Console cannot read it either`);
}

/* 2. One consistent, correct host and base path across every entry. */
let declaredBase = null;
if (locations.length) {
  const bases = new Set();
  for (const url of locations) {
    const match = url.match(/^(https?:\/\/[^?#]*\/)(?:[^/]*)$/);
    bases.add(match ? match[1] : url);
  }
  const roots = new Set(locations.map((url) => new URL(url).origin));
  if (roots.size > 1) failures.push(`sitemap mixes ${roots.size} hosts (${[...roots].join(", ")})`);
  declaredBase = locations[0].slice(0, locations[0].lastIndexOf("/") + 1);
  if (declaredBase !== SITE_URL) {
    const message = `sitemap advertises ${declaredBase} but this check fetched ${SITE_URL}`;
    if (MIRROR) notes.push(`${message} (allowed by --mirror)`);
    else failures.push(`${message} — Search Console would index the wrong host or path`);
  }
  const duplicates = locations.length - new Set(locations).size;
  if (duplicates) failures.push(`${sitemapUrl} lists ${duplicates} duplicate URLs`);
  if (bases.size > 1) notes.push(`sitemap entries span ${bases.size} distinct parent paths`);
}

/* 3. Coverage against the archive in this checkout. */
const minimum = archiveMinimum();
if (minimum && locations.length) {
  if (locations.length < minimum) {
    failures.push(
      `Deployed sitemap lists ${locations.length} URLs but this checkout's archive needs at least ${minimum}. ` +
        "The deploy may predate the current archive, or it did not publish the newest sitemap.",
    );
  } else {
    notes.push(`sitemap lists ${locations.length} URLs (archive requires >= ${minimum})`);
  }
} else if (locations.length) {
  notes.push(`sitemap lists ${locations.length} URLs`);
}

const expectedBase = declaredBase ?? SITE_URL;
for (const route of STATIC_PAGES) {
  const expected = `${expectedBase}${route}`;
  if (locations.length && !locations.includes(expected)) failures.push(`sitemap is missing ${expected}`);
}

/* 4. robots.txt must name that exact sitemap URL. */
try {
  const body = await fetchWithRetry(robotsUrl);
  if (!/user-agent:\s*\*/i.test(body)) failures.push(`${robotsUrl} has no user-agent group`);
  if (/^\s*disallow:\s*\/\s*$/im.test(body)) failures.push(`${robotsUrl} disallows the whole site`);
  const declaredSitemaps = [...body.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);
  if (!declaredSitemaps.length) {
    failures.push(`${robotsUrl} does not declare a sitemap — the sitemap URL must be given in full`);
  } else if (!declaredSitemaps.includes(`${expectedBase}sitemap.xml`)) {
    failures.push(`${robotsUrl} declares ${declaredSitemaps.join(", ")} instead of ${expectedBase}sitemap.xml`);
  } else {
    notes.push(`robots.txt names ${expectedBase}sitemap.xml`);
  }
} catch (error) {
  failures.push(`${robotsUrl} is not reachable (${error.message})`);
}

/* 5. Spot-check that advertised pages resolve (remapped host when mirroring). */
const remap = (url) => (MIRROR && declaredBase && declaredBase !== SITE_URL ? SITE_URL + url.slice(declaredBase.length) : url);
const recentMeetings = locations.filter((url) => /\/meetings\/[^/]+\/$/.test(url)).slice(0, 2);
const samples = [...STATIC_PAGES.map((route) => `${expectedBase}${route}`), ...recentMeetings];
let checked = 0;
for (const url of samples) {
  try {
    const response = await fetch(remap(url), { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) failures.push(`${url} returned HTTP ${response.status}`);
    else checked += 1;
  } catch (error) {
    failures.push(`${url} could not be fetched (${error.message})`);
  }
}
notes.push(`spot-checked ${checked}/${samples.length} advertised pages`);

/* 6. Report the host-root robots.txt, which is what actually governs crawling. */
const hostRootRobots = new URL("/robots.txt", SITE_URL).toString();
try {
  await fetchWithRetry(hostRootRobots, { attempts: 1 });
  notes.push(`host root ${hostRootRobots} is served`);
} catch (error) {
  notes.push(`host root ${hostRootRobots} is not served (${error.message}) — Google treats that as "no crawl rules", so nothing is blocked`);
}

console.log(`Live SEO check for ${SITE_URL}`);
for (const note of notes) console.log(`  · ${note}`);
console.log(`  · submit this exact URL in Search Console: ${SITE_URL}sitemap.xml`);

if (failures.length) {
  console.error(`\nLive SEO check failed with ${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}
console.log("\nLive SEO check passed: the deployed sitemap and robots.txt match this site.");
