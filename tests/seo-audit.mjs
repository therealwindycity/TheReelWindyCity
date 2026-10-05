#!/usr/bin/env node
/**
 * Static SEO audit of the exported site (out/).
 *
 * Checks the whole indexing surface — every meeting, every page — rather than
 * sampling a few URLs. Run it after `npm run build`:
 *
 *   NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run build
 *   npm run test:seo
 *
 * Fails with a non-zero exit code and a list of offending URLs on regression,
 * so an export that quietly drops static pages, duplicates canonicals, or
 * serves a placeholder host cannot ship.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ORIGIN = process.env.SEO_ORIGIN || "https://therealwindycity.github.io";
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/TheReelWindyCity").replace(/\/+$/, "");
const SITE_URL = `${ORIGIN}${BASE_PATH}/`;

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const index = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "meetings.json"), "utf8"));
const MEETINGS = index.meetings;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function read(relativePath) {
  const file = path.join(OUT, relativePath);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function matchAll(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* 1. Every meeting has its own static page                            */
/* ------------------------------------------------------------------ */
const titles = new Map();
const canonicals = new Map();
const ids = new Set(MEETINGS.map((meeting) => meeting.id));
check(ids.size === MEETINGS.length, `Meeting index contains duplicate ids (${MEETINGS.length} entries, ${ids.size} unique)`);

for (const meeting of MEETINGS) {
  const html = read(path.join("meetings", meeting.id, "index.html"));
  if (!html) {
    failures.push(`Missing static page: out/meetings/${meeting.id}/index.html`);
    continue;
  }

  const expectedCanonical = `${SITE_URL}meetings/${meeting.id}/`;
  const titleTags = matchAll(html, /<title>([^<]*)<\/title>/g);
  const canonicalTags = matchAll(html, /<link rel="canonical" href="([^"]*)"/g);
  const h1Tags = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g);

  check(titleTags.length === 1, `${meeting.id}: expected exactly one <title>, found ${titleTags.length}`);
  check(canonicalTags.length === 1, `${meeting.id}: expected exactly one canonical link, found ${canonicalTags.length}`);
  check(h1Tags.length === 1, `${meeting.id}: expected exactly one <h1>, found ${h1Tags.length}`);
  check(canonicalTags[0] === expectedCanonical, `${meeting.id}: canonical is ${canonicalTags[0]}, expected ${expectedCanonical}`);
  check(/<meta name="robots" content="[^"]*index/.test(html), `${meeting.id}: missing indexable robots directive`);
  check(!/noindex/i.test(html), `${meeting.id}: page contains a noindex directive`);
  check(!/https:\/\/github\.io(\/|\{|\s|")/.test(html), `${meeting.id}: links a bare github.io host instead of the project URL`);

  const title = (titleTags[0] ?? "").trim();
  check(title.length > 0 && title.includes(meeting.shortDate), `${meeting.id}: title "${title}" does not carry the meeting date`);
  titles.set(meeting.id, title);

  const canonical = canonicalTags[0];
  canonicals.set(meeting.id, canonical);

  const heading = visibleText(h1Tags[0] ?? "");
  check(heading.includes(meeting.bodyLabel), `${meeting.id}: <h1> "${heading}" does not name the government body`);

  // Each record page must carry real content: facts plus at least one linkable record.
  check(visibleText(html).length > 800, `${meeting.id}: page text is only ${visibleText(html).length} characters — likely a hollow shell`);

  // Structured data must be valid JSON and point at the canonical URL.
  const blocks = matchAll(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  check(blocks.length >= 2, `${meeting.id}: expected WebPage and BreadcrumbList structured data, found ${blocks.length} blocks`);
  const types = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      types.push(parsed["@type"]);
      if (parsed["@type"] === "WebPage") {
        check(parsed.url === expectedCanonical, `${meeting.id}: WebPage structured data url ${parsed.url} does not match the canonical`);
      }
    } catch (error) {
      failures.push(`${meeting.id}: invalid JSON-LD block (${error.message})`);
    }
  }
  check(types.includes("WebPage"), `${meeting.id}: missing WebPage structured data`);
  check(types.includes("BreadcrumbList"), `${meeting.id}: missing BreadcrumbList structured data`);

  // Traceability: every archived document must be linked from the page.
  const githubLinks = matchAll(html, /href="(https:\/\/github\.com\/therealwindycity\/[^"]+)"/g);
  check(
    githubLinks.length >= meeting.docs.length + (meeting.transcripts?.length ?? (meeting.transcript ? 1 : 0)),
    `${meeting.id}: links ${githubLinks.length} source documents but the index lists ${meeting.docs.length} documents`,
  );
}

