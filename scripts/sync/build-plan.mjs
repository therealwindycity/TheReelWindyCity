#!/usr/bin/env node
/**
 * Build the sync plan from trigger payloads (repository_dispatch OR workflow_call).
 *
 * Red-team context (Order of Magnitude 3, finding 1 — "The Payload Variable
 * Mismatch"): repository_dispatch custom data lives FLAT under
 * `github.event.client_payload.*`. The original workflow referenced
 * `github.event.client_payload.payload.pdf_source_url`, which silently evaluates
 * to empty and crashes the extractor with `--url ""`.
 *
 * This step is the single place where the payload contract is enforced:
 *   - flat keys win:  client_payload.pdf_source_url / pdf_source_urls
 *   - the legacy nested `client_payload.payload.*` shape is tolerated with a loud
 *     deprecation warning (graceful migration instead of a crash), and
 *   - a missing/empty payload fails fast with the documented contract — never an
 *     empty-URL run that "succeeds" and commits nothing.
 *
 * Security note: the workflow passes payload values into this script through
 * environment variables (never inline `${{ }}` inside run:) which removes the
 * expression-injection vector of interpolated run scripts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SYNC_DIR, PLAN_FILE } from "./plan.mjs";
import { runIfMain } from "../lib/cli.mjs";

function splitList(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function main() {
  const flatUrls = [...splitList(process.env.PDF_SOURCE_URLS), ...splitList(process.env.PDF_SOURCE_URL)].filter(Boolean);
  const legacyUrls = splitList(process.env.LEGACY_NESTED_URL);
  const meetingIds = splitList(process.env.MEETING_IDS);
  const reason = (process.env.SYNC_REASON || "repository-dispatch").trim();
  const itemId = (process.env.ITEM_ID || "").trim();

  if (!flatUrls.length && legacyUrls.length) {
    console.warn(
      "::warning::Dispatch payload used the deprecated nested shape " +
        "(client_payload.payload.pdf_source_url). The contract is FLAT: " +
        'client_payload.pdf_source_url / pdf_source_urls. Update the sender; support for the ' +
        "nested shape is temporary.",
    );
  }
  const urls = flatUrls.length ? flatUrls : legacyUrls;
  if (!urls.length) {
    console.error(
      [
        "No agenda URLs in payload — refusing to build an empty plan.",
        "",
        "repository_dispatch contract (flat client_payload):",
        JSON.stringify(
          {
            event_type: "MUNICIPAL_AGENDA_ALTERATION",
            client_payload: {
              pdf_source_url: "https://…/psc-10-05-26-agenda.pdf",
              pdf_source_urls: "url1,url2 (optional, batch form)",
              meeting_id: "public-services-committee-2026-10-05 (optional)",
              meeting_ids: "id1,id2 (optional, batch form)",
              item_id: "15 (optional focus item)",
              reason: "lambda-watch (optional)",
            },
          },
          null,
          2,
        ),
      ].join("\n"),
    );
    process.exit(1);
  }

  // Pair urls with meeting ids positionally when provided; duplicates collapse.
  const seen = new Set();
  const meetings = [];
  urls.forEach((url, index) => {
    if (seen.has(url)) return;
    seen.add(url);
    meetings.push({ url, meetingId: meetingIds[index] || null, itemId: index === 0 && itemId ? itemId : null });
  });
  if (meetingIds.length && meetingIds.length < meetings.length) {
    console.warn(`::warning::${meetingIds.length} meeting ids for ${meetings.length} urls — unmatched urls will derive their id from the document name.`);
  }

  const plan = { reason, createdAt: new Date().toISOString(), meetings };
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Plan: ${meetings.length} meeting(s) — ${meetings.map((m) => m.meetingId || path.basename(new URL(m.url).pathname)).join(", ")}`);
}

runIfMain(import.meta.url, main);
