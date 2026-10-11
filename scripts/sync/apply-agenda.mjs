#!/usr/bin/env node
/**
 * Apply VALIDATED pipeline extractions to the site snapshot
 * (src/data/official-meetings.json).
 *
 * Why this script exists (the "sync succeeds but the site never changes" gap):
 * the sync pipeline deliberately commits its raw artifacts under data/ and NOT
 * src/data/ (OM1#1b — a bad sync must never break the deployed site). But the
 * static build only reads src/data/official-meetings.json, so before this step
 * existed a fully successful sync updated nothing the public site displays.
 * This script is the validated bridge: it runs AFTER the validator gate and
 * BEFORE the guarded commit, so only checked data can reach the snapshot.
 *
 * For every plan meeting it:
 *   1. reads the validated data/meetings/<year>/<meeting-id>/agenda.json,
 *   2. updates (or creates) that meeting's entry in the snapshot's `upcoming`
 *      array with the transcribed items and the official source link — never
 *      inventing Zoom details or locations the extraction does not contain,
 *   3. moves entries whose date has passed (city time) into `posted`, keeping
 *      the `upcoming` array a true forward calendar, so the site's date gate
 *      and the watcher's future-only baseline agree with the file on disk.
 *
 * Fail-closed: any missing artifact or malformed meeting id exits non-zero and
 * the workflow stops before a single git command runs (OM3#2).
 *
 * Usage: node scripts/sync/apply-agenda.mjs --plan .sync/plan.json
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { atomicWrite } from "../lib/atomic.mjs";
import { runIfMain } from "../lib/cli.mjs";
import { cheyenneTodayISO, displayTime, isUpcomingDate } from "../lib/upcoming-merge.mjs";
import { loadPlan, meetingDirectory } from "./plan.mjs";

const SNAPSHOT = path.join("src", "data", "official-meetings.json");
const DETECTED = path.join("src", "data", "detected-upcoming.json");

/** Site body labels — mirrors build-data.mjs BODY_LABELS for the sync-able bodies. */
const BODY_LABELS = {
  "city-council": "City Council",
  "finance-committee": "Finance Committee",
  "public-services-committee": "Public Services Committee",
  "planning-commission": "Planning Commission",
  "board-of-adjustment": "Board of Adjustment",
  "historic-preservation-board": "Historic Preservation Board",
  "urban-renewal-authority": "Urban Renewal Authority",
  "work-sessions": "Work Sessions",
};

export function parseMeetingId(meetingId) {
  const match = String(meetingId || "").match(/^([a-z0-9-]+)-(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return { body: match[1], date: match[2] };
}

function weekdayLabel(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Posted time for a meeting according to the watcher's last detection, if any. */
function detectedTime(body, date) {
  if (!existsSync(DETECTED)) return undefined;
  try {
    const detected = JSON.parse(readFileSync(DETECTED, "utf8"));
    const record = (detected.meetings || []).find((meeting) => meeting.body === body && meeting.date === date);
    return record?.time ? displayTime(record.time) : undefined;
  } catch {
    return undefined;
  }
}

/** Public item shape used across the site (verbatim text from the posted agenda). */
function toPublicItems(items) {
  return items.map((item) => ({ number: String(item.number), kind: item.kind || "Other", text: item.text }));
}

/**
 * Pure core, separated from I/O for tests: returns a NEW snapshot with the
 * extraction applied. `agenda` is a validated agenda.json document.
 */
export function applyToSnapshot(snapshot, agenda, { todayISO = cheyenneTodayISO() } = {}) {
  const parsed = parseMeetingId(agenda.meetingId);
  if (!parsed) throw new Error(`unusable meeting id in agenda.json: "${agenda.meetingId}"`);
  const { body, date } = parsed;
  const bodyLabel = BODY_LABELS[body];
  if (!bodyLabel) throw new Error(`meeting id "${agenda.meetingId}" names an unknown body "${body}" — refusing to guess its public label`);

  const items = toPublicItems(agenda.items || []);
  if (!items.length) throw new Error(`agenda.json for ${agenda.meetingId} has no items — nothing to apply`);
  const sourceUrl = agenda.sourceUrl;
  const isGranicus = /granicus\.com/i.test(sourceUrl);

  const next = {
    ...snapshot,
    upcoming: [...(snapshot.upcoming || [])],
    posted: [...(snapshot.posted || [])],
  };

  // 1. Apply the extraction to the upcoming entry (create it when absent).
  const index = next.upcoming.findIndex((entry) => entry.body === body && entry.date === date);
  if (index >= 0) {
    const entry = { ...next.upcoming[index], items };
    if (isGranicus) entry.granicusUrl = sourceUrl;
    else entry.agendaPath = sourceUrl;
    if (!entry.time) {
      const time = detectedTime(body, date);
      if (time) entry.time = time;
    }
    next.upcoming[index] = entry;
  } else {
    const entry = {
      id: agenda.meetingId,
      body,
      bodyLabel,
      date,
      dayLabel: weekdayLabel(date),
      ...(detectedTime(body, date) ? { time: detectedTime(body, date) } : {}),
      ...(isGranicus ? { granicusUrl: sourceUrl } : { agendaPath: sourceUrl }),
      items,
    };
    next.upcoming.push(entry);
  }

  // 2. Keep `upcoming` a forward calendar: entries whose date has passed move
  //    to `posted` (deduped; an existing posted entry wins — it may already
  //    carry richer curated data). Data is never deleted, only relocated.
  const stillUpcoming = [];
  for (const entry of next.upcoming) {
    if (isUpcomingDate(entry.date, todayISO)) {
      stillUpcoming.push(entry);
      continue;
    }
    if (!next.posted.some((postedEntry) => postedEntry.body === entry.body && postedEntry.date === entry.date)) {
      next.posted.push(entry);
    }
  }
  next.upcoming = stillUpcoming;

  return next;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const planPath = flag("--plan");
  if (!planPath) {
    console.error("usage: apply-agenda.mjs --plan <plan.json>");
    process.exit(2);
  }

  const plan = loadPlan(planPath);
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  let snapshotModified = false;

  for (const meeting of plan.meetings) {
    const meetingId = meeting.meetingId;
    if (!meetingId) {
      throw new Error(`plan entry has no resolved meetingId (extraction must run first): ${meeting.url}`);
    }
    const dir = meeting.dir || meetingDirectory(meetingId);
    const agendaPath = path.join(dir, "agenda.json");
    if (!existsSync(agendaPath)) {
      throw new Error(`missing validated agenda.json for ${meetingId} (expected ${agendaPath}) — run the extractor and validator first`);
    }
    const agenda = JSON.parse(readFileSync(agendaPath, "utf8"));
    if (agenda.meetingId !== meetingId) {
      throw new Error(`agenda.json meetingId mismatch: expected ${meetingId}, found ${agenda.meetingId}`);
    }

    const before = JSON.stringify(pickCalendar(snapshot));
    const updated = applyToSnapshot(snapshot, agenda);
    if (JSON.stringify(pickCalendar(updated)) !== before) snapshotModified = true;
    Object.assign(snapshot, updated);
    console.log(`✓ ${meetingId}: ${agenda.items.length} item(s) applied to ${SNAPSHOT}`);
  }

  if (!snapshotModified) {
    console.log("Snapshot calendar already up to date — no changes to write.");
    return;
  }
  atomicWrite(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Updated ${SNAPSHOT}.`);
}

/** Calendar fields this script may change — used for the "did anything change" check. */
function pickCalendar(snapshot) {
  return { upcoming: snapshot.upcoming ?? [], posted: snapshot.posted ?? [] };
}

runIfMain(import.meta.url, main);
