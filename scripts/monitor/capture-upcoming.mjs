#!/usr/bin/env node
/**
 * Forensic capture of the city's live upcoming-meetings portal.
 *
 * Read-only diagnostic companion to scripts/monitor/upcoming-meetings.mjs.
 * Where the watcher reduces the portal to semantic records and hashes them,
 * this tool ALSO keeps the raw evidence: the exact table records, plus, for
 * every linked agenda viewer page, the raw HTML and an inventory of every
 * link/frame/embed it contains.
 *
 * It exists because the sync pipeline's extraction step (which resolves a
 * Granicus AgendaViewer page to the underlying agenda PDF) had been failing
 * with no artifacts to inspect — the blocked change marker recorded THAT the
 * document ingestion failed, never WHY. Running this workflow once produces
 * the viewer pages a human needs to fix the resolver.
 *
 * Output (default data/forensic/<utc-stamp>/, all disposable, nothing committed):
 *   upcoming-records.json     semantic table records (same parser as the watcher)
 *   capture-summary.md        human-readable report (also appended to $GITHUB_STEP_SUMMARY)
 *   viewer-<n>.html           raw viewer page (capped)
 *   viewer-<n>-report.json    link/frame inventory + PDF-candidate analysis
 *   viewer-<n>.pdf            saved directly when a viewer URL IS a PDF
 *
 * Exit codes: 0 = captured (any number of viewer fetch failures — recorded,
 * never fatal); 1 = the portal itself could not be parsed/fetched (fail closed,
 * same contract as the watcher).
 *
 * Usage: node scripts/monitor/capture-upcoming.mjs [--url <u>] [--out-dir <dir>] [--viewer-limit <n>]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { extractUpcomingRecords } from "../lib/upcoming-table.mjs";
import { runIfMain } from "../lib/cli.mjs";

const DEFAULT_URL = "https://cheyenne.granicus.com/ViewPublisher.php?view_id=5&widget=upcoming";
const UA = "CivicCheyenne-Forensics/1.0 (automated change detection diagnostics; +https://therealwindycity.github.io/TheReelWindyCity/)";
const FETCH_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 6_000];
const MAX_HTML_BYTES = 512 * 1024;
const VIEWER_TIMEOUT_MS = 45_000;

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function fetchBuffer(url, { accept } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VIEWER_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": UA, accept: accept || "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { bytes: Buffer.from(await response.arrayBuffer()), finalUrl: response.url || url };
    } catch (error) {
      lastError = error.name === "AbortError" ? new Error(`timeout after ${VIEWER_TIMEOUT_MS / 1000}s`) : error;
      if (attempt < FETCH_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

/** All resource references in a viewer page, categorized the way the resolver sees them. */
export function inventoryReferences(html, baseUrl) {
  const root = parse(html);
  const hrefs = [];
  for (const node of root.querySelectorAll("a")) {
    const href = node.getAttribute("href");
    if (href) hrefs.push({ tag: "a", href, text: (node.textContent || "").trim().slice(0, 80) });
  }
  for (const selector of ["iframe", "embed", "object", "frame"]) {
    for (const node of root.querySelectorAll(selector)) {
      const source = node.getAttribute("src") || node.getAttribute("data") || node.getAttribute("href");
      if (source) hrefs.push({ tag: selector, href: source, text: "" });
    }
  }
  const resolved = hrefs.map((entry) => {
    try {
      return { ...entry, absolute: new URL(entry.href, baseUrl).toString() };
    } catch {
      return { ...entry, absolute: entry.href };
    }
  });
  // Raw regex sweep too: resolver-relevant URLs sometimes live in inline JS.
  const rawPdfMatches = [...html.matchAll(/https?:\/\/[^"'\s<>\\]+?\.pdf(?:\?[^"'\s<>\\]*)?/gi)].map((match) => match[0]);
  return { references: resolved, rawPdfUrls: [...new Set(rawPdfMatches)] };
}

function summarizeViewer(report) {
  const lines = [];
  lines.push(`- resolved to: \`${report.finalUrl}\``);
  lines.push(`- content-type sniff: \`${report.sniff}\``);
  if (report.kind === "pdf") {
    lines.push(`- **the viewer URL is already a PDF** (${report.bytes} bytes) — extraction should work; check the sync logs for a different URL`);
  } else {
    const pdfLinks = report.references.filter((entry) => /\.pdf(\?|$)/i.test(entry.absolute));
    const frames = report.references.filter((entry) => ["iframe", "frame", "embed", "object"].includes(entry.tag));
    lines.push(`- links total: ${report.references.length}; direct .pdf links: ${pdfLinks.length}; frames/embeds: ${frames.length}`);
    for (const entry of pdfLinks.slice(0, 10)) lines.push(`  - pdf link: \`${entry.absolute}\``);
    for (const entry of frames.slice(0, 10)) lines.push(`  - frame/embed: <${entry.tag}> \`${entry.absolute}\``);
    for (const url of report.rawPdfUrls.slice(0, 10)) lines.push(`  - raw pdf url in markup/script: \`${url}\``);
    if (!pdfLinks.length && !frames.length && !report.rawPdfUrls.length) {
      lines.push("- **no pdf link, frame, or embed found — this is why resolvePdfLinkFromHtml fails (NO_PDF_LINK)**");
    }
  }
  return lines.join("\n");
}

async function main() {
  const url = flag("--url") || DEFAULT_URL;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = flag("--out-dir") || path.join("data", "forensic", stamp);
  const viewerLimit = Number(flag("--viewer-limit") || 6);
  mkdirSync(outDir, { recursive: true });

  const summaryLines = ["# Granicus upcoming-portal forensic capture", "", `Source: \`${url}\``, ""];

  process.stdout.write(`Fetching ${url} …\n`);
  const table = await fetchBuffer(url, { accept: "text/html,application/xhtml+xml" });
  const html = table.bytes.toString("utf8");
  writeFileSync(path.join(outDir, "upcoming-page.html"), html.slice(0, MAX_HTML_BYTES));

  const records = extractUpcomingRecords(html); // throws ENO_TABLE/ENO_ROWS — fail closed
  writeFileSync(path.join(outDir, "upcoming-records.json"), `${JSON.stringify({ checkedAt: new Date().toISOString(), source: url, records }, null, 2)}\n`);
  summaryLines.push(`## Detected table records (${records.length})`, "", "| body | date | time | agenda url |", "| --- | --- | --- | --- |");
  for (const record of records) {
    summaryLines.push(`| ${record.bodyLabel} | ${record.date} | ${record.time || "—"} | \`${record.agendaUrl || "—"}\` |`);
  }
  summaryLines.push("");

  const viewerUrls = [...new Set(records.map((record) => record.agendaUrl).filter(Boolean))]
    .map((agendaUrl) => {
      // The portal emits protocol-relative links; fetch() needs absolute ones.
      try {
        return new URL(agendaUrl, url).toString();
      } catch {
        return agendaUrl;
      }
    })
    .slice(0, viewerLimit);
  summaryLines.push(`## Agenda viewer pages (${viewerUrls.length} captured)`);
  let index = 0;
  for (const viewerUrl of viewerUrls) {
    index += 1;
    summaryLines.push("", `### viewer-${index}`, "", `- source record link: \`${viewerUrl}\``);
    try {
      const fetched = await fetchBuffer(viewerUrl);
      const bytes = fetched.bytes;
      const sniff = bytes.subarray(0, 5).toString("latin1");
      const baseName = path.join(outDir, `viewer-${index}`);
      if (sniff === "%PDF-") {
        writeFileSync(`${baseName}.pdf`, bytes);
        var report = { sourceUrl: viewerUrl, finalUrl: fetched.finalUrl, sniff, kind: "pdf", bytes: bytes.length, references: [], rawPdfUrls: [] };
      } else {
        const viewerHtml = bytes.toString("utf8");
        writeFileSync(`${baseName}.html`, viewerHtml.slice(0, MAX_HTML_BYTES));
        const inventory = inventoryReferences(viewerHtml, fetched.finalUrl);
        report = { sourceUrl: viewerUrl, finalUrl: fetched.finalUrl, sniff: sniff || "(empty)", kind: "html", bytes: bytes.length, ...inventory };
      }
      writeFileSync(`${baseName}-report.json`, `${JSON.stringify(report, null, 2)}\n`);
      summaryLines.push(summarizeViewer(report));
    } catch (error) {
      summaryLines.push(`- **fetch failed:** ${error.message}`);
    }
  }

  const summary = `${summaryLines.join("\n")}\n`;
  writeFileSync(path.join(outDir, "capture-summary.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
  }
  console.log(summary);
  console.log(`\nForensic capture written to ${outDir}`);
}

// Run only when executed directly (never when imported by tests).
runIfMain(import.meta.url, () =>
  main().catch((error) => {
    console.error(`✗ forensic capture failed: ${error.message}`);
    console.error("  Failing closed: the portal could not be read/parsed; nothing was captured.");
    process.exit(1);
  }),
);
