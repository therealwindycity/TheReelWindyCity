/**
 * Layout-aware PDF text extraction engine.
 *
 * Red-team context (Order of Magnitude 2, finding 1 — "Layout Blindness"):
 * Naive extractors (pdf-parse and friends) concatenate text operators in the order
 * they appear in the content stream. In two-column municipal documents the stream
 * order rarely matches reading order, so adjacent columns get merged into garbage
 * lines ("left1 right1 left2 right2 …"), which downstream analysis then confidently
 * misreads. Scanned (un-OCRed) agenda uploads extract as *empty strings* — silently.
 *
 * This engine reconstructs geometry instead of trusting stream order:
 *   1. Pull positioned text items from pdfjs-dist (x, y, width, height per item).
 *   2. Cluster items into visual lines by baseline (y) with font-relative tolerance.
 *   3. Detect column gutters with an x-occupancy projection (a vertical band that is
 *      unoccupied across (nearly) the whole text area ⇒ column boundary).
 *   4. Emit reading order: columns left→right, lines top→bottom, runs left→right.
 *
 * And it fails LOUDLY (Order of Magnitude 3, finding 2) with typed error codes:
 *   ENCRYPTED   – password-protected upload
 *   CORRUPT     – not a parsable PDF
 *   NO_TEXT     – scanned image page(s) with no text layer (OCR required upstream)
 *   EMPTY_INPUT – zero-byte download / truncated transfer
 * Extraction either produces real positioned text or throws — never an empty string
 * that "succeeds" its way into a commit.
 */

/** Typed extraction failure. `code` is one of the documented machine-readable codes. */
export class ExtractionError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.code = code;
    this.name = "ExtractionError";
  }
}

const MIN_TEXT_CHARS_PER_PAGE = 24; // below this a page counts as "no text layer"

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{pages: Array<{pageNumber: number, width: number, height: number,
 *   lines: Array<{y: number, runs: Array<{x: number, end: number, text: string}>}>,
 *   columns: Array<[number, number]>, text: string, charCount: number}>,
 *   pageCount: number, text: string}>}
 */
export async function extractPdfLayout(bytes) {
  if (!bytes || !bytes.length) throw new ExtractionError("EMPTY_INPUT", "PDF input is empty (zero bytes)");

  let pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (cause) {
    throw new ExtractionError("CORRUPT", "pdfjs-dist is not installed — run npm ci", cause);
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      // Deterministic, CI-safe parsing: no eval, no system font access, no worker fetch.
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (cause) {
    const name = cause?.name || "";
    if (name === "PasswordException") {
      throw new ExtractionError("ENCRYPTED", "PDF is password-protected — cannot extract agenda text", cause);
    }
    if (name === "InvalidPDFException") {
      throw new ExtractionError("CORRUPT", "File is not a valid PDF (corrupt upload or HTML error page)", cause);
    }
    throw new ExtractionError("CORRUPT", `PDF could not be opened: ${cause?.message || cause}`, cause);
  }

  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => typeof item.str === "string" && item.str.trim().length);

      const lines = buildLines(items);
      const columns = detectColumns(lines, viewport.width);
      const { text, readingLines } = renderReadingOrder(lines, columns);
      pages.push({
        pageNumber,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        lines,
        columns,
        readingLines,
        text,
        charCount: text.replace(/\s+/g, "").length,
      });
    }

    const textPages = pages.filter((page) => page.charCount >= MIN_TEXT_CHARS_PER_PAGE);
    if (!pages.length || !textPages.length) {
      throw new ExtractionError(
        "NO_TEXT",
        "PDF has no extractable text layer (scanned image upload?) — an OCR pre-processing step is required before analysis",
      );
    }
    return { pages, pageCount: pages.length, text: pages.map((page) => page.text).join("\n\n") };
  } finally {
    await doc.cleanup?.();
  }
}

