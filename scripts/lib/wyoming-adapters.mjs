/**
 * Statewide watch adapters.
 *
 * Cheyenne's Granicus table is not reused here. Each architecture reduces a page
 * to semantic records (body, date, document URL, kind) or fails closed with a
 * typed code. Markup, viewstate, and a vendor name mentioned in prose never
 * enter the hash. A government with no calibrated posting URL is a roster row,
 * not a URL this module invents.
 */

import { parse } from "node-html-parser";
import { collapseWhitespace, normalizeDate, normalizeUrl } from "./canonical.mjs";
import { bodySlug } from "./upcoming-table.mjs";

export const STRUCTURAL_CODES = new Set(["ENO_SURFACE", "ENO_ROWS", "ENO_KIND", "ENO_HOST"]);

/** Second door that was opened and must be hashed as its own stream. */
export const EXTRA_SURFACES = [
  {
    id: "place-casper-older-portal",
    governmentId: "casper",
    layer: "municipality",
    name: "Casper older portal",
    architectureId: "clerk-file-index",
    mode: "parse",
    url: "https://www.casperwy.gov/cms/One.aspx?portalId=63067&pageId=84270",
    note: "Opened 2026-10-09. Not merged with the clerk PHP index.",
  },
];

const PARSERS = new Set([
  "civicplus-agenda-center",
  "civicplus-cms-page",
  "clerk-file-index",
  "clerk-html-page",
  "pdf-packet-folder",
]);

export function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function siteHost(raw) {
  return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
}

export function packetFolderUrl(packetUrl) {
  const url = new URL(packetUrl);
  url.search = "";
  url.hash = "";
  const parts = url.pathname.split("/").filter(Boolean);
  parts.pop();
  url.pathname = `/${parts.join("/")}/`;
  return url.toString();
}

function absoluteUrl(href, pageUrl) {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return "";
  }
}

function isoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Pull a real calendar date out of a filename or URL. Returns ISO or null. */
export function dateFromHref(raw) {
  const text = decodeURIComponent(String(raw));
  const viewFile = text.match(/_(\d{2})(\d{2})(\d{4})(?:-|\b)/);
  if (viewFile) return isoDate(viewFile[3], viewFile[1], viewFile[2]);
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(iso[1], iso[2], iso[3]);
  const dotted = text.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
  if (dotted) return isoDate(dotted[3], dotted[1], dotted[2]);
  const us = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (us) return isoDate(us[3], us[1], us[2]);
  return null;
}

