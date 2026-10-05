"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Clock,
  Database,
  Gauge,
  Info,
  Layers,
  MapPin,
  ShieldQuestion,
} from "lucide-react";
import {
  CITIZEN_CONNECT,
  availability,
  categoryView,
  caveats,
  dayParts,
  extremes,
  geographyViews,
  heatGrid,
  hourProfile,
  interpretations,
  nf,
  pct,
  scale,
  seasonality,
  signed,
  trendSummary,
  weekdayProfile,
  yearlyTrend,
} from "@/lib/citizen-connect";

type LensTab = "overview" | "rhythm" | "trend" | "mix" | "where" | "method";

const TABS: { id: LensTab; label: string; icon: typeof Clock }[] = [
  { id: "overview", label: "In plain terms", icon: Info },
  { id: "rhythm", label: "Shape of the week", icon: Clock },
  { id: "trend", label: "Trend", icon: CalendarRange },
  { id: "mix", label: "What gets called", icon: Layers },
  { id: "where", label: "Where", icon: MapPin },
  { id: "method", label: "Method & limits", icon: ShieldQuestion },
];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="irl-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function Pending({ what, detail, command }: { what: string; detail?: string; command?: string }) {
  return (
    <div className="irl-pending">
      <Database size={18} aria-hidden="true" />
      <div>
        <strong>{what} is not in the bundled snapshot yet.</strong>
        <p>
          {detail ??
            "The bundled artifact carries the exact rhythm grid and totals captured from the publisher. This series is produced by the ingest pipeline."}
        </p>
        <code>{command ?? "node scripts/sync/citizen-connect.mjs --mode records --records-start 2023-01-01"}</code>
      </div>
    </div>
  );
}

/** Horizontal bar row used by the mix / where / daypart views. */
function BarRow({
  label,
  value,
  max,
  caption,
  accent,
  index,
  indexLabel,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
  accent?: string;
  index?: number | null;
  indexLabel?: string;
}) {
  const width = max ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="irl-bar-row">
      <span className="irl-bar-label" title={label}>{label}</span>
      <span className="irl-bar-track">
        <span className="irl-bar-fill" style={{ width: `${width}%`, background: accent ?? "#2f6f7f" }} />
      </span>
      <span className="irl-bar-value">{nf(value)}</span>
      {caption ? <span className="irl-bar-caption">{caption}</span> : null}
      {typeof index === "number" ? (
        <span className={`irl-index ${index >= 100 ? "up" : "down"}`}>{index >= 100 ? "▲" : "▼"} {indexLabel ?? nf(index, 0)}</span>
      ) : null}
    </div>
  );
}

