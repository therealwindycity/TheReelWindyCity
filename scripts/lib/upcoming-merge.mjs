/**
 * Upcoming-meeting merge rules shared by the site build and the sync pipeline.
 *
 * Red-team context (the "agenda view stuck on last week" defect): the site's
 * upcoming view was driven by a curated snapshot whose `upcoming` array was
 * marked as upcoming *unconditionally* — a meeting whose date had passed kept
 * its "Upcoming" label forever, and nothing the watcher did could demote it.
 * These helpers centralize the two rules that fix the class of bug:
 *
 *   1. DATE GATE — a meeting is "upcoming" only if its date is today or later
 *      in the city's own timezone (America/Denver). Stale captures therefore
 *      self-heal at every static build: the hourly Pages rebuild demotes a
 *      meeting the morning after it happens, no matter how stale the snapshot
 *      that still lists it.
 *
 *   2. DETECTED-TABLE MERGE — the watcher (which successfully reads the city's
 *      live upcoming table every hour) publishes the semantic records it sees;
 *      the build merges any record that the curated snapshot does not already
 *      cover, so the calendar stays current even while agenda-document
 *      ingestion (PDF extraction) is blocked or pending.
 *
 * Merges are additive and conservative: they never invent agenda items, Zoom
 * details, or locations that no official source provides.
 */

/** The city's timezone; every date gate resolves against it, not the builder's TZ. */
export const CITY_TIMEZONE = "America/Denver";

/**
 * Today's date (YYYY-MM-DD) as experienced in Cheyenne.
 * Uses en-CA formatting, which yields ISO-shaped output for this purpose.
 */
export function cheyenneTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A meeting on `date` is upcoming when it is today or later in city time. */
export function isUpcomingDate(date, todayISO = cheyenneTodayISO()) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayISO;
}

/** Convert the canonical "HH:MM" (24h) time into the site's display form. */
export function displayTime(normalizedTime) {
  const match = String(normalizedTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return undefined;
  const suffix = hours < 12 ? "a.m." : "p.m.";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/**
 * Apply one curated `upcoming` entry to its meeting object.
 *
 * Rich data (items, Zoom, location) is applied regardless of the date — an
 * overdue entry is a real captured agenda and stays in the index as history —
 * but `upcoming` is set ONLY when the entry's date has not passed. This is the
 * fix for the stale-agenda defect: an out-of-date snapshot can no longer keep
 * last week's committee meetings in the "Upcoming agendas" view.
 *
 * `dayLabelFor(date)` supplies the weekday label when the entry omits one.
 * Returns the same meeting for chaining.
 */
export function applyCuratedUpcoming(meeting, entry, { todayISO = cheyenneTodayISO(), dayLabelFor } = {}) {
  if (entry.dayLabel) meeting.dayLabel = entry.dayLabel;
  else if (dayLabelFor) meeting.dayLabel = meeting.dayLabel || dayLabelFor(entry.date);
  if (entry.time) meeting.time = entry.time;
  if (entry.location) meeting.location = entry.location;
  if (entry.items) meeting.items = entry.items;
  if (entry.zoom) meeting.zoom = entry.zoom;
  if (entry.agendaPath) meeting.official.agenda = meeting.official.agenda || entry.agendaPath;
  if (entry.granicusUrl) {
    meeting.official.agenda = meeting.official.agenda || entry.granicusUrl;
    meeting.official.granicus = entry.granicusUrl;
  }
  // The date gate: the rule that makes the upcoming view self-healing.
  if (isUpcomingDate(entry.date, todayISO)) meeting.upcoming = true;
  return meeting;
}

/**
 * Merge one record from the watcher's detected-table publish
 * (src/data/detected-upcoming.json) into the meeting index.
 *
 * `existing` tells the merger whether the meeting already existed in the index
 * (pass the result of a lookup BEFORE `ensure` creates it). Rules:
 *   - records whose date has passed are ignored (the archive supersedes them);
 *   - a NEW future meeting is created as an upcoming entry with its official
 *     agenda link and posted time — never with invented items, Zoom details,
 *     or locations — plus one provenance note explaining why item details may
 *     not be transcribed yet;
 *   - an EXISTING meeting only gains fields it is missing (agenda link, time,
 *     weekday label, upcoming flag); curated data always wins.
 *
 * @returns {{ meeting: object, created: boolean } | null} null when the record
 *   is unusable (unknown body, malformed/past date).
 */
export function applyDetectedRecord(ensure, record, { existing, todayISO = cheyenneTodayISO(), dayLabelFor, provenanceNote } = {}) {
  if (!record || typeof record.body !== "string" || record.body.length === 0) return null;
  if (!isUpcomingDate(record.date, todayISO)) return null;

  const meeting = ensure(record.body, record.date);
  const created = !existing;

  if (!meeting.official.agenda && record.agendaUrl) meeting.official.agenda = record.agendaUrl;
  if (record.agendaUrl) meeting.official.granicus = meeting.official.granicus || record.agendaUrl;
  if (!meeting.time && record.time) meeting.time = displayTime(record.time);
  if (!meeting.dayLabel && dayLabelFor) meeting.dayLabel = dayLabelFor(record.date);
  if (created && provenanceNote) {
    meeting.notes ||= [];
    if (!meeting.notes.includes(provenanceNote)) meeting.notes.push(provenanceNote);
  }
  meeting.upcoming = true;
  return { meeting, created };
}
