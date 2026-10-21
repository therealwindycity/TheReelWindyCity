import officialSources from "@/data/official-sources.json";
import meetingsIndex from "@/data/meetings.json";

export const ARCHIVE_OWNER = "therealwindycity";
export const ARCHIVE_REPO = "cheyenne-archives-2025-2026";
export const TRANSCRIPT_REPO = "The-Real-Windy-City-";
/** Deployment path prefix (GitHub Pages project sites serve under /<repo>). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
/** Prefix a root-relative public asset path with the deployment base path. */
export function asset(publicPath: string) { return `${BASE_PATH}/${publicPath.replace(/^\/+/, "")}`; }
/** Locally bundled copy of an official document for the guided session, if one exists. */
export function officialSourcePath(id: string): string | null {
  return (officialSources as Record<string, string>)[id] ?? null;
}
export const CITY_HALL_COORDINATES: [number, number] = [41.135486, -104.822242];
// General neighborhood reference within the four roads named in the agenda; not a parcel centroid or legal boundary.
export const EAST_CHEYENNE_COORDINATES: [number, number] = [41.166, -104.782];
export const REPOSITORIES = [
  { id: ARCHIVE_REPO, label: "Meeting records · 2025–2026" },
  { id: TRANSCRIPT_REPO, label: "Meeting transcripts · 2026" },
  { id: "cheyenne-archives-2023-2024", label: "Meeting records · 2023–2024" },
  { id: "cheyenne-archives-2022", label: "Meeting records · 2022" },
  { id: "cheyenne-archives-2018-2021", label: "Meeting records · 2018–2021" },
  { id: "cheyenne-archives-2014-2017", label: "Meeting records · 2014–2017" },
  { id: "cheyenne-archives-2008-2013", label: "Meeting records · 2008–2013" },
];
export type SourceFile = { path: string; sha: string; size: number; type: "PDF" | "Transcript" | "Source"; repo: string };
export type CivicProgress = { ordinanceId: string; stage: string; position: string | null; reflection: string; updatedAt: string };
export type Bookmark = { id: string; repo: string; path: string };
export type Ordinance = {
  id: string; item: number; title: string; category: string; reading: string; icon: "home" | "map" | "trees" | "shield" | "layers";
  description: string; fullTitle: string; area: string; committee: string; color: string; sourceUrl: string; timestamp: number;
  baseline: string; proposed: string; uncertainty: string; outcome: string; outcomeLabel: string; questions: string[];
  center: [number, number]; zoom: number; scope: "citywide" | "east"; topics: string[];
};
export const MEETING = {
  id: "2026-01-26", date: "January 26, 2026", shortDate: "Jan 26, 2026", time: "6:00 PM", location: "Council Chambers", address: "2101 O’Neil Avenue, Cheyenne, WY",
  agendaUrl: "https://cheyenne.granicus.com/GeneratedAgendaViewer.php?view_id=5&event_id=1382",
  minutesUrl: "https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_18719967ab1f8d1bb9138ebe5e6cb35f.pdf&view=1",
  videoUrl: "https://cheyenne.granicus.com/player/clip/1053?view_id=5&redirect=true",
  youtubeId: "x6Veeticz3Q",
  transcriptPath: "cheyenne-2026-transcripts/city-council/2026-01-26-city-council.md",
  archiveFolder: "1769414400Jan 26, 2026 - City Council Meeting",
};
export const ORDINANCES: Ordinance[] = [
  {
    id: "2026-01-26-adu", item: 9, title: "Accessory dwelling units", category: "Housing & development", reading: "2nd reading", icon: "home", color: "green",
    description: "A proposed update to owner-occupancy and parking rules for accessory dwellings.",
    fullTitle: "Amending 5.7.3 Accessory Dwelling Units of the Cheyenne Unified Development Code to remove owner-occupancy and adjust parking requirements for Accessory Dwellings, and making conforming amendments to the definitions of an Accessory Dwelling and Semi-Attached Dwelling under 1.4.4 Descriptions of Uses of Land and Buildings.",
    area: "Citywide · eligible residential lots", committee: "Public Services Committee", sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145679", timestamp: 3516,
    baseline: "The planning staff report describes an existing owner-occupancy requirement and reports about three ADU applications a year under current code requirements. That is a reported baseline, not a prediction of this ordinance’s effects.",
    proposed: "The proposal would remove the owner-occupancy requirement. The staff report also describes more flexible ways to meet required parking, including a third driveway stall or on-street parking where street frontage is sufficient. Staff note that removing owner-occupancy means ADUs must be treated as two units for building-code compliance. It would change eligibility and compliance requirements, not approve an individual dwelling.",
    uncertainty: "The linked records do not establish how many additional homes would be built, whether rents would change, or how parking demand would respond. Other permits and land-use rules would still apply.",
    outcome: "The official January 26 minutes record approval on second reading, with Dr. Rinne and Mr. Segrave voting no. This was not final adoption. Check subsequent minutes and the final ordinance for later action and current legal status.", outcomeLabel: "Approved on 2nd reading", questions: ["Which lots would be eligible?", "How would parking requirements change?", "What separate-unit building standards would apply?"],
    center: [41.145, -104.805], zoom: 12, scope: "citywide", topics: ["Housing", "Parking", "Property owners"],
  },
  {
    id: "2026-01-26-annexation", item: 7, title: "East Cheyenne annexation", category: "Land use & city services", reading: "2nd reading", icon: "map", color: "blue",
    description: "Bringing surrounded county tracts in eastern Cheyenne into city limits.",
    fullTitle: "Annexing to the City of Cheyenne, Wyoming, various tracts of land completely surrounded by current City limits situate in eastern Cheyenne, generally located south of Storey Boulevard, east of Powderhouse Road, north of Dell Range Boulevard, and west of Ridge Road.",
    area: "East Cheyenne · Storey / Dell Range area", committee: "Public Services Committee", sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145674", timestamp: 3290,
    baseline: "The agenda identifies these tracts as outside the city boundary but completely surrounded by current city limits.",
    proposed: "If the annexation is enacted, the tracts described in the ordinance would become part of the City of Cheyenne. Municipal jurisdiction would change. Exact service, tax, and utility obligations must be checked against the annexation report and adopted text.",
    uncertainty: "The map shows the general area named in the agenda, not a surveyed boundary. It is not a parcel eligibility map. No tax bill, service cost, or revenue forecast is asserted here.",
    outcome: "The official January 26 minutes record unanimous approval on second reading. This advanced the proposal; it did not establish final adoption or an effective date. Check later readings and the adopted text before treating the boundary change as enacted.", outcomeLabel: "Approved on 2nd reading", questions: ["Which legal parcels are included?", "When would city jurisdiction begin?", "What services and obligations would change?"],
    center: EAST_CHEYENNE_COORDINATES, zoom: 14, scope: "east", topics: ["City limits", "Services", "Landowners"],
  },
  {
    id: "2026-01-26-displays", item: 10, title: "Private displays on public land", category: "Public space & community", reading: "1st reading", icon: "trees", color: "amber",
    description: "Proposed rules for unauthorized private displays on public property.",
    fullTitle: "Creating Chapter 8.72, Private Displays on Public Property, to prohibit the unauthorized use of public property for specified private displays.",
    area: "Citywide · public property", committee: "Sponsors: Dr. Aldrich & Mr. Moody", sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145681", timestamp: 4122,
    baseline: "This proposal would create a new Chapter 8.72. The agenda alone does not establish how each existing private display is currently regulated.",
    proposed: "If enacted, the new chapter would prohibit unauthorized use of public property for the specified private displays. The supporting text determines the definitions, exceptions, authorization process, and enforcement provisions.",
    uncertainty: "No claim is made about a particular memorial, sign, or display. The map locates City Hall as a reference; it does not identify violations or predict enforcement actions.",
    outcome: "The official January 26 minutes record first reading and referral to the Public Services Committee. This was a proposal at this session, not a final enacted law.", outcomeLabel: "Referred to committee", questions: ["What counts as a private display?", "How could a display be authorized?", "Which exceptions would apply?"],
    center: CITY_HALL_COORDINATES, zoom: 14, scope: "citywide", topics: ["Public property", "Displays", "Authorization"],
  },
  {
    id: "2026-01-26-warrants", item: 6, title: "Administrative inspection warrants", category: "Government & enforcement", reading: "3rd reading", icon: "shield", color: "purple",
    description: "Proposed authority for specified city officials to apply for inspection warrants.",
    fullTitle: "Creating Chapter 1.28, Administrative Inspection Warrants, establishing authority for their issuance, and amending the Municipal Code of the City of Cheyenne, Wyoming, to authorize certain city officials, as specified, to apply for administrative inspection warrants.",
    area: "Citywide · municipal inspections", committee: "Public Services Committee", sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145727", timestamp: 252,
    baseline: "The proposal would establish a new Chapter 1.28. Existing inspection authority and constitutional safeguards must be assessed from the code and legal sources, not inferred from public testimony.",
    proposed: "If enacted in the form described on the agenda, specified officials would be authorized to apply for administrative inspection warrants. The ordinance text controls the application, issuance, and inspection procedures.",
    uncertainty: "Public testimony is a speaker’s position, not a legal finding. The agenda provides no forecast of inspection volume or enforcement outcomes.",
    outcome: "The official January 26 minutes record a unanimous vote to postpone this ordinance until February 9, 2026. Although listed at third reading, it was not adopted at this session.", outcomeLabel: "Postponed to Feb 9", questions: ["Which officials could apply?", "What judicial review is required?", "What protections are written into the text?"],
    center: CITY_HALL_COORDINATES, zoom: 12, scope: "citywide", topics: ["Inspections", "Process", "Property rights"],
  },
  {
    id: "2026-01-26-zoning", item: 8, title: "East Cheyenne zoning", category: "Land use & planning", reading: "2nd reading", icon: "layers", color: "blue",
    description: "Agricultural and medium-density residential zoning for proposed annexation tracts.",
    fullTitle: "Amending the Official Zoning Map of the City of Cheyenne, establishing the zoning classifications of AG – Agricultural, and MR – Medium-Density Residential, for land annexed to the City of Cheyenne generally located south of Storey Boulevard, east of Powderhouse Road, north of Dell Range Boulevard, and west of Ridge Road.",
    area: "East Cheyenne · proposed annexation tracts", committee: "Public Services Committee", sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145676", timestamp: 3435,
    baseline: "The companion annexation ordinance describes tracts currently outside city limits. This item would assign city zoning classifications if the annexation proceeds.",
    proposed: "If enacted with the annexation, the ordinance would assign Agricultural (AG) and Medium-Density Residential (MR) classifications to the land identified in its zoning exhibit. These classifications guide permitted uses; they do not approve a specific project.",
    uncertainty: "The general-area map is not the official zoning exhibit. No parcel is assigned a zoning classification here, and no new building count or development timeline is predicted.",
    outcome: "The official January 26 minutes record unanimous approval on second reading for this companion zoning item. Consult subsequent final text for adopted classifications and the effective date.", outcomeLabel: "Approved on 2nd reading", questions: ["Which tracts would be AG or MR?", "What uses are allowed in each zone?", "Is the companion annexation enacted?"],
    center: EAST_CHEYENNE_COORDINATES, zoom: 14, scope: "east", topics: ["Zoning", "Agriculture", "Residential uses"],
  },
];
export function githubUrl(repo: string, path: string) { return `https://github.com/${ARCHIVE_OWNER}/${repo}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`; }
export function rawUrl(repo: string, path: string) { return `https://raw.githubusercontent.com/${ARCHIVE_OWNER}/${repo}/main/${path.split("/").map(encodeURIComponent).join("/")}`; }
export function readableName(path: string) {
  const name = path.split("/").pop() || path;
  if (/^\d{10}/.test(name)) return name.replace(/^\d{10}/, "").replace(/ - (City Council Meeting|City Council|Finance Committee|Public Services Committee).*? - /, " · ").replace(/ - ([^.]+)\.pdf$/, ".pdf");
  return name;
}

