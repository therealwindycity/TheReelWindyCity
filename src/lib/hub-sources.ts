import { MEETING, NEXT_MEETING } from "./civic-data";
import { CHEYENNE_SCANNER_FEEDS, WYOMING_CITIES } from "./wyoming-cities";

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
const postedAgendaUrl = NEXT_MEETING.official.agenda ?? NEXT_MEETING.official.granicus ?? "https://cheyenne.granicus.com/ViewPublisher.php?view_id=5&widget=upcoming";
const agendaViewerUrl = NEXT_MEETING.official.granicus ?? postedAgendaUrl;

/**
 * The hub keeps one source visible at a time. This directory intentionally
 * points at the publisher's own page; embeds are a convenience, never a proxy
 * or a replacement for the original record.
 */
export function getHubSources(): HubSource[] {
  return [
    {
      id: "agenda",
      shortLabel: "Posted agenda",
      label: `${NEXT_MEETING.bodyLabel} · ${NEXT_MEETING.shortDate}`,
      category: "CITY GOVERNMENT",
      description: "Open the posted agenda and meeting details from the City of Cheyenne’s Granicus publisher.",
      embedUrl: agendaViewerUrl,
      sourceUrl: postedAgendaUrl,
      sourceName: "City of Cheyenne · Granicus",
      context: "An agenda lists items for consideration. It does not show what the body ultimately decided.",
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
  return NEXT_MEETING;
}
