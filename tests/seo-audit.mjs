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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ORIGIN = process.env.SEO_ORIGIN || "https://therealwindycity.github.io";
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/TheReelWindyCity").replace(/\/+$/, "");
const SITE_URL = `${ORIGIN}${BASE_PATH}/`;

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const index = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "meetings.json"), "utf8"));
const ecosystem = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "wyoming-ecosystem.json"), "utf8"));
const transcriptIndex = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "transcript-vectors.json"), "utf8"));
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
  check(!/<iframe\b[^>]*src="https?:\/\/(?:www\.)?(?:youtube-nocookie\.com|youtube\.com|cheyenne\.granicus\.com)/i.test(html), `${meeting.id}: page eagerly loads a third-party meeting video iframe`);

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

// Transcript overlays are local corpus data joined by meetingId, so they must
// stay available even when the city snapshot has no external video URL.
const transcriptOverlay = transcriptIndex.items.find((item) => {
  if (item.kind !== "transcript" || !item.meetingId || !item.videoUrl) return false;
  const meeting = MEETINGS.find((candidate) => candidate.id === item.meetingId);
  return meeting && !meeting.official.video;
});
if (transcriptOverlay) {
  const overlayMeeting = MEETINGS.find((meeting) => meeting.id === transcriptOverlay.meetingId);
  const overlayHtml = read(path.join("meetings", overlayMeeting.id, "index.html"));
  check(Boolean(overlayHtml && overlayHtml.includes("Timestamp-linked transcript")), `${overlayMeeting.id}: local transcript overlay was not rendered`);
  check(Boolean(overlayHtml && /aria-label="Load video from YouTube:[^"]+"/.test(overlayHtml)), `${overlayMeeting.id}: transcript video was not made visitor-initiated`);
  check(Boolean(overlayHtml && overlayHtml.includes(transcriptOverlay.timestamp)), `${overlayMeeting.id}: transcript timestamp is not linkable inline`);
} else {
  check(false, "Expected a bundled transcript excerpt whose meeting has no official video URL");
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
const signalsHtml = read(path.join("hub/signals/", "index.html"));
check(Boolean(signalsHtml && /(?:LIVE FEEDS · UPDATED|DATED SNAPSHOT ·)/.test(signalsHtml)), "hub/signals/: missing the explicit live-feed or dated-snapshot provenance badge");
check(Boolean(hubHome && /<iframe[^>]+title=/.test(hubHome)), "hub/: expected a titled external source iframe with a direct-source fallback");
for (const sourceLabel of ["Posted agenda", "Council video", "Scanner audio", "NWS forecast", "WYDOT roads"]) {
  check(Boolean(hubHome && hubHome.includes(sourceLabel)), `hub/: missing iframe source tab "${sourceLabel}"`);
}
check(Boolean(hubHome && hubHome.includes("Open original source")), "hub/: missing direct-source fallback for publishers that block iframes");

// Publisher windows are click-to-load. The frame stays in the exported markup so
// it still works without JavaScript and still describes a real framed document,
// but it must not carry a src — otherwise every visit silently opens a request
// to five third parties before anyone has asked to see them.
const hubIframes = [...(hubHome ?? "").matchAll(/<iframe\b[^>]*>/g)].map((match) => match[0]);
check(hubIframes.length > 0, "hub/: expected at least one publisher iframe in the exported markup");
for (const tag of hubIframes) {
  check(
    !/\ssrc="/.test(tag),
    `hub/: publisher iframe ships with a src, so it loads before the visitor asks — ${tag.slice(0, 90)}`,
  );
}
for (const affordance of ["gov-frame-gate", "Load window"]) {
  check(Boolean(hubHome && hubHome.includes(affordance)), `hub/: missing click-to-load affordance "${affordance}"`);
}

// Every page that shows posted agenda items must say how old the snapshot is.
for (const route of ["hub/", "hub/meetings/"]) {
  const html = read(path.join(route, "index.html"));
  check(Boolean(html && html.includes("Record snapshot")), `${route}: missing the record-snapshot freshness note`);
  check(Boolean(html && html.includes("gov-freshness")), `${route}: missing the freshness indicator element`);
  const snapshotYear = index.captured.slice(0, 4);
  check(
    Boolean(html && new RegExp(`Record snapshot[^<]*${snapshotYear}`).test(html)),
    `${route}: freshness note does not name the snapshot year ${snapshotYear}`,
  );
}

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
  const ecosystemRoutes = [
    "hub/wyoming/",
    "hub/wyoming/architecture/",
    "hub/wyoming/entities/",
    ...ecosystem.counties.map((county) => `hub/wyoming/counties/${county.id}/`),
    ...ecosystem.municipalities.map((place) => `hub/wyoming/places/${place.id}/`),
  ];
  const ecosystemUrls = ecosystemRoutes.map((route) => `${SITE_URL}${route}`);
  const civicRoutes = [
    ...ecosystem.municipalities.map((place) => `civic/places/${place.id}/`),
    ...ecosystem.counties.map((county) => `civic/counties/${county.id}/`),
  ];
  const civicUrls = civicRoutes.map((route) => `${SITE_URL}${route}`);
  const expected = [SITE_URL, `${SITE_URL}meetings/`, `${SITE_URL}transcripts/`, ...hubUrls, ...ecosystemUrls, ...civicUrls, ...MEETINGS.map((meeting) => `${SITE_URL}meetings/${meeting.id}/`)];

  check(locations.length === expected.length, `Sitemap lists ${locations.length} URLs, expected ${expected.length}`);
  check(new Set(locations).size === locations.length, "Sitemap contains duplicate <loc> entries");

  const missing = expected.filter((url) => !locations.includes(url));
  check(missing.length === 0, `Sitemap is missing ${missing.length} URLs (e.g. ${missing[0]})`);

  // Nothing optional here: compare the sitemap against the pages actually
  // exported, so a new route cannot ship without an entry. Framework error
  // pages are the only intentional exception.
  const NOT_INDEXABLE = new Set(["404", "_not-found"]);
  const exportedPages = [];
  (function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.name === "index.html") {
        const relative = path.relative(OUT, path.dirname(entryPath)).split(path.sep).join("/");
        if (relative && NOT_INDEXABLE.has(relative.split("/")[0])) continue;
        exportedPages.push(relative ? `${SITE_URL}${relative}/` : SITE_URL);
      }
    }
  })(OUT);
  const unlisted = exportedPages.filter((url) => !locations.includes(url));
  check(unlisted.length === 0, `${unlisted.length} exported pages are absent from the sitemap (e.g. ${unlisted[0]})`);
  const dangling = locations.filter((url) => !exportedPages.includes(url));
  check(dangling.length === 0, `Sitemap lists ${dangling.length} URLs with no exported page (e.g. ${dangling[0]})`);

  const withoutLastmod = blocks.filter((block) => !/<lastmod>/.test(block)).length;
  check(withoutLastmod === 0, `${withoutLastmod} sitemap entries have no <lastmod>`);

  // lastmod must describe the record snapshot, not the moment of the build.
  const lastmods = [...new Set(matchAll(sitemap, /<lastmod>([^<]*)<\/lastmod>/g))];
  const snapshot = index.captured;
  check(new Set(lastmods.map((value) => value.slice(0, 10))).size <= 2, `Sitemap mixes unexpected lastmod dates (${lastmods.join(", ")})`);
  check(lastmods.every((value) => value.startsWith(snapshot) || value.startsWith(ecosystem.captured)), `Sitemap lastmod is not a known snapshot (${lastmods.join(", ")})`);
  for (const block of blocks) {
    const loc = matchAll(block, /<loc>([^<]*)<\/loc>/g)[0];
    const lastmod = matchAll(block, /<lastmod>([^<]*)<\/lastmod>/g)[0];
    const expectedDate = loc?.includes("/hub/wyoming/") || loc?.includes("/civic/") ? ecosystem.captured : snapshot;
    check(lastmod?.startsWith(expectedDate), `${loc}: lastmod ${lastmod} does not match ${expectedDate}`);
  }
  check(locations.every((url) => url.startsWith(SITE_URL)), "Sitemap contains URLs outside the canonical site root");
}

