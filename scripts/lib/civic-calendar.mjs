/**
 * Calendar-status, expiration, and outcome-separation resolver for Civic Cheyenne.
 *
 * Design principles:
 *   1. Orthogonal status axes — never collapsed:
 *      - Historical source status (`publisherStatusAtCapture`, plus raw `notes`
 *        preserved verbatim in every record): what the snapshot or publisher
 *        stated when captured (for example, "Upcoming — agenda posted").
 *      - Calendar status (`calendarStatus`, evaluated at `calendarStatusEvaluatedAt`
 *        in America/Denver with explicit `calendarStatusValidUntil`):
 *          • "upcoming"                 — future date, OR today strictly before
 *                                         a verified posted start time.
 *          • "same-day-time-unverified" — dated today with no verified start
 *                                         time ("Scheduled for today; start
 *                                         time not verified"). Never advertised
 *                                         as a confirmed future meeting.
 *          • "start-time-passed"        — dated today at or after posted start
 *                                         time ("Scheduled start time passed;
 *                                         outcome not verified").
 *          • "date-passed"              — scheduled date is before today in
 *                                         America/Denver.
 *          • "canceled"                 — explicit cancellation in source record.
 *          • "rescheduled"              — explicit reschedule in source record.
 *          • "unknown-date"             — missing or unparseable date.
 *      - Outcome status (`outcomeStatus`): never inferred from the clock.
 *          • "minutes-linked"           — official minutes URL or minutes file
 *                                         is present in the record.
 *          • "canceled" | "rescheduled" — explicitly recorded cancellation/move.
 *          • "unverified"               — all other records, regardless of age.
 *
 *   2. Explicit expiration between static builds:
 *      Every `"upcoming"` record carries `calendarStatusValidUntil` (an exact
 *      UTC ISO-8601 instant derived via `Intl` in `America/Denver`), so a
 *      browser viewing a stale static export after a failed sync/rebuild can
 *      detect expiration immediately rather than advertising a passed meeting.
 */

/** The time zone kept by the City of Cheyenne. */
export const DENVER_TIME_ZONE = "America/Denver";

/** Maximum hours a static build is treated as fresh before surfacing a stale-build notice. */
export const STATIC_BUILD_STALE_HOURS = 48;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAYS = /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat),?\s+/i;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validIso(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Add whole calendar days to a validated `YYYY-MM-DD` string. */
export function addIsoDays(isoDate, deltaDays) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

/**
 * Convert any supported date label to `YYYY-MM-DD`, or null.
 *
 * Supported: ISO (`2026-10-05`, optionally with a time suffix), `October 5,
 * 2026`, `Oct. 5, 2026`, `Monday, October 5, 2026`, and `10/5/2026`.
 * Dates lacking an explicit year or invalid calendar days (e.g. `2026-02-30`)
 * return null rather than rolling over.
 */
export function normalizeMeetingDate(raw) {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return `${raw.getUTCFullYear()}-${pad2(raw.getUTCMonth() + 1)}-${pad2(raw.getUTCDate())}`;
  }
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\u00a0/g, " ").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) return validIso(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]));

  const words = text.replace(WEEKDAYS, "").replace(/\s+/g, " ").trim();
  const named = words.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    if (!month) return null;
    return validIso(Number(named[3]), month, Number(named[2]));
  }
  return null;
}

/** Wall-clock parts for an instant in a named IANA time zone. */
export function zonedDateParts(instant = new Date(), timeZone = DENVER_TIME_ZONE) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("zonedDateParts received an invalid instant");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    isoDate: `${year}-${pad2(month)}-${pad2(day)}`,
    timeZoneName: parts.timeZoneName ?? "",
  };
}

export const zonedWallClock = zonedDateParts;