/* ------------------------------------------------------------------ */
/* Orthogonal status, provenance, and expiration model                 */
/* ------------------------------------------------------------------ */

export type MeetingCalendarStatus =
  | "upcoming"
  | "same-day-time-unverified"
  | "start-time-passed"
  | "date-passed"
  | "canceled"
  | "rescheduled"
  | "unknown-date";

export type MeetingOutcomeStatus = "minutes-linked" | "canceled" | "rescheduled" | "unverified";

export type MeetingIngestionStage =
  | "posting-discovered"
  | "agenda-downloaded"
  | "agenda-validated"
  | "meeting-indexed"
  | "outcome-verified";

export type MeetingTimestamps = {
  discoveredAt: string | null;
  downloadedAt: string | null;
  validatedAt: string | null;
  indexedAt: string;
  outcomeVerifiedAt: string | null;
};

export type AgendaItem = { number: string; kind: string; text: string };
export type MeetingDocRef = { repo: string; path: string; local?: boolean; publicPath?: string; size?: number };
export type MeetingTranscriptExcerpt = { id: string; timestamp: string; text: string; sourceUrl: string; videoUrl?: string };

export type Meeting = {
  id: string;
  body: string;
  bodyLabel: string;
  date: string;
  dateLabel: string;
  shortDate: string;
  /** Raw source notes preserved verbatim (never stripped). */
  notes?: string[];
  docs: MeetingDocRef[];
  official: { agenda?: string; minutes?: string; video?: string; granicus?: string };
  transcript?: MeetingDocRef;
  transcripts?: MeetingDocRef[];
  transcriptExcerpts?: MeetingTranscriptExcerpt[];
  /** Historical status statement preserved from snapshot capture time. */
  publisherStatusAtCapture?: string | null;
  /** Snapshot capture date (`YYYY-MM-DD`) when known. */
  snapshotCapturedAt?: string | null;
  /** Normalized scheduled calendar date (`YYYY-MM-DD`). */
  scheduledDate?: string | null;
  /** Posted start time string when verified in the source record. */
  scheduledTime?: string | null;
  /** Calendar position evaluated at `calendarStatusEvaluatedAt` in `America/Denver`. */
  calendarStatus?: MeetingCalendarStatus;
  calendarStatusEvaluatedAt?: string;
  /** Explicit UTC instant after which a time-sensitive status expires between static builds. */
  calendarStatusValidUntil?: string | null;
  /** Separate outcome status — never inferred from passing time. */
  outcomeStatus?: MeetingOutcomeStatus;
  /** Pipeline provenance stage reached for this record. */
  ingestionStage?: MeetingIngestionStage;
  /** True when an official schedule posting was discovered without archived agenda items. */
  archiveUnavailable?: boolean;
  /** Separate timestamps across discovery, download, validation, indexing, and verification. */
  timestamps?: MeetingTimestamps;
  upcoming?: boolean;
  agendaPosted?: boolean;
  postedInCapture?: boolean;
  postedOnOfficialTable?: boolean;
  sourceObservedAt?: string;
  rescheduledTo?: string;
  dayLabel?: string;
  time?: string;
  location?: string;
  items?: AgendaItem[];
  zoom?: { joinUrl: string; webinarId: string; passcode: string; callIn: string; callInPasscode: string };
};

