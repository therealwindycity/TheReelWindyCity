import {
  FEATURED_MEETING,
  GRANICUS_UPCOMING_URL,
  MEETING,
  MEETINGS_CAPTURED,
  MEETING_STATS,
  NEXT_MEETING,
  OFFICIAL_SCHEDULE_CHECKED_AT,
  OFFICIAL_SCHEDULE_URL,
  WATCHER_BASELINE_CHECKED_AT,
} from "./civic-data";
import { CHEYENNE_SCANNER_FEEDS, WYOMING_CITIES } from "./wyoming-cities";

/** A record snapshot older than this is called out as possibly out of date. */
export const SNAPSHOT_STALE_AFTER_DAYS = 14;

export type SnapshotFreshness = {
  /** ISO date of the committed official-meetings snapshot, e.g. "2026-10-03". */
  captured: string;
  /** Human label for the snapshot date, e.g. "October 3, 2026". */
  capturedLabel: string;
  /** Separate timestamp when the live city schedule table was recorded, if any (never substituted for `captured`). */
  scheduleCheckedAt: string | null;
  /** Separate timestamp of the committed Granicus watcher baseline, if any. */
  watcherCheckedAt: string | null;
  /** Build-time evaluation timestamp for `calendarStatus` in America/Denver. */
  calendarEvaluatedAt: string;
  /** Whole days between the snapshot date and the reference date in America/Denver. */
  ageInDays: number;
  /** Short age phrase, e.g. "today", "yesterday", "18 days ago". */
  ageLabel: string;
  /** True when the snapshot is old enough that visitors should double-check it. */
  stale: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function denverDayEpochMs(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}

/**
 * How old the underlying record snapshot is in America/Denver calendar days.
 * Keeps `captured`, `scheduleCheckedAt`, `watcherCheckedAt`, and `calendarEvaluatedAt`
 * distinct rather than conflating schedule-check timestamps with snapshot capture.
 */
export function getSnapshotFreshness(
  captured: string = MEETINGS_CAPTURED,
  now: Date = new Date(),
): SnapshotFreshness {
  const capturedDate = new Date(`${captured}T00:00:00Z`);
  const nowDay = denverDayEpochMs(now);
  const capturedMs = Number.isNaN(capturedDate.getTime())
    ? nowDay
    : Date.UTC(capturedDate.getUTCFullYear(), capturedDate.getUTCMonth(), capturedDate.getUTCDate());
  const ageInDays = Math.max(0, Math.round((nowDay - capturedMs) / DAY_MS));

  let ageLabel = "today";
  if (ageInDays === 1) ageLabel = "yesterday";
  else if (ageInDays > 1) ageLabel = `${ageInDays} days ago`;

  return {
    captured,
    capturedLabel: capturedDate.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    scheduleCheckedAt: OFFICIAL_SCHEDULE_CHECKED_AT,
    watcherCheckedAt: WATCHER_BASELINE_CHECKED_AT,
    calendarEvaluatedAt: MEETING_STATS.calendarStatusEvaluatedAt ?? "",
    ageInDays,
    ageLabel,
    stale: ageInDays >= SNAPSHOT_STALE_AFTER_DAYS,
  };
}

/** The origin a URL belongs to, so a visitor can see exactly where a window goes. */
export function publisherHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "external publisher";
  }
}

export type HubSource = {
  id: string;
  shortLabel: string;
  label: string;
  category: string;
  description: string;
  embedUrl: string;
  sourceUrl: string;
  sourceName: string;
  context: string;
  mode: "webpage" | "video" | "audio";
  sandbox?: string;
  allow?: string;
};

const cheyenne = WYOMING_CITIES.find((city) => city.id === "cheyenne")!;
const primaryScanner = CHEYENNE_SCANNER_FEEDS[0];
const postedAgendaUrl = NEXT_MEETING?.official.agenda ?? NEXT_MEETING?.official.granicus ?? GRANICUS_UPCOMING_URL;
const agendaViewerUrl = NEXT_MEETING?.official.granicus ?? NEXT_MEETING?.official.agenda ?? GRANICUS_UPCOMING_URL;

