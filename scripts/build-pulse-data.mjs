#!/usr/bin/env node
/**
 * Publish a source-attributed Wyoming news snapshot for the static GitHub Pages
 * deployment. Browser-side RSS requests are blocked by many publishers' CORS
 * policies, so the build collects publisher feeds and ships their real headlines
 * as a small JSON asset. A checked-in, dated article snapshot keeps the desk
 * useful when a publisher or the build network is temporarily unavailable.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePublisherFeed } from "./lib/pulse-news.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = path.join(ROOT, "src", "data", "wyoming-pulse-seed.json");
const SOURCES_PATH = path.join(ROOT, "src", "data", "pulse-sources.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "wyoming-pulse.json");
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ALERTS = 500;
const REQUEST_HEADERS = {
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/geo+json, application/json, */*",
  "User-Agent": "WyomingPulse/1.0 (independent public-interest news index; https://therealwindycity.github.io/TheReelWindyCity/)"
};

const [seed, config] = await Promise.all([
  readFile(SEED_PATH, "utf8").then(JSON.parse),
  readFile(SOURCES_PATH, "utf8").then(JSON.parse),
]);
const now = new Date();
const capturedAt = now.toISOString();

async function requestJson(url) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function requestText(url) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function nwsSeverity(value) {
  return ({ Extreme: "critical", Severe: "urgent", Moderate: "standard", Minor: "informational" })[value] ?? "standard";
}

function nwsCategory(event = "") {
  if (/fire weather|red flag/i.test(event)) return "fire";
  if (/fog|dust|ice|travel|winter weather/i.test(event)) return "road_conditions";
  return "weather";
}