function Overview() {
  const s = useMemo(() => scale(), []);
  const lines = useMemo(() => interpretations(), []);
  const e = useMemo(() => extremes(), []);
  const parts = useMemo(() => dayParts(), []);
  const a = CITIZEN_CONNECT;

  return (
    <div className="irl-panel">
      <div className="irl-stat-grid">
        <Stat label="RECORDS IN WINDOW" value={nf(s.total)} sub={`${a.coverage.requestedStart} → ${a.coverage.requestedEnd}`} />
        <Stat label="PER DAY" value={nf(s.perDay, 0)} sub={`${nf(s.perHour, 1)} per hour`} />
        <Stat label="INCIDENTS LAYER" value={pct(s.incidentShare, 1)} sub={`${nf(s.incidents)} dispatch records`} />
        <Stat label="SEPARATE CASES LAYER" value={pct(s.caseShare, 1)} sub={`${nf(s.cases)} case-dataset rows`} />
        <Stat label="PEAK ÷ TROUGH HOUR" value={`${e.hourRatio.toFixed(1)}×`} sub={`${e.peakHour.label} vs ${e.troughHour.label}`} />
        <Stat label="ONE RECORD EVERY" value={`${s.secondsPerRecord.toFixed(0)}s`} sub="averaged over the whole window" />
      </div>

      <div className="irl-reading">
        <h3>What the numbers actually say</h3>
        <p className="irl-reading-note">
          Every figure below is normalised against something — hours in a band, occurrences of a weekday, days in a
          year. Raw counts mostly measure how long a window is.
        </p>
        <ol className="irl-findings">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="irl-dayparts">
        <h3>Dayparts, against their share of the clock</h3>
        <p className="irl-reading-note">
          A lift of 1.00 means a band produces exactly the share of records you would expect from the share of hours it
          occupies. Below 1.00 it is genuinely quieter; above 1.00 genuinely busier.
        </p>
        <div className="irl-daypart-grid">
          {parts.map((p) => (
            <div className={`irl-daypart ${p.lift >= 1 ? "hot" : "cool"}`} key={p.id}>
              <span className="irl-daypart-label">{p.label}</span>
              <span className="irl-daypart-hours">
                {String(p.startHour).padStart(2, "0")}:00–{String((p.startHour + p.hours) % 24).padStart(2, "0")}:00 · {p.hours}h
              </span>
              <strong className="irl-daypart-lift">{p.lift.toFixed(2)}×</strong>
              <span className="irl-daypart-share">{pct(p.share)} of records</span>
              <span className="irl-daypart-count">{nf(p.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Rhythm() {
  const grid = useMemo(() => heatGrid(), []);
  const hours = useMemo(() => hourProfile(), []);
  const days = useMemo(() => weekdayProfile(), []);
  const [metric, setMetric] = useState<"total" | "cases">("total");
  const maxHour = Math.max(...hours.map((h) => h.total), 1);
  const caseMax = Math.max(1, ...grid.rows.flatMap((row) => row.cells.map((cell) => cell.cases)));
  const sortedDays = [...days].sort((a, b) => b.perOccurrence - a.perOccurrence);
  const maxDay = sortedDays[0]?.perOccurrence ?? 1;

  return (
    <div className="irl-panel">
      <div className="irl-block">
        <div className="irl-block-head">
          <h3>The 7 × 24 grid</h3>
          <div className="irl-toggle" role="group" aria-label="Heat grid metric">
            <button type="button" className={metric === "total" ? "active" : ""} onClick={() => setMetric("total")}>All records</button>
            <button type="button" className={metric === "cases" ? "active" : ""} onClick={() => setMetric("cases")}>Cases only</button>
          </div>
        </div>
        <p className="irl-reading-note">
          Every record in the window, bucketed by the weekday and hour it was created. Darker is busier. Read it as a
          shape: the daytime plateau, the overnight floor, and the shoulder ramps either side.
        </p>
        <div className="irl-heat" role="img" aria-label={`Heat map of records by weekday and hour. Busiest cell ${nf(grid.max)} records.`}>
          <div className="irl-heat-corner" aria-hidden="true" />
          <div className="irl-heat-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
            ))}
          </div>
          {grid.rows.map((row) => (
            <div className="irl-heat-row" key={row.dow}>
              <span className="irl-heat-dow" title={row.label}>{row.dow}</span>
              {row.cells.map((c) => {
                const v = metric === "cases" ? c.cases : c.total;
                const intensity = metric === "cases" ? c.cases / caseMax : c.intensity;
                return (
                  <span
                    key={c.hour}
                    className={`irl-heat-cell ${metric === "cases" ? "case" : ""}`}
                    style={{ opacity: Math.max(0.06, Math.min(1, intensity)) }}
                    title={`${row.label} ${String(c.hour).padStart(2, "0")}:00 — ${nf(c.total)} records (${nf(c.incidents)} incidents, ${nf(c.cases)} cases)`}
                  >
                    <span className="irl-sr">{v}</span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="irl-split">
        <div className="irl-block">
          <h3>Hour of day</h3>
          <p className="irl-reading-note">Bar height is share of all records; the marker is the even-share line.</p>
          <div className="irl-hour-chart" role="img" aria-label="Records by hour of day">
            <span className="irl-hour-average" style={{ top: `${100 - (CITIZEN_CONNECT.totals.all / 24 / maxHour) * 100}%` }} aria-hidden="true" />
            {hours.map((h) => (
              <div className="irl-hour-col" key={h.hour} title={`${h.label} — ${nf(h.total)} records, lift ${h.lift.toFixed(2)}×`}>
                <span className="irl-hour-bar" style={{ height: `${(h.total / maxHour) * 100}%` }} />
                <span className="irl-hour-tick">{h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="irl-block">
          <h3>Weekday, per occurrence</h3>
          <p className="irl-reading-note">
            Total ÷ how many times that weekday falls in the window — so a 353-Thursday and a 352-Tuesday are compared
            fairly. ▲/▼ is the index against the window&rsquo;s mean day.
          </p>
          <div className="irl-bar-list">
            {sortedDays.map((d) => (
              <BarRow
                key={d.dow}
                label={d.label}
                value={Math.round(d.perOccurrence)}
                max={maxDay}
                caption={`${pct(d.caseIntensity)} cases`}
                index={d.index}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Trend() {
  const years = useMemo(() => yearlyTrend(), []);
  const summary = useMemo(() => trendSummary(), []);
  const seasons = useMemo(() => seasonality(), []);

  if (!summary || !years.length) {
    return (
      <div className="irl-panel">
        <Pending
          what="The year-over-year and monthly series"
          detail="These are aggregate publisher trends; no record-level detail pull is needed. The scheduled sync refreshes them automatically."
          command="node scripts/sync/citizen-connect.mjs --mode aggregates"
        />
      </div>
    );
  }

  const maxYear = Math.max(...years.map((y) => y.perDay), 1);
  const maxSeason = Math.max(...seasons.map((s) => s.perDay), 1);
  const monthly = (CITIZEN_CONNECT.trend?.monthly ?? []).filter((m) => (m.days ?? 0) >= 27);
  const maxMonthly = Math.max(...monthly.map((m) => m.perDay ?? 0), 1);

  return (
    <div className="irl-panel">
      <div className="irl-block">
        <h3>Per day, by year</h3>
        <p className="irl-reading-note">
          Rates per day rather than annual totals, so a part-year is visibly a part-year instead of reading as a
          collapse. Change is against the previous full year&rsquo;s rate.
        </p>
        <div className="irl-bar-list">
          {years.map((y) => (
            <BarRow
              key={y.label}
              label={y.isPreLaunch ? `${y.label} (pre-launch / sparse)` : y.isPartial ? `${y.label} (partial · ${y.days ?? 0}d)` : y.label}
              value={Math.round(y.perDay)}
              max={maxYear}
              caption={`${nf(y.total)} total`}
              index={y.changePerDay === null ? undefined : 100 + y.changePerDay}
              indexLabel={y.changePerDay === null ? undefined : signed(y.changePerDay, 0)}
              accent={y.isPreLaunch ? "#c7d0d2" : y.isPartial ? "#d99224" : "#2f6f7f"}
            />
          ))}
        </div>
        {summary.firstYear && summary.lastYear && summary.changePerDay !== null ? (
          <p className="irl-callout">
            <Gauge size={15} aria-hidden="true" />
            <span>
              {summary.firstYear.label} → {summary.lastYear.label}:{" "}
              <strong>{signed(summary.changePerDay)}</strong> per day ({nf(summary.firstYear.perDay, 0)} →{" "}
              {nf(summary.lastYear.perDay, 0)}). Full years only; part-years excluded from the comparison.
            </span>
          </p>
        ) : null}
      </div>

      <div className="irl-split">
        <div className="irl-block">
          <h3>Seasonality</h3>
          <p className="irl-reading-note">
            Each calendar month averaged across every year in the window, indexed to 100 = the average month.
          </p>
          <div className="irl-season">
            {seasons.map((s) => (
              <div className="irl-season-col" key={s.month} title={`${s.label} — ${nf(s.perDay, 1)} per day, index ${nf(s.index, 0)}`}>
                <span className="irl-season-bar" style={{ height: `${maxSeason ? (s.perDay / maxSeason) * 100 : 0}%` }} />
                <span className="irl-season-index">{s.index ? nf(s.index, 0) : ""}</span>
                <span className="irl-season-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="irl-block">
          <h3>Month by month</h3>
          <p className="irl-reading-note">Records per day for each month in the window. The right-hand edge is provisional.</p>
          {monthly.length ? (
            <div className="irl-spark" role="img" aria-label="Monthly records per day">
              {monthly.map((m) => (
                <span
                  key={m.label}
                  className="irl-spark-col"
                  style={{ height: `${maxMonthly ? ((m.perDay ?? 0) / maxMonthly) * 100 : 0}%` }}
                  title={`${m.label} — ${nf(m.perDay ?? 0, 1)} per day (${nf(m.total)} records over ${m.days ?? 0} days)`}
                />
              ))}
            </div>
          ) : (
            <Pending what="The monthly series" />
          )}
          {summary.busiestMonth && summary.quietestMonth ? (
            <p className="irl-callout">
              <BarChart3 size={15} aria-hidden="true" />
              <span>
                Busiest month on record: <strong>{summary.busiestMonth.label}</strong> at{" "}
                {nf(summary.busiestMonth.perDay ?? 0, 1)}/day. Quietest: <strong>{summary.quietestMonth.label}</strong> at{" "}
                {nf(summary.quietestMonth.perDay ?? 0, 1)}/day — {summary.monthRatio.toFixed(2)}× apart.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Mix() {
  const view = useMemo(() => categoryView(CITIZEN_CONNECT, 20), []);
  const [layer, setLayer] = useState<string>("all");

  if (!view) {
    return (
      <div className="irl-panel">
        <Pending
          what="Per-category counts"
          detail="Category counts need the record-level pull: the publisher's aggregate endpoints break down by layer and hour, but not by call type. One day-windowed pass over details.json produces this, plus the agency split and the ward counts."
        />
        <div className="irl-block">
          <h3>What the filters include</h3>
          <p className="irl-reading-note">
            This view follows the category ranges selected in the original dashboard. The filter taxonomy is supplied
            by the publisher; the counts by call type arrive with the record-level sync. Category ID ranges are not
            treated as counts.
          </p>
          <ul className="irl-layer-notes">
            {CITIZEN_CONNECT.layers.map((l) => (
              <li key={l.id}>
                <strong>{l.label}</strong>
                {l.description ? <span>{l.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const layers = ["all", ...new Set(view.counts.map((c) => c.layer))];
  const rows = view.counts.filter((c) => layer === "all" || c.layer === layer);
  const max = rows[0]?.count ?? 1;

  return (
    <div className="irl-panel">
      <div className="irl-block">
        <div className="irl-block-head">
          <h3>What people actually call about</h3>
          <div className="irl-toggle" role="group" aria-label="Filter by layer">
            {layers.map((l) => (
              <button type="button" key={l} className={layer === l ? "active" : ""} onClick={() => setLayer(l)}>
                {l === "all" ? "All layers" : l}
              </button>
            ))}
          </div>
        </div>
        <p className="irl-reading-note">
          {view.coverage
            ? `Record-level pin breakdown · ${view.coverage.start} → ${view.coverage.end} (${nf(view.coverage.days)} days). The publisher reports Unverified Locations separately; this category split is not a substitute for the full-archive totals.`
            : "Record-level pin breakdown. The publisher reports Unverified Locations separately; this category split is not a substitute for the full-archive totals."}
        </p>
        <p className="irl-callout">
          <Layers size={15} aria-hidden="true" />
          <span>
            <strong>{nf(view.halfOfDemand)}</strong> of {nf(view.distinct)} distinct call types account for half of this
            breakdown. The top {view.top.length} cover {pct(view.topShare)}. The long tail is real but thin.
          </span>
        </p>
        <div className="irl-bar-list">
          {rows.slice(0, 20).map((c) => (
            <BarRow
              key={`${c.layer}-${c.agency}-${c.type}`}
              label={c.type}
              value={c.count}
              max={max}
              caption={`${pct(c.share, 2)} · ${c.agency.replace(/ - WY\d+$/, "")}`}
            />
          ))}
        </div>
      </div>

      <div className="irl-split">
        <div className="irl-block">
          <h3>By agency</h3>
          <div className="irl-bar-list">
            {view.byAgency.map((g) => (
              <BarRow key={g.name} label={g.name} value={g.count} max={view.byAgency[0]?.count ?? 1} caption={pct(g.share)} accent="#4a6fa5" />
            ))}
          </div>
        </div>
        <div className="irl-block">
          <h3>By layer</h3>
          <div className="irl-bar-list">
            {view.byLayer.map((g) => (
              <BarRow key={g.layer} label={g.layer} value={g.count} max={view.byLayer[0]?.count ?? 1} caption={pct(g.share)} accent="#7a5ea8" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Where() {
  const views = useMemo(() => geographyViews(), []);
  const [activeId, setActiveId] = useState<string>(views[0]?.id ?? "");
  const groups = CITIZEN_CONNECT.geography?.groups ?? [];
  const active = views.find((v) => v.id === activeId) ?? views[0];

  return (
    <div className="irl-panel">
      <div className="irl-block">
        <div className="irl-block-head">
          <h3>Where the record lands</h3>
          {views.length > 1 ? (
            <div className="irl-toggle" role="group" aria-label="Boundary layer">
              {views.map((v) => (
                <button type="button" key={v.id} className={active?.id === v.id ? "active" : ""} onClick={() => setActiveId(v.id)}>
                  {v.name} ({v.points.length})
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {active ? (
          <>
            <p className="irl-reading-note">
              Records assigned to each {active.name.toLowerCase()} boundary by point-in-polygon against the publisher&rsquo;s
              own boundary file. ▲/▼ is the index against an even split of {nf(active.total / active.points.length, 0)}.
              {active.coverage
                ? ` Record-level window: ${active.coverage.start} → ${active.coverage.end}.`
                : ""}
              {active.stale ? " Counts are retained from the previous complete boundary sync because the latest boundary request was incomplete." : ""}
              {typeof active.unassigned === "number"
                ? ` ${nf(active.unassigned)} records did not match a boundary or usable point in this layer; listed counts are the assigned portion.`
                : ""}
              {active.complete === false ? " Boundary coverage is incomplete; do not compare these partial totals." : ""}
            </p>
            <div className="irl-bar-list">
              {active.points.map((p) => (
                <BarRow
                  key={`${p.id}-${p.name}`}
                  label={p.name}
                  value={p.count}
                  max={active.points[0]?.count ?? 1}
                  caption={pct(p.share)}
                  index={p.index}
                  accent={active.color ?? "#2f6f7f"}
                />
              ))}
            </div>
            <p className="irl-warning">
              <ShieldQuestion size={15} aria-hidden="true" />
              <span>
                These are <strong>workload counts, not risk rates</strong>. The publisher does not release population or
                area denominators, and the boundaries differ by orders of magnitude in both. A high count can mean more
                residents, more through-traffic, more retail — or simply a larger patrol area.
              </span>
            </p>
          </>
        ) : (
          <Pending
            what="Per-boundary counts"
            detail="Boundary names and geometry come from the publisher; assigning records to them needs the record-level pull. The names below are already captured."
          />
        )}
      </div>

      <div className="irl-block">
        <h3>Boundary layers available</h3>
        <ul className="irl-shape-groups">
          {groups.map((g) => (
            <li key={g.id}>
              <span className="irl-swatch" style={{ background: g.color ?? "#888" }} aria-hidden="true" />
              <strong>{g.name}</strong>
              <span className="irl-shape-meta">
                {g.shapes.length}
                {g.complete === false && g.expectedShapes ? ` of ${g.expectedShapes}` : ""} boundaries · id {g.id}
              </span>
              <span className="irl-shape-names">{g.shapes.map((s) => s.name).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Method() {
  const notes = useMemo(() => caveats(), []);
  const avail = useMemo(() => availability(), []);
  const a = CITIZEN_CONNECT;

  return (
    <div className="irl-panel">
      <div className="irl-block">
        <h3>Where this comes from</h3>
        <dl className="irl-provenance">
          <div><dt>Publisher</dt><dd>{a.source.publisher}</dd></div>
          <div><dt>Product</dt><dd>{a.source.platform}</dd></div>
          <div><dt>Window requested</dt><dd>{a.coverage.requestedStart} → {a.coverage.requestedEnd} ({nf(a.coverage.days)} days)</dd></div>
          {a.recordCoverage ? <div><dt>Record-level breakdown</dt><dd>{a.recordCoverage.start} → {a.recordCoverage.end} ({nf(a.recordCoverage.days)} days)</dd></div> : null}
          <div><dt>Layers</dt><dd>{a.layers.map((l) => `${l.label}${l.datasetId ? ` (${l.datasetId})` : ""}`).join(" · ")}</dd></div>
          <div><dt>Agencies</dt><dd>{a.agencies.map((g) => `${g.name} · ${g.ori}`).join("  |  ")}</dd></div>
          <div><dt>Captured</dt><dd>{new Date(a.capturedAt).toISOString().slice(0, 10)} · via {a.generatedBy === "sync" ? "the scheduled ingest pipeline" : "a manual capture from the public API"}</dd></div>
          <div><dt>Refresh</dt><dd>{a.source.refreshCadence}</dd></div>
        </dl>
        <div className="irl-source-links">
          <a className="irl-source-link" href={a.source.dashboardUrl ?? a.source.appUrl} target="_blank" rel="noopener noreferrer">
            Open the original Citizen Connect dashboard <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          {a.source.agencyInfoUrl ? (
            <a className="irl-source-link" href={a.source.agencyInfoUrl} target="_blank" rel="noopener noreferrer">
              Agency notes on coverage, refresh and privacy <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="irl-block">
        <h3>What is in this snapshot</h3>
        <ul className="irl-availability">
          {Object.entries(avail).map(([key, ok]) => (
            <li key={key} className={ok ? "yes" : "no"}>
              <span aria-hidden="true">{ok ? "●" : "○"}</span>
              {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
            </li>
          ))}
        </ul>
        {a.captureNote ? <p className="irl-reading-note">{a.captureNote}</p> : null}
      </div>

      <div className="irl-block">
        <h3>Read this before quoting any of it</h3>
        <div className="irl-caveats">
          {notes.map((n) => (
            <article key={n.title}>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function IncidentRecordLens() {
  const [tab, setTab] = useState<LensTab>("overview");
  const a = CITIZEN_CONNECT;
  const sample = a.sample ?? [];

  return (
    <section className="irl-section" aria-labelledby="irl-heading">
      <div className="irl-header">
        <div>
          <span className="pulse-section-kicker">
            <span className="pulse-live-dot" /> LARAMIE COUNTY CAD RECORD · {a.coverage.requestedStart.slice(0, 4)}–
            {a.coverage.requestedEnd.slice(0, 4)}
          </span>
          <h2 id="irl-heading">The incident record, interpreted</h2>
          <p>
            {nf(a.totals.all)} Cheyenne PD &amp; Laramie County Sheriff records from the agencies&rsquo; own Citizen
            Connect dashboard — not a pin map, but what the whole archive looks like from above.
          </p>
        </div>
        <a className="irl-open-source" href={a.source.dashboardUrl ?? a.source.appUrl} target="_blank" rel="noopener noreferrer">
          Original dashboard <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>

      <div className="irl-tabs" role="group" aria-label="Ways to read the incident record">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={13} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="irl-panel-wrap" id={`irl-panel-${tab}`} role="region" aria-label={`${TABS.find((item) => item.id === tab)?.label ?? "Record"} view`} aria-live="polite">
        {tab === "overview" ? <Overview /> : null}
        {tab === "rhythm" ? <Rhythm /> : null}
        {tab === "trend" ? <Trend /> : null}
        {tab === "mix" ? <Mix /> : null}
        {tab === "where" ? <Where /> : null}
        {tab === "method" ? <Method /> : null}
      </div>

      {sample.length ? (
        <div className="irl-sample">
          <h3>
            <Clock size={13} aria-hidden="true" /> Example public records
          </h3>
          <p className="irl-reading-note">
            {a.sampleDescription ?? "Illustrative record sample, not a complete set. Coordinates are the publisher's generalized grid position, not an address."}
            {" "}Times are shown as reported in Mountain Time. Type names are verbatim from the public record.
          </p>
          <ul>
            {sample.slice(0, 8).map((r) => (
              <li key={r.id}>
                <time dateTime={r.at}>
                  {`${new Date(r.at.endsWith("Z") ? r.at : `${r.at}Z`).toLocaleString("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })} MT`}
                </time>
                <strong>{r.type}</strong>
                <span>{r.agency.replace(/ - WY\d+$/, "")}</span>
                <em>{r.layer}</em>
                <code>
                  {r.lat.toFixed(3)}, {r.lng.toFixed(3)}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="irl-not-dispatch">
        <ShieldQuestion size={14} aria-hidden="true" />
        This is a historical public record, not a live feed and not dispatch. It excludes categories the publisher
        withholds, lags by days, and generalises every location. For an emergency call 911.
      </p>
    </section>
  );
}