/** The calendar date (`YYYY-MM-DD`) at an instant in a named time zone. */
export function zonedIsoDate(instant = new Date(), timeZone = DENVER_TIME_ZONE) {
  const parts = zonedDateParts(instant, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * Convert a scheduled local date (`YYYY-MM-DD`) and minute offset (`0..1439`)
 * in `timeZone` to the corresponding UTC ISO-8601 instant.
 *
 * Uses two-step `Intl` offset convergence rather than fixed UTC-6 / UTC-7
 * offsets so MDT/MST transitions are handled accurately.
 */
export function zonedInstantIso(isoDate, minutesAfterMidnight = 0, timeZone = DENVER_TIME_ZONE) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !Number.isFinite(minutesAfterMidnight)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guess = desiredAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const observed = zonedDateParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0, 0);
    const diff = observedAsUtc - desiredAsUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

/**
 * Minutes after midnight for a posted start time, or null if the record has no
 * usable time. Accepts 12-hour labels ("12:00 p.m.", "6 PM"), 24-hour clock
 * values ("18:00"), "noon", and "midnight".
 */
export function parsePostedTime(label) {
  if (label == null) return null;
  if (typeof label === "number" && Number.isFinite(label)) {
    return label >= 0 && label < 24 * 60 ? Math.round(label) : null;
  }
  const text = String(label).replace(/\u00a0/g, " ").trim().toLowerCase();
  if (!text) return null;
  if (text === "noon") return 12 * 60;
  if (text === "midnight") return 0;

  const compact = text.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const match = compact.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

export function looksCanceled(record) {
  const explicit = String(record?.status ?? record?.calendarStatus ?? "").toLowerCase();
  if (record?.canceled === true || explicit === "canceled" || explicit === "cancelled") return true;
  return (record?.notes ?? []).some((note) => /\bcancell?ed\b/i.test(String(note)));
}

export function looksRescheduled(record) {
  const explicit = String(record?.status ?? record?.calendarStatus ?? "").toLowerCase();
  if (explicit === "rescheduled") return true;
  return (record?.notes ?? []).some((note) => /\breschedul/i.test(String(note)));
}

/**
 * Determine historical publisher status recorded when the source was captured,
 * without deleting or mutating `record.notes`.
 */
export function extractPublisherStatusAtCapture(record) {
  if (typeof record?.publisherStatusAtCapture === "string" && record.publisherStatusAtCapture.trim()) {
    return record.publisherStatusAtCapture.trim();
  }
  const statusNote = (record?.notes ?? []).find((note) =>
    /^(?:upcoming\b|meeting cancell?ed\b|rescheduled\b)/i.test(String(note).trim()),
  );
  if (statusNote) return String(statusNote).trim();
  if (record?.postedInCapture) return "Posted upcoming in snapshot capture";
  return null;
}

/**
 * Determine outcome status strictly from source evidence — never from clock passage.
 *
 * @returns {"minutes-linked" | "canceled" | "rescheduled" | "unverified"}
 */
export function resolveOutcomeStatus(record) {
  if (looksCanceled(record)) return "canceled";
  if (looksRescheduled(record)) return "rescheduled";
  if (record?.official?.minutes) return "minutes-linked";
  if ((record?.docs ?? []).some((doc) => /\bminutes\b/i.test(String(doc?.path ?? "")))) {
    return "minutes-linked";
  }
  return "unverified";
}

/**
 * Resolve one meeting's calendar status, expiration boundary, historical capture
 * status, and separate outcome status.
 *
 * @returns {{
 *   status: "upcoming" | "same-day-time-unverified" | "start-time-passed" | "date-passed" | "canceled" | "rescheduled" | "unknown-date",
 *   upcoming: boolean,
 *   date: string | null,
 *   scheduledDate: string | null,
 *   scheduledTime: string | null,
 *   timeKnown: boolean,
 *   sameDay: boolean,
 *   rescheduledTo: string | null,
 *   evaluatedAt: string,
 *   validUntil: string | null,
 *   outcomeStatus: "minutes-linked" | "canceled" | "rescheduled" | "unverified",
 *   publisherStatusAtCapture: string | null
 * }}
 */
export function resolveMeetingCalendar(record, { now = new Date(), timeZone = DENVER_TIME_ZONE } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) throw new Error("resolveMeetingCalendar received an invalid `now` instant");

  const date = normalizeMeetingDate(record?.scheduledDate ?? record?.date);
  const rawTime = typeof record?.scheduledTime === "string" && record.scheduledTime.trim()
    ? record.scheduledTime.trim()
    : typeof record?.time === "string" && record.time.trim()
      ? record.time.trim()
      : null;
  const startMinutes = parsePostedTime(rawTime);
  const base = {
    date,
    scheduledDate: date,
    scheduledTime: rawTime,
    timeKnown: startMinutes !== null,
    sameDay: false,
    rescheduledTo: normalizeMeetingDate(record?.rescheduledTo),
    evaluatedAt: nowDate.toISOString(),
    validUntil: null,
    outcomeStatus: resolveOutcomeStatus(record),
    publisherStatusAtCapture: extractPublisherStatusAtCapture(record),
  };

  if (looksCanceled(record)) return { ...base, status: "canceled", upcoming: false };
  if (looksRescheduled(record)) return { ...base, status: "rescheduled", upcoming: false };
  if (!date) return { ...base, status: "unknown-date", upcoming: false };

  const today = zonedIsoDate(nowDate, timeZone);
  if (date > today) {
    // Future date: if start time is known, status remains valid until that
    // scheduled start minute in America/Denver; if start time is unknown,
    // confirmed-future status expires at 00:00 America/Denver on `date`, when
    // the record transitions to `same-day-time-unverified`.
    const validUntil = startMinutes !== null
      ? zonedInstantIso(date, startMinutes, timeZone)
      : zonedInstantIso(date, 0, timeZone);
    return { ...base, status: "upcoming", upcoming: true, validUntil };
  }
  if (date < today) {
    return { ...base, status: "date-passed", upcoming: false };
  }

  // Same calendar day in America/Denver.
  if (startMinutes === null) {
    // Same-day without a verified start time must NOT be advertised as a
    // confirmed future meeting: "Scheduled for today; start time not verified."
    const nextDay = addIsoDays(date, 1);
    return {
      ...base,
      status: "same-day-time-unverified",
      upcoming: false,
      sameDay: true,
      validUntil: nextDay ? zonedInstantIso(nextDay, 0, timeZone) : null,
    };
  }

  const parts = zonedDateParts(nowDate, timeZone);
  const nowMinutes = parts.hour * 60 + parts.minute;
  if (nowMinutes < startMinutes) {
    return {
      ...base,
      status: "upcoming",
      upcoming: true,
      sameDay: true,
      validUntil: zonedInstantIso(date, startMinutes, timeZone),
    };
  }
  return { ...base, status: "start-time-passed", upcoming: false, sameDay: true };
}

/** Resolve a list of meeting records cleanly while preserving raw source notes. */
export function resolveCalendar(records, { now = new Date(), timeZone = DENVER_TIME_ZONE } = {}) {
  return (records ?? []).map((record) => {
    const resolved = resolveMeetingCalendar(record, { now, timeZone });
    return {
      ...record,
      scheduledDate: resolved.scheduledDate,
      scheduledTime: resolved.scheduledTime,
      publisherStatusAtCapture: resolved.publisherStatusAtCapture,
      calendarStatus: resolved.status,
      calendarStatusEvaluatedAt: resolved.evaluatedAt,
      calendarStatusValidUntil: resolved.validUntil,
      outcomeStatus: resolved.outcomeStatus,
      upcoming: resolved.upcoming,
    };
  });
}

/**
 * The newest transcript linked to a dated, non-future meeting record.
 *
 * Excludes undated files, empty arrays, and upcoming meetings. Indicates source
 * provenance (`local` vs repository tree entry) without claiming audio verification.
 */
export function latestTranscriptRecord(records) {
  const candidates = (records ?? []).filter((record) => {
    if (!record || record.upcoming || record.calendarStatus === "upcoming") return false;
    if (!normalizeMeetingDate(record.date)) return false;
    return Boolean(record.transcript?.path);
  });
  candidates.sort((a, b) => {
    const byDate = normalizeMeetingDate(b.date).localeCompare(normalizeMeetingDate(a.date));
    if (byDate) return byDate;
    return String(a.id).localeCompare(String(b.id));
  });
  const meeting = candidates[0];
  if (!meeting) return null;
  return {
    meetingId: meeting.id,
    date: normalizeMeetingDate(meeting.date),
    bodyLabel: meeting.bodyLabel,
    transcript: meeting.transcript,
    transcriptVariants: meeting.transcripts?.length ?? 1,
    verification: "unverified-caption",
  };
}

/**
 * Whole-day age of a captured record date, or null when the timestamp is
 * missing or unparseable. Never negative.
 */
export function snapshotAgeDays(captured, now = new Date(), timeZone = DENVER_TIME_ZONE) {
  const iso = normalizeMeetingDate(captured);
  if (!iso) return null;
  const capturedMs = Date.parse(`${iso}T00:00:00Z`);
  const nowMs = Date.parse(`${zonedIsoDate(now, timeZone)}T00:00:00Z`);
  if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((nowMs - capturedMs) / 86_400_000));
}
