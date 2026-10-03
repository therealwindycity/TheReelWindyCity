import { ARCHIVE_REPO, MEETING, TRANSCRIPT_REPO, asset, rawUrl, type SourceFile } from "./civic-data";

/** URL used to display a repository file: a bundled copy when one ships with the site, otherwise the original raw file on GitHub. */
export function sourceContentUrl(repo: string, path: string): string {
  if (repo === TRANSCRIPT_REPO && path === MEETING.transcriptPath) return asset("data/jan-26-transcript.md");
  if (repo === ARCHIVE_REPO && path === `${MEETING.archiveFolder}/Agenda.pdf`) return asset("sources/2026-01-26-agenda.html");
  return rawUrl(repo, path);
}

export type LoadedSource =
  | { kind: "pdf"; objectUrl: string }
  | { kind: "html"; html: string }
  | { kind: "text"; text: string }
  | { kind: "binary" }
  | { kind: "error"; message: string };

const TEXT_EXT = /\.(md|txt|json|csv|sh|yml|yaml|js|ts|css)$/i;
const MAX_INLINE_BYTES = 35 * 1024 * 1024;

/**
 * Fetch a source document and detect its real format (archived pages are
 * frequently stored with a .pdf name, so the bytes decide — never the extension).
 */
export async function loadSource(url: string, filePath = ""): Promise<LoadedSource> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { kind: "error", message: "We couldn’t load this source. The original GitHub file is still available through the source link." };
  }
  if (!response.ok) {
    return { kind: "error", message: "We couldn’t load this source. The original GitHub file is still available through the source link." };
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_INLINE_BYTES) {
    return { kind: "error", message: "This source is too large for inline preview. Open the original on GitHub or download it directly." };
  }
  const head = new TextDecoder().decode(buffer.slice(0, 512));
  const isPdf = head.startsWith("%PDF-");
  const isText = TEXT_EXT.test(filePath);
  const isHtml = /\.(html?|pdf|bin)$/i.test(filePath) && /<(script|html|!doctype|style|title)\b/i.test(head);
  if (isPdf) {
    const blob = new Blob([buffer], { type: "application/pdf" });
    return { kind: "pdf", objectUrl: URL.createObjectURL(blob) };
  }
  if (isText || (!isHtml && /^text\/(plain|markdown|csv)/i.test(response.headers.get("content-type") || ""))) {
    return { kind: "text", text: new TextDecoder().decode(buffer) };
  }
  if (isHtml || /<(script|html|!doctype|style|title)\b/i.test(head)) {
    return { kind: "html", html: new TextDecoder().decode(buffer) };
  }
  return { kind: "binary" };
}

/** Plain-text fetch used for lightweight lookups (e.g. reading a transcript's video id). */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  return res.ok ? res.text() : "";
}
