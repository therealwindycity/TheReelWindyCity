#!/usr/bin/env node
/**
 * Phase 2a — layout-aware municipal agenda PDF extraction.
 *
 * Red-team fixes implemented here:
 *   OM2#1 (Layout Blindness): uses scripts/lib/pdf-layout.mjs (positioned items →
 *     line clustering → column-gutter detection → reading order) instead of a
 *     stream-order extractor. Two-column agendas come out as two columns.
 *   OM3#2 (Error Cascades): fails LOUDLY with typed codes (ENCRYPTED / CORRUPT /
 *     NO_TEXT / EMPTY_INPUT / NO_PDF_LINK / HTTP_*) and, on failure, writes
 *     NOTHING — atomic tmp+rename writes mean no half-parsed files can reach a
 *     commit even if the process dies mid-write.
 *
 * Accepts either a direct PDF URL/path or a Granicus AgendaViewer URL (the HTML
 * viewer is resolved to the underlying PDF link first — government portals love
 * wrapping documents in viewer chrome).
 *
 * Usage:
 *   node scripts/extractors/parse_agenda_pdf.mjs --url <pdf-or-viewer-url> [--meeting-id <id>] [--out <dir>]
 *   node scripts/extractors/parse_agenda_pdf.mjs --file <local.pdf>  [--meeting-id <id>] [--out <dir>]
 *   node scripts/extractors/parse_agenda_pdf.mjs --plan .sync/plan.json
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { extractPdfLayout, ExtractionError } from "../lib/pdf-layout.mjs";
import { parseAgendaStructure } from "../lib/agenda-structure.mjs";
import { collapseWhitespace, normalizeUrl } from "../lib/canonical.mjs";
import { atomicWrite } from "../lib/atomic.mjs";
import { loadPlan, meetingDirectory } from "../sync/plan.mjs";
import { runIfMain } from "../lib/cli.mjs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MiB cap — agendas are small; bigger means we fetched the wrong thing
const UA = "CivicCheyenne-SyncBot/1.0 (+https://therealwindycity.github.io/TheReelWindyCity/)";

/** Derive a meeting id from a document/viewer URL filename (psc-10-05-26-agenda.pdf). */
export function meetingIdFromUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
    name = rawUrl.split("/").pop() || "";
  }
  const BODY_PREFIXES = {
    psc: "public-services-committee", fc: "finance-committee", ws: "work-sessions",
    cow: "work-sessions", cc: "city-council", pc: "planning-commission", boa: "board-of-adjustment",
  };
  const match = name.match(/^(psc|fc|ws|cow|cc|pc|boa)-(\d{1,2})-(\d{1,2})-(\d{2})/i);
  if (match) {
    const [, prefix, month, day, year] = match;
    const body = BODY_PREFIXES[prefix.toLowerCase()];
    if (body) return `${body}-20${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  }
  return null;
}

/** If the payload is HTML (Granicus AgendaViewer chrome), resolve the real PDF link. */
export function resolvePdfLinkFromHtml(html, baseUrl) {
  const root = parse(html);
  const candidates = [
    ...root.querySelectorAll('a[href$=".pdf" i], a[href*=".pdf?" i]'),
    ...root.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"]'),
    ...root.querySelectorAll("iframe"),
  ];
  const hrefs = candidates
    .map((node) => node.getAttribute("href") || node.getAttribute("src"))
    .filter(Boolean)
    .map((href) => new URL(href, baseUrl).toString());
  // Prefer the city's document host over portal-internal viewers.
  const preferred = hrefs.find((href) => /cheyennecity\.org/i.test(href)) || hrefs.find((href) => /\.pdf(\?|$)/i.test(href));
  return preferred || null;
}

export async function fetchDocument(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "application/pdf,text/html;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) {
      throw new ExtractionError("HTTP_" + response.status, `Fetching agenda failed: HTTP ${response.status} for ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      throw new ExtractionError("TOO_LARGE", `Document is ${Math.round(buffer.length / 1024 / 1024)} MiB (cap ${MAX_BYTES / 1024 / 1024} MiB) — likely the wrong URL`);
    }
    const looksHtml = buffer.subarray(0, 512).toString("latin1").match(/^\s*(<!doctype html|<html)/i);
    if (looksHtml) {
      const html = buffer.toString("utf8");
      const pdfLink = resolvePdfLinkFromHtml(html, response.url || url);
      if (!pdfLink) {
        throw new ExtractionError("NO_PDF_LINK", `Viewer page at ${url} does not link a PDF (portal layout change?) — needs a human look before sync can continue`);
      }
      console.log(`Resolved viewer chrome → ${pdfLink}`);
      return fetchDocument(pdfLink); // one level of indirection is enough for Granicus
    }
    const magic = buffer.subarray(0, 5).toString("latin1");
    if (magic !== "%PDF-") {
      throw new ExtractionError("CORRUPT", `Response from ${url} is neither PDF nor HTML (%PDF magic missing)`);
    }
    return { bytes: new Uint8Array(buffer), sourceUrl: url, finalUrl: response.url || url };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    if (error.name === "AbortError") throw new ExtractionError("TIMEOUT", `Fetching agenda timed out after 45s: ${url}`, error);
    throw new ExtractionError("CORRUPT", `Fetching agenda failed: ${error.message}`, error);
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve meeting ids back into the plan so downstream steps never guess. */
function updatePlan(planPath, results) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  // Plan entries and extraction results are index-aligned (tasks are built 1:1).
  results.forEach((result, index) => {
    const entry = plan.meetings[index];
    if (entry) {
      entry.meetingId = result.meetingId;
      entry.dir = result.dir;
    }
  });
  atomicWrite(planPath, `${JSON.stringify(plan, null, 2)}\n`);
}

