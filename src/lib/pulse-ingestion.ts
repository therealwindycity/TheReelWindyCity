/**
 * Wyoming Pulse browser refresh pipeline.
 *
 * Publisher RSS is collected at build time into a same-origin JSON snapshot
 * because many newsrooms do not permit cross-origin RSS requests. Official
 * weather and road feeds are also checked directly in the browser when their
 * public APIs allow it. A dated, source-linked seed remains available offline.
 */
import seedData from "@/data/wyoming-pulse-seed.json";

export type AlertSeverity = "critical" | "urgent" | "standard" | "informational";
export type AlertCategory =
  | "weather"
  | "road_conditions"
  | "fire"
  | "crime"
  | "accident"
  | "government"
  | "court"
  | "election"
  | "environment"
  | "health"
  | "sports"
  | "community"
  | "breaking";

export interface PulseAlert {
  source: string;
  source_id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  full_text?: string;
  location: {
    lat?: number;
    lng?: number;
    county?: string;
    city?: string;
    highway?: string;
    mile_marker?: number;
  };
  event_time: string;
  ingested_at: string;
  tags: string[];
}

export type PulseSourceStatus = {
  id: string;
  name: string;
  kind: "agency" | "publisher";
  status: "ok" | "empty" | "clear" | "unavailable";
  count: number;
  url: string;
  error?: string;
};

export interface IngestionResult {
  alerts: PulseAlert[];
  counts: Record<string, number>;
  timestamp: string;
  snapshotCapturedAt: string;
  mode: "published-snapshot" | "curated-seed";
  sourceStatuses: PulseSourceStatus[];
  errors: string[];
}

interface SnapshotDocument {
  mode?: IngestionResult["mode"];
  capturedAt?: string;
  alerts?: PulseAlert[];
  counts?: Record<string, number>;
  sources?: PulseSourceStatus[];
  errors?: string[];
}

const SEED_ALERTS = seedData.alerts as PulseAlert[];
const SEED_SOURCE_STATUSES: PulseSourceStatus[] = [];
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  urgent: 1,
  standard: 2,
  informational: 3,
};

const SEVERITY_MAP: Record<string, AlertSeverity> = {
  Extreme: "critical",
  Severe: "urgent",
  Moderate: "standard",
  Minor: "informational",
};

const EVENT_CATEGORY_MAP: Record<string, AlertCategory> = {
  "Tornado Warning": "weather",
  "Severe Thunderstorm Warning": "weather",
  "Winter Storm Warning": "weather",
  "Winter Storm Watch": "weather",
  "Blizzard Warning": "weather",
  "High Wind Warning": "weather",
  "High Wind Watch": "weather",
  "Fire Weather Watch": "fire",
  "Red Flag Warning": "fire",
  "Flash Flood Warning": "weather",
  "Flood Warning": "weather",
  "Dense Fog Advisory": "road_conditions",
  "Winter Weather Advisory": "weather",
  "Wind Advisory": "weather",
  "Dust Advisory": "road_conditions",
};

function mergeAlerts(alerts: PulseAlert[]): PulseAlert[] {
  const unique = new Map<string, PulseAlert>();
  for (const alert of alerts) {
    if (!alert || typeof alert.title !== "string" || typeof alert.source_id !== "string") continue;
    const previous = unique.get(alert.source_id);
    if (!previous || new Date(alert.ingested_at).getTime() >= new Date(previous.ingested_at).getTime()) {
      unique.set(alert.source_id, alert);
    }
  }
  return [...unique.values()].sort((a, b) => {
    const severityDifference = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDifference !== 0) return severityDifference;
    return new Date(b.event_time).getTime() - new Date(a.event_time).getTime();
  });
}

function countAlerts(alerts: PulseAlert[]) {
  return {
    total: alerts.length,
    nws: alerts.filter((alert) => alert.source === "nws").length,
    wydot: alerts.filter((alert) => alert.source === "wydot").length,
    rss: alerts.filter((alert) => alert.source.startsWith("rss-")).length,
  };
}

