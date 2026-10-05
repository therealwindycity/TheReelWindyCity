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
  Play,
  Radio,
  RefreshCw,
  Route,
  Shield,
  Sun,
  Thermometer,
  Trophy,
  Wind,
  type LucideIcon,
} from "lucide-react";
import {
  runPulseIngestion,
  type AlertCategory,
  type AlertSeverity,
  type IngestionResult,
  type PulseAlert,
} from "@/lib/pulse-ingestion";
import pulseSeed from "@/data/wyoming-pulse-seed.json";
import pulseSources from "@/data/pulse-sources.json";
import { WYOMING_CITIES, type WyomingCity } from "@/lib/wyoming-cities";

const SEVERITY: Record<AlertSeverity, { label: string; rank: number }> = {
  critical: { label: "Critical", rank: 0 },
  urgent: { label: "Urgent", rank: 1 },
  standard: { label: "Update", rank: 2 },
  informational: { label: "Info", rank: 3 },
};

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  weather: "Weather",
  road_conditions: "Roads",
  fire: "Fire",
  crime: "Public safety",
  accident: "Traffic incident",
  government: "Government",
  court: "Courts",
  election: "Elections",
  environment: "Environment",
  health: "Health",
  sports: "Sports",
  community: "Community",
  breaking: "Breaking news",
};

const CATEGORY_ICON: Record<AlertCategory, LucideIcon> = {
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

const HISTORY_STORAGE_KEY = "wyoming-pulse-history-v1";
const HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_HISTORY_ITEMS = 600;
const SEED_ALERTS = pulseSeed.alerts as PulseAlert[];

const INITIAL_RESULT: IngestionResult = {
  alerts: SEED_ALERTS,
  counts: pulseSeed.counts,
  timestamp: pulseSeed.capturedAt,
  snapshotCapturedAt: pulseSeed.capturedAt,
  mode: "curated-seed",
  sourceStatuses: [],
  errors: pulseSeed.errors,
};

interface PulseNewsStream {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  matches: (alert: PulseAlert) => boolean;
  sourceUrl: string;
}

const NEWS_STREAMS: PulseNewsStream[] = [
  {
    id: "statewide",
    title: "Statewide headlines",
    description: "The full Wyoming newswire",
    icon: Newspaper,
    matches: () => true,
    sourceUrl: "https://www.wyomingpublicmedia.org/",
  },
  {
    id: "government",
    title: "Government & elections",
    description: "Policy, ballots, and public decisions",
    icon: Building2,
    matches: (alert) => ["government", "court", "election"].includes(alert.category)
      || /legislature|lawmakers?|governor|commission|ballot|voter|election|tax|public hearing|city council/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://www.wyomingpublicmedia.org/politics-government/",
  },
  {
    id: "public-safety",
    title: "Public safety",
    description: "Incidents, emergency services, and policing",
    icon: Shield,
    matches: (alert) => ["crime", "accident", "fire", "breaking"].includes(alert.category)
      || /police|sheriff|crash|collision|fatal|firefighter|ambulance|emt|law enforcement|flock camera|license plate/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://capcity.news/latest-news/",
  },
  {
    id: "weather",
    title: "Weather & wildfire",
    description: "Forecasts, watches, and fire conditions",
    icon: Cloud,
    matches: (alert) => ["weather", "fire"].includes(alert.category)
      || /forecast|wind warning|blizzard|wildfire|fire weather|burn ban/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://www.weather.gov/riw/",
  },
  {
    id: "roads",
    title: "Roads & travel",
    description: "Closures, crashes, construction, and WYDOT",
    icon: Route,
    matches: (alert) => ["road_conditions", "accident"].includes(alert.category)
      || /road|highway|interstate|traffic|closure|closed|construction|detour|travel|wyodot|milepost/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://wyoroad.info/",
  },
  {
    id: "energy-land",
    title: "Energy, land & wildlife",
    description: "Natural resources and Wyoming’s outdoors",
    icon: Activity,
    matches: (alert) => alert.category === "environment"
      || /energy|electric(?:ity)?|power bills?|data cent(?:er|re)s?|oil|gas|coal|uranium|wind turbine|public lands?|national forest|wildlife|conservation|water rights|mining/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://www.wyomingpublicmedia.org/natural-resources-energy/",
  },
  {
    id: "schools-health",
    title: "Schools & health",
    description: "Education, care, and community services",
    icon: CheckCircle2,
    matches: (alert) => alert.category === "health"
      || /school|student|education|bus|university|college|health|hospital|medicaid|ambulance|emt|boys’ school|boys' school/i.test(`${alert.title} ${alert.summary} ${alert.tags.join(" ")}`),
    sourceUrl: "https://www.wyomingpublicmedia.org/",
  },
  {
    id: "community",
    title: "Community & economy",
    description: "Local life, business, and county news",
    icon: MapPin,
    matches: (alert) => alert.category === "community"
      || /business|economy|tourism|lodging|local|community|arts|event|ranch|housing|residents|ratepayers/i.test(`${alert.title} ${alert.summary}`),
    sourceUrl: "https://oilcity.news/latest-news/",
  },
  {
    id: "sports",
    title: "Wyoming sports",
    description: "High school scores, standouts, and local teams",
    icon: Trophy,
    matches: (alert) => alert.category === "sports"
      || /football|basketball|volleyball|baseball|softball|soccer|wrestling|tennis|golf|cross[- ]country|swimming|rodeo|scoreboard|playoffs?|championship|all-state/i.test(`${alert.title} ${alert.summary} ${alert.tags.join(" ")}`),
    sourceUrl: "https://wyopreps.com/",
  },
];

interface HourlyForecast {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  relativeHumidity?: number;
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  shortForecast?: string;
  windSpeed?: string;
  relativeHumidity?: { value?: number | null };
}

interface ForecastResponse {
  properties?: { periods?: ForecastPeriod[] };
}

interface PointResponse {
  properties?: { forecastHourly?: string; forecast?: string };
}

function formatTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/Denver" }).format(date);
}