async function extractMeeting({ url, file, meetingId, out }) {
  let bytes;
  let sourceUrl;
  if (url) {
    const fetched = await fetchDocument(url);
    bytes = fetched.bytes;
    sourceUrl = fetched.finalUrl;
  } else {
    bytes = new Uint8Array(readFileSync(file));
    sourceUrl = path.resolve(file);
  }

  const layout = await extractPdfLayout(bytes); // throws typed ExtractionError on any failure
  const structured = parseAgendaStructure(layout.pages);
  const id = meetingId || meetingIdFromUrl(sourceUrl) || `unresolved-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 8)}`;
  if (!meetingId && !meetingIdFromUrl(sourceUrl)) {
    console.warn(`::warning::Could not derive a meeting id from ${sourceUrl}; using "${id}". Pass --meeting-id for a stable directory name.`);
  }

  const targetDir = out || meetingDirectory(id);
  const document = {
    meetingId: id,
    sourceUrl,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    fetchedAt: new Date().toISOString(),
    extraction: { engine: "layout-aware/pdfjs-geom-v1", pageCount: layout.pageCount },
    pages: layout.pageCount,
    pageTexts: layout.pages.map((page) => ({ pageNumber: page.pageNumber, width: page.width, height: page.height, text: page.text })),
    text: layout.text,
    items: structured.items,
    sections: structured.sections.map((section) => ({ heading: section.heading, items: section.items.map((item) => item.number) })),
  };

  atomicWrite(path.join(targetDir, "agenda.json"), `${JSON.stringify(document, null, 2)}\n`);
  atomicWrite(path.join(targetDir, "agenda.txt"), `${layout.text}\n`);

  const consent = document.items.filter((item) => item.consent).length;
  console.log(
    `✓ ${id}: ${document.pages} page(s), ${document.items.length} items (${consent} consent) → ${targetDir}`,
  );
  return { meetingId: id, dir: targetDir, items: document.items.length };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const planPath = flag("--plan");

  let tasks = [];
  if (planPath) {
    const plan = loadPlan(planPath);
    tasks = plan.meetings.map((meeting) => ({
      url: meeting.url,
      file: meeting.file, // offline/forensic plan entries may point at a local copy
      meetingId: meeting.meetingId || undefined,
    }));
  } else {

    const url = flag("--url");
    const file = flag("--file");
    if (!url && !file) {
      console.error("usage: parse_agenda_pdf.mjs (--url <u> | --file <f> | --plan <p>) [--meeting-id <id>] [--out <dir>]");
      process.exit(2);
    }
    tasks = [{ url, file, meetingId: flag("--meeting-id") || undefined, out: flag("--out") }];
  }

  const results = [];
  for (const task of tasks) {
    try {
      results.push(await extractMeeting(task));
    } catch (error) {
      if (error instanceof ExtractionError) {
        console.error(`✗ ${task.url || task.file}: [${error.code}] ${error.message}`);
        console.error("  Extraction failed — no artifacts written; the sync job stops here (no commit).");
        // Surface the code and message as a run annotation. The step log lives
        // behind the Actions log download, which is not always reachable; an
        // annotation carries the reason where a blocked reader can see it.
        console.error(`::error title=Agenda extraction failed [${error.code}]::${error.message}`);
      } else {
        console.error(`✗ ${task.url || task.file}: ${error.stack || error}`);
        console.error(`::error title=Agenda extraction crashed::${String(error?.message ?? error).slice(0, 900)}`);
      }
      process.exit(1); // hard stop: never continue the chain after a failed extraction (OM3#2)
    }
  }
  // Write resolved meeting ids/dirs back into the plan so the analyzer, drafter
  // and validator all operate on exactly what was extracted.
  if (planPath) updatePlan(planPath, results);
  console.log(`Extraction complete: ${results.length} meeting(s).`);
}

runIfMain(import.meta.url, main);
