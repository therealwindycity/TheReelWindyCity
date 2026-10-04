/**
 * Dependency-free synthetic PDF writer for pipeline tests.
 *
 * Produces real, spec-valid PDFs with positioned text (Tm text matrices), which
 * pdfjs-dist extracts exactly like a real municipal document. This lets the test
 * suite build adversarial fixtures on the fly:
 *   - two-column agendas whose content stream interleaves columns (the exact
 *     "pdf-parse merges adjacent columns" failure mode),
 *   - scanned pages (no text operators at all) to prove the NO_TEXT failure,
 *   - multi-page documents with real Cheyenne agenda item text.
 *
 * Only latin1 content is emitted; callers keep text ASCII/WinAnsi-safe.
 */

function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * @param {Array<Array<{x: number, y: number, text: string, size?: number}>>} pages
 *   Each page is a list of positioned text lines (PDF user-space coordinates,
 *   origin bottom-left). Emission order within a page IS the content-stream order,
 *   so callers control exactly how "naive" extractors would read the document.
 * @returns {Buffer}
 */
export function makePdf(pages) {
  const objects = [];
  const pageNumbers = [];
  const fontNumber = 3;

  objects[1] = null; // catalog (filled at the end)
  objects[2] = null; // page tree (filled at the end)
  objects[fontNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  let next = 4;
  for (const lines of pages) {
    const pageNumber = next++;
    const contentNumber = next++;
    pageNumbers.push(pageNumber);
    const stream = lines
      .map(
        ({ x, y, text, size = 10 }) =>
          `BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(text)}) Tj ET`,
      )
      .join("\n");
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    objects[contentNumber] = { stream };
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(out, "latin1");
    const object = objects[index];
    if (object && typeof object === "object" && "stream" in object) {
      const length = Buffer.byteLength(object.stream, "latin1");
      out += `${index} 0 obj\n<< /Length ${length} >>\nstream\n${object.stream}\nendstream\nendobj\n`;
    } else {
      out += `${index} 0 obj\n${object}\nendobj\n`;
    }
  }

  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    out += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Greedy word wrap for fixture text. */
export function wrapText(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Layout helper: an editorial column with per-line baselines. */
export function column(x, startY, lineHeight, size = 10) {
  const lines = [];
  return {
    add(text, { size: override = size, gap = 0 } = {}) {
      if (gap && lines.length) lines[lines.length - 1].y += 0; // no-op, clarity only
      const y = startY - lines.length * lineHeight - gap * lineHeight;
      lines.push({ x, y, text, size: override });
      return this;
    },
    addWrapped(text, width, options = {}) {
      for (const line of wrapText(text, width)) this.add(line, options);
      return this;
    },
    get lines() {
      return [...lines];
    },
  };
}

/**
 * Merge columns into one page whose content stream interleaves them line by line
 * (left line, right line, left line, right line, …) at SHARED baselines — the
 * precise stream order that naive text extraction concatenates into garbage.
 */
export function interleaveColumns(...columns) {
  const byBaseline = new Map();
  for (const col of columns) {
    for (const line of col.lines) {
      const key = Math.round(line.y);
      if (!byBaseline.has(key)) byBaseline.set(key, []);
      byBaseline.get(key).push(line);
    }
  }
  return [...byBaseline.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first (PDF y grows upward)
    .flatMap(([, lines]) => lines.sort((a, b) => a.x - b.x));
}
