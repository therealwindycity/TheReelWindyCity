import raw from "@/data/citizen-connect.json";

/**
 * Cheyenne / Laramie County "Citizen Connect" record lens.
 *
 * The publisher's dashboard shows pins on a map and a date filter. That answers
 * "what happened near me", but it is a poor way to understand ~445k records of
 * dispatch history. This module turns the synced artifact into a small set of
 * honest, comparative readings — every one of them normalised against something,
 * because raw counts on their own mostly measure how many hours a window has.
 *
 * Nothing here invents data: if a series is absent from the artifact the
 * corresponding view reports itself unavailable (see `availability`) and the UI
 * says so instead of rendering an empty chart that looks like a zero.
 */

export type RhythmCell = [total: number, incidents: number, cases: number];

export interface ShapeCount { id: string; name: string; count?: number }
export interface ShapeGroup {
  id: string;
  name: string;
  color?: string | null;
  complete?: boolean;
  expectedShapes?: number;
  unassigned?: number | null;
  stale?: boolean;
  coverage?: { start: string; end: string; days: number; source?: string } | null;
  shapes: ShapeCount[];
}
export interface CategoryCount {
  layer: string;
  agency: string;
  type: string;
  count: number;
  share: number;
}
export interface TrendPoint {
  label: string;
  total: number;
  incidents: number;
  cases: number;
  days?: number;
  perDay?: number;
}
export interface SampleRecord {
  id: string;
  at: string;
  agency: string;
  layer: string;
  type: string;
  lat: number;
  lng: number;
}

export interface CitizenConnectArtifact {
  schema: number;
  generatedBy: string;
  capturedAt: string;
  captureNote?: string;
  source: {
    name: string;
    publisher: string;
    platform: string;
    appUrl: string;
    apiBase?: string;
    dashboardUrl?: string;
    agencyInfoUrl?: string;
    attributionNote?: string;
    refreshCadence?: string;
    timezone?: string;
  };
  coverage: {
    requestedStart: string;
    requestedEnd: string;
    days: number;
    weekdayOccurrences?: Record<string, number>;
    substantiveStart?: string;
    note?: string;
  };
  recordCoverage?: { start: string; end: string; days: number; source?: string } | null;
  layers: { id: string; label: string; datasetId?: string; taxonomySize?: number; description?: string }[];
  agencies: { name: string; ori: string }[];
  totals: { all: number; incidents: number; cases: number };
  rhythm: {
    dowOrder: string[];
    cells: Record<string, RhythmCell[]>;
    hour?: { hour: number; total: number; incidents: number; cases: number }[];
    dowTotals?: Record<string, { total: number; incidents: number; cases: number; occurrences: number | null; perOccurrence: number | null }>;
  };
  trend?: { granularity: string | null; daily?: TrendPoint[]; monthly?: TrendPoint[]; yearly?: TrendPoint[] };
  categories?: {
    counts?: CategoryCount[];
    tree?: unknown[];
    agencies?: { name: string; count: number; share: number }[];
    coverage?: { start: string; end: string; days: number; source?: string } | null;
  };
  geography?: {
    groups: ShapeGroup[];
    coverage?: { start: string; end: string; days: number; source?: string } | null;
  };
  dataQuality?: {
    unmappable?: { window: string; count: number; label: string };
    unmappableByWindow?: { window: string; year?: string; count: number; label: string }[];
    locationPrecisionDegrees?: number;
  };
  sample?: SampleRecord[];
  sampleDescription?: string;
  filters?: { categorySelection?: string; includeRestrictedPlaces?: boolean; shapeGroup?: string };
  completeness?: Record<string, boolean>;
}

export const CITIZEN_CONNECT = raw as unknown as CitizenConnectArtifact;