export type LiveSourceCheck = {
  observedAt: string | null;
  ok: boolean;
  used: boolean;
  stale: boolean;
  ageHours: number | null;
  sourceUrl: string | null;
  error: string | null;
  meetings: number;
};

export type DiscoveredPostingMeta = {
  meetingId: string;
  body: string;
  bodyLabel: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  agendaUrl: string | null;
  discoveredAt: string | null;
  source: "watcher-table" | "build-live-check" | "sync-blocked";
  archiveStatus: "validated" | "archive-unavailable" | "download-failed";
  promotedWithValidatedItems: boolean;
  calendarStatus: MeetingCalendarStatus;
  outcomeStatus: MeetingOutcomeStatus;
};

export type BlockedSyncMeta = {
  attemptedAt: string | null;
  attempts: number;
  reason: string;
  meetingIds: string[];
  entries: DiscoveredPostingMeta[];
};

export type PipelineProvenance = {
  snapshotCapturedAt: string | null;
  watcherBaselineCheckedAt: string | null;
  scheduleCheckedAt: string | null;
  blockedSync: BlockedSyncMeta | null;
  validatedExtractions: Array<{ meetingId: string; downloadedAt: string | null; items: number }>;
  rejectedExtractions: Array<{ meetingId: string; dir: string; problems: string[] }>;
  discoveredPostings: DiscoveredPostingMeta[];
};

