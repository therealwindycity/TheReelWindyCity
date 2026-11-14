#!/usr/bin/env node
/**
 * Text-separation regression audit for the exported site.
 *
 * Two different failure modes are covered, and they are deliberately kept apart:
 *
 *  1. STATIC (always runs, needs only `out/`): text extractors that strip tags
 *     without inserting whitespace (search snippets, fetch tools, some
 *     crawlers) must not merge neighbouring labels into strings such as
 *     "Official agendacheyennecity.org" or "2026City Council5 files". Block
 *     layout hid this from browsers, so it is asserted on the raw HTML.
 *
 *  2. BROWSER (runs when BASE_URL is set, as in CI): the rendered text and the
 *     accessible names of links, buttons and headings must not contain two
 *     inline runs joined without a separator. This is the case a screen
 *     reader actually announces; /transcripts/ shipped it for every row.
 *
 * Usage: node tests/text-separation.mjs            (static only)
 *        BASE_URL=http://127.0.0.1:3000/TheReelWindyCity node tests/text-separation.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
const failures = [];
const fail = (message) => failures.push(message);

function naiveText(file) {
  const html = readFileSync(file, "utf8");
  const body = html.slice(html.indexOf("<body"));
  return body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/g, "")
    .replace(/<[^>]+>/g, "") // intentionally NO whitespace inserted
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}

// ---------------------------------------------------------------- static --
if (!existsSync(path.join(out, "meetings", "index.html"))) {
  console.error("text-separation: out/ is missing — run `npm run build` first.");
  process.exit(2);
}
const meetingDirs = readdirSync(path.join(out, "meetings"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const sampleMeetings = [meetingDirs[0], meetingDirs[Math.floor(meetingDirs.length / 2)], meetingDirs.at(-1), "city-council-2026-01-26"]
  .filter((id, i, all) => id && all.indexOf(id) === i && existsSync(path.join(out, "meetings", id, "index.html")));
const staticPages = [
  ["meetings/", path.join(out, "meetings", "index.html")],
  ["transcripts/", path.join(out, "transcripts", "index.html")],
  ...sampleMeetings.map((id) => [`meetings/${id}/`, path.join(out, "meetings", id, "index.html")]),
];
const GLUED = [
  [/Civic CheyenneIndependent index/, "brand name and tagline"],
  [/(All meetings|Civic Cheyenne home)Live Government Hub/, "site navigation links"],
  [/Live Government Hub(Transcript archive|Civic Cheyenne home)/, "site navigation links"],
  [/Home\/(Meeting archive|Transcript archive)/, "breadcrumb"],
  [/\b(19|20)\d\d(City Council|Finance Committee|Public Services Committee|Work Sessions?|Planning Commission|Board of)/, "row date and government body"],
  [/[a-z]\d+ files?\b/, "row label and file count"],
  [/(Official agenda|Official minutes|Granicus meeting page|Meeting video)[a-z0-9-]+\.(org|com|gov)/, "source label and host badge"],
  [/(Government body|Scheduled date|Calendar status|Outcome verification)[A-Z]/, "fact label and value"],
  [/Archive documents\d/, "fact label and value"],
  [/\d(historical meeting entries|archived documents indexed|upcoming meetings confirmed)/, "statistic and its label"],
  [/\.md(Meeting record|Repository copy)/, "transcript file name and back-link"],
];
for (const [label, file] of staticPages) {
  const text = naiveText(file);
  for (const [pattern, what] of GLUED) {
    const hit = text.match(new RegExp(`.{0,24}${pattern.source}.{0,24}`));
    if (hit) fail(`[static] ${label}: ${what} merge without a separator → "${hit[0].replace(/\s+/g, " ")}"`);
  }
}

// --------------------------------------------------------------- browser --
const BASE_URL = process.env.BASE_URL?.replace(/\/$/, "");
let browserChecked = 0;
if (BASE_URL) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const routes = ["/", "/meetings/", "/transcripts/", "/mynewspace/", ...sampleMeetings.slice(0, 2).map((id) => `/meetings/${id}/`)];
  for (const route of routes) {
    const page = await context.newPage();
    await page.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 60_000 });
    const hits = await page.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue.trim() && n.parentElement && !n.parentElement.closest("script,style,noscript,svg,[aria-hidden=true],[aria-label]") && visible(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      const squash = (s) => s.replace(/\s+/g, " ");
      const found = [];
      for (let i = 0; i < nodes.length - 1; i += 1) {
        const a = nodes[i], b = nodes[i + 1];
        if (a.parentElement === b.parentElement) continue;
        if (/\s$/.test(a.nodeValue) || /^\s/.test(b.nodeValue)) continue;
        if (!/[A-Za-z0-9]$/.test(a.nodeValue) || !/^[A-Za-z0-9]/.test(b.nodeValue)) continue;
        // Only one accessible object is affected: a shared link, button, heading, or text cell.
        const scope = a.parentElement.closest("a,button,summary,h1,h2,h3,h4,h5,h6,dd,dt,p,li>span");
        if (!scope || !scope.contains(b)) continue;
        const glued = squash(a.nodeValue).slice(-14) + squash(b.nodeValue).slice(0, 14);
        if (squash(scope.innerText || "").includes(glued)) found.push(`<${scope.tagName.toLowerCase()}> "${glued}"`);
      }
      return found;
    });
    browserChecked += 1;
    for (const hit of [...new Set(hits)].slice(0, 8)) fail(`[browser] ${route}: adjacent inline text announced as one run → ${hit}`);
    if (hits.length > 8) fail(`[browser] ${route}: … and ${hits.length - 8} more`);
    await page.close();
  }
  await browser.close();
}

if (failures.length) {
  console.error(`text-separation: ${failures.length} problem(s)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`Text-separation audit passed: ${staticPages.length} exported pages have no merged labels under tag stripping` + (BASE_URL ? `; ${browserChecked} rendered pages have no glued inline runs inside links, headings or cells.` : " (browser pass skipped: BASE_URL not set)."));