function mountainZone(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    timeZoneName: "short",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "MT";
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
  if (alert.source === "wydot") return "WYDOT ROADS";
  return alert.tags[0]?.toUpperCase() ?? "NEWSWIRE";
}

function articleSourceUrl(alert: PulseAlert): string | null {
  if (alert.source === "nws" && /^https?:\/\//i.test(alert.source_id)) return alert.source_id;
  if (alert.source === "wydot") return "https://wyoroad.info/";
  if (alert.source.startsWith("rss-") && /^https?:\/\//i.test(alert.source_id)) return alert.source_id;
  return null;
}

function mergeHistoryAlerts(...groups: PulseAlert[][]): PulseAlert[] {
  const unique = new Map<string, PulseAlert>();
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  for (const alert of groups.flat()) {
    if (!alert || !alert.source_id || !alert.title) continue;
    const timestamp = new Date(alert.event_time).getTime();
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue;
    const current = unique.get(alert.source_id);
    if (!current || new Date(alert.ingested_at).getTime() >= new Date(current.ingested_at).getTime()) {
      unique.set(alert.source_id, alert);
    }
  }
  return [...unique.values()]
    .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
    .slice(0, MAX_HISTORY_ITEMS);
}

function readSavedHistory(): PulseAlert[] {
  try {
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const value: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(value) ? value as PulseAlert[] : [];
  } catch {
    return [];
  }
}

function writeSavedHistory(alerts: PulseAlert[]) {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Keep the live desk usable when private browsing or storage limits block saving.
  }
}

function formatPublishedDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "Date not listed";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "America/Denver",
  }).format(date);
}

function newestFirst(alerts: PulseAlert[]): PulseAlert[] {
  return [...alerts].sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());
}

function alertLocation(alert: PulseAlert): string {
  return [alert.location.city, alert.location.county, alert.location.highway]
    .filter(Boolean)
    .join(" · ") || "Wyoming";
}

function matchesCity(alert: PulseAlert, city: WyomingCity): boolean {
  const locationText = [
    alert.location.city,
    alert.location.county,
    alert.location.highway,
    alert.title,
    alert.summary,
  ].filter(Boolean).join(" ").toLocaleLowerCase("en-US");
  const countyName = city.county.replace(/\s+county$/i, "").toLocaleLowerCase("en-US");
  const hasCity = locationText.includes(city.name.toLocaleLowerCase("en-US"));
  const hasCounty = countyName.length > 2 && locationText.includes(countyName);
  const hasZone = city.nwsZones.some((zone) => locationText.includes(zone.name.toLocaleLowerCase("en-US")));
  const hasHighway = city.highways.some((highway) => locationText.includes(highway.toLocaleLowerCase("en-US")));
  return hasCity || hasCounty || hasZone || hasHighway;
}