async function fetchPublisherSnapshot(): Promise<SnapshotDocument> {
  const snapshotUrl = new URL("data/wyoming-pulse.json", window.location.href);
  const response = await fetch(snapshotUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Publisher snapshot returned HTTP ${response.status}`);
  const snapshot = await response.json() as SnapshotDocument;
  if (!Array.isArray(snapshot.alerts)) throw new Error("Publisher snapshot did not contain an article list");
  return snapshot;
}

async function fetchNWSAlerts(): Promise<PulseAlert[]> {
  const response = await fetch("https://api.weather.gov/alerts/active?area=WY", {
    headers: { Accept: "application/geo+json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`NWS returned HTTP ${response.status}`);
  const data = await response.json() as { features?: Array<{ id?: string; properties?: Record<string, unknown> }> };
  return (data.features ?? []).map((feature) => {
    const properties = feature.properties ?? {};
    const event = String(properties.event ?? "Weather alert");
    return {
      source: "nws",
      source_id: String(feature.id ?? properties.id ?? `${event}:${properties.sent ?? new Date().toISOString()}`),
      severity: SEVERITY_MAP[String(properties.severity ?? "")] ?? "standard",
      category: EVENT_CATEGORY_MAP[event] ?? "weather",
      title: String(properties.headline ?? `${event} — ${properties.areaDesc ?? "Wyoming"}`),
      summary: String(properties.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
      full_text: String(properties.description ?? ""),
      location: { county: String(properties.areaDesc ?? "") },
      event_time: String(properties.onset ?? properties.effective ?? properties.sent ?? new Date().toISOString()),
      ingested_at: new Date().toISOString(),
      tags: [event, properties.urgency, properties.certainty].filter(Boolean).map(String),
    } satisfies PulseAlert;
  });
}

async function fetchWYDOTRoadConditions(): Promise<PulseAlert[]> {
  const response = await fetch("https://www.wyoroad.info/highway/webmap/json/events.json", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`WYDOT returned HTTP ${response.status}`);
  const data = await response.json() as { events?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const events = Array.isArray(data) ? data : data.events ?? [];
  return events.flatMap((event) => {
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
      severity: isClosed ? "urgent" as const : "standard" as const,
      category: /crash|incident/i.test(searchable) ? "accident" as const : "road_conditions" as const,
      title: `${road} ${isClosed ? "CLOSED" : condition || "travel update"}${route ? `: ${route}` : ""}`,
      summary: summary.slice(0, 500),
      location: {
        city: String(event.city ?? ""),
        county: String(event.county ?? ""),
        highway: road,
        lat: Number.isFinite(Number(event.latitude)) ? Number(event.latitude) : undefined,
        lng: Number.isFinite(Number(event.longitude)) ? Number(event.longitude) : undefined,
      },
      event_time: String(event.updated ?? event.created ?? event.lastUpdated ?? new Date().toISOString()),
      ingested_at: new Date().toISOString(),
      tags: ["WYDOT", "road", condition].filter(Boolean),
    } satisfies PulseAlert];
  });
}

function normalizeSourceStatuses(value: unknown): PulseSourceStatus[] {
  if (!Array.isArray(value)) return SEED_SOURCE_STATUSES;
  return value.filter((source): source is PulseSourceStatus => Boolean(
    source && typeof source === "object" &&
    typeof (source as PulseSourceStatus).id === "string" &&
    typeof (source as PulseSourceStatus).name === "string" &&
    typeof (source as PulseSourceStatus).url === "string",
  ));
}

/** Refresh the published RSS snapshot and the public agency feeds concurrently. */
export async function runPulseIngestion(): Promise<IngestionResult> {
  const [snapshotResult, nwsResult, wydotResult] = await Promise.allSettled([
    fetchPublisherSnapshot(),
    fetchNWSAlerts(),
    fetchWYDOTRoadConditions(),
  ]);

  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const snapshotAlerts = snapshot?.alerts ?? SEED_ALERTS;
  const nwsAlerts = nwsResult.status === "fulfilled" ? nwsResult.value : [];
  const wydotAlerts = wydotResult.status === "fulfilled" ? wydotResult.value : [];
  const alerts = mergeAlerts([...snapshotAlerts, ...nwsAlerts, ...wydotAlerts]);
  const errors = [...(snapshot?.errors ?? [])];

  if (snapshotResult.status === "rejected") {
    errors.push("The publisher snapshot could not be refreshed; showing the bundled source-linked headlines.");
  }
  if (nwsResult.status === "rejected") errors.push(`NWS: ${nwsResult.reason instanceof Error ? nwsResult.reason.message : "request failed"}`);
  if (wydotResult.status === "rejected") errors.push(`WYDOT: ${wydotResult.reason instanceof Error ? wydotResult.reason.message : "request failed"}`);

  const sourceStatuses = normalizeSourceStatuses(snapshot?.sources);
  if (nwsResult.status === "fulfilled") {
    const existing = sourceStatuses.find((source) => source.id === "nws");
    if (existing) {
      existing.status = nwsAlerts.length ? "ok" : "clear";
      existing.count = nwsAlerts.length;
      delete existing.error;
    }
  }
  if (wydotResult.status === "fulfilled") {
    const existing = sourceStatuses.find((source) => source.id === "wydot");
    if (existing) {
      existing.status = wydotAlerts.length ? "ok" : "clear";
      existing.count = wydotAlerts.length;
      delete existing.error;
    }
  }

  return {
    alerts,
    counts: countAlerts(alerts),
    timestamp: new Date().toISOString(),
    snapshotCapturedAt: snapshot?.capturedAt ?? seedData.capturedAt,
    mode: snapshot?.mode === "published-snapshot" ? "published-snapshot" : "curated-seed",
    sourceStatuses,
    errors,
  };
}