export const DOW_LONG: Record<string, string> = {
  Su: "Sunday", Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function nf(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
export function signed(n: number, digits = 1): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

export interface ScaleSummary {
  total: number;
  incidents: number;
  cases: number;
  days: number;
  perDay: number;
  perHour: number;
  secondsPerRecord: number;
  caseShare: number;
  incidentShare: number;
  perWeekday: number;
  perWeekendDay: number;
  weekdayWeekendRatio: number;
}

export function scale(a: CitizenConnectArtifact = CITIZEN_CONNECT): ScaleSummary {
  const { all, incidents, cases } = a.totals;
  const days = a.coverage.days || 1;
  const perDay = all / days;
  const dow = weekdayProfile(a);
  const weekdays = ["Mo", "Tu", "We", "Th", "Fr"].map((d) => dow.find((x) => x.dow === d)?.perOccurrence ?? 0);
  const weekend = ["Sa", "Su"].map((d) => dow.find((x) => x.dow === d)?.perOccurrence ?? 0);
  const perWeekday = weekdays.reduce((s, n) => s + n, 0) / (weekdays.length || 1);
  const perWeekendDay = weekend.reduce((s, n) => s + n, 0) / (weekend.length || 1);
  return {
    total: all,
    incidents,
    cases,
    days,
    perDay,
    perHour: all / (days * 24),
    secondsPerRecord: (days * 86400) / (all || 1),
    caseShare: (cases / (all || 1)) * 100,
    incidentShare: (incidents / (all || 1)) * 100,
    perWeekday,
    perWeekendDay,
    weekdayWeekendRatio: perWeekendDay ? perWeekday / perWeekendDay : 0,
  };
}

// ---------------------------------------------------------------------------
// Hour of day — always compared against clock share, never left as a raw count
// ---------------------------------------------------------------------------

export interface HourPoint {
  hour: number;
  label: string;
  total: number;
  incidents: number;
  cases: number;
  share: number;
  /** share of records ÷ share of the clock (1/24). >1 means over-represented. */
  lift: number;
  caseIntensity: number;
}

export function hourProfile(a: CitizenConnectArtifact = CITIZEN_CONNECT): HourPoint[] {
  const order = a.rhythm.dowOrder;
  const total = a.totals.all || 1;
  return Array.from({ length: 24 }, (_, h) => {
    let t = 0, i = 0, c = 0;
    for (const d of order) { const cell = a.rhythm.cells[d]?.[h]; if (cell) { t += cell[0]; i += cell[1]; c += cell[2]; } }
    const share = (t / total) * 100;
    return {
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      total: t,
      incidents: i,
      cases: c,
      share,
      lift: share / (100 / 24),
      caseIntensity: t ? (c / t) * 100 : 0,
    };
  });
}

export interface DayPart { id: string; label: string; hours: number; startHour: number; total: number; incidents: number; cases: number; share: number; lift: number }

/** Four dayparts that tile the clock exactly, so their lifts are comparable. */
export const DAY_PARTS: { id: string; label: string; startHour: number; hours: number }[] = [
  { id: "overnight", label: "Overnight", startHour: 22, hours: 8 },
  { id: "morning", label: "Morning", startHour: 6, hours: 6 },
  { id: "afternoon", label: "Afternoon", startHour: 12, hours: 5 },
  { id: "evening", label: "Evening", startHour: 17, hours: 5 },
];

export function dayParts(a: CitizenConnectArtifact = CITIZEN_CONNECT): DayPart[] {
  const hours = hourProfile(a);
  const total = a.totals.all || 1;
  return DAY_PARTS.map((p) => {
    let t = 0, i = 0, c = 0;
    for (let k = 0; k < p.hours; k++) {
      const h = hours[(p.startHour + k) % 24];
      t += h.total; i += h.incidents; c += h.cases;
    }
    const share = (t / total) * 100;
    const clockShare = (p.hours / 24) * 100;
    return { ...p, total: t, incidents: i, cases: c, share, lift: share / clockShare };
  });
}

export interface RollingBlock { startHour: number; label: string; total: number; lift: number }

/** Busiest / quietest contiguous windows — the shape of the day, not one spike. */
export function rollingBlocks(a: CitizenConnectArtifact = CITIZEN_CONNECT, size = 4): RollingBlock[] {
  const hours = hourProfile(a);
  const total = a.totals.all || 1;
  const out: RollingBlock[] = [];
  for (let s = 0; s < 24; s++) {
    let t = 0;
    for (let k = 0; k < size; k++) t += hours[(s + k) % 24].total;
    out.push({
      startHour: s,
      label: `${String(s).padStart(2, "0")}:00–${String((s + size) % 24).padStart(2, "0")}:00`,
      total: t,
      lift: (t / total) / (size / 24),
    });
  }
  return out;
}

export function extremes(a: CitizenConnectArtifact = CITIZEN_CONNECT) {
  const hours = hourProfile(a);
  const sorted = [...hours].sort((x, y) => y.total - x.total);
  const blocks = rollingBlocks(a, 4);
  const blockSorted = [...blocks].sort((x, y) => y.total - x.total);
  return {
    peakHour: sorted[0],
    troughHour: sorted[sorted.length - 1],
    hourRatio: sorted[sorted.length - 1].total ? sorted[0].total / sorted[sorted.length - 1].total : 0,
    peakBlock: blockSorted[0],
    troughBlock: blockSorted[blockSorted.length - 1],
    blockRatio: blockSorted[blockSorted.length - 1].total ? blockSorted[0].total / blockSorted[blockSorted.length - 1].total : 0,
  };
}

// ---------------------------------------------------------------------------
// Day of week — normalised per occurrence, because the window is not whole weeks
// ---------------------------------------------------------------------------

export interface WeekdayPoint { dow: string; label: string; total: number; incidents: number; cases: number; occurrences: number | null; perOccurrence: number; index: number; caseIntensity: number }

export function weekdayProfile(a: CitizenConnectArtifact = CITIZEN_CONNECT): WeekdayPoint[] {
  const meanPerDay = a.totals.all / (a.coverage.days || 1);
  return a.rhythm.dowOrder.map((dow) => {
    const cells = a.rhythm.cells[dow] ?? [];
    const total = cells.reduce((s, c) => s + c[0], 0);
    const incidents = cells.reduce((s, c) => s + c[1], 0);
    const cases = cells.reduce((s, c) => s + c[2], 0);
    const occurrences = a.coverage.weekdayOccurrences?.[dow] ?? a.rhythm.dowTotals?.[dow]?.occurrences ?? null;
    const perOccurrence = occurrences ? total / occurrences : total;
    return {
      dow,
      label: DOW_LONG[dow] ?? dow,
      total,
      incidents,
      cases,
      occurrences,
      perOccurrence,
      index: meanPerDay ? (perOccurrence / meanPerDay) * 100 : 0,
      caseIntensity: total ? (cases / total) * 100 : 0,
    };
  });
}

/** The 7 x 24 heat grid, scaled 0..1 against the busiest single cell. */
export function heatGrid(a: CitizenConnectArtifact = CITIZEN_CONNECT) {
  const order = a.rhythm.dowOrder;
  let max = 0;
  for (const d of order) for (const c of a.rhythm.cells[d] ?? []) max = Math.max(max, c[0]);
  return {
    dowOrder: order,
    max,
    rows: order.map((d) => ({
      dow: d,
      label: DOW_LONG[d] ?? d,
      cells: (a.rhythm.cells[d] ?? []).map((c, h) => ({
        hour: h,
        total: c[0],
        incidents: c[1],
        cases: c[2],
        intensity: max ? c[0] / max : 0,
        caseIntensity: c[0] ? c[2] / c[0] : 0,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Trend — per-day rates, so a partial year never looks like a collapse
// ---------------------------------------------------------------------------

export interface YearPoint extends TrendPoint { perDay: number; changePerDay: number | null; isPartial: boolean; isPreLaunch: boolean }

function daysInYear(year: number): number {
  return new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime() > 365 * 86400000 ? 366 : 365;
}

export function yearlyTrend(a: CitizenConnectArtifact = CITIZEN_CONNECT): YearPoint[] {
  const series = a.trend?.yearly ?? [];
  const substantiveYear = Number(a.coverage.substantiveStart?.slice(0, 4) ?? a.coverage.requestedStart.slice(0, 4));
  const points = series.map((s) => {
    const days = s.days ?? 0;
    const year = Number(s.label);
    return {
      ...s,
      perDay: s.perDay ?? (days ? s.total / days : 0),
      changePerDay: null as number | null,
      isPartial: Number.isFinite(year) ? days < daysInYear(year) : true,
      isPreLaunch: Number.isFinite(year) && year < substantiveYear,
    };
  });
  return points.map((point, i) => {
    const prev = points[i - 1];
    const consecutive = prev && Number(point.label) === Number(prev.label) + 1;
    const comparable = !point.isPartial && !point.isPreLaunch && prev && !prev.isPartial && !prev.isPreLaunch && consecutive && prev.perDay > 0;
    return { ...point, changePerDay: comparable ? ((point.perDay - prev.perDay) / prev.perDay) * 100 : null };
  });
}

export interface MonthSeasonPoint { month: number; label: string; perDay: number; index: number; years: number }

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month-of-year averaged across every year in the window, indexed to the mean. */
export function seasonality(a: CitizenConnectArtifact = CITIZEN_CONNECT): MonthSeasonPoint[] {
  const months = a.trend?.monthly ?? [];
  const substantiveStart = a.coverage.substantiveStart ?? a.coverage.requestedStart;
  const buckets = new Map<number, { total: number; days: number; years: number }>();
  for (const m of months) {
    const mm = Number(m.label.slice(5, 7));
    const days = m.days ?? 30;
    // Skip stub months at either range edge and the publisher's pre-launch era.
    if (days < 25 || m.label < substantiveStart.slice(0, 7)) continue;
    const b = buckets.get(mm) ?? { total: 0, days: 0, years: 0 };
    b.total += m.total; b.days += days; b.years += 1;
    buckets.set(mm, b);
  }
  const points = [...buckets.entries()].map(([month, b]) => ({ month, perDay: b.days ? b.total / b.days : 0, years: b.years }));
  const mean = points.length ? points.reduce((s, p) => s + p.perDay, 0) / points.length : 0;
  return Array.from({ length: 12 }, (_, i) => {
    const p = points.find((x) => x.month === i + 1);
    return {
      month: i + 1,
      label: MONTH_LABELS[i],
      perDay: p?.perDay ?? 0,
      index: p && mean ? (p.perDay / mean) * 100 : 0,
      years: p?.years ?? 0,
    };
  });
}

export function trendSummary(a: CitizenConnectArtifact = CITIZEN_CONNECT) {
  const substantiveStart = a.coverage.substantiveStart ?? a.coverage.requestedStart;
  const years = yearlyTrend(a).filter((y) => !y.isPartial && !y.isPreLaunch && (y.days ?? 0) >= 360);
  const months = (a.trend?.monthly ?? []).filter((m) => (m.days ?? 0) >= 27 && m.label >= substantiveStart.slice(0, 7));
  if (!years.length && !months.length) return null;
  const first = years[0];
  const last = years[years.length - 1];
  const byVolume = [...months].sort((x, y) => (y.perDay ?? 0) - (x.perDay ?? 0));
  return {
    fullYears: years,
    firstYear: first ?? null,
    lastYear: last ?? null,
    changePerDay: first && last && first.perDay ? ((last.perDay - first.perDay) / first.perDay) * 100 : null,
    busiestMonth: byVolume[0] ?? null,
    quietestMonth: byVolume[byVolume.length - 1] ?? null,
    monthRatio: byVolume.length > 1 && (byVolume[byVolume.length - 1].perDay ?? 0)
      ? (byVolume[0].perDay ?? 0) / byVolume[byVolume.length - 1].perDay!
      : 0,
    latestMonths: months.slice(-13),
  };
}

// ---------------------------------------------------------------------------
// Category mix — how concentrated is demand, really?
// ---------------------------------------------------------------------------

export interface CategoryView {
  counts: CategoryCount[];
  total: number;
  coverage: { start: string; end: string; days: number; source?: string } | null;
  top: CategoryCount[];
  topShare: number;
  /** How many distinct call types account for half of everything. */
  halfOfDemand: number;
  distinct: number;
  byLayer: { layer: string; count: number; share: number }[];
  byAgency: { name: string; count: number; share: number }[];
}

export function categoryView(a: CitizenConnectArtifact = CITIZEN_CONNECT, limit = 24): CategoryView | null {
  const counts = a.categories?.counts ?? [];
  if (!counts.length) return null;
  const total = counts.reduce((s, c) => s + c.count, 0) || 1;
  const sorted = [...counts].sort((x, y) => y.count - x.count);
  let cum = 0, halfOfDemand = sorted.length;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i].count;
    if (cum >= total / 2) { halfOfDemand = i + 1; break; }
  }
  const top = sorted.slice(0, limit);
  const groupBy = (key: (c: CategoryCount) => string) => {
    const m = new Map<string, number>();
    for (const c of sorted) m.set(key(c), (m.get(key(c)) ?? 0) + c.count);
    return [...m.entries()].map(([name, count]) => ({ name, count, share: (count / total) * 100 })).sort((x, y) => y.count - x.count);
  };
  return {
    counts: sorted,
    total,
    coverage: a.categories?.coverage ?? a.recordCoverage ?? null,
    top,
    topShare: (top.reduce((s, c) => s + c.count, 0) / total) * 100,
    halfOfDemand,
    distinct: sorted.length,
    byLayer: groupBy((c) => c.layer).map((g) => ({ layer: g.name, count: g.count, share: g.share })),
    byAgency: groupBy((c) => c.agency),
  };
}

// ---------------------------------------------------------------------------
// Geography — counts, with the rate caveat stated rather than implied
// ---------------------------------------------------------------------------

export interface GeographyPoint { id: string; name: string; count: number; share: number; index: number }
export interface GeographyView {
  id: string;
  name: string;
  color?: string | null;
  total: number;
  points: GeographyPoint[];
  unassigned?: number | null;
  complete?: boolean;
  stale?: boolean;
  coverage?: { start: string; end: string; days: number; source?: string } | null;
}

export function geographyViews(a: CitizenConnectArtifact = CITIZEN_CONNECT): GeographyView[] {
  return (a.geography?.groups ?? [])
    .map((g) => {
      const withCounts = g.shapes.filter((s) => typeof s.count === "number");
      const total = withCounts.reduce((s, x) => s + (x.count ?? 0), 0);
      const mean = withCounts.length ? total / withCounts.length : 0;
      const points: GeographyPoint[] = withCounts
        .map((s) => ({
          id: s.id,
          name: s.name,
          count: s.count ?? 0,
          share: total ? ((s.count ?? 0) / total) * 100 : 0,
          index: mean ? ((s.count ?? 0) / mean) * 100 : 0,
        }))
        .sort((x, y) => y.count - x.count);
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        total,
        points,
        unassigned: g.unassigned,
        complete: g.complete,
        stale: g.stale,
        coverage: g.coverage ?? a.geography?.coverage ?? null,
      };
    })
    .filter((g) => g.points.length > 0);
}

// ---------------------------------------------------------------------------
// Availability + the interpretation caveats that must travel with the numbers
// ---------------------------------------------------------------------------

export function availability(a: CitizenConnectArtifact = CITIZEN_CONNECT) {
  const c = a.completeness ?? {};
  return {
    totals: Boolean(c.totals) && a.totals.all > 0,
    rhythm: Boolean(c.rhythm) && Boolean(a.rhythm.cells?.[a.rhythm.dowOrder[0]]?.length),
    trend: Boolean(c.trend) && Boolean((a.trend?.yearly ?? []).length),
    categories: Boolean(c.categoryCounts) && Boolean((a.categories?.counts ?? []).length),
    geography: Boolean(c.geographyCounts) && geographyViews(a).length > 0,
    sample: Boolean(c.sample) && (a.sample?.length ?? 0) > 0,
  };
}

export function caveats(a: CitizenConnectArtifact = CITIZEN_CONNECT): { title: string; body: string }[] {
  const precision = a.dataQuality?.locationPrecisionDegrees ?? 0.005;
  const metresLat = Math.round(precision * 111_320);
  const metresLng = Math.round(precision * 111_320 * Math.cos((41.14 * Math.PI) / 180));
  const unmappable = [...(a.dataQuality?.unmappableByWindow ?? [])].reverse().find((x) => x.count > 0) ?? a.dataQuality?.unmappable;
  return [
    {
      title: "A dispatch record is not a crime finding",
      body: "The Incidents layer is computer-aided-dispatch activity: calls for service and officer/deputy-initiated events. It can include welfare checks, alarms, traffic hazards, security checks and administrative work; it is not a police report, an arrest, or proof that a crime occurred.",
    },
    {
      title: "Cases and incidents are not a conversion funnel",
      body: "The dashboard publishes Incidents and Cases as separate datasets with different date fields. The public data does not link a specific call to a specific case, so the Cases share is not the percent of calls that became reports. In this selected window, Cases are a distinct layer comprising a share of the combined rows only.",
    },
    {
      title: "The publisher withholds whole categories",
      body: "The agencies state that sexual assaults and juvenile matters are not shown, and that names and street addresses are removed. Absence of a category here is a publishing decision, not evidence that it did not happen.",
    },
    {
      title: `Pins are a neighbourhood, not an address`,
      body: `Coordinates are generalised to a ${precision}° grid — roughly ${metresLat} m north–south by ${metresLng} m east–west at Cheyenne's latitude. A pin cannot identify a block, a building or a person, and clusters should never be read as a specific address.`,
    },
    {
      title: "Counts are not rates",
      body: "Wards, response areas and precincts differ enormously in area and population, and the publisher does not release denominators. A high count can mean more people, more roads, more retail — or a busier unit. Never compare two shapes without a population or area denominator you sourced yourself.",
    },
    {
      title: "Coverage does not start where the date picker does",
      body: a.coverage.note ?? "The dashboard lets you select years with almost no records. Read those as pre-launch, not as quiet.",
    },
    {
      title: "Every third day, not every third minute",
      body: `${a.source.refreshCadence ?? "The publisher refreshes roughly every three days."} Recent days are provisional: a record can be reclassified, moved or added after the fact, so the newest part of any trend is the least reliable part.`,
    },
    ...(unmappable
      ? [{
          title: "Some records cannot be mapped at all",
          body: `${nf(unmappable.count)} records in ${unmappable.window.replace("/", " → ")} matched the filters but carry no usable location, so they appear in totals and in the “Unverified Locations” tab but never on the map. Any map-only reading of this data silently drops them.`,
        }]
      : []),
  ];
}

/** Plain-language readings the panel shows alongside the charts. */
export function interpretations(a: CitizenConnectArtifact = CITIZEN_CONNECT): string[] {
  const s = scale(a);
  const e = extremes(a);
  const parts = dayParts(a);
  const overnight = parts.find((p) => p.id === "overnight");
  const weekday = weekdayProfile(a);
  const busiestDay = [...weekday].sort((x, y) => y.perOccurrence - x.perOccurrence)[0];
  const quietestDay = [...weekday].sort((x, y) => x.perOccurrence - y.perOccurrence)[0];
  const hours = hourProfile(a);
  const casePeak = [...hours].sort((x, y) => y.caseIntensity - x.caseIntensity)[0];
  const caseTrough = [...hours].sort((x, y) => x.caseIntensity - y.caseIntensity)[0];

  const out: string[] = [];
  out.push(
    `Across ${nf(s.days)} days the dashboard holds ${nf(s.total)} records — one every ${s.secondsPerRecord.toFixed(0)} seconds, or ${nf(s.perDay, 0)} a day.`,
  );
  out.push(
    `${pct(s.caseShare)} of the rows in this selected archive sit in the separate Cases dataset. The public records do not link calls to cases, so this is a layer mix — not a rate of calls that became reports.`,
  );
  if (overnight) {
    out.push(
      overnight.lift < 1
        ? `Overnight (22:00–06:00) is ${pct(overnight.share)} of records but ${pct((8 / 24) * 100, 0)} of the clock — ${overnight.lift.toFixed(2)}× the even-share rate. The quiet hours are genuinely quieter, not just longer.`
        : `Overnight (22:00–06:00) runs ${overnight.lift.toFixed(2)}× its share of the clock.`,
    );
  }
  out.push(
    `${e.peakHour.label} is the single busiest hour and ${e.troughHour.label} the quietest — ${e.hourRatio.toFixed(1)}× apart. Widening to four-hour blocks, ${e.peakBlock.label} carries ${e.blockRatio.toFixed(1)}× the volume of ${e.troughBlock.label}.`,
  );
  if (busiestDay && quietestDay) {
    out.push(
      `${busiestDay.label} averages ${nf(busiestDay.perOccurrence, 0)} records per occurrence against ${quietestDay.label}'s ${nf(quietestDay.perOccurrence, 0)}. The five weekdays average ${s.weekdayWeekendRatio.toFixed(2)}× a weekend day; that describes when this dataset is busier, not why.`,
    );
  }
  if (casePeak && caseTrough && casePeak.hour !== caseTrough.hour) {
    out.push(
      `The Case layer is ${pct(casePeak.caseIntensity)} of ${casePeak.label} records and ${pct(caseTrough.caseIntensity)} of ${caseTrough.label} records. This is an hourly mix between separate datasets, not an hourly case-conversion rate.`,
    );
  }
  const cv = categoryView(a);
  if (cv) {
    out.push(
      `${nf(cv.halfOfDemand)} of ${nf(cv.distinct)} distinct call types account for half of all records; the top ${cv.top.length} cover ${pct(cv.topShare)}. Demand is far more concentrated than the ${nf(cv.distinct)}-item taxonomy suggests.`,
    );
  }
  const geo = geographyViews(a);
  if (geo.length && geo[0].points.length > 1) {
    const g = geo[0];
    const top = g.points[0];
    const bottom = g.points[g.points.length - 1];
    out.push(
      `Within ${g.name}, ${top.name} holds ${pct(top.share)} of records against ${bottom.name}'s ${pct(bottom.share)} — but with no published population or area denominator this is a workload map, not a risk map.`,
    );
  }
  return out;
}
