/**
 * Granicus "GeneratedAgendaViewer" HTML agenda → layout-shaped reading lines.
 *
 * Red-team context (the second layer of the wedged sync): the portal's modern
 * agenda page does not link a combined agenda PDF at all. `AgendaViewer.php`
 * redirects to `GeneratedAgendaViewer.php`, which renders THE AGENDA ITSELF as
 * HTML — one row per item (`<td width=40>N.</td><td>ITEM TEXT…</td>`), with
 * ACTION lines, consent markers and per-item "Supporting Document" attachments
 * (MetaViewer links). The extractor used to demand a PDF link, find none, and
 * fail NO_PDF_LINK — while the complete official agenda sat in the response
 * body.
 *
 * This module converts that HTML into the same {pages[].readingLines} shape
 * scripts/lib/agenda-structure.mjs consumes for PDFs, so the identical item
 * grammar, section logic, verbatim quotes and anti-hallucination back-check
 * apply to both sources. The text is stripped from the official page itself —
 * nothing is invented; quotes are checked against it by scripts/lib/validate.mjs
 * exactly as for PDF extraction.
 */

import { collapseWhitespace } from "./canonical.mjs";

/**
 * A Granicus agenda page (as opposed to generic viewer chrome around a PDF).
 *
 * Detected by CONTENT, not markup: Granicus serves these pages as HTML
 * fragments (no <html>/doctype — the document can start mid-head with the
 * analytics script), and their exact chrome changes between portal versions.
 * What does not change is the grammar this pipeline already parses: numbered
 * agenda items. A page that links Granicus document viewers AND carries the
 * portal's numbered-item rows IS the agenda.
 */
export function looksLikeGranicusAgendaHtml(html) {
  const text = String(html || "");
  if (!text.trimStart().startsWith("<")) return false;
  if (!/MetaViewer\.php|MediaPlayer\.php|GeneratedAgendaViewer\.php|AgendaViewer\.php/i.test(text)) return false;
  const itemLines = htmlAgendaLayout(text).pages[0].readingLines.filter((line) =>
    /^\d{1,3}[a-z]?\.\s+\S/i.test(line.text),
  );
  return itemLines.length >= 3;
}

const NAMED_ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", sect: "§", deg: "°",
};

function decodeEntities(text) {
  return String(text || "").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (/^#x/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (/^#/i.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Strip markup: scripts/styles removed, block boundaries and <br> become newlines. */
function htmlToLines(html) {
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br[^>]*>/gi, "\n")
    .replace(/<\/(?:tr|p|div|blockquote|h[1-6]|li|table|tbody|thead)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);
}

/**
 * Convert an official Granicus agenda page into the layout shape shared with
 * the PDF engine: one pseudo-page whose readingLines the agenda-structure
 * parser consumes unchanged. A lone number cell ("5." / "12a.") is merged with
 * the line that follows it, because the portal renders the item number in its
 * own table cell.
 *
 * @returns {{pageCount: number, pages: Array<object>, text: string}}
 */
export function htmlAgendaLayout(html) {
  const rawLines = htmlToLines(html);
  const readingLines = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const loneNumber = line.match(/^(\d{1,3}[a-z]?)\.\s*$/i);
    if (loneNumber && index + 1 < rawLines.length && !/^\d{1,3}[a-z]?\.\s/.test(rawLines[index + 1])) {
      readingLines.push({ y: readingLines.length, text: `${line} ${rawLines[index + 1]}`, columnBreak: false });
      index += 1;
      continue;
    }
    readingLines.push({ y: readingLines.length, text: line, columnBreak: false });
  }
  const text = readingLines.map((line) => line.text).join("\n");
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, width: 612, height: 792, text, readingLines }],
    text,
  };
}
