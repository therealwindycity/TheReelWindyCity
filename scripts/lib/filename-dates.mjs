const MUNICIPAL_BODY_BY_PREFIX = {
  psc: "public-services-committee",
  fc: "finance-committee",
  ws: "work-sessions",
  cow: "work-sessions",
};

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function basename(value) {
  return String(value ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function expandYear(value) {
  const year = Number(value);
  if (String(value).length === 4) return year;
  // Municipal archive filenames use two-digit years. Apply the conventional
  // 00–69 => 2000s, 70–99 => 1900s pivot rather than taking a fixed prefix.
  return year <= 69 ? 2000 + year : 1900 + year;
}

function asIsoDate(yearValue, monthValue, dayValue) {
  const year = expandYear(String(yearValue));
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse the dated folder names used by the Granicus archive.
 * Examples: `1740384000Feb 24, 2025 - City Council Meeting` and
 * `2025-02-24-special-meeting`.
 */
export function parseArchiveDate(value) {
  const raw = String(value ?? "");
  const timestampFolder = raw.match(/^\d{10}([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (timestampFolder) {
    const month = MONTHS[timestampFolder[1].toLowerCase()];
    return month ? asIsoDate(timestampFolder[3], month, timestampFolder[2]) : null;
  }

  const isoFolder = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[-_\s])/);
  return isoFolder ? asIsoDate(isoFolder[1], isoFolder[2], isoFolder[3]) : null;
}

/**
 * Parse a date embedded in a municipal filename, never in a version number.
 * Supported formats are ISO dates, dotted ISO dates, municipal committee
 * prefixes such as `psc-sm-05-22-23`, four-digit municipal years such as
 * `cow-06-04-2025`, and compact dates on explicitly named work-session files.
 */
export function parseFilenameDate(value) {
  const filename = basename(value);

  const iso = filename.match(/(?:^|[^0-9])(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[^0-9])/);
  if (iso) return asIsoDate(iso[1], iso[2], iso[3]);

  const dottedIso = filename.match(/(?:^|[^0-9])(\d{4})\.(\d{1,2})\.(\d{1,2})(?=$|[^0-9])/);
  if (dottedIso) return asIsoDate(dottedIso[1], dottedIso[2], dottedIso[3]);

  const municipal = filename.match(/^(psc|fc|ws|cow)((?:[-_][a-z][a-z0-9]*)*)[-_](\d{1,2})[-_](\d{1,2})[-_](\d{2}|\d{4})(?=$|[-_.])/i);
  if (municipal) return asIsoDate(municipal[5], municipal[3], municipal[4]);

  const compactWorkSession = filename.match(/work[-_ ]session[^0-9]*?(\d{2})(\d{2})(\d{4})(?=$|[^0-9])/i);
  if (compactWorkSession) return asIsoDate(compactWorkSession[3], compactWorkSession[1], compactWorkSession[2]);

  return null;
}

/** Infer a government-body slug from an explicit filename label, if present. */
export function inferMeetingBodyFromFilename(value) {
  const filename = basename(value).toLowerCase().replaceAll("_", "-");
  if (/\b(?:psc|public-services?(?:-committee)?)/i.test(filename)) return "public-services-committee";
  if (/\b(?:fc|finance-committee)/i.test(filename)) return "finance-committee";
  if (/\b(?:ws|cow|work-session|committee-of-the-whole)/i.test(filename)) return "work-sessions";
  if (/planning-commission/.test(filename)) return "planning-commission";
  if (/board-of-adjustment/.test(filename)) return "board-of-adjustment";
  if (/historic-preservation/.test(filename)) return "historic-preservation-board";
  if (/urban-renewal/.test(filename)) return "urban-renewal-authority";
  if (/board-of-county-commissioners/.test(filename)) return "board-of-county-commissioners";
  if (/city-council/.test(filename)) return "city-council";
  return undefined;
}

/**
 * Parse committee documents whose names encode both the body and meeting date.
 * `sm`/`special` sub-prefixes are retained as a distinct special-meeting ID.
 */
export function parseMunicipalMeetingFilename(value) {
  const filename = basename(value);
  const match = filename.match(/^(psc|fc|ws|cow)((?:[-_][a-z][a-z0-9]*)*)[-_](\d{1,2})[-_](\d{1,2})[-_](\d{2}|\d{4})(?=$|[-_.])/i);
  if (match) {
    const prefix = match[1].toLowerCase();
    const date = asIsoDate(match[5], match[3], match[4]);
    if (!date) return null;
    const qualifiers = match[2].toLowerCase();
    return {
      date,
      body: MUNICIPAL_BODY_BY_PREFIX[prefix],
      ...( /(?:^|[-_])(?:sm|special)(?:$|[-_])/.test(qualifiers) ? { note: "Special Meeting" } : {}),
    };
  }

  const date = parseFilenameDate(filename);
  if (!date) return null;
  return { date, body: inferMeetingBodyFromFilename(filename) };
}
