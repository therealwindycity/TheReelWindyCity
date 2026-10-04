/**
 * Upcoming-meetings table extraction (Granicus / CivicPlus "ViewPublisher" widget).
 *
 * Red-team context (Order of Magnitude 1, finding 2): the watcher must never hash
 * markup. This module reduces the page to semantic meeting records — body name,
 * date, time and the agenda link — which scripts/lib/canonical.mjs then normalizes
 * and hashes. Markup churn (class renames, new tracking spans, reordered attributes)
 * cannot produce a false positive because markup never enters the record set.
 *
 * The parser is deliberately structural, not cosmetic: it locates the table whose
 * header row names "Name" / "Date" / "Agenda" and reads rows by *cell meaning*,
 * so a redesign that keeps the columns still parses, and a redesign that drops the
 * columns fails loudly (ENO_TABLE) instead of silently hashing nothing.
 */

import { parse } from "node-html-parser";
import { collapseWhitespace, normalizeDate, normalizeTime, normalizeUrl } from "./canonical.mjs";

/** Display name (Granicus "Name" column) → site body slug (matches build-data.mjs). */
export const BODY_SLUGS = {
  "city council": "city-council",
  "city council meeting": "city-council",
  "special city council meeting": "city-council",
  "finance committee": "finance-committee",
  "public services committee": "public-services-committee",
  "planning commission": "planning-commission",
  "board of adjustment": "board-of-adjustment",
  "historic preservation board": "historic-preservation-board",
  "urban renewal authority": "urban-renewal-authority",
  "work session": "work-sessions",
  "committee of the whole": "work-sessions",
  "board of county commissioners": "board-of-county-commissioners",
};

/** Normalize a Granicus body label to the site slug vocabulary. */
export function bodySlug(name) {
  const label = collapseWhitespace(name).toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (BODY_SLUGS[label]) return BODY_SLUGS[label];
  const hit = Object.entries(BODY_SLUGS).find(([key]) => label.startsWith(key));
  if (hit) return hit[1];
  return label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

/**
 * Parse a date/time cell like "Oct 5, 2026 - 12:00 PM" (Granicus renders the parts
 * separated by <br> tags). Returns { date, time } in canonical form.
 */
export function parseWhenCell(cellText) {
  const text = collapseWhitespace(cellText).replace(/\s*-\s*/g, " ");
  const match = text.match(/^(.*?\d{4})\s+(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)$/i);
  if (match) return { date: normalizeDate(match[1]), time: normalizeTime(match[2]) };
  return { date: normalizeDate(text), time: "" };
}

/**
 * Extract upcoming-meeting records from a Granicus ViewPublisher HTML document.
 * Records contain ONLY semantic fields; ids/classes/scripts never survive this call.
 *
 * @returns {Array<{body: string, bodyLabel: string, date: string, time: string, agendaUrl: string}>}
 * @throws {Error} with code ENO_TABLE when no upcoming table with the expected
 *                 header columns exists (fail loud — never hash an empty page).
 */
export function extractUpcomingRecords(html) {
  const root = parse(html);
  const tables = root.querySelectorAll("table");
  let upcoming = null;
  for (const table of tables) {
    const headerText = collapseWhitespace(table.querySelector("tr")?.textContent || "");
    const lower = headerText.toLowerCase();
    if (lower.includes("name") && lower.includes("date") && lower.includes("agenda") && !lower.includes("duration")) {
      upcoming = table;
      break;
    }
  }
  if (!upcoming) {
    const error = new Error("No upcoming-events table (Name / Date / Agenda columns) found in document");
    error.code = "ENO_TABLE";
    throw error;
  }

  const records = [];
  for (const row of upcoming.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (!cells.length) continue; // header or spacer row
    const nameCell = collapseWhitespace(cells[0]?.textContent);
    if (!nameCell) continue;

    const { date, time } = parseWhenCell(cells[1]?.textContent || "");

    // Agenda link lives in whichever cell contains an <a> whose text is "Agenda".
    let agendaUrl = "";
    for (const cell of cells.slice(2)) {
      const link = cell.querySelectorAll("a").find((a) => /^agenda$/i.test(collapseWhitespace(a.textContent)));
      if (link?.getAttribute("href")) {
        agendaUrl = normalizeUrl(link.getAttribute("href"));
        break;
      }
    }

    records.push({ body: bodySlug(nameCell), bodyLabel: nameCell, date, time, agendaUrl });
  }

  if (!records.length) {
    const error = new Error("Upcoming-events table contained no meeting rows");
    error.code = "ENO_ROWS";
    throw error;
  }
  return records;
}

/**
 * Build the same record shape from the curated snapshot
 * (src/data/official-meetings.json) so the watcher can seed its baseline without
 * touching the network. Keeps field normalization identical to the live path.
 */
export function recordsFromOfficialSnapshot(snapshot) {
  return (snapshot.upcoming || []).map((meeting) => ({
    body: meeting.body,
    bodyLabel: meeting.bodyLabel,
    date: normalizeDate(meeting.date),
    time: normalizeTime(meeting.time),
    agendaUrl: normalizeUrl(meeting.granicusUrl || ""),
  }));
}