type MeetingIndex = {
  meetings: Meeting[];
  resolvedAt?: string;
  buildValidUntil?: string;
  timeZone?: string;
  scheduleUrl?: string;
  granicusUpcomingUrl?: string;
  watcherBaselineCheckedAt?: string | null;
  liveCheck?: LiveSourceCheck | null;
  detectedTable?: { discoveredAt: string | null; sourceUrl: string | null; meetings: number; used: boolean } | null;
  pipeline?: PipelineProvenance;
  latestTranscript?: {
    meetingId: string;
    date: string;
    bodyLabel: string;
    transcript: MeetingDocRef;
    transcriptVariants: number;
    verification?: string;
  } | null;
  stats: {
    totalMeetings: number;
    pastMeetings: number;
    upcomingMeetings: number;
    sameDayUnverifiedMeetings?: number;
    earliest: string | null;
    latest: string | null;
    totalDocuments: number;
    totalTranscripts: number;
    totalTranscriptFiles?: number;
    localValidatedTranscripts?: number;
    excerptIndexedMeetings?: number;
    audioVerifiedTranscripts?: number;
    calendarStatusEvaluatedAt?: string;
    byBody: Record<string, { label: string; count: number; first: string; last: string }>;
  };
  captured: string | null;
  schedules: Record<string, string>;
};