async function fetchNwsAlerts() {
  try {
    const data = await requestJson(config.agencies.find((source) => source.id === "nws").url);
    const alerts = (data.features ?? []).map((feature) => {
      const properties = feature.properties ?? {};
      const event = String(properties.event ?? "Weather alert");
      return {
        source: "nws",
        source_id: String(feature.id ?? properties.id ?? `${event}:${properties.sent ?? capturedAt}`),
        severity: nwsSeverity(properties.severity),
        category: nwsCategory(event),
        title: String(properties.headline ?? `${event} — ${properties.areaDesc ?? "Wyoming"}`),
        summary: String(properties.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
        full_text: String(properties.description ?? ""),
        location: { county: String(properties.areaDesc ?? "") },
        event_time: String(properties.onset ?? properties.effective ?? properties.sent ?? capturedAt),
        ingested_at: capturedAt,
        tags: [event, properties.urgency, properties.certainty].filter(Boolean).map(String),
      };
    });
    return { alerts, status: alerts.length ? "ok" : "clear" };
  } catch (error) {
    return { alerts: [], status: "unavailable", error: error.message };
  }
}

async function fetchWydotEvents() {
  try {
    const data = await requestJson(config.agencies.find((source) => source.id === "wydot").url);
    const events = Array.isArray(data) ? data : Array.isArray(data.events) ? data.events : [];
    const alerts = events.flatMap((event) => {
      const condition = String(event.roadCondition ?? event.condition ?? event.eventType ?? event.type ?? "");
      const description = String(event.description ?? event.comments ?? event.remarks ?? "");
      const searchable = `${condition} ${description}`;
      if (!/closed|chain|incident|crash|hazard|construction|restriction|detour|blocked|delay|reduced speed/i.test(searchable)) return [];

      const road = String(event.roadName ?? event.route ?? event.highway ?? "Wyoming road");
      const from = String(event.fromLocation ?? event.from ?? "").trim();
      const to = String(event.toLocation ?? event.to ?? "").trim();
      const isClosed = /closed|blocked/i.test(condition);
      const route = [from, to].filter(Boolean).join(" to ");
      const summary = description || `${road}: ${condition}${route ? ` between ${route}` : ""}.`;
      return [{
        source: "wydot",
        source_id: `wydot-${event.id ?? `${road}-${from}-${to}-${condition}`}`,
        severity: isClosed ? "urgent" : "standard",
        category: /crash|incident/i.test(searchable) ? "accident" : "road_conditions",
        title: `${road} ${isClosed ? "CLOSED" : condition || "travel update"}${route ? `: ${route}` : ""}`,
        summary: summary.slice(0, 500),
        location: {
          city: String(event.city ?? ""),
          county: String(event.county ?? ""),
          highway: road,
          lat: Number.isFinite(Number(event.latitude)) ? Number(event.latitude) : undefined,
          lng: Number.isFinite(Number(event.longitude)) ? Number(event.longitude) : undefined,
        },
        event_time: String(event.updated ?? event.created ?? event.lastUpdated ?? capturedAt),
        ingested_at: capturedAt,
        tags: ["WYDOT", "road", condition].filter(Boolean),
      }];
    });
    return { alerts, status: alerts.length ? "ok" : "clear" };
  } catch (error) {
    return { alerts: [], status: "unavailable", error: error.message };
  }
}

async function fetchPublisher(feed) {
  try {
    const xml = await requestText(feed.url);
    const alerts = parsePublisherFeed(xml, feed, capturedAt);
    return { feed, alerts, status: alerts.length ? "ok" : "empty" };
  } catch (error) {
    return { feed, alerts: [], status: "unavailable", error: error.message };
  }
}

function mergeAlerts(alerts) {
  const unique = new Map();
  for (const alert of alerts) {
    if (!alert?.source_id || !alert?.title) continue;
    const key = String(alert.source_id);
    const previous = unique.get(key);
    if (!previous || new Date(alert.ingested_at).getTime() > new Date(previous.ingested_at).getTime()) {
      unique.set(key, alert);
    }
  }
  return [...unique.values()]
    .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
    .slice(0, MAX_ALERTS);
}

const [nws, wydot, ...publisherResults] = await Promise.all([
  fetchNwsAlerts(),
  fetchWydotEvents(),
  ...config.feeds.map(fetchPublisher),
]);

const successfulPublisherIds = new Set(
  publisherResults
    .filter((result) => result.status === "ok" && result.alerts.length > 0)
    .map((result) => result.feed.id),
);
const retainedSeed = (seed.alerts ?? []).filter((alert) => {
  const seedFeedId = String(alert.source ?? "").replace(/^rss-/, "");
  return !successfulPublisherIds.has(seedFeedId);
});
const alerts = mergeAlerts([
  ...retainedSeed,
  ...nws.alerts,
  ...wydot.alerts,
  ...publisherResults.flatMap((result) => result.alerts),
]);
const sourceStatuses = [
  {
    id: "nws",
    name: "National Weather Service",
    kind: "agency",
    status: nws.status,
    count: nws.alerts.length,
    url: "https://www.weather.gov/riw/",
  },
  {
    id: "wydot",
    name: "WYDOT Travel Information",
    kind: "agency",
    status: wydot.status,
    count: wydot.alerts.length,
    url: "https://wyoroad.info/",
  },
  ...publisherResults.map(({ feed, alerts: feedAlerts, status, error }) => ({
    id: feed.id,
    name: feed.name,
    kind: "publisher",
    status,
    count: feedAlerts.length,
    url: feed.website,
    ...(error ? { error } : {}),
  })),
];
const errors = sourceStatuses
  .filter((source) => source.status === "unavailable")
  .map((source) => `${source.name}: ${source.error ?? "source request failed"}`);
const hasPublisherSnapshot = publisherResults.some((result) => result.status === "ok" || result.status === "empty");
const rssCount = alerts.filter((alert) => alert.source.startsWith("rss-")).length;
const counts = {
  total: alerts.length,
  nws: alerts.filter((alert) => alert.source === "nws").length,
  wydot: alerts.filter((alert) => alert.source === "wydot").length,
  rss: rssCount,
};
const output = {
  mode: hasPublisherSnapshot ? "published-snapshot" : "curated-seed",
  capturedAt: hasPublisherSnapshot ? capturedAt : seed.capturedAt,
  counts,
  sources: sourceStatuses,
  errors,
  alerts,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const okFeeds = sourceStatuses.filter((source) => source.status === "ok").length;
console.log(
  `Wyoming Pulse: wrote ${alerts.length} source-linked items (${okFeeds}/${sourceStatuses.length} sources returned stories; ${output.mode}).`,
);
if (errors.length) console.log(`Unavailable sources: ${errors.join("; ")}`);
