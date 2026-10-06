"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  ExternalLink,
  Flame,
  Gauge,
  HeartPulse,
  MapPin,
  Newspaper,
  Pause,
  PhoneCall,
  Play,
  Radio,
  RefreshCw,
  Route,
  Shield,
  Siren,
  Sun,
  Thermometer,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  type LucideIcon,
} from "lucide-react";
import {
  NEWSROOM_COUNT,
  runPulseIngestion,
  type AlertCategory,
  type AlertSeverity,
  type IngestionResult,
  type PulseAlert,
} from "@/lib/pulse-ingestion";
import pulseSeed from "@/data/wyoming-pulse-seed.json";
import {
  ALL_WYOMING_SCANNER_FEEDS,
  CHEYENNE_SCANNER_FEEDS,
  CHEYENNE_WYOLINK_TALKGROUPS,
  WYOMING_CITIES,
  type WyomingCity,
  type WyomingScannerFeed,
} from "@/lib/wyoming-cities";
import IncidentRecordLens from "./incident-record-lens";

const SEVERITY: Record<AlertSeverity, { label: string; rank: number }> = {
  critical: { label: "Critical", rank: 0 },
  urgent: { label: "Urgent", rank: 1 },
  standard: { label: "Update", rank: 2 },
  informational: { label: "Info", rank: 3 },
};

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  scanner: "Scanner dispatch",
  weather: "Weather",
  road_conditions: "Roads",
  fire: "Fire & EMS",
  crime: "Public safety",
  accident: "Traffic incident",
  government: "Government",
  court: "Courts",
  election: "Elections",
  environment: "Seismic & environment",
  health: "Health & care",
  sports: "Sports",
  community: "Community",
  breaking: "Breaking news",
};

const SEED_ALERTS = pulseSeed.alerts as PulseAlert[];
const INITIAL_RESULT: IngestionResult = {
  alerts: SEED_ALERTS,
  counts: {
    total: SEED_ALERTS.length,
    scanner: 0,
    nws: pulseSeed.counts.nws,
    wydot: pulseSeed.counts.wydot,
    wildfire: 0,
    usgs: 0,
    cheyenne: 0,
    rss: pulseSeed.counts.rss,
  },
  timestamp: pulseSeed.capturedAt,
  errors: pulseSeed.errors,
  liveSourcesCount: 0,
  snapshotCapturedAt: pulseSeed.capturedAt,
  mode: "curated-seed",
};

const CATEGORY_ICON: Record<AlertCategory, LucideIcon> = {
  scanner: Radio,
  weather: Cloud,
  road_conditions: Route,
  fire: Flame,
  crime: Shield,
  accident: AlertTriangle,
  government: Building2,
  court: Building2,
  election: CheckCircle2,
  environment: Activity,
  health: HeartPulse,
  sports: Trophy,
  community: Newspaper,
  breaking: Bell,
};

interface HourlyForecast {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  relativeHumidity?: number;
  stationId?: string;
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  shortForecast?: string;
  windSpeed?: string;
  windDirection?: string;
  relativeHumidity?: { value?: number | null };
}

interface ForecastResponse {
  properties?: { periods?: ForecastPeriod[] };
}

interface PointResponse {
  properties?: { forecastHourly?: string; forecast?: string };
}

type FeedFilterId =
  | "all"
  | "cheyenne"
  | "scanner"
  | "priority"
  | "weather"
  | "road_conditions"
  | "crime"
  | "community";

type ScannerScope = "cheyenne" | "city" | "statewide" | "talkgroups";

function formatTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/Denver" }).format(date);
}

function mountainZone(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "MT"
  );
}

function timeAgo(value: string, now: Date): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "time not listed";

  const delta = now.getTime() - timestamp;
  if (delta < -60_000) {
    const minutes = Math.ceil(-delta / 60_000);
    return minutes < 60 ? `in ${minutes}m` : `in ${Math.ceil(minutes / 60)}h`;
  }
  const minutes = Math.floor(Math.max(0, delta) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sourceLabel(alert: PulseAlert): string {
  if (alert.source === "nws") return "NWS WEATHER";
  if (alert.source === "wydot") return "WYDOT 511";
  if (alert.source === "scanner") return "SCANNER / CAD";
  if (alert.source === "wildfire") return "NIFC WILDFIRE";
  if (alert.source === "usgs") return "USGS SEISMIC";
  if (alert.source === "cheyenne") return "CITY OF CHEYENNE";
  return alert.tags[0]?.toUpperCase() ?? "WY NEWSROOM";
}

function articleSourceUrl(alert: PulseAlert): string | null {
  const isHttpUrl = (value: string) => value.startsWith("https://") || value.startsWith("http://");
  if (alert.source_url && isHttpUrl(alert.source_url)) return alert.source_url;
  if ((alert.source === "nws" || alert.source.startsWith("rss-")) && isHttpUrl(alert.source_id)) return alert.source_id;
  if (alert.source === "wydot") return "https://wyoroad.info/";
  return null;
}

function formatPublishedDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return formatTime(date, { month: "short", day: "numeric", year: "numeric" });
}

function newestFirst(alerts: PulseAlert[]): PulseAlert[] {
  return [...alerts].sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());
}

const HISTORY_STORAGE_KEY = "wyoming-pulse-history-v1";
const HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_HISTORY_ITEMS = 600;

function mergeHistoryAlerts(...groups: PulseAlert[][]): PulseAlert[] {
  const unique = new Map<string, PulseAlert>();
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  for (const alert of groups.flat()) {
    if (!alert || !alert.source_id || !alert.title) continue;
    const timestamp = new Date(alert.event_time).getTime();
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue;
    const previous = unique.get(alert.source_id);
    if (!previous || new Date(alert.ingested_at).getTime() >= new Date(previous.ingested_at).getTime()) {
      unique.set(alert.source_id, alert);
    }
  }
  return newestFirst([...unique.values()]).slice(0, MAX_HISTORY_ITEMS);
}

function readSavedHistory(): PulseAlert[] {
  try {
    const value = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed as PulseAlert[] : [];
  } catch {
    return [];
  }
}

function writeSavedHistory(alerts: PulseAlert[]): void {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Keep the live desk usable if storage is full or unavailable.
  }
}

interface PulseNewsStream {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  matches: (alert: PulseAlert) => boolean;
  sourceUrl: string;
}