const duplicateTitles = [...titles.values()].filter((title, position) => titles.size && [...titles.values()].indexOf(title) !== position);
check(duplicateTitles.length === 0, `${duplicateTitles.length} meeting pages share a duplicate title, e.g. "${duplicateTitles[0]}"`);
const duplicateCanonicals = [...canonicals.values()].filter((url, position) => [...canonicals.values()].indexOf(url) !== position);
check(duplicateCanonicals.length === 0, `${duplicateCanonicals.length} meeting pages share a duplicate canonical, e.g. ${duplicateCanonicals[0]}`);

/* ------------------------------------------------------------------ */
/* 2. The archive index links every meeting page (crawl reachability)   */
/* ------------------------------------------------------------------ */
const archiveHtml = read(path.join("meetings", "index.html"));
if (!archiveHtml) {
  failures.push("Missing crawlable archive index: out/meetings/index.html");
} else {
  const linked = new Set(matchAll(archiveHtml, /href="[^"]*\/meetings\/([^"/]+)\/"/g));
  const unlinked = MEETINGS.filter((meeting) => !linked.has(meeting.id));
  check(unlinked.length === 0, `${unlinked.length} meeting pages are not linked from /meetings/ (e.g. ${unlinked[0]?.id})`);
  check(archiveHtml.includes("Cheyenne public meeting archive"), "Archive index is missing its heading text");
}

/* ------------------------------------------------------------------ */
/* 3. Dedicated civic hub pages are crawlable, canonical, and useful    */
/* ------------------------------------------------------------------ */
const hubPages = [
  { route: "hub/", heading: "Local government is easier to follow", marker: "OPEN SOURCE WINDOWS" },
  { route: "hub/meetings/", heading: "Meetings & agendas", marker: "FEATURED POSTED AGENDA" },
  { route: "hub/signals/", heading: "Live signal desk", marker: "WyoLink P25" },
  { route: "hub/learn/", heading: "Learn to follow a public decision", marker: "QUICK KNOWLEDGE CHECK" },
];
for (const hub of hubPages) {
  const html = read(path.join(hub.route, "index.html"));
  if (!html) {
    failures.push(`Missing dedicated civic hub page: out/${hub.route}index.html`);
    continue;
  }
  const canonicalUrl = `${SITE_URL}${hub.route}`;
  const titleTags = matchAll(html, /<title>([^<]*)<\/title>/g);
  const canonicalTags = matchAll(html, /<link rel="canonical" href="([^"]*)"/g);
  check(titleTags.length === 1, `${hub.route}: expected one page title, found ${titleTags.length}`);
  check(canonicalTags.length === 1 && canonicalTags[0] === canonicalUrl, `${hub.route}: canonical ${canonicalTags[0]} does not match ${canonicalUrl}`);
  check(/<meta name="robots" content="[^"]*index/.test(html), `${hub.route}: missing indexable robots directive`);
  check(visibleText(html).length > 700, `${hub.route}: page text is only ${visibleText(html).length} characters — likely a hollow shell`);
  check(html.toLowerCase().includes(hub.marker.toLowerCase()), `${hub.route}: missing expected page content "${hub.marker}"`);
  const h1Tags = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g);
  check(h1Tags.length === 1, `${hub.route}: expected one <h1>, found ${h1Tags.length}`);
  const h1Text = visibleText(h1Tags[0] ?? "").replace(/&amp;/g, "&");
  check(h1Text.toLowerCase().includes(hub.heading.toLowerCase()), `${hub.route}: heading "${h1Text}" does not match "${hub.heading}"`);
  check(!/https:\/\/github\.io(\/|\{|\s|")/.test(html), `${hub.route}: links a bare github.io host instead of the project URL`);
}
const hubHome = read(path.join("hub/", "index.html"));
check(Boolean(hubHome && /<iframe[^>]+title=/.test(hubHome)), "hub/: expected a titled external source iframe with a direct-source fallback");
for (const sourceLabel of ["Posted agenda", "Council video", "Scanner audio", "NWS forecast", "WYDOT roads"]) {
  check(Boolean(hubHome && hubHome.includes(sourceLabel)), `hub/: missing iframe source tab "${sourceLabel}"`);
}
check(Boolean(hubHome && hubHome.includes("Open original source")), "hub/: missing direct-source fallback for publishers that block iframes");

/* ------------------------------------------------------------------ */
/* 4. Sitemap covers every page with an honest lastmod                  */
/* ------------------------------------------------------------------ */
const sitemap = read("sitemap.xml");
if (!sitemap) {
  failures.push("Missing out/sitemap.xml");
} else {
  const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
  const locations = blocks.map((block) => matchAll(block, /<loc>([^<]*)<\/loc>/g)[0]);
  const hubUrls = ["hub/", "hub/meetings/", "hub/signals/", "hub/learn/"].map((route) => `${SITE_URL}${route}`);
  const expected = [SITE_URL, `${SITE_URL}meetings/`, `${SITE_URL}transcripts/`, ...hubUrls, ...MEETINGS.map((meeting) => `${SITE_URL}meetings/${meeting.id}/`)];

  check(locations.length === expected.length, `Sitemap lists ${locations.length} URLs, expected ${expected.length}`);
  check(new Set(locations).size === locations.length, "Sitemap contains duplicate <loc> entries");

  const missing = expected.filter((url) => !locations.includes(url));
  check(missing.length === 0, `Sitemap is missing ${missing.length} URLs (e.g. ${missing[0]})`);

  const withoutLastmod = blocks.filter((block) => !/<lastmod>/.test(block)).length;
  check(withoutLastmod === 0, `${withoutLastmod} sitemap entries have no <lastmod>`);

  // lastmod must describe the record snapshot, not the moment of the build.
  const lastmods = [...new Set(matchAll(sitemap, /<lastmod>([^<]*)<\/lastmod>/g))];
  const snapshot = index.captured;
  check(lastmods.length === 1, `Sitemap mixes ${lastmods.length} different lastmod values (${lastmods.join(", ")})`);
  check(lastmods[0]?.startsWith(snapshot), `Sitemap lastmod ${lastmods[0]} does not match the index snapshot date ${snapshot}`);
  check(locations.every((url) => url.startsWith(SITE_URL)), "Sitemap contains URLs outside the canonical site root");
}

/* ------------------------------------------------------------------ */
/* 4. Home page and section pages                                      */
/* ------------------------------------------------------------------ */
const home = read("index.html");
if (!home) {
  failures.push("Missing out/index.html");
} else {
  check(home.includes(`<link rel="canonical" href="${SITE_URL}"`), `Homepage canonical is not ${SITE_URL}`);
  check(home.includes("meetings/"), "Homepage does not link the crawlable meeting archive");
}

const exportedSitemap = read("sitemap.xml") ?? "";
for (const [label, file, expectedCanonical] of [
  ["meeting archive", path.join("meetings", "index.html"), `${SITE_URL}meetings/`],
  ["transcript archive", path.join("transcripts", "index.html"), `${SITE_URL}transcripts/`],
]) {
  const html = read(file);
  if (!html) {
    failures.push(`Missing ${label}: out/${file}`);
    continue;
  }
  check(html.includes(`rel="canonical" href="${expectedCanonical}"`), `${label} canonical is not ${expectedCanonical}`);
  check(exportedSitemap.includes(`<loc>${expectedCanonical}</loc>`), `${label} missing from sitemap`);
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
if (failures.length) {
  console.error(`SEO audit failed with ${failures.length} problem${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures.slice(0, 40)) console.error(`  • ${failure}`);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(
  `SEO audit passed: ${MEETINGS.length} meeting pages and four standalone hub pages exported with canonicals, ` +
    `plus home, archive and transcript indexes in the sitemap (lastmod ${index.captured}).`,
);
