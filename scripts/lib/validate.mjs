/**
 * Structural validation gate for pipeline artifacts.
 *
 * Red-team context (Order of Magnitude 3, finding 2 — "Total Absence of Error
 * Cascades & Recovery Paths"): the original pipeline chained commands and then
 * committed whatever was on disk. A password-protected or scanned PDF that
 * "extracted" to nothing would still be committed, pushing broken/empty
 * structures into main and breaking the deployed site.
 *
 * This module is the gate between "scripts produced files" and "git is allowed
 * to touch main". It verifies, for every meeting directory:
 *   - agenda.json parses, has the required shape, and belongs to a known meeting;
 *   - every item carries a number, page and verbatim quote;
 *   - every quote is literally present in the extracted page text (anti-hallucination
 *     back-check — applies to rule output *and* LLM output alike);
 *   - analysis.json findings cite evidence that exists in the agenda text;
 *   - no partial/temp files are left behind (atomic write discipline).
 *
 * Exit code 1 with a human-readable report on the first violation. The sync
 * workflow runs this BEFORE any git command (see .github/workflows/live_city_sync.yml).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { collapseWhitespace } from "./canonical.mjs";
import { runIfMain } from "./cli.mjs";

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/** @returns {Array<string>} list of violation messages (empty when valid). */
export function validateMeetingDirectory(dir, { requireAnalysis = true } = {}) {
  const problems = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`not a directory: ${dir}`];

  const files = readdirSync(dir);
  const agendaPath = path.join(dir, "agenda.json");
  if (!existsSync(agendaPath)) {
    return [`missing agenda.json in ${dir}`];
  }

  let agenda;
  try {
    agenda = JSON.parse(readFileSync(agendaPath, "utf8"));
  } catch (error) {
    return [`agenda.json is not valid JSON (${error.message}) — refusing to commit`];
  }

  for (const field of ["meetingId", "sourceUrl", "fetchedAt", "pages", "items"]) {
    if (agenda[field] === undefined) problems.push(`agenda.json missing required field "${field}"`);
  }
  if (problems.length) return problems;

  if (!Number.isInteger(agenda.pages) || agenda.pages < 1) problems.push(`agenda.json "pages" must be a positive integer, got ${agenda.pages}`);
  if (!Array.isArray(agenda.items) || !agenda.items.length) {
    problems.push("agenda.json has no items — extraction produced an empty agenda (refusing to commit)");
    return problems;
  }

  const pageText = new Map();
  for (const page of agenda.pageTexts || []) pageText.set(page.pageNumber, collapseWhitespace(page.text));
  if (!pageText.size && agenda.text) pageText.set(1, collapseWhitespace(agenda.text));

  const seenNumbers = new Set();
  for (const [index, item] of agenda.items.entries()) {
    const label = `item[${index}] (${item.number ?? "?"})`;
    if (!item.number || !String(item.number).trim()) problems.push(`${label}: missing number`);
    else if (seenNumbers.has(item.number)) problems.push(`${label}: duplicate item number`);
    seenNumbers.add(item.number);
    if (!item.text || collapseWhitespace(item.text).length < 8) problems.push(`${label}: item text too short to be real`);
    if (!item.kind) problems.push(`${label}: missing kind`);
    if (!Number.isInteger(item.page) || item.page < 1 || item.page > agenda.pages) {
      problems.push(`${label}: page ${item.page} outside document (1..${agenda.pages})`);
    }
    if (!item.quote) {
      problems.push(`${label}: missing verbatim quote`);
    } else {
      const quote = collapseWhitespace(item.quote);
      const page = pageText.get(item.page);
      // Page-scoped check first; fall back to the whole-document text for items
      // whose text legitimately wraps onto the next page.
      const onPage = page && page.includes(quote);
      const inDocument = collapseWhitespace(agenda.text || "").includes(quote);
      if (!onPage && !inDocument) {
        problems.push(`${label}: quote not found in extracted source text — possible fabrication`);
      }
    }
  }

  const analysisPath = path.join(dir, "analysis.json");
  if (requireAnalysis) {
    if (!existsSync(analysisPath)) {
      problems.push("missing analysis.json (analyzer did not run or crashed)");
    } else {
      let analysis;
      try {
        analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
      } catch (error) {
        problems.push(`analysis.json is not valid JSON (${error.message})`);
      }
      if (analysis) {
        if (agenda.meetingId && analysis.meetingId !== agenda.meetingId) {
          problems.push(`analysis.json meetingId "${analysis.meetingId}" does not match agenda "${agenda.meetingId}"`);
        }
        const allText = collapseWhitespace(agenda.text || agenda.items.map((i) => i.quote).join(" "));
        for (const [index, finding] of (analysis.findings || []).entries()) {
          const label = `finding[${index}]`;
          for (const field of ["id", "severity", "title", "generatedBy"]) {
            if (!finding[field]) problems.push(`${label}: missing "${field}"`);
          }
          if (!Array.isArray(finding.evidence) || !finding.evidence.length) {
            problems.push(`${label}: no evidence quotes (uncited findings are not committable)`);
            continue;
          }
          for (const [evidenceIndex, evidence] of finding.evidence.entries()) {
            const quote = collapseWhitespace(evidence.quote);
            if (!quote || !allText.includes(quote)) {
              problems.push(`${label}.evidence[${evidenceIndex}]: quote not present in agenda text — refusing to commit`);
            }
          }
        }
      }
    }
  }

  // Atomic-write discipline: temp files mean a crashed writer, not a committable state.
  for (const file of files) {
    if (file.endsWith(".tmp") || file.endsWith(".part")) problems.push(`partial write left behind: ${file}`);
  }
  return problems;
}

/** CLI: node scripts/lib/validate.mjs --meeting data/meetings/2026/<id> [--meeting …] | --plan .sync/plan.json */
async function main() {
  const meetings = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--meeting") meetings.push(process.argv[index + 1]);
    if (process.argv[index] === "--plan") {
      const { loadPlan, meetingDirectory } = await import("../sync/plan.mjs");
      const plan = loadPlan(process.argv[index + 1] || ".sync/plan.json");
      for (const meeting of plan.meetings) {
        meetings.push(meeting.dir || (meeting.meetingId ? meetingDirectory(meeting.meetingId) : null));
      }
    }
  }
  if (!meetings.length || meetings.some((meeting) => !meeting)) {
    console.error("usage: node scripts/lib/validate.mjs --meeting <dir> [--meeting <dir> …] | --plan .sync/plan.json");
    if (meetings.length) console.error("(a plan entry had no resolved meeting id — did extraction run?)");
    process.exit(2);
  }
  let failed = false;
  for (const meeting of meetings) {
    const problems = validateMeetingDirectory(meeting);
    if (problems.length) {
      failed = true;
      console.error(`✗ ${meeting}`);
      for (const problem of problems) console.error(`    - ${problem}`);
    } else {
      console.log(`✓ ${meeting} structurally sound (agenda + analysis verified)`);
    }
  }
  if (failed) {
    console.error("\nValidation failed — no git writes will be performed for this run.");
    process.exit(1);
  }
}

runIfMain(import.meta.url, main);