const NEWS_STREAMS: PulseNewsStream[] = [
  { id: "statewide", title: "Statewide headlines", description: "The full Wyoming newswire", icon: Newspaper, matches: () => true, sourceUrl: "https://www.wyomingpublicmedia.org/" },
  { id: "government", title: "Government & elections", description: "Policy, ballots, and public decisions", icon: Building2, matches: (alert) => ["government", "court", "election"].includes(alert.category) || /legislature|lawmakers?|governor|commission|ballot|voter|election|tax|public hearing|city council/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://www.wyomingpublicmedia.org/politics-government/" },
  { id: "public-safety", title: "Public safety", description: "Incidents, emergency services, and policing", icon: Shield, matches: (alert) => ["crime", "accident", "fire", "breaking"].includes(alert.category) || /police|sheriff|crash|collision|fatal|firefighter|ambulance|emt|law enforcement|flock camera|license plate/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://capcity.news/latest-news/" },
  { id: "weather", title: "Weather & wildfire", description: "Forecasts, watches, and fire conditions", icon: Cloud, matches: (alert) => ["weather", "fire"].includes(alert.category) || /forecast|wind warning|blizzard|wildfire|fire weather|burn ban/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://www.weather.gov/riw/" },
  { id: "roads", title: "Roads & travel", description: "Closures, crashes, construction, and WYDOT", icon: Route, matches: (alert) => ["road_conditions", "accident"].includes(alert.category) || /road|highway|interstate|traffic|closure|closed|construction|detour|travel|wyodot|milepost/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://wyoroad.info/" },
  { id: "energy-land", title: "Energy, land & wildlife", description: "Natural resources and Wyoming’s outdoors", icon: Activity, matches: (alert) => alert.category === "environment" || /energy|electric(?:ity)?|power bills?|data cent(?:er|re)s?|oil|gas|coal|uranium|wind turbine|public lands?|national forest|wildlife|conservation|water rights|mining/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://www.wyomingpublicmedia.org/natural-resources-energy/" },
  { id: "schools-health", title: "Schools & health", description: "Education, care, and community services", icon: HeartPulse, matches: (alert) => alert.category === "health" || /school|student|education|bus|university|college|health|hospital|medicaid|ambulance|emt|boys’ school|boys' school/i.test(`${alert.title} ${alert.summary} ${alert.tags.join(" ")}`), sourceUrl: "https://www.wyomingpublicmedia.org/" },
  { id: "community", title: "Community & economy", description: "Local life, business, and county news", icon: MapPin, matches: (alert) => alert.category === "community" || /business|economy|tourism|lodging|local|community|arts|event|ranch|housing|residents|ratepayers/i.test(`${alert.title} ${alert.summary}`), sourceUrl: "https://oilcity.news/latest-news/" },
  { id: "sports", title: "Wyoming sports", description: "High school scores, standouts, and local teams", icon: Trophy, matches: (alert) => alert.category === "sports" || /football|basketball|volleyball|baseball|softball|soccer|wrestling|tennis|golf|cross[- ]country|swimming|rodeo|scoreboard|playoffs?|championship|all-state/i.test(`${alert.title} ${alert.summary} ${alert.tags.join(" ")}`), sourceUrl: "https://wyopreps.com/" },
];

function alertLocation(alert: PulseAlert): string {
  return (
    [alert.location.city, alert.location.county, alert.location.highway]
      .filter(Boolean)
      .join(" · ") || "Wyoming"
  );
}

export function matchesCity(alert: PulseAlert, city: WyomingCity): boolean {
  const locationText = [
    alert.location.city,
    alert.location.county,
    alert.location.highway,
    ...(alert.location.zones ?? []),
    alert.title,
    alert.summary,
    alert.agency,
    alert.talkgroup,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");

  const countyName = city.county.replace(/\s+county$/i, "").toLocaleLowerCase("en-US");
  const hasCity = locationText.includes(city.name.toLocaleLowerCase("en-US"));
  const hasCounty = countyName.length > 2 && locationText.includes(countyName);
  const hasZone = city.nwsZones.some(
    (zone) =>
      locationText.includes(zone.id.toLocaleLowerCase("en-US")) ||
      locationText.includes(zone.name.toLocaleLowerCase("en-US")),
  );
  const hasFeed = Boolean(
    alert.feed_id && city.scanners.some((scanner) => scanner.id === alert.feed_id),
  );
  const hasHighway =
    (alert.source === "wydot" ||
      alert.category === "road_conditions" ||
      alert.category === "accident") &&
    city.highways.some((highway) => locationText.includes(highway.toLocaleLowerCase("en-US")));

  return hasCity || hasCounty || hasZone || hasFeed || hasHighway;
}

function getAgeBuckets(alerts: PulseAlert[], now: Date) {
  const definitions = [
    { label: "< 6 hours", maxMinutes: 360 },
    { label: "6–18 hours", maxMinutes: 1080 },
    { label: "18–36 hours", maxMinutes: 2160 },
    { label: "36+ hours", maxMinutes: Infinity },
  ];
  const counts = definitions.map(() => 0);

  for (const alert of alerts) {
    const timestamp = new Date(alert.event_time).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const ageMinutes = Math.max(0, (now.getTime() - timestamp) / 60_000);
    const bucketIndex = definitions.findIndex((bucket) => ageMinutes <= bucket.maxMinutes);
    counts[bucketIndex < 0 ? counts.length - 1 : bucketIndex] += 1;
  }

  return definitions.map((bucket, index) => ({ ...bucket, count: counts[index] }));
}

function buildFallbackForecast(city: WyomingCity): HourlyForecast {
  const isCheyenne = city.id === "cheyenne";
  const isMountain = city.id === "jackson" || city.id === "laramie";
  return {
    name: `${city.observationStation} Surface Observation`,
    temperature: isCheyenne ? 74 : isMountain ? 66 : 72,
    temperatureUnit: "F",
    shortForecast: isCheyenne
      ? "Sunny & Unseasonably Warm · Fire Weather Watch (WYZ430)"
      : "Sunny & Dry · Elevated Fire Danger",
    windSpeed: isCheyenne ? "15 to 25 mph WSW (gusts 35 mph)" : "12 to 20 mph W",
    relativeHumidity: isCheyenne ? 16 : 21,
    stationId: city.observationStation,
  };
}

function ForecastIcon({ forecast }: { forecast: string }) {
  if (/snow|blizzard|sleet|flurr/i.test(forecast)) return <CloudSnow aria-hidden="true" />;
  if (/thunder|lightning/i.test(forecast)) return <CloudLightning aria-hidden="true" />;
  if (/rain|shower|drizzle/i.test(forecast)) return <CloudRain aria-hidden="true" />;
  if (/sunny|clear|warm/i.test(forecast)) return <Sun aria-hidden="true" />;
  return <Cloud aria-hidden="true" />;
}

function AlertRow({
  alert,
  now,
  onTuneFeed,
}: {
  alert: PulseAlert;
  now: Date;
  onTuneFeed: (feedId: string) => void;
}) {
  const Icon = CATEGORY_ICON[alert.category] ?? Bell;
  const sourceUrl =
    alert.source_url ||
    (/^https?:\/\//i.test(alert.source_id)
      ? alert.source_id
      : alert.source === "wydot"
        ? "https://www.wyoroad.info/pls/Browse/MEDIA.Statewide"
        : null);
  const sourceLinkLabel =
    alert.source === "nws"
      ? "NWS alert"
      : alert.source === "wydot"
        ? "WYDOT 511"
        : alert.source === "wildfire"
          ? "NIFC WFIGS"
          : alert.source === "usgs"
            ? "USGS event"
            : "Official source";

  return (
    <article className={`broadcast-alert broadcast-alert--${alert.severity}`}>
      <div className="broadcast-alert-icon">
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="broadcast-alert-content">
        <div className="broadcast-alert-meta">
          <span className={`broadcast-severity broadcast-severity--${alert.severity}`}>
            {SEVERITY[alert.severity].label}
          </span>
          <span>{sourceLabel(alert)}</span>
          {alert.talkgroup && (
            <span className="broadcast-talkgroup-pill">
              <Radio size={10} aria-hidden="true" /> {alert.talkgroup}
            </span>
          )}
          <time dateTime={alert.event_time}>{timeAgo(alert.event_time, now)}</time>
        </div>
        <h3>{alert.title}</h3>
        <p>{alert.summary || "No additional detail was included in the source alert."}</p>
        <div className="broadcast-alert-footer">
          <span>
            <MapPin size={12} aria-hidden="true" />
            {alertLocation(alert)}
            {alert.agency ? ` · ${alert.agency}` : ""}
          </span>
          <div className="broadcast-alert-actions">
            {alert.feed_id ? (
              <button
                type="button"
                className="broadcast-tune-button"
                onClick={() => onTuneFeed(alert.feed_id ?? "47003")}
                title={`Tune Live Scanner Feed #${alert.feed_id}`}
              >
                <Radio size={11} aria-hidden="true" /> Tune #{alert.feed_id}
              </button>
            ) : null}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {sourceLinkLabel} <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function PulseBroadcast({ embedded = false }: { embedded?: boolean }) {
  const [result, setResult] = useState<IngestionResult | null>(INITIAL_RESULT);
  const [historyAlerts, setHistoryAlerts] = useState<PulseAlert[]>(SEED_ALERTS);
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [selectedCityId, setSelectedCityId] = useState("cheyenne");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilterId>("all");
  const [forecast, setForecast] = useState<HourlyForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  // Live Scanner Console state
  const [scannerScope, setScannerScope] = useState<ScannerScope>("cheyenne");
  const [activeFeedId, setActiveFeedId] = useState<string>("47003");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showEmbeddedTuner, setShowEmbeddedTuner] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>(
    "Ready · WyoLink P25 Archer 800 MHz (Node 6571 · System 3939)",
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scannerSectionRef = useRef<HTMLElement | null>(null);

  const city = WYOMING_CITIES.find((item) => item.id === selectedCityId) ?? WYOMING_CITIES[0];
  const cheyenneCity = WYOMING_CITIES[0];

  const displayedScannerFeeds = useMemo((): readonly WyomingScannerFeed[] => {
    if (scannerScope === "cheyenne") return CHEYENNE_SCANNER_FEEDS;
    if (scannerScope === "city") return city.scanners;
    if (scannerScope === "statewide") return ALL_WYOMING_SCANNER_FEEDS;
    return CHEYENNE_SCANNER_FEEDS;
  }, [scannerScope, city]);

  const activeScannerFeed = useMemo((): WyomingScannerFeed => {
    return (
      ALL_WYOMING_SCANNER_FEEDS.find((f) => f.id === activeFeedId) ??
      city.scanners[0] ??
      CHEYENNE_SCANNER_FEEDS[0]
    );
  }, [activeFeedId, city]);

  const refresh = useCallback(async () => {
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      const nextResult = await runPulseIngestion();
      setResult(nextResult);
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch {
      // Keep the most recent feed on screen if a refresh fails.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const firstRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(firstRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const restored = mergeHistoryAlerts(SEED_ALERTS, readSavedHistory(), result?.alerts ?? []);
    writeSavedHistory(restored);
    const frame = window.requestAnimationFrame(() => setHistoryAlerts(restored));
    return () => window.cancelAnimationFrame(frame);
  }, [result?.alerts]);

  useEffect(() => {
    const updateClock = () => setClock(new Date());
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    const frame = window.requestAnimationFrame(syncPreference);
    preference.addEventListener("change", syncPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      preference.removeEventListener("change", syncPreference);
    };
  }, []);

  const allAlerts = result?.alerts ?? SEED_ALERTS;

  // Fetch NWS airport METAR surface observation + hourly point forecast for selected city
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const fallback = buildFallbackForecast(city);
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 9_000);

    async function loadForecast() {
      try {
        const [obsResp, pointResp] = await Promise.allSettled([
          fetch(
            `https://api.weather.gov/stations/${city.observationStation}/observations/latest`,
            {
              headers: {
                Accept: "application/geo+json",
                "User-Agent": "WyomingPulse/2.0 (public-safety civic monitor)",
              },
              signal: controller.signal,
            },
          ),
          fetch(`https://api.weather.gov/points/${city.latitude},${city.longitude}`, {
            headers: {
              Accept: "application/geo+json",
              "User-Agent": "WyomingPulse/2.0 (public-safety civic monitor)",
            },
            signal: controller.signal,
          }),
        ]);

        let metarTempF: number | undefined;
        let metarDesc: string | undefined;
        let metarWind: string | undefined;
        let metarHumidity: number | undefined;

        if (obsResp.status === "fulfilled" && obsResp.value.ok) {
          const obsJson = (await obsResp.value.json()) as {
            properties?: {
              temperature?: { value?: number | null };
              textDescription?: string;
              windSpeed?: { value?: number | null };
              windGust?: { value?: number | null };
              relativeHumidity?: { value?: number | null };
            };
          };
          const p = obsJson.properties;
          if (p && typeof p.temperature?.value === "number") {
            metarTempF = Math.round((p.temperature.value * 9) / 5 + 32);
            metarDesc = p.textDescription || undefined;
            if (typeof p.windSpeed?.value === "number") {
              const mph = Math.round(p.windSpeed.value * 0.621371);
              const gust =
                typeof p.windGust?.value === "number" && p.windGust.value > 0
                  ? ` (gusts ${Math.round(p.windGust.value * 0.621371)} mph)`
                  : "";
              metarWind = `${mph} mph${gust}`;
            }
            if (typeof p.relativeHumidity?.value === "number") {
              metarHumidity = Math.round(p.relativeHumidity.value);
            }
          }
        }

        let period: ForecastPeriod | undefined;
        if (pointResp.status === "fulfilled" && pointResp.value.ok) {
          const point = (await pointResp.value.json()) as PointResponse;
          const forecastUrl = point.properties?.forecastHourly ?? point.properties?.forecast;
          if (forecastUrl) {
            const forecastResponse = await fetch(forecastUrl, {
              headers: {
                Accept: "application/geo+json",
                "User-Agent": "WyomingPulse/2.0 (public-safety civic monitor)",
              },
              signal: controller.signal,
            });
            if (forecastResponse.ok) {
              const forecastData = (await forecastResponse.json()) as ForecastResponse;
              period = forecastData.properties?.periods?.[0];
            }
          }
        }

        if (active) {
          if (period && typeof period.temperature === "number" && period.shortForecast) {
            setForecast({
              name: metarTempF !== undefined ? `${city.observationStation} Live & Next Hour` : (period.name ?? "Next hour"),
              temperature: metarTempF ?? period.temperature,
              temperatureUnit: period.temperatureUnit ?? "F",
              shortForecast: metarDesc
                ? `${metarDesc} · ${period.shortForecast}`
                : period.shortForecast,
              windSpeed:
                metarWind ??
                ([period.windSpeed, period.windDirection].filter(Boolean).join(" ") ||
                  fallback.windSpeed),
              relativeHumidity:
                metarHumidity ??
                (typeof period.relativeHumidity?.value === "number"
                  ? Math.round(period.relativeHumidity.value)
                  : fallback.relativeHumidity),
              stationId: city.observationStation,
            });
          } else if (metarTempF !== undefined) {
            setForecast({
              name: `${city.observationStation} Surface Observation`,
              temperature: metarTempF,
              temperatureUnit: "F",
              shortForecast: metarDesc || fallback.shortForecast,
              windSpeed: metarWind || fallback.windSpeed,
              relativeHumidity: metarHumidity ?? fallback.relativeHumidity,
              stationId: city.observationStation,
            });
          } else {
            setForecast(fallback);
          }
        }
      } catch {
        if (active) {
          setForecast(fallback);
        }
      } finally {
        window.clearTimeout(timeout);
        if (active) setForecastLoading(false);
      }
    }

    void loadForecast();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [city]);

  // Scanner audio controls
  const stopAudioStream = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    setIsStreaming(false);
    setStreamStatus(`Standby · ${activeScannerFeed.name} (${activeScannerFeed.primaryFrequency})`);
  }, [activeScannerFeed]);

  const startAudioStream = useCallback(
    async (feed: WyomingScannerFeed) => {
      setActiveFeedId(feed.id);
      if (!feed.streamUrl) {
        setShowEmbeddedTuner(true);
        setStreamStatus(`Tuned · ${feed.name} (Open Broadcastify web tuner below)`);
        return;
      }
      if (!audioRef.current) return;
      try {
        setStreamStatus(`Connecting to Broadcastify CDN (${feed.name})…`);
        audioRef.current.src = feed.streamUrl;
        audioRef.current.muted = isMuted;
        await audioRef.current.play();
        setIsStreaming(true);
        setStreamStatus(`ON AIR · Streaming ${feed.name} (${feed.primaryFrequency})`);
      } catch {
        setIsStreaming(false);
        setShowEmbeddedTuner(true);
        setStreamStatus(
          `Tuned to ${feed.name} · Use the embedded Broadcastify web player or pop-out link below`,
        );
      }
    },
    [isMuted],
  );

  const toggleAudioStream = useCallback(() => {
    if (isStreaming) {
      stopAudioStream();
    } else {
      void startAudioStream(activeScannerFeed);
    }
  }, [isStreaming, stopAudioStream, startAudioStream, activeScannerFeed]);

  const handleSelectScannerFeed = useCallback(
    (feed: WyomingScannerFeed) => {
      setActiveFeedId(feed.id);
      if (isStreaming) {
        void startAudioStream(feed);
      } else {
        setStreamStatus(`Tuned · ${feed.name} (${feed.primaryFrequency})`);
      }
    },
    [isStreaming, startAudioStream],
  );

  const handleTuneFromAlert = useCallback((feedId: string) => {
    const target = ALL_WYOMING_SCANNER_FEEDS.find((f) => f.id === feedId);
    if (!target) return;
    setActiveFeedId(target.id);
    if (target.county === "Laramie County") {
      setScannerScope("cheyenne");
    } else {
      setScannerScope("statewide");
    }
    setStreamStatus(`Tuned from dispatch · ${target.name} (${target.primaryFrequency})`);
    scannerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const localAlerts = useMemo(
    () => allAlerts.filter((alert) => matchesCity(alert, city)),
    [allAlerts, city],
  );
  const cheyenneAlerts = useMemo(
    () => allAlerts.filter((alert) => matchesCity(alert, cheyenneCity)),
    [allAlerts, cheyenneCity],
  );
  const scannerAlerts = useMemo(
    () =>
      allAlerts.filter(
        (alert) =>
          alert.source === "scanner" ||
          Boolean(alert.talkgroup) ||
          alert.category === "crime" ||
          alert.category === "fire" ||
          alert.category === "accident",
      ),
    [allAlerts],
  );
  const localWeatherAlerts = localAlerts.filter(
    (alert) => alert.category === "weather" || alert.category === "fire",
  );
  const priorityAlerts = allAlerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "urgent",
  );
  const storiesByStream = useMemo(
    () => new Map(NEWS_STREAMS.map((stream) => [stream.id, newestFirst(historyAlerts.filter((alert) => stream.matches(alert)))])),
    [historyAlerts],
  );
  const tickerAlerts = priorityAlerts.length ? priorityAlerts.slice(0, 10) : allAlerts.slice(0, 8);

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((alert) => {
      if (feedFilter === "all") return true;
      if (feedFilter === "cheyenne") return matchesCity(alert, cheyenneCity);
      if (feedFilter === "scanner") {
        return (
          alert.source === "scanner" ||
          Boolean(alert.talkgroup) ||
          alert.category === "crime" ||
          alert.category === "fire" ||
          alert.category === "accident"
        );
      }
      if (feedFilter === "priority") {
        return alert.severity === "critical" || alert.severity === "urgent";
      }
      if (feedFilter === "weather") {
        return (
          alert.category === "weather" ||
          alert.category === "fire" ||
          alert.category === "environment"
        );
      }
      if (feedFilter === "road_conditions") {
        return alert.category === "road_conditions" || alert.category === "accident";
      }
      if (feedFilter === "crime") {
        return alert.category === "crime" || alert.category === "court";
      }
      if (feedFilter === "community") {
        return (
          alert.category === "community" ||
          alert.category === "government" ||
          alert.category === "election"
        );
      }
      return true;
    });
  }, [allAlerts, feedFilter, cheyenneCity]);

  const featuredStoryCount = Math.min(allAlerts.length, 8);
  const currentStoryIndex = featuredStoryCount ? featuredIndex % featuredStoryCount : 0;
  const featuredStory = featuredStoryCount ? allAlerts[currentStoryIndex] : null;
  const now = clock ?? new Date(0);
  const ageBuckets = getAgeBuckets(allAlerts, now);
  const maxAgeBucket = Math.max(1, ...ageBuckets.map((bucket) => bucket.count));
  const mountainTime = clock
    ? formatTime(clock, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : "--:--:--";
  const mountainDate = clock
    ? formatTime(clock, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "Loading local time";
  const mountainZoneLabel = clock ? mountainZone(clock) : "MT";
  const updatedLabel = lastUpdated
    ? formatTime(lastUpdated, { hour: "numeric", minute: "2-digit", hour12: true })
    : "Waiting for first update";
  // The build snapshot records whether live sources actually answered. Surface
  // that instead of letting a dated fallback look like a fresh live feed.
  const hasLiveFeeds = Boolean(result && (
    result.mode === "published-snapshot" || result.liveSourcesCount > 0
  ));
  const snapshotCapturedLabel = formatPublishedDate(result?.snapshotCapturedAt ?? INITIAL_RESULT.snapshotCapturedAt);
  const provenanceLabel = hasLiveFeeds
    ? `LIVE FEEDS · UPDATED ${updatedLabel} ${mountainZoneLabel}`
    : `DATED SNAPSHOT · ${snapshotCapturedLabel}`;
  const provenanceDetail = hasLiveFeeds
    ? "Publisher or agency feeds returned stories during the latest update; any retained fallback stories keep their own publish dates."
    : "Publisher and agency feeds did not return stories during the latest update, so this desk is showing its dated, source-linked curated snapshot.";
  const cityForecastUrl = `https://forecast.weather.gov/MapClick.php?lat=${city.latitude}&lon=${city.longitude}`;

  useEffect(() => {
    if (rotationPaused || reducedMotion || featuredStoryCount < 2) return;
    const interval = window.setInterval(() => {
      setFeaturedIndex((index) => (index + 1) % featuredStoryCount);
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [featuredStoryCount, reducedMotion, rotationPaused]);

  function showStory(direction: -1 | 1) {
    if (!featuredStoryCount) return;
    setFeaturedIndex((index) => (index + direction + featuredStoryCount) % featuredStoryCount);
  }

  function selectCity(nextCityId: string) {
    setSelectedCityId(nextCityId);
    setForecast(null);
    setForecastLoading(true);
    const nextCity = WYOMING_CITIES.find((c) => c.id === nextCityId);
    if (nextCity && nextCity.scanners[0]) {
      setActiveFeedId(nextCity.scanners[0].id);
      setScannerScope(nextCityId === "cheyenne" ? "cheyenne" : "city");
    }
  }

  const feedFilters: { id: FeedFilterId; label: string }[] = [
    { id: "all", label: `All signals (${allAlerts.length})` },
    { id: "cheyenne", label: `Cheyenne & LarCo (${cheyenneAlerts.length})` },
    { id: "scanner", label: `Scanner & CAD (${scannerAlerts.length})` },
    { id: "priority", label: `Priority (${priorityAlerts.length})` },
    { id: "weather", label: "Weather & Fire" },
    { id: "road_conditions", label: "WYDOT Roads" },
    { id: "crime", label: "Law & Courts" },
    { id: "community", label: "Civic & Community" },
  ];

  return (
    <section className="pulse-broadcast page-enter" aria-labelledby="pulse-title">
      {/* Hidden HTML5 audio element for direct Broadcastify MP3 CDN streams */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => setIsStreaming(false)}
        onError={() => {
          setIsStreaming(false);
          setShowEmbeddedTuner(true);
          setStreamStatus(
            `Tuned to ${activeScannerFeed.name} · Use the embedded Broadcastify web player below`,
          );
        }}
      />

      <header className="pulse-masthead">
        <div className="pulse-brand-mark" aria-hidden="true">
          <Radio size={25} strokeWidth={1.8} />
        </div>
        <div className="pulse-brand-copy">
          <span>WYOMING</span>
          {embedded ? <h2 id="pulse-title">PULSE</h2> : <h1 id="pulse-title">PULSE</h1>}
        </div>
        <div className="pulse-masthead-divider" />
        <div className="pulse-masthead-description">
          <strong>CHEYENNE &amp; STATEWIDE SCANNER DESK</strong>
          <span>WyoLink P25 · CPD / LCSO / CFR / WHP · NWS KCYS · WYDOT 511 · 14 Newsrooms</span>
        </div>
        <div
          className="pulse-masthead-clock"
          aria-label={`Current Wyoming time ${mountainTime} ${mountainZoneLabel}`}
        >
          <span>CHEYENNE LOCAL TIME</span>
          <strong>
            {mountainTime} <small>{mountainZoneLabel}</small>
          </strong>
          <time>{mountainDate}</time>
        </div>
      </header>

      <div className="pulse-status-rail">
        <span className="pulse-on-air">
          <span />
          {loading ? "CONNECTING" : isStreaming ? "SCANNER LIVE" : "MONITORING"}
        </span>
        <span className="pulse-status-copy">
          MONITORING <strong>CHEYENNE &amp; WYOMING</strong>
        </span>
        <span
          className={`pulse-status-updated pulse-status-updated--${hasLiveFeeds ? "live" : "snapshot"}`}
          data-provenance={hasLiveFeeds ? "live" : "snapshot"}
          title={provenanceDetail}
        >
          {provenanceLabel}
        </span>
        <button
          className="pulse-refresh"
          type="button"
          onClick={() => void refresh()}
          disabled={loading || refreshing}
        >
          <RefreshCw size={13} className={refreshing ? "spin" : ""} aria-hidden="true" />
          {refreshing ? "Updating" : "Refresh feed"}
        </button>
        <span className="pulse-status-sources">
          WYOLINK P25 <i /> NWS KCYS <i /> WYDOT 511 <i /> NIFC/USGS <i /> {NEWSROOM_COUNT} NEWSROOMS
        </span>
      </div>

      <section className="pulse-breaking-ticker" aria-label="Breaking and priority alerts">
        <div className="pulse-breaking-label">
          <Radio size={14} aria-hidden="true" />
          {priorityAlerts.length ? "BREAKING" : "SCANNER"}
        </div>
        <div className="pulse-ticker-window" aria-live="polite">
          {tickerAlerts.length ? (
            <div className="pulse-ticker-track">
              {[0, 1].map((copy) => (
                <div className="pulse-ticker-copy" key={copy} aria-hidden={copy === 1}>
                  {tickerAlerts.map((alert) => (
                    <span className="pulse-ticker-item" key={`${copy}-${alert.source_id}`}>
                      <b>{CATEGORY_LABEL[alert.category].toUpperCase()}</b>
                      {alert.talkgroup && <strong>[{alert.talkgroup}]</strong>}
                      <span>{alert.title}</span>
                      <i aria-hidden="true">◆</i>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <span className="pulse-ticker-empty">
              {loading
                ? "Connecting to Cheyenne & statewide feeds…"
                : "No active alerts in the feed right now."}
            </span>
          )}
        </div>
        <span className="pulse-ticker-count">
          {priorityAlerts.length.toString().padStart(2, "0")} PRIORITY
        </span>
      </section>

      <section className="pulse-stream-directory" aria-labelledby="pulse-stream-title">
        <div className="pulse-stream-directory-heading">
          <div>
            <span className="pulse-stream-kicker">THE WYOMING NEWS MAP</span>
            <h2 id="pulse-stream-title">A state-wide desk, split into streams.</h2>
            <p>Each slow-moving marquee is a sector index. Select one to open its source-linked story archive.</p>
          </div>
          <div className="pulse-stream-summary">
            <span><strong>{NEWS_STREAMS.length.toString().padStart(2, "0")}</strong> news streams</span>
            <span><strong>{historyAlerts.length.toLocaleString("en-US")}</strong> saved headlines</span>
          </div>
        </div>
        <nav className="pulse-stream-index" aria-label="Jump to a Wyoming news stream">
          {NEWS_STREAMS.map((stream) => <a href={`#pulse-stream-row-${stream.id}`} key={stream.id}>{stream.title}</a>)}
        </nav>
        <div className="pulse-stream-list">
          {NEWS_STREAMS.map((stream, index) => {
            const stories = storiesByStream.get(stream.id) ?? [];
            const marqueeStories = stories.slice(0, 12);
            const expanded = expandedStreamId === stream.id;
            const Icon = stream.icon;
            return (
              <article className={`pulse-stream-row ${expanded ? "pulse-stream-row--open" : ""}`} key={stream.id} id={`pulse-stream-row-${stream.id}`}>
                <button
                  type="button"
                  className="pulse-stream-lane"
                  aria-expanded={expanded}
                  aria-controls={expanded ? `pulse-stream-history-${stream.id}` : undefined}
                  aria-label={`${stream.title}. ${stories.length} archived ${stories.length === 1 ? "story" : "stories"}. ${expanded ? "Close" : "Open"} this stream's news archive.`}
                  onClick={() => setExpandedStreamId(expanded ? null : stream.id)}
                >
                  <span className="pulse-stream-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="pulse-stream-label"><strong>{stream.title}</strong><small>{stream.description}</small></span>
                  <span className="pulse-stream-window" aria-hidden="true">
                    {marqueeStories.length ? (
                      <span className="pulse-stream-track" data-direction={index % 2 ? "reverse" : "forward"}>
                        {[0, 1].map((copy) => <span className="pulse-stream-copy" key={copy}>
                          {marqueeStories.map((alert, storyIndex) => <span className="pulse-stream-item" key={`${copy}-${alert.source_id}-${storyIndex}`}>
                            <b>{sourceLabel(alert)}</b><span>{alert.title}</span><i>{formatPublishedDate(alert.event_time)}</i><i className="pulse-stream-separator">◆</i>
                          </span>)}
                        </span>)}
                      </span>
                    ) : <span className="pulse-stream-empty-copy">Waiting for the next source-linked update…</span>}
                  </span>
                  <span className="pulse-stream-count"><strong>{stories.length.toString().padStart(2, "0")}</strong><small>STORIES</small></span>
                  <span className="pulse-stream-action">{expanded ? "CLOSE" : "ARCHIVE"}<ChevronDown size={14} aria-hidden="true" /></span>
                </button>
                {expanded && <section className="pulse-stream-history" id={`pulse-stream-history-${stream.id}`} aria-label={`${stream.title} historical news`}>
                  <div className="pulse-stream-history-heading">
                    <div><span className="pulse-stream-kicker">SECTOR ARCHIVE · {stream.title.toUpperCase()}</span><h3>{stream.title} archive</h3><p>{stories.length} source-linked {stories.length === 1 ? "story" : "stories"}, newest first.</p></div>
                    <span className="pulse-stream-history-actions">
                      <span className="pulse-archive-retention"><Activity size={13} aria-hidden="true" /> Publisher snapshot + this browser’s saved history</span>
                      <a className="pulse-archive-source-link" href={stream.sourceUrl} target="_blank" rel="noreferrer">Open sector source <ExternalLink size={11} aria-hidden="true" /></a>
                    </span>
                  </div>
                  {stories.length ? <div className="pulse-stream-story-list">
                    {stories.map((alert, storyIndex) => {
                      const sourceUrl = articleSourceUrl(alert);
                      return <article className="pulse-stream-story" key={`${alert.source_id}-${storyIndex}`}>
                        <div className="pulse-stream-story-meta"><span>{CATEGORY_LABEL[alert.category].toUpperCase()}</span><time dateTime={alert.event_time}>{formatPublishedDate(alert.event_time)}</time><b>{sourceLabel(alert)}</b></div>
                        <h4>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{alert.title}<ArrowUpRight size={14} aria-hidden="true" /></a> : alert.title}</h4>
                        {alert.summary && <p>{alert.summary}</p>}
                        <div className="pulse-stream-story-footer"><span><MapPin size={12} aria-hidden="true" />{alertLocation(alert)}</span>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Open original story <ExternalLink size={11} aria-hidden="true" /></a>}</div>
                      </article>;
                    })}
                  </div> : <div className="pulse-stream-history-empty"><Newspaper size={20} aria-hidden="true" /><p>No stories have been saved in this stream yet. Publisher updates will appear here as they’re published.</p><a href={stream.sourceUrl} target="_blank" rel="noreferrer">Browse this sector’s source <ExternalLink size={12} aria-hidden="true" /></a></div>}
                  <p className="pulse-stream-history-note">Archive includes the current publisher snapshot and up to 12 months of feed history saved in this browser (up to 600 links). Publisher availability and archive depth vary; each headline links to its original source.</p>
                </section>}
              </article>
            );
          })}
        </div>
      </section>

      <div className="pulse-broadcast-grid">
        <div className="pulse-broadcast-main">
          <section className="pulse-lead-story" aria-label="Rotating statewide stories">
            <div className="pulse-lead-topline">
              <span>
                <span className="pulse-live-dot" /> CHEYENNE &amp; STATEWIDE HEADLINES
              </span>
              <span>
                {featuredStory
                  ? `${String(currentStoryIndex + 1).padStart(2, "0")} / ${String(featuredStoryCount).padStart(2, "0")}`
                  : "— / —"}
              </span>
            </div>
            {featuredStory ? (
              <div className="pulse-lead-content" key={featuredStory.source_id}>
                <div className="pulse-lead-kicker">
                  <span
                    className={`pulse-lead-severity pulse-lead-severity--${featuredStory.severity}`}
                  >
                    {featuredStory.severity === "critical" && (
                      <AlertTriangle size={12} aria-hidden="true" />
                    )}
                    {SEVERITY[featuredStory.severity].label.toUpperCase()}
                  </span>
                  <span>{CATEGORY_LABEL[featuredStory.category].toUpperCase()}</span>
                  {featuredStory.talkgroup && (
                    <span className="pulse-lead-talkgroup">
                      <Radio size={11} aria-hidden="true" /> {featuredStory.talkgroup}
                    </span>
                  )}
                </div>
                <h2>{featuredStory.title}</h2>
                <p>
                  {featuredStory.summary ||
                    "Details are available in the original public alert or story."}
                </p>
                <div className="pulse-lead-meta">
                  <span>
                    <MapPin size={13} aria-hidden="true" />
                    {alertLocation(featuredStory)}
                  </span>
                  <span>
                    {featuredStory.agency ? featuredStory.agency : sourceLabel(featuredStory)}
                  </span>
                  {featuredStory.feed_id ? (
                    <button
                      type="button"
                      className="pulse-lead-tune-btn"
                      onClick={() => handleTuneFromAlert(featuredStory.feed_id ?? "47003")}
                    >
                      <Radio size={11} aria-hidden="true" /> Tune Scanner #{featuredStory.feed_id}
                    </button>
                  ) : null}
                  {featuredStory.source_url && (
                    <a
                      href={featuredStory.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="pulse-lead-source-link"
                    >
                      Official record <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  )}
                  {clock && (
                    <time dateTime={featuredStory.event_time}>
                      {timeAgo(featuredStory.event_time, clock)}
                    </time>
                  )}
                </div>
              </div>
            ) : (
              <div className="pulse-lead-empty">
                <Radio size={30} aria-hidden="true" />
                <h2>{loading ? "Tuning in to Cheyenne & Wyoming" : "The statewide desk is quiet."}</h2>
                <p>
                  {loading
                    ? "Checking WyoLink scanner, weather, road and newsroom feeds."
                    : "No alerts were returned in the latest refresh."}
                </p>
              </div>
            )}
            <div className="pulse-lead-controls">
              <div
                className="pulse-story-progress"
                aria-label={`${currentStoryIndex + 1} of ${featuredStoryCount} featured stories`}
              >
                {allAlerts.slice(0, Math.min(allAlerts.length, 8)).map((alert, index) => (
                  <button
                    type="button"
                    key={alert.source_id}
                    className={index === currentStoryIndex ? "active" : ""}
                    aria-label={`Show story ${index + 1}: ${alert.title}`}
                    onClick={() => setFeaturedIndex(index)}
                  />
                ))}
              </div>
              <span className="pulse-rotation-status">
                {featuredStoryCount > 1
                  ? rotationPaused
                    ? "PAUSED"
                    : reducedMotion
                      ? "MOTION OFF"
                      : "AUTO-ROTATING"
                  : "LIVE FEED"}
              </span>
              <div className="pulse-story-actions">
                <button
                  type="button"
                  onClick={() => showStory(-1)}
                  disabled={featuredStoryCount < 2}
                  aria-label="Previous story"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setRotationPaused((paused) => !paused)}
                  disabled={featuredStoryCount < 2 || reducedMotion}
                  aria-label={
                    reducedMotion
                      ? "Automatic story rotation is off because reduced motion is enabled"
                      : rotationPaused
                        ? "Resume story rotation"
                        : "Pause story rotation"
                  }
                  aria-pressed={rotationPaused}
                >
                  {rotationPaused || reducedMotion ? <Play size={13} /> : <Pause size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => showStory(1)}
                  disabled={featuredStoryCount < 2}
                  aria-label="Next story"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>

          <section className="pulse-stat-strip" aria-label="Statewide alert totals">
            <div>
              <span>ACTIVE SIGNALS</span>
              <strong>
                {loading && !result ? "—" : allAlerts.length.toString().padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>CHEYENNE / LARCO</span>
              <strong className="pulse-stat-red">
                {loading && !result ? "—" : cheyenneAlerts.length.toString().padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>SCANNER &amp; CAD</span>
              <strong>
                {loading && !result ? "—" : scannerAlerts.length.toString().padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>ROAD &amp; FIRE</span>
              <strong>
                {loading && !result
                  ? "—"
                  : allAlerts
                      .filter(
                        (alert) =>
                          alert.category === "road_conditions" || alert.category === "fire",
                      )
                      .length.toString()
                      .padStart(2, "0")}
              </strong>
            </div>
            <div className="pulse-stat-caption">
              <Activity size={14} aria-hidden="true" />
              <span>Cheyenne WyoLink P25 &amp; statewide feeds</span>
            </div>
          </section>

          {/* LIVE CHEYENNE & WYOMING PUBLIC SAFETY SCANNER CONSOLE */}
          <section
            ref={scannerSectionRef}
            className="pulse-scanner-section"
            aria-labelledby="pulse-scanner-heading"
          >
            <div className="pulse-scanner-header">
              <div>
                <span className="pulse-section-kicker">
                  <span className="pulse-live-dot" /> WYOLINK P25 TRUNKED RADIO (SYSTEM 3939 · ARCHER 800 NODE 6571)
                </span>
                <h2 id="pulse-scanner-heading">
                  Cheyenne &amp; Wyoming Live Scanner Console
                </h2>
                <p>
                  Live Broadcastify audio relays, WyoLink P25 talkgroups, VHF frequencies, and Laramie County Combined Communications CAD.
                </p>
              </div>
              <div className="pulse-scanner-scope-tabs" role="group" aria-label="Scanner directory view">
                <button
                  type="button"
                  className={scannerScope === "cheyenne" ? "active" : ""}
                  onClick={() => {
                    setScannerScope("cheyenne");
                    setActiveFeedId(CHEYENNE_SCANNER_FEEDS[0].id);
                  }}
                >
                  Cheyenne / Laramie Co. ({CHEYENNE_SCANNER_FEEDS.length})
                </button>
                {city.id !== "cheyenne" && (
                  <button
                    type="button"
                    className={scannerScope === "city" ? "active" : ""}
                    onClick={() => {
                      setScannerScope("city");
                      if (city.scanners[0]) setActiveFeedId(city.scanners[0].id);
                    }}
                  >
                    {city.name} ({city.scanners.length})
                  </button>
                )}
                <button
                  type="button"
                  className={scannerScope === "statewide" ? "active" : ""}
                  onClick={() => setScannerScope("statewide")}
                >
                  All Wyoming ({ALL_WYOMING_SCANNER_FEEDS.length})
                </button>
                <button
                  type="button"
                  className={scannerScope === "talkgroups" ? "active" : ""}
                  onClick={() => setScannerScope("talkgroups")}
                >
                  Cheyenne Talkgroups ({CHEYENNE_WYOLINK_TALKGROUPS.length})
                </button>
              </div>
            </div>

            {/* Active Scanner Tuner Deck */}
            <div className="pulse-scanner-tuner">
              <div className="pulse-scanner-tuner-main">
                <div className="pulse-scanner-tuner-badges">
                  <span className={`pulse-scanner-feed-badge ${isStreaming ? "streaming" : ""}`}>
                    <Radio size={11} aria-hidden="true" />
                    {isStreaming ? "ON AIR" : `FEED #${activeScannerFeed.id}`}
                  </span>
                  <span className="pulse-scanner-freq-badge">
                    {activeScannerFeed.primaryFrequency}
                  </span>
                  <span className="pulse-scanner-county-badge">
                    {activeScannerFeed.city} · {activeScannerFeed.county}
                  </span>
                </div>
                <h3>{activeScannerFeed.name}</h3>
                <p className="pulse-scanner-tuner-system">{activeScannerFeed.system}</p>
                <p className="pulse-scanner-tuner-status">{streamStatus}</p>
              </div>

              <div className="pulse-scanner-tuner-actions">
                {activeScannerFeed.streamUrl && (
                  <button
                    type="button"
                    className={`pulse-scanner-action-btn primary ${isStreaming ? "streaming" : ""}`}
                    onClick={toggleAudioStream}
                  >
                    {isStreaming ? (
                      <Pause size={13} aria-hidden="true" />
                    ) : (
                      <Play size={13} aria-hidden="true" />
                    )}
                    {isStreaming ? "Stop audio" : "Listen live"}
                  </button>
                )}
                {isStreaming && (
                  <button
                    type="button"
                    className="pulse-scanner-action-btn"
                    onClick={() => {
                      const nextMuted = !isMuted;
                      setIsMuted(nextMuted);
                      if (audioRef.current) audioRef.current.muted = nextMuted;
                    }}
                    aria-label={isMuted ? "Unmute scanner audio" : "Mute scanner audio"}
                  >
                    {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  className="pulse-scanner-action-btn"
                  onClick={() => setShowEmbeddedTuner((prev) => !prev)}
                >
                  <Radio size={12} aria-hidden="true" />
                  {showEmbeddedTuner ? "Hide web tuner" : "Embed web tuner"}
                </button>
                <a
                  href={activeScannerFeed.listenUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pulse-scanner-action-btn"
                >
                  Broadcastify <ExternalLink size={11} aria-hidden="true" />
                </a>
                {activeScannerFeed.callsNodeUrl && (
                  <a
                    href={activeScannerFeed.callsNodeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pulse-scanner-action-btn"
                  >
                    WyoLink Node 6571 <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
                <a
                  href="https://www.cheyennepd.org/citizenconnect"
                  target="_blank"
                  rel="noreferrer"
                  className="pulse-scanner-action-btn"
                >
                  Cheyenne CAD Map <ExternalLink size={11} aria-hidden="true" />
                </a>
              </div>
            </div>

            {showEmbeddedTuner && (
              <div className="pulse-scanner-embed-box">
                <div className="pulse-scanner-embed-bar">
                  <span>
                    Broadcastify Live Web Tuner — <strong>{activeScannerFeed.name}</strong>
                  </span>
                  <div>
                    <a href={activeScannerFeed.popoutUrl} target="_blank" rel="noreferrer">
                      Pop-out player <ExternalLink size={10} aria-hidden="true" />
                    </a>
                    {activeScannerFeed.archiveUrl && (
                      <a href={activeScannerFeed.archiveUrl} target="_blank" rel="noreferrer">
                        Audio archives <ExternalLink size={10} aria-hidden="true" />
                      </a>
                    )}
                    <a href={activeScannerFeed.radioReferenceUrl} target="_blank" rel="noreferrer">
                      RadioReference DB <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <iframe
                  title={`Broadcastify Live Scanner - ${activeScannerFeed.name}`}
                  src={activeScannerFeed.popoutUrl}
                  className="pulse-scanner-embed-iframe"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            )}

            {scannerScope === "talkgroups" ? (
              <div className="pulse-talkgroup-panel">
                <div className="pulse-talkgroup-callsigns">
                  <Siren size={14} aria-hidden="true" />
                  <span>
                    <strong>Laramie County Unit Callsigns (02-LE 1):</strong>{" "}
                    <code>Paul</code> = Cheyenne Police Dept · <code>Charlie</code> = Laramie County Sheriff ·{" "}
                    <code>PB</code> = Pine Bluffs PD · <code>Engine / Ladder</code> = Cheyenne Fire Rescue ·{" "}
                    <code>AXO</code> = WHP Troop A
                  </span>
                  <a
                    href="https://www.radioreference.com/db/browse/ctid/3134"
                    target="_blank"
                    rel="noreferrer"
                  >
                    RadioReference DB <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
                <div className="pulse-talkgroup-grid">
                  {CHEYENNE_WYOLINK_TALKGROUPS.map((tg) => (
                    <article key={tg.id} className="pulse-talkgroup-item">
                      <div className="pulse-talkgroup-item-top">
                        <strong>{tg.alphaTag}</strong>
                        <span>{tg.service}</span>
                      </div>
                      <div className="pulse-talkgroup-item-freq">
                        {tg.frequency || `WyoLink TG ${tg.id}`}
                      </div>
                      <p>{tg.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pulse-scanner-grid">
                {displayedScannerFeeds.map((feed) => {
                  const isSelected = feed.id === activeScannerFeed.id;
                  return (
                    <article
                      key={feed.id}
                      className={`pulse-scanner-card ${isSelected ? "active" : ""}`}
                    >
                      <div className="pulse-scanner-card-top">
                        <span className="pulse-scanner-card-id">
                          {isSelected && isStreaming ? "● ON AIR" : `FEED #${feed.id}`}
                        </span>
                        <span className="pulse-scanner-card-freq">{feed.primaryFrequency}</span>
                      </div>
                      <h3>{feed.name}</h3>
                      <p className="pulse-scanner-card-agencies">
                        {feed.agencies.slice(0, 4).join(" · ")}
                      </p>
                      <div className="pulse-scanner-card-footer">
                        <button
                          type="button"
                          className={`pulse-scanner-card-btn ${isSelected ? "active" : ""}`}
                          onClick={() => handleSelectScannerFeed(feed)}
                        >
                          <Radio size={11} aria-hidden="true" />
                          {isSelected ? "Tuned" : "Tune feed"}
                        </button>
                        {feed.streamUrl && (
                          <button
                            type="button"
                            className="pulse-scanner-card-btn listen"
                            onClick={() => void startAudioStream(feed)}
                          >
                            <Play size={11} aria-hidden="true" /> Stream
                          </button>
                        )}
                        <a
                          href={feed.listenUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pulse-scanner-card-link"
                        >
                          Web <ExternalLink size={10} aria-hidden="true" />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* LARAMIE COUNTY CITIZEN CONNECT INCIDENT RECORD — the historical
              counterpart to the live scanner above: same agencies, same
              dispatch stream, but the whole archive read as evidence rather
              than as pins on a map. */}
          <IncidentRecordLens />

          <section className="pulse-feed-section" aria-labelledby="pulse-feed-title">
            <div className="pulse-section-heading">
              <div>
                <span className="pulse-section-kicker">THE LIVE DESK</span>
                <h2 id="pulse-feed-title">Latest dispatches &amp; signals</h2>
                <p>
                  Live scanner blotter, NWS Cheyenne alerts, WYDOT 511 road conditions, and {NEWSROOM_COUNT} Wyoming newsrooms.
                </p>
              </div>
              <span className="pulse-feed-total">
                {filteredAlerts.length} {filteredAlerts.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="pulse-feed-filters" role="group" aria-label="Filter live alerts">
              {feedFilters.map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  className={feedFilter === filter.id ? "active" : ""}
                  aria-pressed={feedFilter === filter.id}
                  onClick={() => setFeedFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="pulse-alert-list">
              {filteredAlerts.map((alert) => (
                <AlertRow
                  key={alert.source_id}
                  alert={alert}
                  now={now}
                  onTuneFeed={handleTuneFromAlert}
                />
              ))}
              {!loading && filteredAlerts.length === 0 && (
                <div className="pulse-feed-empty">
                  <CheckCircle2 size={24} aria-hidden="true" />
                  <strong>
                    {allAlerts.length ? "No signals in this filter." : "No active alerts returned."}
                  </strong>
                  <span>
                    {allAlerts.length
                      ? "Choose another feed filter to see more updates."
                      : "Try refreshing, or check the original agency feeds."}
                  </span>
                </div>
              )}
              {loading && !result && (
                <div className="pulse-feed-loading" role="status">
                  <span />
                  <span />
                  <span />
                  Checking Cheyenne &amp; statewide feeds…
                </div>
              )}
            </div>
          </section>

          <section className="pulse-method-note">
            <Shield size={16} aria-hidden="true" />
            <p>
              Wyoming Pulse aggregates live WyoLink P25 scanner feeds (Broadcastify Node 6571 &amp; statewide relays), NWS Cheyenne (KCYS) alerts, WYDOT 511 road conditions, NIFC WFIGS wildfire incidents, USGS seismic events, and {NEWSROOM_COUNT} Wyoming newsrooms. Always confirm emergency instructions with Laramie County Combined Communications or your local 911 authority.
            </p>
          </section>
        </div>

        <aside className="pulse-broadcast-rail" aria-label="Local desk and feed analytics">
          <section className="pulse-rail-card pulse-city-card">
            <div className="pulse-card-kicker">
              <MapPin size={13} aria-hidden="true" /> LOCAL DESK &amp; 911 PSAP
            </div>
            <label htmlFor="pulse-city-select">Choose a Wyoming city</label>
            <div className="pulse-city-select-wrap">
              <select
                id="pulse-city-select"
                value={city.id}
                onChange={(event) => selectCity(event.target.value)}
              >
                {WYOMING_CITIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.observationStation})
                  </option>
                ))}
              </select>
              <ChevronRight size={15} aria-hidden="true" />
            </div>
            <div className="pulse-city-meta">
              <span>{city.county}</span>
              <span>
                {localAlerts.length} local {localAlerts.length === 1 ? "signal" : "signals"}
              </span>
            </div>
            <div className="pulse-psap-summary">
              <strong>{city.dispatch.name}</strong>
              {city.dispatch.address && <span>{city.dispatch.address}</span>}
              <div className="pulse-psap-links">
                <a href={`tel:${city.dispatch.nonEmergencyPhone.replace(/[^0-9]/g, "")}`}>
                  <PhoneCall size={10} aria-hidden="true" /> {city.dispatch.nonEmergencyPhone}
                </a>
                {city.dispatch.cadUrl && (
                  <a href={city.dispatch.cadUrl} target="_blank" rel="noreferrer">
                    {city.dispatch.cadName || "Citizen Connect CAD"} <ExternalLink size={10} aria-hidden="true" />
                  </a>
                )}
                <a
                  href={`https://www.wyoroad.info/pls/Browse/WRR.TownResults?SelectedTown=${encodeURIComponent(city.name)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WYDOT {city.name} 511 <ExternalLink size={10} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="pulse-highway-list">
              {city.highways.slice(0, 5).map((highway) => (
                <span key={highway}>{highway}</span>
              ))}
            </div>
          </section>

          <section
            className="pulse-rail-card pulse-weather-card"
            aria-labelledby="pulse-weather-title"
          >
            <div className="pulse-weather-heading">
              <div>
                <div className="pulse-card-kicker">
                  <Thermometer size={13} aria-hidden="true" /> NWS &amp; {city.observationStation} METAR
                </div>
                <h2 id="pulse-weather-title">{city.name}, Wyoming</h2>
              </div>
              <a
                href={cityForecastUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the National Weather Service forecast for ${city.name}`}
              >
                <ArrowUpRight size={15} />
              </a>
            </div>
            {forecastLoading && !forecast ? (
              <div className="pulse-weather-loading" role="status">
                <span />
                Loading {city.observationStation} telemetry…
              </div>
            ) : forecast ? (
              <div className="pulse-weather-content">
                <div className="pulse-weather-main">
                  <ForecastIcon forecast={forecast.shortForecast} />
                  <div>
                    <strong>
                      {forecast.temperature}°{forecast.temperatureUnit.replace(/^°/, "")}
                    </strong>
                    <span>{forecast.name}</span>
                  </div>
                </div>
                <p className="pulse-weather-summary">{forecast.shortForecast}</p>
                <div className="pulse-weather-facts">
                  <span>
                    <Wind size={13} aria-hidden="true" />
                    {forecast.windSpeed}
                  </span>
                  {forecast.relativeHumidity !== undefined && (
                    <span>
                      <Gauge size={13} aria-hidden="true" />
                      {forecast.relativeHumidity}% humidity
                    </span>
                  )}
                </div>
              </div>
            ) : null}
            <div
              className={`pulse-weather-alert-count ${localWeatherAlerts.length ? "has-alerts" : ""}`}
            >
              {localWeatherAlerts.length ? (
                <AlertTriangle size={14} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={14} aria-hidden="true" />
              )}
              <span>
                {localWeatherAlerts.length
                  ? `${localWeatherAlerts.length} active weather/fire ${localWeatherAlerts.length === 1 ? "alert" : "alerts"} in the local feed`
                  : "No weather alerts in the local feed"}
              </span>
            </div>
            <div className="pulse-zone-note">
              NWS ZONE{city.nwsZones.length > 1 ? "S" : ""}:{" "}
              {city.nwsZones.map((zone) => `${zone.id} · ${zone.name}`).join("  /  ")}
            </div>
          </section>

          <section className="pulse-rail-card pulse-local-card">
            <div className="pulse-section-heading pulse-local-heading">
              <div>
                <span className="pulse-section-kicker">NEAR {city.name.toUpperCase()}</span>
                <h2>Local dispatch</h2>
              </div>
              <span className="pulse-local-count">
                {localAlerts.length.toString().padStart(2, "0")}
              </span>
            </div>
            {localAlerts.length ? (
              <div className="pulse-local-list">
                {localAlerts.slice(0, 5).map((alert) => (
                  <article key={alert.source_id}>
                    <span className={`pulse-local-marker pulse-local-marker--${alert.severity}`} />
                    <div>
                      <strong>{alert.title}</strong>
                      <span>
                        {sourceLabel(alert)}
                        {alert.talkgroup ? ` · ${alert.talkgroup}` : ""} ·{" "}
                        {clock ? timeAgo(alert.event_time, clock) : "—"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="pulse-local-empty">
                <CheckCircle2 size={19} aria-hidden="true" />
                <p>
                  {loading
                    ? "Checking the local desk…"
                    : `No current signals matched ${city.name} or ${city.county}.`}
                </p>
              </div>
            )}
          </section>

          <section
            className="pulse-rail-card pulse-velocity-card"
            aria-labelledby="pulse-velocity-title"
          >
            <div className="pulse-velocity-heading">
              <div>
                <span className="pulse-section-kicker">FEED TEMPO</span>
                <h2 id="pulse-velocity-title">Alert velocity</h2>
              </div>
              <Activity size={17} aria-hidden="true" />
            </div>
            <p>Signals grouped by age of the source event.</p>
            <div
              className="pulse-velocity-chart"
              role="img"
              aria-label={ageBuckets
                .map((bucket) => `${bucket.label}: ${bucket.count} alerts`)
                .join(", ")}
            >
              {ageBuckets.map((bucket) => (
                <div className="pulse-velocity-column" key={bucket.label}>
                  <strong>{bucket.count}</strong>
                  <div className="pulse-velocity-track">
                    <span
                      style={{
                        height: `${bucket.count ? Math.max(9, (bucket.count / maxAgeBucket) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span>{bucket.label}</span>
                </div>
              ))}
            </div>
            <div className="pulse-velocity-footnote">
              <Gauge size={13} aria-hidden="true" /> {allAlerts.length} timestamped{" "}
              {allAlerts.length === 1 ? "signal" : "signals"} in current feed
            </div>
          </section>

          <section className="pulse-rail-card pulse-source-card">
            <div className="pulse-card-kicker">
              <Activity size={13} aria-hidden="true" /> CHEYENNE &amp; WYOMING SOURCES
            </div>
            <div className="pulse-source-row">
              <span className="pulse-source-icon pulse-source-icon--scanner">
                <Radio size={14} />
              </span>
              <span>
                <strong>WyoLink &amp; Cheyenne CAD</strong>
                <small>CPD, LCSO, CFR, WHP &amp; county scanners</small>
              </span>
              <b>{result?.counts.scanner ?? "—"}</b>
            </div>
            <div className="pulse-source-row">
              <span className="pulse-source-icon pulse-source-icon--weather">
                <Cloud size={14} />
              </span>
              <span>
                <strong>National Weather Service</strong>
                <small>KCYS Cheyenne &amp; statewide alerts</small>
              </span>
              <b>{result?.counts.nws ?? "—"}</b>
            </div>
            <div className="pulse-source-row">
              <span className="pulse-source-icon pulse-source-icon--roads">
                <Route size={14} />
              </span>
              <span>
                <strong>WYDOT 511 &amp; District 1</strong>
                <small>I-80, I-25 &amp; statewide closures</small>
              </span>
              <b>{result?.counts.wydot ?? "—"}</b>
            </div>
            <div className="pulse-source-row">
              <span className="pulse-source-icon pulse-source-icon--fire">
                <Flame size={14} />
              </span>
              <span>
                <strong>NIFC Wildfire &amp; USGS Seismic</strong>
                <small>WFIGS fire dispatch &amp; seismic sensors</small>
              </span>
              <b>{(result?.counts.wildfire ?? 0) + (result?.counts.usgs ?? 0)}</b>
            </div>
            <div className="pulse-source-row">
              <span className="pulse-source-icon pulse-source-icon--news">
                <Newspaper size={14} />
              </span>
              <span>
                <strong>Wyoming newsrooms (14 feeds)</strong>
                <small>Cap City Crime, KGAB, KFBC, WyoFile &amp; more</small>
              </span>
              <b>{result?.counts.rss ?? "—"}</b>
            </div>
            <div className="pulse-source-foot">
              <span className="pulse-source-indicator" />
              Last checked {updatedLabel} {mountainZoneLabel} · Cheyenne &amp; statewide active
            </div>
          </section>

          <a
            className="pulse-wydot-link"
            href="https://www.wyoroad.info/pls/Browse/WRR.TownResults?SelectedTown=Cheyenne"
            target="_blank"
            rel="noreferrer"
          >
            <Route size={15} aria-hidden="true" /> WYDOT Cheyenne &amp; statewide 511{" "}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </aside>
      </div>

      <footer className="pulse-broadcast-footer">
        <span>
          <Radio size={13} aria-hidden="true" /> WYOMING PULSE · CHEYENNE &amp; STATEWIDE PUBLIC SAFETY MONITOR
        </span>
        <span>
          WyoLink P25 (Node 6571) <i /> Auto-refreshes every 60 seconds <i /> Times shown in Mountain Time
        </span>
      </footer>
    </section>
  );
}

export default PulseBroadcast;
