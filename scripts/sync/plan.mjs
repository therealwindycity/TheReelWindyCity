/**
 * Sync plan loading/sharing.
 *
 * The sync pipeline converges two very different triggers onto one job:
 *   - repository_dispatch (external watcher / Lambda) with a flat client_payload,
 *   - workflow_call from the in-repo scheduled watcher (live_city_watch.yml).
 * scripts/sync/build-plan.mjs normalizes both into .sync/plan.json, and every
 * downstream CLI consumes the same plan file. That keeps trigger plumbing out of
 * the extractors/analyzers (single responsibility, testable without GitHub).
 *
 * Plan shape:
 *   {
 *     "reason": "scheduled-watch",
 *     "createdAt": "2026-10-04T…Z",
 *     "meetings": [ { "url": "…", "meetingId": "public-services-committee-2026-10-05", "itemId": "15" } ]
 *   }
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SYNC_DIR = ".sync";
export const PLAN_FILE = path.join(SYNC_DIR, "plan.json");

/** Data root for pipeline artifacts (deliberately OUTSIDE src/data — see docs). */
export const DATA_ROOT = path.join("data", "meetings");

/** Meeting id → pipeline artifact directory (data/meetings/<year>/<meeting-id>). */
export function meetingDirectory(meetingId, { year } = {}) {
  const yearMatch = String(meetingId).match(/(\d{4})-\d{2}-\d{2}/);
  const resolvedYear = year || (yearMatch ? yearMatch[1] : String(new Date().getUTCFullYear()));
  return path.join(DATA_ROOT, resolvedYear, meetingId);
}

/** Load and structurally check a plan file. */
export function loadPlan(planPath = PLAN_FILE) {
  if (!existsSync(planPath)) {
    throw new Error(`plan file not found: ${planPath} (run scripts/sync/build-plan.mjs first)`);
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(planPath, "utf8"));
  } catch (error) {
    throw new Error(`plan file is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(plan.meetings) || !plan.meetings.length) {
    throw new Error('plan file has no meetings[] — nothing to sync (this should have failed in build-plan)');
  }
  for (const meeting of plan.meetings) {
    const hasUrl = typeof meeting.url === "string" && /^https?:\/\//i.test(meeting.url);
    const hasFile = typeof meeting.file === "string" && meeting.file.length > 0; // offline/forensic path
    if (!hasUrl && !hasFile) {
      throw new Error(`plan meeting entry needs an http(s) url or a local file: ${JSON.stringify(meeting)}`);
    }
  }
  return plan;
}