function getAgeBuckets(alerts: PulseAlert[], now: Date) {
  const definitions = [
    { label: "< 15 min", maxMinutes: 15 },
    { label: "15–60 min", maxMinutes: 60 },
    { label: "1–6 hours", maxMinutes: 360 },
    { label: "6+ hours", maxMinutes: Infinity },
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

function ForecastIcon({ forecast }: { forecast: string }) {
  if (/snow|blizzard|sleet|flurr/i.test(forecast)) return <CloudSnow aria-hidden="true" />;
  if (/thunder|lightning/i.test(forecast)) return <CloudLightning aria-hidden="true" />;
  if (/rain|shower|drizzle/i.test(forecast)) return <CloudRain aria-hidden="true" />;
  if (/sunny|clear/i.test(forecast)) return <Sun aria-hidden="true" />;
  return <Cloud aria-hidden="true" />;
}

function AlertRow({ alert, now }: { alert: PulseAlert; now: Date }) {
  const Icon = CATEGORY_ICON[alert.category] ?? Bell;
  const sourceUrl = articleSourceUrl(alert);
  const sourceLinkLabel = alert.source === "nws" ? "NWS alert" : alert.source === "wydot" ? "WYDOT" : "Original story";

  return (
    <article className={`broadcast-alert broadcast-alert--${alert.severity}`}>
      <div className="broadcast-alert-icon"><Icon size={17} aria-hidden="true" /></div>
      <div className="broadcast-alert-content">
        <div className="broadcast-alert-meta">
          <span className={`broadcast-severity broadcast-severity--${alert.severity}`}>
            {SEVERITY[alert.severity].label}
          </span>
          <span>{sourceLabel(alert)}</span>
          <time dateTime={alert.event_time}>{timeAgo(alert.event_time, now)}</time>
        </div>
        <h3>{alert.title}</h3>
        <p>{alert.summary || "No additional detail was included in the source alert."}</p>
        <div className="broadcast-alert-footer">
          <span><MapPin size={12} aria-hidden="true" />{alertLocation(alert)}</span>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {sourceLinkLabel} <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function PulseBroadcast() {
  const [result, setResult] = useState<IngestionResult>(INITIAL_RESULT);
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
  const [feedFilter, setFeedFilter] = useState<"all" | "priority" | "public_safety" | "government_desk" | AlertCategory>("all");
  const [forecast, setForecast] = useState<HourlyForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastUnavailable, setForecastUnavailable] = useState(false);
  const hasLoadedRef = useRef(false);
  const refreshInProgressRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      const nextResult = await runPulseIngestion();
      setResult(nextResult);
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch {
      // Keep the most recent source-linked headlines on screen if a refresh fails.
    } finally {
      refreshInProgressRef.current = false;
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
    const restored = mergeHistoryAlerts(SEED_ALERTS, readSavedHistory(), result.alerts);
    writeSavedHistory(restored);
    const frame = window.requestAnimationFrame(() => setHistoryAlerts(restored));
    return () => window.cancelAnimationFrame(frame);
  }, [result.alerts]);

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

  const allAlerts = result.alerts;
  const isSeedSnapshot = result.mode === "curated-seed";
  const city = WYOMING_CITIES.find((item) => item.id === selectedCityId) ?? WYOMING_CITIES[0];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);

    async function loadForecast() {
      try {
        const pointResponse = await fetch(
          `https://api.weather.gov/points/${city.latitude},${city.longitude}`,
          {
            headers: {
              Accept: "application/geo+json",
              "User-Agent": "WyomingPulse/1.0 (public-interest dashboard)",
            },
            signal: controller.signal,
          },
        );
        if (!pointResponse.ok) throw new Error("NWS point lookup failed");
        const point = await pointResponse.json() as PointResponse;
        const forecastUrl = point.properties?.forecastHourly ?? point.properties?.forecast;
        if (!forecastUrl) throw new Error("NWS forecast is unavailable for this point");

        const forecastResponse = await fetch(forecastUrl, {
          headers: {
            Accept: "application/geo+json",
            "User-Agent": "WyomingPulse/1.0 (public-interest dashboard)",
          },
          signal: controller.signal,
        });
        if (!forecastResponse.ok) throw new Error("NWS forecast request failed");
        const forecastData = await forecastResponse.json() as ForecastResponse;
        const period = forecastData.properties?.periods?.[0];
        if (
          !period ||
          typeof period.temperature !== "number" ||
          !period.shortForecast
        ) throw new Error("NWS returned no hourly forecast period");

        if (active) {
          setForecast({
            name: period.name ?? "Next hour",
            temperature: period.temperature,
            temperatureUnit: period.temperatureUnit ?? "°F",
            shortForecast: period.shortForecast,
            windSpeed: period.windSpeed ?? "Not listed",
            relativeHumidity: typeof period.relativeHumidity?.value === "number"
              ? period.relativeHumidity.value
              : undefined,
          });
        }
      } catch {
        if (active && (timedOut || !controller.signal.aborted)) setForecastUnavailable(true);
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

  const localAlerts = useMemo(
    () => allAlerts.filter((alert) => matchesCity(alert, city)),
    [allAlerts, city],
  );
  const localWeatherAlerts = localAlerts.filter(
    (alert) => (alert.category === "weather" || alert.category === "fire") && alert.source === "nws",
  );
  const nwsUnavailable = result.sourceStatuses.some((source) => source.id === "nws" && source.status === "unavailable")
    || result.errors.some((error) => /^NWS:/i.test(error));
  const storiesByStream = useMemo(
    () => new Map(NEWS_STREAMS.map((stream) => [
      stream.id,
      newestFirst(historyAlerts.filter((alert) => stream.matches(alert))),
    ])),
    [historyAlerts],
  );
  const priorityAlerts = allAlerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "urgent",
  );
  const tickerAlerts = priorityAlerts.length ? priorityAlerts.slice(0, 8) : allAlerts.slice(0, 6);
  const filteredAlerts = allAlerts.filter((alert) => {
    if (feedFilter === "all") return true;
    if (feedFilter === "priority") return alert.severity === "critical" || alert.severity === "urgent";
    if (feedFilter === "public_safety") return ["crime", "accident", "fire", "breaking"].includes(alert.category);
    if (feedFilter === "government_desk") return ["government", "court", "election"].includes(alert.category);
    return alert.category === feedFilter;
  });
  const featuredStoryCount = Math.min(allAlerts.length, 8);
  const currentStoryIndex = featuredStoryCount ? featuredIndex % featuredStoryCount : 0;
  const featuredStory = featuredStoryCount ? allAlerts[currentStoryIndex] : null;
  const now = clock ?? new Date(0);
  const ageBuckets = getAgeBuckets(allAlerts, now);
  const maxAgeBucket = Math.max(1, ...ageBuckets.map((bucket) => bucket.count));
  const mountainTime = clock ? formatTime(clock, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) : "--:--:--";
  const mountainDate = clock ? formatTime(clock, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Loading local time";
  const mountainZoneLabel = clock ? mountainZone(clock) : "MT";
  const updatedLabel = lastUpdated
    ? formatTime(lastUpdated, { hour: "numeric", minute: "2-digit", hour12: true })
    : "Waiting for first update";
  const snapshotDateLabel = result.snapshotCapturedAt ? formatPublishedDate(result.snapshotCapturedAt) : "not available";
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
    setForecastUnavailable(false);
  }

  const feedFilters: { id: "all" | "priority" | "public_safety" | "government_desk" | AlertCategory; label: string }[] = [
    { id: "all", label: "All items" },
    { id: "priority", label: "Priority" },
    { id: "government_desk", label: "Government" },
    { id: "public_safety", label: "Public safety" },
    { id: "weather", label: "Weather" },
    { id: "road_conditions", label: "Roads" },
    { id: "environment", label: "Land & energy" },
    { id: "health", label: "Health" },
    { id: "sports", label: "Sports" },
    { id: "community", label: "Community" },
  ];

  return (
    <section className="pulse-broadcast page-enter" aria-labelledby="pulse-title">
      <header className="pulse-masthead">
        <div className="pulse-brand-mark" aria-hidden="true"><Radio size={25} strokeWidth={1.8} /></div>
        <div className="pulse-brand-copy">
          <span>WYOMING</span>
          <h1 id="pulse-title">PULSE</h1>
        </div>
        <div className="pulse-masthead-divider" />
        <div className="pulse-masthead-description">
          <strong>THE STATEWIDE DESK</strong>
          <span>News · Safety · Weather · Roads · Government</span>
        </div>
        <div className="pulse-masthead-clock" aria-label={`Current Wyoming time ${mountainTime} ${mountainZoneLabel}`}>
          <span>CHEYENNE LOCAL TIME</span>
          <strong>{mountainTime} <small>{mountainZoneLabel}</small></strong>
          <time>{mountainDate}</time>
        </div>
      </header>

      <div className={`pulse-status-rail ${isSeedSnapshot ? "pulse-status-rail--snapshot" : ""}`}>
        <span className="pulse-on-air"><span />{loading ? "SYNCING" : isSeedSnapshot ? "SOURCE SNAPSHOT" : "ON AIR"}</span>
        <span className="pulse-status-copy">MONITORING <strong>WYOMING</strong></span>
        <span className="pulse-status-updated">CHECKED {updatedLabel} {mountainZoneLabel}</span>
        <button className="pulse-refresh" type="button" onClick={() => void refresh()} disabled={loading || refreshing}>
          <RefreshCw size={13} className={refreshing ? "spin" : ""} aria-hidden="true" />
          {refreshing ? "Updating" : "Refresh feeds"}
        </button>
        <span className="pulse-status-sources">NWS <i /> WYDOT <i /> {pulseSources.feeds.length} NEWSROOMS</span>
      </div>

      <section className="pulse-breaking-ticker" aria-label="Breaking and priority alerts">
        <div className="pulse-breaking-label"><Radio size={14} aria-hidden="true" />{priorityAlerts.length ? "BREAKING" : "LATEST"}</div>
        <div className="pulse-ticker-window" aria-live="polite">
          {tickerAlerts.length ? (
            <div className="pulse-ticker-track">
              {[0, 1].map((copy) => (
                <div className="pulse-ticker-copy" key={copy} aria-hidden={copy === 1}>
                  {tickerAlerts.map((alert) => (
                    <span className="pulse-ticker-item" key={`${copy}-${alert.source_id}`}>
                      <b>{CATEGORY_LABEL[alert.category].toUpperCase()}</b>
                      <span>{alert.title}</span>
                      <i aria-hidden="true">◆</i>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <span className="pulse-ticker-empty">
              {loading ? "Connecting to statewide feeds…" : "No active alerts in the feed right now."}
            </span>
          )}
        </div>
        <span className="pulse-ticker-count">{priorityAlerts.length.toString().padStart(2, "0")} PRIORITY</span>
      </section>

      <section className="pulse-stream-directory" aria-labelledby="pulse-stream-title">
        <div className="pulse-stream-directory-heading">
          <div>
            <span className="pulse-stream-kicker">THE WYOMING NEWS MAP</span>
            <h2 id="pulse-stream-title">A state-wide desk, split into streams.</h2>
            <p>Scan each moving headline rail. Select a sector to open its source-linked news archive.</p>
          </div>
          <div className="pulse-stream-summary">
            <span><strong>{NEWS_STREAMS.length.toString().padStart(2, "0")}</strong> news streams</span>
            <span><strong>{historyAlerts.length.toLocaleString("en-US")}</strong> saved headlines</span>
          </div>
        </div>

        <nav className="pulse-stream-index" aria-label="Jump to a Wyoming news stream">
          {NEWS_STREAMS.map((stream) => (
            <a href={`#pulse-stream-row-${stream.id}`} key={stream.id}>{stream.title}</a>
          ))}
        </nav>

        <div className="pulse-stream-list">
          {NEWS_STREAMS.map((stream, index) => {
            const stories = storiesByStream.get(stream.id) ?? [];
            const marqueeStories = stories.slice(0, 12);
            const expanded = expandedStreamId === stream.id;
            const Icon = stream.icon;

            return (
              <article
                className={`pulse-stream-row ${expanded ? "pulse-stream-row--open" : ""}`}
                key={stream.id}
                id={`pulse-stream-row-${stream.id}`}
                data-open={expanded}
              >
                <button
                  type="button"
                  className="pulse-stream-lane"
                  aria-expanded={expanded}
                  aria-controls={expanded ? `pulse-stream-history-${stream.id}` : undefined}
                  aria-label={`${stream.title}. ${stories.length} archived ${stories.length === 1 ? "story" : "stories"}. ${expanded ? "Close" : "Open"} this stream's news archive.`}
                  onClick={() => setExpandedStreamId(expanded ? null : stream.id)}
                >
                  <span className="pulse-stream-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="pulse-stream-label">
                    <strong>{stream.title}</strong>
                    <small>{stream.description}</small>
                  </span>
                  <span className="pulse-stream-window" aria-hidden="true">
                    {marqueeStories.length ? (
                      <span className="pulse-stream-track" data-direction={index % 2 ? "reverse" : "forward"}>
                        {[0, 1].map((copy) => (
                          <span className="pulse-stream-copy" key={copy}>
                            {marqueeStories.map((alert, storyIndex) => (
                              <span className="pulse-stream-item" key={`${copy}-${alert.source_id}-${storyIndex}`}>
                                <b>{sourceLabel(alert)}</b>
                                <span>{alert.title}</span>
                                <i>{formatPublishedDate(alert.event_time)}</i>
                                <i className="pulse-stream-separator">◆</i>
                              </span>
                            ))}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="pulse-stream-empty-copy">Waiting for the next source-linked update…</span>
                    )}
                  </span>
                  <span className="pulse-stream-count"><strong>{stories.length.toString().padStart(2, "0")}</strong><small>STORIES</small></span>
                  <span className="pulse-stream-action">{expanded ? "CLOSE" : "ARCHIVE"}<ChevronDown size={14} aria-hidden="true" /></span>
                </button>

                {expanded && (
                  <section
                    className="pulse-stream-history"
                    id={`pulse-stream-history-${stream.id}`}
                    aria-label={`${stream.title} historical news`}
                  >
                    <div className="pulse-stream-history-heading">
                      <div>
                        <span className="pulse-stream-kicker">SECTOR ARCHIVE · {stream.title.toUpperCase()}</span>
                        <h3>{stream.title} archive</h3>
                        <p>{stories.length} source-linked {stories.length === 1 ? "story" : "stories"}, newest first.</p>
                      </div>
                      <span className="pulse-stream-history-actions">
                        <span className="pulse-archive-retention"><Activity size={13} aria-hidden="true" /> Publisher snapshot + this browser’s saved history</span>
                        <a className="pulse-archive-source-link" href={stream.sourceUrl} target="_blank" rel="noreferrer">
                          Open sector source <ExternalLink size={11} aria-hidden="true" />
                        </a>
                      </span>
                    </div>

                    {stories.length ? (
                      <div className="pulse-stream-story-list">
                        {stories.map((alert, storyIndex) => {
                          const sourceUrl = articleSourceUrl(alert);
                          return (
                            <article className="pulse-stream-story" key={`${alert.source_id}-${storyIndex}`}>
                              <div className="pulse-stream-story-meta">
                                <span>{CATEGORY_LABEL[alert.category].toUpperCase()}</span>
                                <time dateTime={alert.event_time}>{formatPublishedDate(alert.event_time)}</time>
                                <b>{sourceLabel(alert)}</b>
                              </div>
                              <h4>
                                {sourceUrl ? (
                                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                                    {alert.title}<ArrowUpRight size={14} aria-hidden="true" />
                                  </a>
                                ) : alert.title}
                              </h4>
                              {alert.summary && <p>{alert.summary}</p>}
                              <div className="pulse-stream-story-footer">
                                <span><MapPin size={12} aria-hidden="true" />{alertLocation(alert)}</span>
                                {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Open original story <ExternalLink size={11} aria-hidden="true" /></a>}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="pulse-stream-history-empty">
                        <Newspaper size={20} aria-hidden="true" />
                        <p>No stories have been saved in this stream yet. Publisher updates will appear here as they’re published.</p>
                        <a href={stream.sourceUrl} target="_blank" rel="noreferrer">Browse this sector’s source <ExternalLink size={12} aria-hidden="true" /></a>
                      </div>
                    )}
                    <p className="pulse-stream-history-note">
                      Archive includes the publisher’s current RSS window and up to 12 months of feed snapshots saved in this browser (up to 600 links). Publisher availability and archive depth vary; each headline links to its original source.
                    </p>
                  </section>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <details className="pulse-supporting-desk">
        <summary className="pulse-supporting-summary">
          <span><small>LIVE DESK TOOLS</small><strong>Agency alerts, local forecast &amp; feed analytics</strong></span>
          <span className="pulse-supporting-toggle">OPEN DETAILS <ChevronDown size={15} aria-hidden="true" /></span>
        </summary>
        <div className="pulse-broadcast-grid">
        <div className="pulse-broadcast-main">
          <section className="pulse-lead-story" aria-label="Rotating statewide stories">
            <div className="pulse-lead-topline">
              <span><span className="pulse-live-dot" /> STATEWIDE HEADLINES</span>
              <span>{featuredStory ? `${String(currentStoryIndex + 1).padStart(2, "0")} / ${String(featuredStoryCount).padStart(2, "0")}` : "— / —"}</span>
            </div>
            {featuredStory ? (
              <div className="pulse-lead-content" key={featuredStory.source_id}>
                <div className="pulse-lead-kicker">
                  <span className={`pulse-lead-severity pulse-lead-severity--${featuredStory.severity}`}>
                    {featuredStory.severity === "critical" && <AlertTriangle size={12} aria-hidden="true" />}
                    {SEVERITY[featuredStory.severity].label.toUpperCase()}
                  </span>
                  <span>{CATEGORY_LABEL[featuredStory.category].toUpperCase()}</span>
                </div>
                <h2>{featuredStory.title}</h2>
                <p>{featuredStory.summary || "Details are available in the original public alert or story."}</p>
                <div className="pulse-lead-meta">
                  <span><MapPin size={13} aria-hidden="true" />{alertLocation(featuredStory)}</span>
                  <span>{sourceLabel(featuredStory)}</span>
                  {clock && <time dateTime={featuredStory.event_time}>{timeAgo(featuredStory.event_time, clock)}</time>}
                </div>
              </div>
            ) : (
              <div className="pulse-lead-empty">
                <Radio size={30} aria-hidden="true" />
                <h2>{loading ? "Tuning in to Wyoming" : "The statewide desk is quiet."}</h2>
                <p>{loading ? "Checking weather, road and newsroom feeds." : "No alerts were returned in the latest refresh."}</p>
              </div>
            )}
            <div className="pulse-lead-controls">
              <div className="pulse-story-progress" aria-label={`${currentStoryIndex + 1} of ${featuredStoryCount} featured stories`}>
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
              <span className="pulse-rotation-status">{featuredStoryCount > 1 ? rotationPaused ? "PAUSED" : reducedMotion ? "MOTION OFF" : "AUTO-ROTATING" : "LIVE FEED"}</span>
              <div className="pulse-story-actions">
                <button type="button" onClick={() => showStory(-1)} disabled={featuredStoryCount < 2} aria-label="Previous story"><ChevronLeft size={16} /></button>
                <button
                  type="button"
                  onClick={() => setRotationPaused((paused) => !paused)}
                  disabled={featuredStoryCount < 2 || reducedMotion}
                  aria-label={reducedMotion ? "Automatic story rotation is off because reduced motion is enabled" : rotationPaused ? "Resume story rotation" : "Pause story rotation"}
                  aria-pressed={rotationPaused}
                >
                  {rotationPaused || reducedMotion ? <Play size={13} /> : <Pause size={13} />}
                </button>
                <button type="button" onClick={() => showStory(1)} disabled={featuredStoryCount < 2} aria-label="Next story"><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>

          <section className="pulse-stat-strip" aria-label="Statewide alert totals">
            <div><span>FEED ITEMS</span><strong>{allAlerts.length.toString().padStart(2, "0")}</strong></div>
            <div><span>PRIORITY</span><strong className="pulse-stat-red">{priorityAlerts.length.toString().padStart(2, "0")}</strong></div>
            <div><span>WEATHER ITEMS</span><strong>{allAlerts.filter((alert) => alert.category === "weather").length.toString().padStart(2, "0")}</strong></div>
            <div><span>ROAD ITEMS</span><strong>{allAlerts.filter((alert) => alert.category === "road_conditions").length.toString().padStart(2, "0")}</strong></div>
            <div className="pulse-stat-caption"><Activity size={14} aria-hidden="true" /><span>Source-linked snapshot across Wyoming</span></div>
          </section>

          <section className="pulse-feed-section" aria-labelledby="pulse-feed-title">
            <div className="pulse-section-heading">
              <div>
                <span className="pulse-section-kicker">THE LIVE DESK</span>
                <h2 id="pulse-feed-title">Latest headlines &amp; alerts</h2>
                <p>Source-linked news, weather alerts, and road reports from across Wyoming.</p>
              </div>
              <span className="pulse-feed-total">{filteredAlerts.length} {filteredAlerts.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="pulse-feed-filters" role="group" aria-label="Filter the latest headlines and alerts">
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
                <AlertRow key={alert.source_id} alert={alert} now={now} />
              ))}
              {!loading && filteredAlerts.length === 0 && (
                <div className="pulse-feed-empty">
                  <CheckCircle2 size={24} aria-hidden="true" />
                  <strong>{allAlerts.length ? "No headlines in this filter." : "No current feed items returned."}</strong>
                  <span>{allAlerts.length ? "Choose another sector to see more updates." : "Try refreshing, or open the original agency feeds."}</span>
                </div>
              )}
            </div>
          </section>

          <section className="pulse-method-note">
            <Shield size={16} aria-hidden="true" />
            <p>
              Wyoming Pulse is an independent aggregation view. Confirm time-sensitive weather and road conditions with the issuing agency; alert boundaries may differ from city limits. News headlines link to their original publishers where available.
            </p>
          </section>
        </div>

        <aside className="pulse-broadcast-rail" aria-label="Local desk and feed analytics">
          <section className="pulse-rail-card pulse-city-card">
            <div className="pulse-card-kicker"><MapPin size={13} aria-hidden="true" /> LOCAL DESK</div>
            <label htmlFor="pulse-city-select">Choose a Wyoming city</label>
            <div className="pulse-city-select-wrap">
              <select id="pulse-city-select" value={city.id} onChange={(event) => selectCity(event.target.value)}>
                {WYOMING_CITIES.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <ChevronRight size={15} aria-hidden="true" />
            </div>
            <div className="pulse-city-meta"><span>{city.county}</span><span>{localAlerts.length} local {localAlerts.length === 1 ? "signal" : "signals"}</span></div>
            <div className="pulse-highway-list">
              {city.highways.slice(0, 4).map((highway) => <span key={highway}>{highway}</span>)}
            </div>
          </section>

          <section className="pulse-rail-card pulse-weather-card" aria-labelledby="pulse-weather-title">
            <div className="pulse-weather-heading">
              <div>
                <div className="pulse-card-kicker"><Thermometer size={13} aria-hidden="true" /> NWS HOURLY OUTLOOK</div>
                <h2 id="pulse-weather-title">{city.name}, Wyoming</h2>
              </div>
              <a href={cityForecastUrl} target="_blank" rel="noreferrer" aria-label={`Open the National Weather Service forecast for ${city.name}`}><ArrowUpRight size={15} /></a>
            </div>
            {forecastLoading ? (
              <div className="pulse-weather-loading" role="status"><span />Loading forecast…</div>
            ) : forecast ? (
              <div className="pulse-weather-content">
                <div className="pulse-weather-main">
                  <ForecastIcon forecast={forecast.shortForecast} />
                  <div><strong>{forecast.temperature}°{forecast.temperatureUnit}</strong><span>{forecast.name}</span></div>
                </div>
                <p className="pulse-weather-summary">{forecast.shortForecast}</p>
                <div className="pulse-weather-facts">
                  <span><Wind size={13} aria-hidden="true" />{forecast.windSpeed}</span>
                  {forecast.relativeHumidity !== undefined && <span><Gauge size={13} aria-hidden="true" />{forecast.relativeHumidity}% humidity</span>}
                </div>
              </div>
            ) : (
              <div className="pulse-weather-unavailable">
                <Cloud size={25} aria-hidden="true" />
                <span>{forecastUnavailable ? "Forecast unavailable" : "Waiting for NWS forecast"}</span>
                <small>Open the official forecast for current conditions.</small>
              </div>
            )}
            <div className={`pulse-weather-alert-count ${localWeatherAlerts.length || nwsUnavailable ? "has-alerts" : ""}`}>
              {localWeatherAlerts.length || nwsUnavailable ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              <span>{loading
                ? "Checking current NWS weather alerts…"
                : nwsUnavailable
                  ? localWeatherAlerts.length
                    ? `${localWeatherAlerts.length} alert${localWeatherAlerts.length === 1 ? "" : "s"} in the last NWS snapshot; live check unavailable`
                    : "NWS alert check unavailable — use the official forecast link"
                  : localWeatherAlerts.length
                    ? `${localWeatherAlerts.length} active NWS weather ${localWeatherAlerts.length === 1 ? "alert" : "alerts"} near ${city.name}`
                    : `No active NWS weather alerts listed near ${city.name}`}</span>
            </div>
            <div className="pulse-zone-note">NWS ZONE{city.nwsZones.length > 1 ? "S" : ""}: {city.nwsZones.map((zone) => `${zone.id} · ${zone.name}`).join("  /  ")}</div>
          </section>

          <section className="pulse-rail-card pulse-local-card">
            <div className="pulse-section-heading pulse-local-heading">
              <div><span className="pulse-section-kicker">NEAR {city.name.toUpperCase()}</span><h2>Local dispatch</h2></div>
              <span className="pulse-local-count">{localAlerts.length.toString().padStart(2, "0")}</span>
            </div>
            {localAlerts.length ? (
              <div className="pulse-local-list">
                {localAlerts.slice(0, 4).map((alert) => (
                  <article key={alert.source_id}>
                    <span className={`pulse-local-marker pulse-local-marker--${alert.severity}`} />
                    <div><strong>{alert.title}</strong><span>{sourceLabel(alert)} · {clock ? timeAgo(alert.event_time, clock) : "—"}</span></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="pulse-local-empty">
                <CheckCircle2 size={19} aria-hidden="true" />
                <p>{loading ? "Checking the local desk…" : `No current signals matched ${city.name} or ${city.county}.`}</p>
              </div>
            )}
          </section>

          <section className="pulse-rail-card pulse-velocity-card" aria-labelledby="pulse-velocity-title">
            <div className="pulse-velocity-heading">
              <div><span className="pulse-section-kicker">FEED TEMPO</span><h2 id="pulse-velocity-title">Alert velocity</h2></div>
              <Activity size={17} aria-hidden="true" />
            </div>
            <p>Signals grouped by age of the source event.</p>
            <div className="pulse-velocity-chart" role="img" aria-label={ageBuckets.map((bucket) => `${bucket.label}: ${bucket.count} alerts`).join(", ")}>
              {ageBuckets.map((bucket) => (
                <div className="pulse-velocity-column" key={bucket.label}>
                  <strong>{bucket.count}</strong>
                  <div className="pulse-velocity-track"><span style={{ height: `${bucket.count ? Math.max(9, bucket.count / maxAgeBucket * 100) : 0}%` }} /></div>
                  <span>{bucket.label}</span>
                </div>
              ))}
            </div>
            <div className="pulse-velocity-footnote"><Gauge size={13} aria-hidden="true" /> {allAlerts.length} timestamped {allAlerts.length === 1 ? "signal" : "signals"} in current feed</div>
          </section>

          <section className="pulse-rail-card pulse-source-card">
            <div className="pulse-card-kicker"><Activity size={13} aria-hidden="true" /> FEED SOURCES</div>
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--weather"><Cloud size={14} /></span><span><strong>National Weather Service</strong><small>Alerts & hourly forecast</small></span><b>{result.counts.nws ?? 0}</b></div>
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--roads"><Route size={14} /></span><span><strong>WYDOT</strong><small>Road conditions & closures</small></span><b>{result.counts.wydot ?? 0}</b></div>
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--news"><Newspaper size={14} /></span><span><strong>Wyoming newsrooms</strong><small>{pulseSources.feeds.length} publisher RSS feeds · latest snapshot</small></span><b>{result.counts.rss ?? 0}</b></div>
            <div className="pulse-source-foot"><span className={isSeedSnapshot ? "pulse-source-indicator demo" : "pulse-source-indicator"} />
              {isSeedSnapshot ? `Dated source snapshot · ${snapshotDateLabel}` : `Publisher snapshot ${snapshotDateLabel} · checked ${updatedLabel} ${mountainZoneLabel}`}
            </div>
          </section>

          <a className="pulse-wydot-link" href="https://wyoroad.info/" target="_blank" rel="noreferrer">
            <Route size={15} aria-hidden="true" /> WYDOT road conditions <ExternalLink size={12} aria-hidden="true" />
          </a>
        </aside>
        </div>
      </details>

      <footer className="pulse-broadcast-footer">
        <span><Radio size={13} aria-hidden="true" /> WYOMING PULSE · PUBLIC INFORMATION MONITOR</span>
        <span>Agency alerts refresh every minute · newsroom feeds refresh with the published site snapshot (hourly) <i /> Mountain Time</span>
      </footer>
    </section>
  );
}