const index = meetingsIndex as MeetingIndex;

export const MEETINGS = index.meetings;
export const MEETING_STATS = {
  ...index.stats,
  calendarStatusEvaluatedAt: index.stats.calendarStatusEvaluatedAt ?? index.resolvedAt ?? "",
};
export const MEETING_SCHEDULES = index.schedules;
export const MEETINGS_CAPTURED = index.captured ?? "";
export const OFFICIAL_SNAPSHOT_CAPTURED = MEETINGS_CAPTURED;
export const OFFICIAL_SNAPSHOT_CAPTURED_LABEL = formatSnapshotDate(MEETINGS_CAPTURED) ?? MEETINGS_CAPTURED;
export const MEETINGS_RESOLVED_AT = index.resolvedAt ?? null;
export const MEETINGS_BUILD_VALID_UNTIL = index.buildValidUntil ?? null;
export const MEETINGS_TIME_ZONE = index.timeZone ?? "America/Denver";
/** Distinct watcher baseline check timestamp — never substituted for `MEETINGS_CAPTURED`. */
export const WATCHER_BASELINE_CHECKED_AT = index.watcherBaselineCheckedAt ?? null;
export const LIVE_SOURCE_CHECK = index.liveCheck ?? null;
export const PIPELINE_PROVENANCE = index.pipeline ?? null;
export const OFFICIAL_SCHEDULE_CHECKED_AT = LIVE_SOURCE_CHECK?.observedAt ?? PIPELINE_PROVENANCE?.scheduleCheckedAt ?? null;
export const OFFICIAL_SCHEDULE_URL = index.scheduleUrl ?? "https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas";
export const GRANICUS_UPCOMING_URL = index.granicusUpcomingUrl ?? "https://cheyenne.granicus.com/ViewPublisher.php?view_id=5&widget=upcoming";

