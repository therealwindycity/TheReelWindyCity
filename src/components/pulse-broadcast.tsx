"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  ExternalLink,
  Flame,
  Gauge,
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
  community: "Community",
  breaking: "Breaking news",
};

const EMPTY_ALERTS: PulseAlert[] = [];

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
  const sourceUrl = alert.source === "nws" && /^https?:\/\//i.test(alert.source_id)
    ? alert.source_id
    : alert.source === "wydot"
      ? "https://wyoroad.info/"
      : alert.source.startsWith("rss-") && /^https?:\/\//i.test(alert.source_id)
        ? alert.source_id
        : null;
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
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [selectedCityId, setSelectedCityId] = useState("cheyenne");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"all" | "priority" | AlertCategory>("all");
  const [forecast, setForecast] = useState<HourlyForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastUnavailable, setForecastUnavailable] = useState(false);
  const hasLoadedRef = useRef(false);

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

  const allAlerts = result?.alerts ?? EMPTY_ALERTS;
  const isDemo = result?.errors.some((error) => /demo data loaded/i.test(error)) ?? false;
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
    (alert) => alert.category === "weather" || alert.category === "fire",
  );
  const priorityAlerts = allAlerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "urgent",
  );
  const tickerAlerts = priorityAlerts.length ? priorityAlerts.slice(0, 8) : allAlerts.slice(0, 6);
  const filteredAlerts = allAlerts.filter((alert) => {
    if (feedFilter === "all") return true;
    if (feedFilter === "priority") return alert.severity === "critical" || alert.severity === "urgent";
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

  const feedFilters: { id: "all" | "priority" | AlertCategory; label: string }[] = [
    { id: "all", label: "All signals" },
    { id: "priority", label: "Priority" },
    { id: "weather", label: "Weather" },
    { id: "road_conditions", label: "Roads" },
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
          <span>Weather · Roads · Government · Community</span>
        </div>
        <div className="pulse-masthead-clock" aria-label={`Current Wyoming time ${mountainTime} ${mountainZoneLabel}`}>
          <span>CHEYENNE LOCAL TIME</span>
          <strong>{mountainTime} <small>{mountainZoneLabel}</small></strong>
          <time>{mountainDate}</time>
        </div>
      </header>

      <div className={`pulse-status-rail ${isDemo ? "pulse-status-rail--demo" : ""}`}>
        <span className="pulse-on-air"><span />{isDemo ? "DEMO FEED" : loading ? "CONNECTING" : "ON AIR"}</span>
        <span className="pulse-status-copy">MONITORING <strong>WYOMING</strong></span>
        <span className="pulse-status-updated">UPDATED {updatedLabel} {mountainZoneLabel}</span>
        <button className="pulse-refresh" type="button" onClick={() => void refresh()} disabled={loading || refreshing}>
          <RefreshCw size={13} className={refreshing ? "spin" : ""} aria-hidden="true" />
          {refreshing ? "Updating" : "Refresh feed"}
        </button>
        <span className="pulse-status-sources">NWS <i /> WYDOT <i /> NEWSROOMS</span>
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
            <div><span>ACTIVE SIGNALS</span><strong>{loading && !result ? "—" : allAlerts.length.toString().padStart(2, "0")}</strong></div>
            <div><span>PRIORITY</span><strong className="pulse-stat-red">{loading && !result ? "—" : priorityAlerts.length.toString().padStart(2, "0")}</strong></div>
            <div><span>WEATHER</span><strong>{loading && !result ? "—" : allAlerts.filter((alert) => alert.category === "weather").length.toString().padStart(2, "0")}</strong></div>
            <div><span>ROAD EVENTS</span><strong>{loading && !result ? "—" : allAlerts.filter((alert) => alert.category === "road_conditions").length.toString().padStart(2, "0")}</strong></div>
            <div className="pulse-stat-caption"><Activity size={14} aria-hidden="true" /><span>Feed totals across Wyoming</span></div>
          </section>

          <section className="pulse-feed-section" aria-labelledby="pulse-feed-title">
            <div className="pulse-section-heading">
              <div>
                <span className="pulse-section-kicker">THE LIVE DESK</span>
                <h2 id="pulse-feed-title">Latest signals</h2>
                <p>Source-linked updates from across the state.</p>
              </div>
              <span className="pulse-feed-total">{filteredAlerts.length} {filteredAlerts.length === 1 ? "item" : "items"}</span>
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
                <AlertRow key={alert.source_id} alert={alert} now={now} />
              ))}
              {!loading && filteredAlerts.length === 0 && (
                <div className="pulse-feed-empty">
                  <CheckCircle2 size={24} aria-hidden="true" />
                  <strong>{allAlerts.length ? "No signals in this filter." : "No active alerts returned."}</strong>
                  <span>{allAlerts.length ? "Choose another feed filter to see more updates." : "Try refreshing, or check the original agency feeds."}</span>
                </div>
              )}
              {loading && !result && (
                <div className="pulse-feed-loading" role="status"><span /><span /><span />Checking statewide feeds…</div>
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
            <div className={`pulse-weather-alert-count ${localWeatherAlerts.length ? "has-alerts" : ""}`}>
              {localWeatherAlerts.length ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              <span>{localWeatherAlerts.length ? `${localWeatherAlerts.length} active weather ${localWeatherAlerts.length === 1 ? "alert" : "alerts"} in the local feed` : "No weather alerts in the local feed"}</span>
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
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--weather"><Cloud size={14} /></span><span><strong>National Weather Service</strong><small>Alerts & hourly forecast</small></span><b>{result?.counts.nws ?? "—"}</b></div>
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--roads"><Route size={14} /></span><span><strong>WYDOT</strong><small>Road conditions & closures</small></span><b>{result?.counts.wydot ?? "—"}</b></div>
            <div className="pulse-source-row"><span className="pulse-source-icon pulse-source-icon--news"><Newspaper size={14} /></span><span><strong>Wyoming newsrooms</strong><small>Publisher RSS feeds</small></span><b>{result?.counts.rss ?? "—"}</b></div>
            <div className="pulse-source-foot"><span className={isDemo ? "pulse-source-indicator demo" : "pulse-source-indicator"} />
              {isDemo ? "Sample feed shown · live requests returned no alerts" : `Last checked ${updatedLabel} ${mountainZoneLabel}`}
            </div>
          </section>

          <a className="pulse-wydot-link" href="https://wyoroad.info/" target="_blank" rel="noreferrer">
            <Route size={15} aria-hidden="true" /> WYDOT road conditions <ExternalLink size={12} aria-hidden="true" />
          </a>
        </aside>
      </div>

      <footer className="pulse-broadcast-footer">
        <span><Radio size={13} aria-hidden="true" /> WYOMING PULSE · PUBLIC INFORMATION MONITOR</span>
        <span>Auto-refreshes every 60 seconds <i /> Times shown in Mountain Time</span>
      </footer>
    </section>
  );
}
