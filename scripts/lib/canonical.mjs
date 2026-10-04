/**
 * Canonical content hashing for municipal watch data.
 *
 * Red-team context (Order of Magnitude 1, finding 2 — "The DOM-Hashing Fallacy"):
 * Modern municipal portals (Legistar / Granicus / CivicPlus) decorate their DOM with
 * per-request session ids, rotating anti-bot nonces, cache-busting query strings and
 * analytics beacons. Hashing the raw DOM (or raw HTML bytes) therefore produces a new
 * fingerprint on every single request, even when the underlying meeting data is
 * byte-for-byte identical — flooding the pipeline with false-positive triggers.
 *
 * The fix implemented here: reduce the page to *semantic records only* (body, date,
 * time, agenda URL), normalize every field, sort deterministically, and hash the
 * canonical JSON. Anything that is not meeting data never reaches the hash input:
 *   - HTML tags, attributes, class names, inline scripts/styles/comments are dropped
 *     during record extraction (see scripts/lib/upcoming-table.mjs), not "stripped later".
 *   - Tracking / session URL parameters are removed; semantic parameters
 *     (view_id, event_id, clip_id) are kept and sorted.
 *   - Whitespace, case-insensitive date formats and URL trivia are normalized.
 *
 * As a result: identical meeting data ⇒ identical hash, regardless of markup churn.
 */

import { createHash } from "node:crypto";

/** Tracking/session parameter prefixes & names that must never influence the hash. */
const TRACKING_URL_PARAMS = new Set([
  "jsid", "sid", "session", "sessionid", "session_id", "phsid", "phplive", "_ga",
  "_gl", "fbclid", "gclid", "msclkid", "ref", "referrer", "utm_source", "utm_medium",
  "utm_campaign", "utm_term", "utm_content", "utm_id", "mc_cid", "mc_eid", "igshid",
  "yclid", "wbraid", "gbraid", "ver", "v", "t", "ts", "timestamp", "_", "rand", "rnd",
]);

/** Granicus parameters that are semantic (they identify the view/event/clip). */
const SEMANTIC_URL_PARAMS = new Set(["view_id", "event_id", "clip_id", "doc_id"]);

/**
 * Collapse all whitespace runs to single spaces and trim.
 * Granicus pads cells with newlines, non-breaking spaces and <br> artifacts.
 */
export function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\s\u200b\u200e\u200f\ufeff]+/g, " ")
    .trim();
}

/** Canonicalize a URL so tracking noise can never change the content hash. */
export function normalizeUrl(raw) {
  const text = collapseWhitespace(raw);
  if (!text) return "";
  let url;
  try {
    url = new URL(text);
  } catch {
    // Not a parseable absolute URL — return the collapsed text lowercased so that
    // trivial case/whitespace differences do not trigger syncs either.
    return text.toLowerCase();
  }
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  const kept = new Map();
  for (const [key, value] of url.searchParams) {
    const lower = key.toLowerCase();
    // Drop every parameter unless it is explicitly semantic. Unknown parameters are
    // treated as noise by default — the safe direction for a change detector.
    if (SEMANTIC_URL_PARAMS.has(lower) && !TRACKING_URL_PARAMS.has(lower)) {
      const existing = kept.get(lower);
      kept.set(lower, existing === undefined ? value : `${existing},${value}`);
    }
  }
  url.search = "";
  const params = [...kept.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of params) url.searchParams.append(key, value);
  return url.toString();
}

/** Canonical time: "12:00 p.m." / "12:00 PM" / "6:00 pm" ⇒ "12:00" / "18:00" (24h). */
export function normalizeTime(raw) {
  const text = collapseWhitespace(raw).toLowerCase().replace(/[\s.]/g, "");
  const match = text.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (!match) return collapseWhitespace(raw).toLowerCase();
  let [, hour, minute, meridiem] = match;
  hour = Number(hour);
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** Canonical date: "Oct 5, 2026" / "October 5, 2026" / "2026-10-05" ⇒ "2026-10-05". */
export function normalizeDate(raw) {
  const text = collapseWhitespace(raw);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const match = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    if (month) {
      return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
    }
  }
  return text.toLowerCase();
}

/**
 * Deterministic stringify: object keys sorted recursively, no insignificant whitespace.
 * Two structurally equal records always serialize identically.
 */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Sort a list of records by their canonical key so row order never flips the hash. */
export function sortRecords(records, keyFields = ["body", "date", "time", "agendaUrl"]) {
  return [...records].sort((a, b) => {
    for (const field of keyFields) {
      const delta = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
      if (delta) return delta;
    }
    return 0;
  });
}

/**
 * SHA-256 over the canonical form of the records.
 * This is the *only* thing the watcher compares — never the DOM, never raw HTML.
 */
export function contentHash(records) {
  const canonical = sortRecords(records).map((record) => {
    const clean = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      clean[key] = typeof value === "string" ? collapseWhitespace(value) : value;
    }
    return clean;
  });
  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}