export const UPCOMING_MEETINGS = MEETINGS.filter((meeting) => meeting.upcoming);
/** Same-day postings lacking a verified start time — never advertised as confirmed future meetings. */
export const SAME_DAY_UNVERIFIED_MEETINGS = MEETINGS.filter((meeting) => meeting.calendarStatus === "same-day-time-unverified");
/** The soonest confirmed future meeting as of build evaluation, or null when none is confirmed. */
export const NEXT_MEETING: Meeting | null = UPCOMING_MEETINGS[0] ?? null;
/** Most recent non-upcoming meeting in the record. */
export const LATEST_MEETING: Meeting | null = MEETINGS.find((meeting) => !meeting.upcoming) ?? null;
export const FEATURED_MEETING: Meeting = NEXT_MEETING ?? LATEST_MEETING ?? MEETINGS[0];
export const DEFAULT_MEETING_ID = FEATURED_MEETING.id;
export const GUIDED_MEETING_ID = "city-council-2026-01-26";

export const LATEST_TRANSCRIPT_MEETING: Meeting | null = index.latestTranscript
  ? MEETINGS.find((meeting) => meeting.id === index.latestTranscript?.meetingId) ?? null
  : null;
export const LATEST_TRANSCRIPT_META = index.latestTranscript ?? null;

export function getMeeting(id: string): Meeting | undefined {
  return MEETINGS.find((meeting) => meeting.id === id);
}

/**
 * Raw `notes` remain intact on every record in `meetings.json` so historical
 * source observations are never destroyed. UI badges and subtitles filter out
 * capture-time futurity adjectives (`"Upcoming — agenda posted"`) and surface
 * historical capture status explicitly instead.
 */
export function displayMeetingNotes(meeting: Meeting): string[] {
  return (meeting.notes ?? []).filter((note) => !/^upcoming\b/i.test(note.trim()));
}

/**
 * Evaluate whether a build-time `"upcoming"` or `"same-day-time-unverified"`
 * status has expired in the visitor's browser since the static HTML was built.
 */
function calendarStatusPhrase(meeting: Meeting, status: MeetingCalendarStatus, expiredSinceBuild: boolean): string {
  if (status === "upcoming") {
    if (meeting.archiveUnavailable || meeting.ingestionStage === "posting-discovered") {
      return "Official posting detected; archive unavailable";
    }
    return `Next posted meeting as of snapshot (${MEETINGS_CAPTURED || "unrecorded capture date"})`;
  }
  if (status === "same-day-time-unverified") {
    return "Scheduled for today; start time not verified.";
  }
  if (status === "start-time-passed") {
    return expiredSinceBuild
      ? "Scheduled start time passed since static build; outcome not verified."
      : "Scheduled start time passed; outcome not verified.";
  }
  if (status === "canceled") return "Canceled per source record";
  if (status === "rescheduled") {
    return meeting.rescheduledTo ? `Rescheduled to ${meeting.rescheduledTo}` : "Rescheduled";
  }
  if (status === "unknown-date") return "Scheduled date not verified";
  return meeting.outcomeStatus === "minutes-linked"
    ? "Scheduled date passed · official minutes linked"
    : "Scheduled date passed; outcome not verified.";
}

export function evaluateMeetingCalendarAt(meeting: Meeting, viewerNow?: Date | null): {
  status: MeetingCalendarStatus;
  upcoming: boolean;
  expiredSinceBuild: boolean;
  expired: boolean;
  label: string;
} {
  const buildStatus = meeting.calendarStatus ?? (meeting.upcoming ? "upcoming" : "date-passed");
  if (!viewerNow || !meeting.calendarStatusValidUntil) {
    return {
      status: buildStatus,
      upcoming: buildStatus === "upcoming",
      expiredSinceBuild: false,
      expired: false,
      label: calendarStatusPhrase(meeting, buildStatus, false),
    };
  }
  const validUntilMs = Date.parse(meeting.calendarStatusValidUntil);
  if (!Number.isFinite(validUntilMs) || viewerNow.getTime() < validUntilMs) {
    return {
      status: buildStatus,
      upcoming: buildStatus === "upcoming",
      expiredSinceBuild: false,
      expired: false,
      label: calendarStatusPhrase(meeting, buildStatus, false),
    };
  }
  // Validity boundary passed between static builds: demote without inferring held/completed outcome.
  const denverToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEETINGS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(viewerNow);
  const targetDate = meeting.scheduledDate ?? meeting.date;
  if (targetDate === denverToday) {
    const expiredStatus: MeetingCalendarStatus = meeting.scheduledTime ? "start-time-passed" : "same-day-time-unverified";
    return {
      status: expiredStatus,
      upcoming: false,
      expiredSinceBuild: true,
      expired: true,
      label: calendarStatusPhrase(meeting, expiredStatus, true),
    };
  }
  return {
    status: "date-passed",
    upcoming: false,
    expiredSinceBuild: true,
    expired: true,
    label: calendarStatusPhrase(meeting, "date-passed", true),
  };
}

