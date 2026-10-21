/**
 * Granicus "GeneratedAgendaViewer" HTML agenda → layout-shaped reading lines.
 *
 * Modern Cheyenne Granicus postings redirect `AgendaViewer.php` to
 * `GeneratedAgendaViewer.php`, which serves the official agenda directly as HTML
 * (numbered item rows, ACTION lines, consent markers, and MetaViewer supporting
 * document links) with no combined PDF link.
 *
 * Converting that official HTML into `{ pages[].readingLines }` lets
 * `scripts/lib/agenda-structure.mjs` and `scripts/lib/validate.mjs` apply the
 * exact same item grammar and verbatim contiguous-quote verification as PDF
 * extraction.
 */

import { collapseWhitespace } from "./canonical.mjs";

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