export function getHubSources(): HubSource[] {
  return [
    {
      id: "agenda",
      shortLabel: "Posted agenda",
      label: NEXT_MEETING
        ? `${NEXT_MEETING.bodyLabel} · ${NEXT_MEETING.shortDate} (snapshot)`
        : "City of Cheyenne · Posted agendas & schedule",
      category: "CITY GOVERNMENT",
      description: NEXT_MEETING
        ? "Open the posted agenda and meeting details from the City of Cheyenne’s Granicus publisher."
        : "Open the City of Cheyenne’s live Granicus schedule for current upcoming postings.",
      embedUrl: agendaViewerUrl,
      sourceUrl: NEXT_MEETING ? postedAgendaUrl : OFFICIAL_SCHEDULE_URL,
      sourceName: "City of Cheyenne · Granicus",
      context: "An agenda lists items for consideration. It does not show whether a meeting met or what the body decided.",
      mode: "webpage",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-presentation",
    },
    {
      id: "recording",
      shortLabel: "Council video",
      label: `Recorded City Council meeting · ${MEETING.shortDate}`,
      category: "MEETING VIDEO",
      description: "A published recording from the January 26, 2026 City Council meeting, paired with the original video link.",
      embedUrl: `https://www.youtube-nocookie.com/embed/${MEETING.youtubeId}?rel=0`,
      sourceUrl: MEETING.videoUrl,
      sourceName: "City meeting video · YouTube / Granicus",
      context: "This is an archived recording, not a live broadcast. Captions can be imperfect; verify names and quotations against the video and minutes.",
      mode: "video",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    },
    {
      id: "scanner",
      shortLabel: "Scanner audio",
      label: primaryScanner.name,
      category: "PUBLIC SAFETY AUDIO",
      description: "A public Broadcastify player for the Laramie County law-enforcement feed.",
      embedUrl: primaryScanner.popoutUrl,
      sourceUrl: primaryScanner.listenUrl,
      sourceName: "Broadcastify · Feed 47003",
      context: "Scanner audio is an unfiltered third-party relay, may be delayed or unavailable, and is not an emergency alert or official incident record. Call 911 for emergencies.",
      mode: "audio",
      sandbox: "allow-scripts allow-same-origin allow-popups",
    },
    {
      id: "weather",
      shortLabel: "NWS forecast",
      label: `National Weather Service · ${cheyenne.name}`,
      category: "WEATHER",
      description: "The National Weather Service forecast page for Cheyenne and surrounding forecast zones.",
      embedUrl: `https://forecast.weather.gov/MapClick.php?lat=${cheyenne.latitude}&lon=${cheyenne.longitude}`,
      sourceUrl: `https://forecast.weather.gov/MapClick.php?lat=${cheyenne.latitude}&lon=${cheyenne.longitude}`,
      sourceName: "National Weather Service",
      context: "Use NWS watches and warnings for official weather guidance. The forecast zone is broader than the city boundary.",
      mode: "webpage",
      sandbox: "allow-scripts allow-same-origin allow-popups",
    },
    {
      id: "roads",
      shortLabel: "WYDOT roads",
      label: "Cheyenne road conditions",
      category: "TRANSPORTATION",
      description: "WYDOT’s public road-condition page for Cheyenne, with access to statewide 511 information.",
      embedUrl: "https://www.wyoroad.info/pls/Browse/WRR.TownResults?SelectedTown=Cheyenne",
      sourceUrl: "https://www.wyoroad.info/pls/Browse/WRR.TownResults?SelectedTown=Cheyenne",
      sourceName: "Wyoming Department of Transportation · 511",
      context: "Road reports can change quickly. Confirm closures and travel instructions with WYDOT before you travel.",
      mode: "webpage",
      sandbox: "allow-scripts allow-same-origin allow-popups",
    },
  ];
}

export function getFeaturedMeeting() {
  return NEXT_MEETING ?? FEATURED_MEETING;
}