/** Cluster positioned items into visual lines (shared baseline). */
function buildLines(items) {
  if (!items.length) return [];
  const heights = items.map((item) => Math.abs(item.transform[3]) || 10);
  const medianHeight = median(heights) || 10;
  const tolerance = Math.max(1.5, medianHeight * 0.45);

  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines = [];
  let current = null;
  for (const item of sorted) {
    const y = item.transform[5];
    if (!current || Math.abs(current.y - y) > tolerance) {
      current = { y, runs: [] };
      lines.push(current);
    }
    const x = item.transform[4];
    const end = item.width > 0 ? x + item.width : x + item.str.length * (Math.abs(item.transform[0]) || medianHeight * 0.5);
    current.runs.push({ x, end, text: item.str });
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Column-gutter detection via x-occupancy projection (rate-based).
 * For each 2pt-wide vertical bin we compute the fraction of visual lines whose
 * runs cover it. A band counts as a gutter when occupancy stays below
 * GUTTER_MAX_OCCUPANCY across its whole width — so a handful of full-width lines
 * (centered page headers spanning both columns) no longer defeat detection,
 * while genuine columns keep a clean low-occupancy band between them.
 */
const GUTTER_MAX_OCCUPANCY = 0.15;

function detectColumns(lines, pageWidth) {
  const textLines = lines.filter((line) => line.runs.length);
  if (textLines.length < 4) return [[0, pageWidth]];

  const binCount = Math.max(16, Math.ceil(pageWidth / 2) + 1);
  const occupancy = new Float32Array(binCount);
  for (const line of textLines) {
    for (const run of line.runs) {
      const from = Math.max(0, Math.floor(run.x / 2));
      const to = Math.min(binCount - 1, Math.ceil(run.end / 2));
      for (let bin = from; bin <= to; bin += 1) occupancy[bin] += 1;
    }
  }
  for (let bin = 0; bin < binCount; bin += 1) occupancy[bin] /= textLines.length;

  const leftMargin = leftmost(occupancy);
  const rightMargin = rightmost(occupancy);
  const contentWidth = (rightMargin - leftMargin) * 2;
  if (contentWidth <= 0) return [[0, pageWidth]];

  const gutterMinWidth = Math.max(24, contentWidth * 0.04); // ≥4% of content width, ≥24pt
  const gutters = [];
  let runStart = -1;
  for (let bin = leftMargin; bin <= rightMargin; bin += 1) {
    if (occupancy[bin] < GUTTER_MAX_OCCUPANCY) {
      if (runStart === -1) runStart = bin;
    } else if (runStart !== -1) {
      pushGutter(gutters, runStart, bin - 1, gutterMinWidth);
      runStart = -1;
    }
  }
  if (runStart !== -1) pushGutter(gutters, runStart, rightMargin, gutterMinWidth);

  if (!gutters.length) return [[0, pageWidth]];

  const columns = [];
  let start = 0;
  for (const gutter of gutters) {
    columns.push([start, gutter[0]]);
    start = gutter[1];
  }
  columns.push([start, pageWidth]);
  const realColumns = columns.filter(([from, to]) => textLines.some((line) => runsInColumn(line, from, to).length));
  return realColumns.length ? realColumns : [[0, pageWidth]];
}

function pushGutter(gutters, fromBin, toBin, minWidth) {
  const from = fromBin * 2;
  const to = (toBin + 1) * 2;
  if (to - from >= minWidth) gutters.push([from, to]);
}

function leftmost(occupancy) {
  for (let i = 0; i < occupancy.length; i += 1) if (occupancy[i] >= GUTTER_MAX_OCCUPANCY) return i;
  return 0;
}

function rightmost(occupancy) {
  for (let i = occupancy.length - 1; i >= 0; i -= 1) if (occupancy[i] >= GUTTER_MAX_OCCUPANCY) return i;
  return occupancy.length - 1;
}

function lineWithin(line, from, to) {
  const x = line.runs[0].x;
  return x >= from && x < to;
}

/** Runs of a visual line that fall inside the column band [from, to). */
function runsInColumn(line, from, to) {
  return line.runs.filter((run) => run.x >= from && run.x < to);
}

/**
 * Render reading order: for each column (left→right) emit its runs top→bottom.
 * Lines that span a shared baseline across columns are split per column *first* —
 * this is precisely where naive stream-order extractors interleave two columns
 * into one garbage line. Column boundaries become blank-line separators so
 * downstream parsers can tell "new column" from "wrapped line".
 *
 * Returns both the page text and `readingLines` — the column-aware line sequence
 * (with a columnBreak marker at each column start) that agenda parsing consumes,
 * so item assembly never glues a right-column heading onto a left-column item.
 */
function renderReadingOrder(lines, columns) {
  const out = [];
  const readingLines = [];
  for (const [from, to] of columns) {
    const columnLines = [];
    for (const line of lines) {
      const runs = runsInColumn(line, from, to);
      if (runs.length) columnLines.push({ y: line.y, runs });
    }
    if (!columnLines.length) continue;
    if (out.length) {
      out.push(""); // column separator
      if (readingLines.length) readingLines[readingLines.length - 1].endsWithColumn = true;
    }
    for (const line of columnLines) {
      const text = joinRuns(line);
      out.push(text);
      readingLines.push({ y: line.y, text, columnBreak: readingLines.length > 0 && readingLines[readingLines.length - 1]?.endsWithColumn === true });
    }
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), readingLines };
}

/** Join the runs of one visual line, inserting spaces only at real gaps. */
function joinRuns(line) {
  let text = "";
  let previousEnd = null;
  for (const run of line.runs) {
    if (previousEnd !== null) {
      const gap = run.x - previousEnd;
      if (gap > 1.2 || /[\s\u00a0]$/.test(text) || /^[\s\u00a0]/.test(run.text)) text += " ";
    }
    text += run.text;
    previousEnd = run.end;
  }
  return text.replace(/\s+/g, " ").trim();
}