export function isBuildStaleAt(viewerNow?: Date | null): boolean {
  if (!viewerNow || !MEETINGS_BUILD_VALID_UNTIL) return false;
  const ms = Date.parse(MEETINGS_BUILD_VALID_UNTIL);
  return Number.isFinite(ms) && viewerNow.getTime() >= ms;
}

/** Group label used by the meeting picker: "Upcoming", "Scheduled today", "2026", etc. */
export function meetingGroupLabel(meeting: Meeting, viewerNow?: Date | null): string {
  const { status } = evaluateMeetingCalendarAt(meeting, viewerNow);
  if (status === "upcoming") return "Upcoming";
  if (status === "same-day-time-unverified") return "Scheduled today";
  return meeting.date.slice(0, 4);
}

/** Honest, unambiguous calendar status label — never infers that a meeting was held. */
export function meetingCalendarLabel(meeting: Meeting, viewerNow?: Date | null): string {
  return evaluateMeetingCalendarAt(meeting, viewerNow).label.replace(/\.$/, "");
}

/** Separate outcome label — strictly distinct from calendar status. */
export function meetingOutcomeLabel(meeting: Meeting): string {
  switch (meeting.outcomeStatus) {
    case "minutes-linked":
      return "Official minutes linked in record (consult minutes for recorded actions)";
    case "canceled":
      return "Canceled per source notice";
    case "rescheduled":
      return meeting.rescheduledTo ? `Rescheduled to ${meeting.rescheduledTo}` : "Rescheduled";
    default:
      return "Outcome not verified in this snapshot";
  }
}

/** Concise, explicitly qualified transcript summary with distinct denominators. */
export function transcriptCountSummary(): string {
  const files = MEETING_STATS.totalTranscriptFiles ?? MEETING_STATS.totalTranscripts;
  const linked = MEETING_STATS.totalTranscripts;
  return `${files} transcript files; ${linked} linked to dated meeting records`;
}

export function formatEvaluationTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    timeZone: MEETINGS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatSnapshotDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
}

/**
 * Structured notice when no confirmed future meeting is available (or when a
 * build-time posting has outlived its validity window).
 *
 * Keeps snapshot capture date, watcher baseline check, live schedule check, and
 * failed agenda downloads strictly distinct — never substituting one timestamp
 * for another.
 */