/* ------------------------------------------------------------------ */
/* 4b. Statewide ecosystem pages                                        */
/* ------------------------------------------------------------------ */
const ecosystemPages = [
  { route: "hub/wyoming/", heading: "not one Granicus table", marker: "DISPARATE SITES" },
  { route: "hub/wyoming/architecture/", heading: "do not transfer unchanged", marker: "ADAPTERS" },
  { route: "hub/wyoming/entities/", heading: "Every Wyoming city, town, and county", marker: "Offices present in every county" },
];
for (const page of ecosystemPages) {
  const html = read(path.join(page.route, "index.html"));
  if (!html) {
    failures.push(`Missing statewide ecosystem page: out/${page.route}index.html`);
    continue;
  }
  const canonicalUrl = `${SITE_URL}${page.route}`;
  const titleTags = matchAll(html, /<title>([^<]*)<\/title>/g);
  const canonicalTags = matchAll(html, /<link rel="canonical" href="([^"]*)"/g);
  const h1Tags = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g);
  check(titleTags.length === 1, `${page.route}: expected one title, found ${titleTags.length}`);
  check(canonicalTags.length === 1 && canonicalTags[0] === canonicalUrl, `${page.route}: canonical ${canonicalTags[0]} does not match ${canonicalUrl}`);
  check(h1Tags.length === 1, `${page.route}: expected one <h1>, found ${h1Tags.length}`);
  check(visibleText(h1Tags[0] ?? "").toLowerCase().includes(page.heading.toLowerCase()), `${page.route}: heading does not include "${page.heading}"`);
  check(html.includes(page.marker), `${page.route}: missing "${page.marker}"`);
  check(visibleText(html).length > 700, `${page.route}: page text is only ${visibleText(html).length} characters`);
  check(!/<iframe\b[^>]*\ssrc="https?:/i.test(html), `${page.route}: eagerly loads a third-party iframe`);
}
for (const place of ecosystem.municipalities) {
  const html = read(path.join("hub", "wyoming", "places", place.id, "index.html"));
  const canonicalUrl = `${SITE_URL}hub/wyoming/places/${place.id}/`;
  if (!html) {
    failures.push(`Missing municipality page: ${place.id}`);
    continue;
  }
  const h1 = visibleText(matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g)[0] ?? "");
  check(h1.includes(place.name), `${place.id}: heading "${h1}" does not name the municipality`);
  check(html.includes(`rel="canonical" href="${canonicalUrl}"`), `${place.id}: canonical is missing`);
  check(visibleText(html).length > 700, `${place.id}: municipality page is only ${visibleText(html).length} characters`);
}
for (const route of [`civic/places/${ecosystem.municipalities[0].id}/`, `civic/counties/${ecosystem.counties[0].id}/`]) {
  const html = read(path.join(route, "index.html"));
  if (!html) {
    failures.push(`Missing civic switch page: out/${route}index.html`);
    continue;
  }
  check(html.includes("PLACE ARCHIVE"), `${route}: civic page does not name its archive`);
  check((html.match(/<h1/g) || []).length === 1, `${route}: expected one h1`);
}
for (const county of ecosystem.counties) {
  const html = read(path.join("hub", "wyoming", "counties", county.id, "index.html"));
  if (!html) {
    failures.push(`Missing county page: ${county.id}`);
    continue;
  }
  const h1 = visibleText(matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g)[0] ?? "");
  check(h1.includes(`${county.name} County`), `${county.id}: heading "${h1}" does not name the county`);
  check(visibleText(html).length > 700, `${county.id}: county page is only ${visibleText(html).length} characters`);
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
/* 5. robots.txt names this site's sitemap                             */
/* ------------------------------------------------------------------ */
const robots = read("robots.txt");
if (!robots) {
  failures.push("Missing out/robots.txt — nothing names the sitemap for crawlers");
} else {
  const sitemapUrl = `${SITE_URL}sitemap.xml`;
  check(/user-agent:\s*\*/i.test(robots), "robots.txt does not define a user-agent group");
  check(!/^\s*disallow:\s*\/\s*$/im.test(robots), "robots.txt disallows the whole site");
  check(robots.includes(`Sitemap: ${sitemapUrl}`), `robots.txt does not point at ${sitemapUrl}`);
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