export function dateFromText(raw) {
  const text = collapseWhitespace(raw);
  const named = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (named) {
    const normalized = normalizeDate(`${named[1]} ${named[2]}, ${named[3]}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }
  return dateFromHref(text);
}

function isGranicusUpcoming(html) {
  const root = parse(html);
  return root.querySelectorAll("table").some((table) => {
    const header = collapseWhitespace(table.querySelector("tr")?.textContent || "").toLowerCase();
    return header.includes("name") && header.includes("date") && header.includes("agenda") && !header.includes("duration");
  });
}

function record(label, date, url, kind) {
  const bodyLabel = collapseWhitespace(label) || "Meeting";
  return {
    body: bodySlug(bodyLabel),
    bodyLabel,
    date,
    time: "",
    agendaUrl: normalizeUrl(url),
    kind,
  };
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((item) => {
    const key = `${item.kind}|${item.agendaUrl}|${item.date}|${item.body}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function kindFromHref(href) {
  if (/minutes/i.test(href)) return "minutes";
  if (/packet/i.test(href)) return "packet";
  return "agenda";
}

function parseAgendaCenter(html, pageUrl) {
  if (!/agendacenter/i.test(html)) throw fail("ENO_SURFACE", "Page has no Agenda Center marker");
  const root = parse(html);
  let category = "Meeting";
  const records = [];
  for (const el of root.querySelectorAll("h1, h2, h3, h4, a")) {
    if (/^H[1-4]$/.test(el.tagName)) {
      const text = collapseWhitespace(el.textContent);
      if (text && !/search|notify|viewstate/i.test(text)) category = text;
      continue;
    }
    const href = el.getAttribute("href") || "";
    if (!/\/AgendaCenter\/ViewFile\//i.test(href)) continue;
    const date = dateFromHref(href) || dateFromText(el.parentNode?.textContent || "");
    if (!date) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url) continue;
    records.push(record(category, date, url, kindFromHref(href)));
  }
  if (!records.length) throw fail("ENO_ROWS", "Agenda Center page had no dated ViewFile rows");
  return dedupe(records);
}

function isDocumentLink(href, text) {
  return /\.(pdf|docx?)($|\?)/i.test(href) || /agenda|minutes|packet/i.test(`${href} ${text}`);
}

function parseDocumentList(html, pageUrl, { rejectAgendaCenter }) {
  if (rejectAgendaCenter && /\/AgendaCenter\/ViewFile\//i.test(html)) {
    throw fail("ENO_KIND", "This page is an Agenda Center module and cannot use the clerk or CMS parser");
  }
  if (!/agenda|minutes/i.test(html)) throw fail("ENO_SURFACE", "Page has no agenda or minutes marker");
  const root = parse(html);
  const records = [];
  for (const el of root.querySelectorAll("a")) {
    const href = el.getAttribute("href") || "";
    if (/portalId=/i.test(href) || /\/cms\/One\.aspx/i.test(href)) continue;
    if (!isDocumentLink(href, el.textContent || "")) continue;
    const around = `${el.textContent || ""} ${el.parentNode?.textContent || ""}`;
    const date = dateFromHref(href) || dateFromText(around);
    if (!date) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url || siteHost(url) !== siteHost(pageUrl)) continue;
    const label = collapseWhitespace(el.textContent) || "Meeting";
    records.push(record(label, date, url, kindFromHref(`${href} ${label}`)));
  }
  if (!records.length) throw fail("ENO_ROWS", "Page had no dated document links on the pinned host");
  return dedupe(records);
}

function parsePacketFolder(html, pageUrl) {
  if (html.startsWith("%PDF") || /^%PDF-/.test(html.slice(0, 8))) {
    throw fail("ENO_SURFACE", "Response is a single PDF, not a packet folder");
  }
  if (/\/AgendaCenter\/ViewFile\//i.test(html)) throw fail("ENO_KIND", "Packet folder parser will not read Agenda Center");
  const folderPath = decodeURIComponent(new URL(pageUrl).pathname).replace(/\/$/, "");
  const root = parse(html);
  const records = [];
  for (const el of root.querySelectorAll("a")) {
    const href = el.getAttribute("href") || "";
    const url = absoluteUrl(href, pageUrl);
    if (!url || !/\.pdf($|\?)/i.test(url)) continue;
    if (siteHost(url) !== siteHost(pageUrl)) continue;
    const pathName = decodeURIComponent(new URL(url).pathname);
    if (!pathName.startsWith(folderPath)) continue;
    const date = dateFromHref(pathName) || dateFromText(el.textContent || "");
    if (!date) continue;
    records.push(record("City Council", date, url, "packet"));
  }
  if (!records.length) throw fail("ENO_ROWS", "Packet folder listed no dated PDFs");
  return dedupe(records);
}

export function parseSurface(architectureId, html, pageUrl) {
  if (architectureId !== "granicus-publisher" && isGranicusUpcoming(html)) {
    throw fail("ENO_KIND", "Page is a Granicus upcoming table. view_id=5 is not reused.");
  }
  switch (architectureId) {
    case "civicplus-agenda-center":
      return parseAgendaCenter(html, pageUrl);
    case "civicplus-cms-page":
      return parseDocumentList(html, pageUrl, { rejectAgendaCenter: true });
    case "clerk-file-index":
      return parseDocumentList(html, pageUrl, { rejectAgendaCenter: true });
    case "clerk-html-page":
      return parseDocumentList(html, pageUrl, { rejectAgendaCenter: false });
    case "pdf-packet-folder":
      return parsePacketFolder(html, pageUrl);
    default:
      throw fail("ENO_KIND", `No parser is calibrated for ${architectureId}`);
  }
}

export function watchTargets(counties, municipalities) {
  const targets = [];
  for (const county of counties) {
    targets.push({
      id: `county-${county.id}`,
      governmentId: county.id,
      layer: "county",
      name: `${county.name} County`,
      architectureId: "county-site-unobserved",
      mode: "host-check",
      url: county.clerk.website.url,
    });
  }
  for (const place of municipalities) {
    if (place.architectureId === "granicus-publisher") {
      const view = place.posting?.url?.match(/view_id=(\d+)/)?.[1];
      targets.push({
        id: `place-${place.id}`,
        governmentId: place.id,
        layer: "municipality",
        name: place.name,
        architectureId: place.architectureId,
        mode: view === "5" && place.id === "cheyenne" ? "delegate" : "record",
        url: view === "5" ? place.posting.url : null,
        reason: view === "5" ? "owned-by-municipal-watch" : "uncalibrated-view",
      });
      continue;
    }
    if (place.posting?.url && PARSERS.has(place.architectureId)) {
      const url = place.architectureId === "pdf-packet-folder" ? packetFolderUrl(place.posting.url) : place.posting.url;
      targets.push({
        id: `place-${place.id}`,
        governmentId: place.id,
        layer: "municipality",
        name: place.name,
        architectureId: place.architectureId,
        mode: "parse",
        url,
      });
      continue;
    }
    targets.push({
      id: `place-${place.id}`,
      governmentId: place.id,
      layer: "municipality",
      name: place.name,
      architectureId: place.architectureId,
      mode: "record",
      url: null,
      reason: "no-calibrated-surface",
    });
  }
  targets.push(...EXTRA_SURFACES);
  return targets;
}

export function emptyState(targets) {
  return {
    version: 1,
    updatedAt: null,
    targets: Object.fromEntries(targets.map((target) => [target.id, {
      architectureId: target.architectureId,
      mode: target.mode,
      url: target.url,
      contentHash: null,
    }])),
  };
}
