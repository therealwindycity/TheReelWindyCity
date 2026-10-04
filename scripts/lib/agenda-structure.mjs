/**
 * Agenda grammar: turn layout-aware extracted lines into structured agenda items.
 *
 * Calibrated against the real Cheyenne agenda grammar (see
 * public/sources/2026-01-26-agenda.html and the posted October 2026 committee
 * agendas indexed in src/data/official-meetings.json):
 *
 *   6.  ORDINANCE –3rd READING – Creating Chapter 1.28, Administrative Inspection
 *       Warrants, … (PUBLIC SERVICES COMMITTEE)
 *   ACTION: Refer to Public Services Committee
 *   Supporting Document
 *
 * Item kinds follow the site's snapshot vocabulary ("Ordinance · 3rd reading",
 * "Resolution", "Leases / Contracts / Legal", …). Section context (e.g. a
 * "LEASES / CONTRACTS / LEGAL" heading) supplies the kind when the item itself
 * carries no ORDINANCE/RESOLUTION prefix.
 *
 * Anti-hallucination contract: every item keeps a verbatim `quote` assembled from
 * the extracted text and the `page` it was found on. scripts/lib/validate.mjs
 * re-checks that each quote is literally present in the source text before any
 * commit is allowed, so downstream analysis (rules or LLM) can never cite text
 * that does not exist in the document.
 */

import { collapseWhitespace } from "./canonical.mjs";

const READING_STAGES = { "1st": "1st reading", "2nd": "2nd reading", "3rd": "3rd reading" };

/** Headings that change section context. Matched on the raw line text. */
const SECTION_HEADINGS = [
  [/consent agenda/i, "Consent Agenda"],
  [/lease|contract|legal/i, "Leases / Contracts / Legal"],
  [/public hearing/i, "Public Hearing"],
  [/appointment/i, "Appointments"],
  [/communication/i, "Communications"],
  [/old business|new business/i, "Business"],
];

const ITEM_PREFIX_KINDS = [/^ordinance\b/i, /^resolution\b/i, /^minutes\b/i];

/** Does this line look like a known section heading (short, unnumbered, matches the list)? */
function knownSectionHeading(text) {
  if (!text || text.length > 80) return null;
  if (!/^[A-Z0-9][A-Z0-9\s.,/&§–—-]*$/.test(text)) return null;
  for (const [pattern, label] of SECTION_HEADINGS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * Parse the start of a numbered agenda item.
 * Returns { number, kind, rest, consent } or null when the line is not an item start.
 */
function parseItemStart(lineText) {
  const match = lineText.match(/^(\d{1,3})([a-z])?[.)]?\s+(.*)$/);
  if (!match) return null;
  const [, number, sub, rest0] = match;
  let rest = collapseWhitespace(rest0);
  if (!rest || ITEM_PREFIX_KINDS.every((pattern) => !pattern.test(rest)) && !/^\[?C\.?A\.?\]|\bMINUTES\b|\bAPPOINT|\bPUBLIC HEARING/i.test(rest)) {
    // Heuristic guard: Cheyenne items virtually always open with a known prefix or a
    // [CA] marker. Anything else numbered is still accepted (returns below) — this
    // guard only rejects page artifacts like "2026 January 26".
    if (/^\d/.test(rest)) return null;
  }

  let consent = false;
  const caMatch = rest.match(/^\[(CA|C\.A\.)\]\s*(.*)$/i);
  if (caMatch) {
    consent = true;
    rest = caMatch[2];
  }

  let kind = null;
  const ordinance = rest.match(/^ORDINANCE\s*[–—-]+\s*(1st|2nd|3rd)\s+READING\s*[–—-]+\s*(.*)$/i);
  if (ordinance) {
    kind = `Ordinance · ${READING_STAGES[ordinance[1].toLowerCase()]}`;
    rest = ordinance[2];
  } else {
    const resolution = rest.match(/^RESOLUTION\s*(?:No\.?\s*\d+)?\s*[–—-]*\s*(.*)$/i);
    if (resolution) {
      kind = "Resolution";
      rest = resolution[1];
    } else if (/^MINUTES\b/i.test(rest)) {
      kind = "Minutes";
    }
  }
  return { number: sub ? `${number}${sub}` : number, kind, rest, consent };
}

/**
 * Structure an agenda from layout-aware reading lines.
 * @param {Array<{pageNumber: number, readingLines: Array<{y:number,text:string,columnBreak?:boolean}>}>} pages
 * @returns {{sections: Array<{heading: string, items: Array<object>}>, items: Array<object>}}
 */
export function parseAgendaStructure(pages) {
  const sections = [];
  let currentSection = { heading: "Agenda", kindBySection: null, items: [] };
  sections.push(currentSection);
  let item = null;
  let actionBuffer = [];

  const flushAction = () => {
    if (item && actionBuffer.length) item.action = collapseWhitespace(actionBuffer.join(" "));
    actionBuffer = [];
  };

  for (const page of pages) {
    for (const line of page.readingLines) {
      const text = collapseWhitespace(line.text);
      if (!text) continue;

      // A column break ends the current reading flow: an item open in the left
      // column must never swallow a heading from the right column.
      if (line.columnBreak) {
        flushAction();
        item = null;
      }

      if (/^ACTION\s*:/i.test(text)) {
        actionBuffer.push(text.replace(/^ACTION\s*:\s*/i, ""));
        continue;
      }
      if (/^(supporting document|additional information|page \d+)/i.test(text)) continue; // document chrome

      const start = parseItemStart(text);
      if (start) {
        flushAction();
        item = {
          number: start.number,
          kind: start.kind,
          consent: start.consent,
          section: currentSection.heading,
          page: page.pageNumber,
          text: start.rest,
          quote: text,
        };
        if (currentSection.heading === "Consent Agenda") item.consent = true;
        currentSection.items.push(item);
        continue;
      }

      const heading = knownSectionHeading(text);
      if (heading && !item) {
        currentSection = { heading, kindBySection: heading, items: [] };
        sections.push(currentSection);
        continue;
      }

      if (item) {
        // Wrapped continuation of the current item's text.
        item.text = collapseWhitespace(`${item.text} ${text}`);
        item.quote = collapseWhitespace(`${item.quote} ${text}`);
      } else if (heading) {
        currentSection = { heading, kindBySection: heading, items: [] };
        sections.push(currentSection);
      }
    }
  }
  flushAction();

  for (const section of sections) {
    for (const agendaItem of section.items) {
      if (!agendaItem.kind) agendaItem.kind = section.kindBySection || "Other";
      if (agendaItem.consent === undefined) agendaItem.consent = false;
      // Committee sponsor in trailing parentheses is surfaced but never stripped
      // from the verbatim quote.
      const sponsor = agendaItem.text.match(
        /\((PUBLIC SERVICES COMMITTEE|FINANCE COMMITTEE|COMMITTEE OF THE WHOLE|SPONSORS?[^)]*)\)\s*$/i,
      );
      if (sponsor) agendaItem.sponsor = collapseWhitespace(sponsor[1]);
    }
  }

  return { sections: sections.filter((section) => section.items.length || section.heading !== "Agenda"), items: sections.flatMap((s) => s.items) };
}