export function noUpcomingMeetingNotice(viewerNow?: Date | null): {
  headline: string;
  detail: string;
  provenanceLine: string;
  blockedPostingLine: string | null;
  sameDayUnverifiedLine: string | null;
  scheduleUrl: string;
} {
  const snapshotDate = formatSnapshotDate(MEETINGS_CAPTURED);
  const evaluatedLabel = formatEvaluationTimestamp(MEETINGS_RESOLVED_AT);
  const watcherBaselineLabel = formatEvaluationTimestamp(WATCHER_BASELINE_CHECKED_AT);
  const live = LIVE_SOURCE_CHECK;
  const blocked = PIPELINE_PROVENANCE?.blockedSync ?? null;
  const buildExpired = NEXT_MEETING ? evaluateMeetingCalendarAt(NEXT_MEETING, viewerNow).expiredSinceBuild : false;

  const provenanceParts: string[] = [];
  provenanceParts.push(
    snapshotDate
      ? `Archive snapshot captured ${snapshotDate}.`
      : "Archive snapshot capture date not recorded.",
  );
  if (watcherBaselineLabel) {
    provenanceParts.push(`Last completed sync baseline: ${watcherBaselineLabel}.`);
  }
  if (evaluatedLabel) {
    provenanceParts.push(`Calendar status evaluated ${evaluatedLabel}${isBuildStaleAt(viewerNow) ? " (static build older than 48h)" : ""}.`);
  }

  let blockedPostingLine: string | null = null;
  if (blocked?.entries?.length) {
    const entry = blocked.entries[0];
    const discoveredLabel = formatEvaluationTimestamp(entry.discoveredAt);
    const calNote = entry.calendarStatus === "date-passed"
      ? "scheduled date passed; outcome not verified"
      : entry.calendarStatus === "same-day-time-unverified"
        ? "scheduled for today; start time not verified"
        : "archive unavailable";
    blockedPostingLine =
      `Official posting detected; archive unavailable: ${entry.bodyLabel}` +
      `${entry.scheduledDate ? ` (${entry.scheduledDate})` : ""}` +
      `${discoveredLabel ? ` — detected ${discoveredLabel}` : ""}; agenda download/extraction failed (${blocked.reason}), so it was not promoted into validated records (${calNote}).`;
  }

  const sameDay = SAME_DAY_UNVERIFIED_MEETINGS[0] ?? null;
  const sameDayUnverifiedLine = sameDay
    ? `${sameDay.bodyLabel} (${sameDay.shortDate}): Scheduled for today; start time not verified.`
    : null;

  if (buildExpired && NEXT_MEETING) {
    return {
      headline: "Scheduled start time passed since this static page was built; outcome not verified.",
      detail: `${NEXT_MEETING.bodyLabel} (${NEXT_MEETING.shortDate}${NEXT_MEETING.time ? `, ${NEXT_MEETING.time}` : ""}) is past its build validity window.`,
      provenanceLine: provenanceParts.join(" "),
      blockedPostingLine,
      sameDayUnverifiedLine,
      scheduleUrl: OFFICIAL_SCHEDULE_URL,
    };
  }

  if (live?.used && live.ok) {
    const checked = formatEvaluationTimestamp(live.observedAt);
    return {
      headline: "No upcoming meeting confirmed in this snapshot.",
      detail: checked
        ? `City posted-meetings schedule checked ${checked}; zero future postings were listed.`
        : "City posted-meetings schedule listed zero future postings.",
      provenanceLine: provenanceParts.join(" "),
      blockedPostingLine,
      sameDayUnverifiedLine,
      scheduleUrl: OFFICIAL_SCHEDULE_URL,
    };
  }

  if (live && live.ok === false) {
    const checked = formatEvaluationTimestamp(live.observedAt);
    return {
      headline: "No upcoming meeting confirmed in this snapshot.",
      detail: `Build-time schedule check failed${live.error ? ` (${live.error})` : ""}${checked ? ` at ${checked}` : ""}; showing verified snapshot records only.`,
      provenanceLine: provenanceParts.join(" "),
      blockedPostingLine,
      sameDayUnverifiedLine,
      scheduleUrl: OFFICIAL_SCHEDULE_URL,
    };
  }

  if (live?.stale) {
    const checked = formatEvaluationTimestamp(live.observedAt);
    return {
      headline: "No upcoming meeting confirmed in this snapshot.",
      detail: `Last schedule check is stale (${live.ageHours ?? "?"}h old${checked ? `, ${checked}` : ""}) and is not treated as current.`,
      provenanceLine: provenanceParts.join(" "),
      blockedPostingLine,
      sameDayUnverifiedLine,
      scheduleUrl: OFFICIAL_SCHEDULE_URL,
    };
  }

  return {
    headline: "No upcoming meeting confirmed in this snapshot.",
    detail: provenanceParts.join(" "),
    provenanceLine: provenanceParts.join(" "),
    blockedPostingLine,
    sameDayUnverifiedLine,
    scheduleUrl: OFFICIAL_SCHEDULE_URL,
  };
}
