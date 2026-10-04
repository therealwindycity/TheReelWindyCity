"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Cloud,
  Flame,
  Gauge,
  Radio,
  RefreshCw,
  Route,
  Shield,
  Zap,
} from "lucide-react";
import {
  runPulseIngestion,
  type AlertCategory,
  type AlertSeverity,
  type IngestionResult,
  type PulseAlert,
} from "@/lib/pulse-ingestion";

/* ─── Severity / Category Visuals ─────────────────────────── */

const SEV: Record<AlertSeverity, { icon: string; bg: string; border: string; text: string; label: string }> = {
  critical:       { icon: "🚨", bg: "#fdf0f0", border: "#e8a5a5", text: "#b33030", label: "CRITICAL" },
  urgent:         { icon: "⚠️", bg: "#fdf6ed", border: "#e8c99a", text: "#a06b1a", label: "URGENT" },
  standard:       { icon: "📋", bg: "#eef4fb", border: "#a5c4e0", text: "#2b6393", label: "STANDARD" },
  informational:  { icon: "ℹ️", bg: "#f4f6f1", border: "#cfd6c5", text: "#6b7a5e", label: "INFO" },
};

const CAT: Record<AlertCategory, string> = {
  weather: "🌤️",
  road_conditions: "🛣️",
  fire: "🔥",
  crime: "🔒",
  accident: "💥",
  government: "🏛️",
  court: "⚖️",
  election: "🗳️",
  environment: "🌿",
  community: "🏘️",
  breaking: "📰",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ─── Alert Card ──────────────────────────────────────────── */

function AlertCard({ alert, compact }: { alert: PulseAlert; compact?: boolean }) {
  const s = SEV[alert.severity];
  const icon = CAT[alert.category] || "📰";
  const loc = [alert.location.city, alert.location.county, alert.location.highway].filter(Boolean).join(" · ");

  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 8,
        padding: compact ? "12px 15px" : "17px 19px",
        transition: "border-color .2s, box-shadow .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 4 : 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: compact ? 13 : 15 }}>{icon}</span>
        <span
          style={{
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: ".8px",
            textTransform: "uppercase",
            color: s.text,
            background: s.bg,
            border: `1px solid ${s.border}`,
            borderRadius: 3,
            padding: "3px 7px",
          }}
        >
          {s.label}
        </span>
        <span style={{ fontSize: 8, color: "#9aa68c" }}>{alert.source}</span>
        <span style={{ fontSize: 8, color: "#b0baa3", marginLeft: "auto" }}>{timeAgo(alert.event_time)}</span>
      </div>

      <h3 style={{ fontSize: compact ? 13 : 15, fontWeight: 700, letterSpacing: "-.3px", lineHeight: 1.45, color: "#354238" }}>
        {alert.title}
      </h3>

      {!compact && (
        <p style={{ fontSize: 10, lineHeight: 1.85, color: "#818879", marginTop: 7 }}>
          {alert.summary}
        </p>
      )}

      {(loc || alert.tags.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: compact ? 6 : 10, flexWrap: "wrap" }}>
          {loc && <span style={{ fontSize: 8, color: "#9aa68c" }}>📍 {loc}</span>}
          {alert.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              style={{ fontSize: 7, color: "#8a9a7a", background: "#f2f6ea", border: "1px solid #e0e8d4", borderRadius: 3, padding: "2px 5px" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/* ─── Velocity Comparison ─────────────────────────────────── */

function VelocityComparison() {
  const outlets = [
    { name: "WYOMING PULSE", time: "<5 min", color: "#3c5d3e", width: 2, isUs: true, method: "Automated pipeline" },
    { name: "Oil City News", time: "1–3 hrs", color: "#6c8556", width: 4, method: "Manual reporter → WordPress" },
    { name: "Cowboy State Daily", time: "3–8 hrs", color: "#a06b1a", width: 8, method: "Batch morning queue" },
    { name: "trib.com", time: "4–12 hrs", color: "#b33030", width: 12, method: "BLOX CMS manual workflow" },
    { name: "WyoFile", time: "24–72 hrs", color: "#9aa68c", width: 40, method: "Investigative long-form" },
    { name: "Other outlets", time: "24–48 hrs", color: "#cfd6c5", width: 33, method: "Weekly cadence, single reporter" },
  ];

  return (
    <section style={{ marginBottom: 32 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-dot" /> COMPETITIVE VELOCITY</span>
          <h2>Publishing speed: how fast we beat them</h2>
          <p>Time from event occurrence to published story. Lower is better.</p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "22px 20px" }}>
        {outlets.map((o) => (
          <div key={o.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 160, textAlign: "right", fontSize: 9, fontFamily: "ui-monospace, monospace", color: o.isUs ? o.color : "#8b9084", fontWeight: o.isUs ? 700 : 400 }}>
              {o.name}
            </span>
            <div style={{ flex: 1, height: 24, background: "#f5f7f0", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: `${Math.max(6, o.width)}%`,
                  background: `${o.color}20`,
                  borderLeft: `3px solid ${o.color}`,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: o.color }}>
                  {o.time}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 10, padding: "13px 15px", background: "#eef2e7", border: "1px solid #dfe8d5", borderRadius: 6 }}>
          <Shield size={15} style={{ color: "#82966a", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 9, lineHeight: 1.9, color: "#8d9b7a" }}>
            <strong style={{ color: "#587044" }}>Why they can&apos;t catch up:</strong>{" "}
            trib.com is locked into Lee Enterprises&apos; BLOX CMS. Cowboy State Daily is batch-model. Oil City is WordPress-bound.
            WyoFile&apos;s DNA is investigative. The technology gap is structural.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Government Sources Card ─────────────────────────────── */

const GOV_SOURCES = [
  { name: "Cheyenne City Council", type: "city", url: "https://www.cheyennecity.org/citycouncil" },
  { name: "Laramie County Commission", type: "county", url: "https://www.laramiecounty.com/commission" },
  { name: "Natrona County Commission", type: "county", url: "https://www.natronacounty-wy.gov" },
  { name: "Casper City Council", type: "city", url: "https://www.casperwy.gov" },
  { name: "Wyoming Legislature", type: "state", url: "https://www.wyoleg.gov" },
  { name: "Governor Gordon", type: "state", url: "https://governor.wy.gov" },
  { name: "WY Secretary of State", type: "state", url: "https://sos.wyo.gov" },
  { name: "WY DEQ", type: "state", url: "https://deq.wyoming.gov" },
  { name: "Teton County Commission", type: "county", url: "https://www.tetoncountywy.gov" },
  { name: "Sheridan County Commission", type: "county", url: "https://www.sheridancounty.com" },
  { name: "Campbell County Commission", type: "county", url: "https://www.ccgov.net" },
  { name: "Fremont County Commission", type: "county", url: "https://fremontcountywy.gov" },
  { name: "Sweetwater County Commission", type: "county", url: "https://www.sweet.wy.us" },
  { name: "Park County Commission", type: "county", url: "https://www.parkcounty.us" },
  { name: "Albany County Commission", type: "county", url: "https://www.co.albany.wy.us" },
];

function GovernmentSources() {
  return (
    <section style={{ marginBottom: 32 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-dot" /> GOVERNMENT WATCH</span>
          <h2>Every county, one dashboard</h2>
          <p>Government agendas, meetings, and filings across Wyoming — nobody else aggregates this.</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {GOV_SOURCES.map((s) => (
          <a
            key={s.name}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "13px 15px",
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 7,
              fontSize: 10,
              color: "#607e44",
              textDecoration: "none",
              transition: "border-color .2s",
            }}
          >
            <span style={{ fontSize: 14 }}>{s.type === "state" ? "🏛️" : s.type === "county" ? "📋" : "🏘️"}</span>
            <span style={{ flex: 1, fontWeight: 700, color: "#354238" }}>{s.name}</span>
            <span style={{ fontSize: 7, color: "#9aa68c", textTransform: "uppercase", letterSpacing: ".5px" }}>{s.type}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ─── Main Dashboard ──────────────────────────────────────── */

export default function PulseDashboard() {
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await runPulseIngestion();
      setResult(r);
      setLastRefresh(new Date());
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000); // auto-refresh every 60s
    return () => clearInterval(interval);
  }, [refresh]);

  const alerts = result?.alerts ?? [];
  const filtered = alerts.filter(
    (a) =>
      (severityFilter === "all" || a.severity === severityFilter) &&
      (categoryFilter === "all" || a.category === categoryFilter)
  );

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const urgentCount = alerts.filter((a) => a.severity === "urgent").length;
  const wyTime = lastRefresh.toLocaleString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit", hour12: true });
  const wyDate = lastRefresh.toLocaleDateString("en-US", { timeZone: "America/Denver", weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <section className="page-enter">
      {/* ── Header ── */}
      <div className="page-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> REAL-TIME WYOMING NEWS INFRASTRUCTURE</div>
          <h1>Wyoming Pulse — Live Alerts</h1>
          <p>
            Automated monitoring of NWS weather, WYDOT road conditions, and 6 active Wyoming news outlets.
            Alerts delivered in under 5 minutes — faster than any outlet in the state.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: "#9aa68c" }}>
            {wyDate} · {wyTime} MT
          </span>
          <button
            className="button button-outline button-small"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { value: alerts.length, label: "Active Alerts", color: "#3c5d3e" },
          { value: result?.counts.nws ?? 0, label: "NWS Weather", color: "#a06b1a" },
          { value: result?.counts.wydot ?? 0, label: "Road Events", color: "#2b6393" },
          { value: result?.counts.rss ?? 0, label: "RSS Stories", color: "#6c8556" },
          { value: criticalCount + urgentCount, label: "Urgent+", color: criticalCount > 0 ? "#b33030" : urgentCount > 0 ? "#a06b1a" : "#6c8556" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "18px 16px" }}>
            <div style={{ fontSize: 30, fontWeight: 400, letterSpacing: "-1.5px", color: stat.color, lineHeight: 1 }}>
              {loading ? "—" : stat.value}
            </div>
            <div style={{ fontSize: 8, letterSpacing: ".8px", color: "#9aa68c", marginTop: 6, textTransform: "uppercase" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "#9aa68c", fontWeight: 700, letterSpacing: ".8px" }}>FILTER:</span>
        {(["all", "critical", "urgent", "standard", "informational"] as const).map((sev) => (
          <button
            key={sev}
            className={`button button-small ${severityFilter === sev ? "button-primary" : "button-outline"}`}
            onClick={() => setSeverityFilter(sev)}
            style={{ fontSize: 8, padding: "6px 10px", minHeight: 28 }}
          >
            {sev === "all" ? "All severities" : SEV[sev].label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: "#dfe5d6", margin: "0 4px" }} />
        {(["all", "weather", "road_conditions", "crime", "accident", "community"] as const).map((cat) => (
          <button
            key={cat}
            className={`button button-small ${categoryFilter === cat ? "button-tinted" : "button-outline"}`}
            onClick={() => setCategoryFilter(cat)}
            style={{ fontSize: 8, padding: "6px 10px", minHeight: 28 }}
          >
            {cat === "all" ? "All categories" : cat.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* ── Critical Banner ── */}
      {criticalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 17px", background: "#fdf0f0", border: "1px solid #e8a5a5", borderRadius: 8, marginBottom: 18 }}>
          <AlertTriangle size={18} style={{ color: "#b33030" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b33030" }}>
            {criticalCount} CRITICAL ALERT{criticalCount > 1 ? "S" : ""} ACTIVE
          </span>
        </div>
      )}

      {/* ── Alert Feed ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {filtered.length === 0 && !loading && (
          <div className="empty-state" style={{ minHeight: 180 }}>
            <Zap size={28} />
            <h3>No alerts matching filters</h3>
            <button className="button button-outline button-small" onClick={() => { setSeverityFilter("all"); setCategoryFilter("all"); }}>
              Clear filters
            </button>
          </div>
        )}
        {filtered.map((alert) => (
          <AlertCard key={alert.source_id} alert={alert} compact={alert.severity === "informational"} />
        ))}
      </div>

      {/* ── Velocity ── */}
      <VelocityComparison />

      {/* ── Government Sources ── */}
      <GovernmentSources />

      {/* ── Data Sources Note ── */}
      <div className="source-notice" style={{ marginTop: 20 }}>
        <Shield size={16} />
        <p>
          Data sourced from NWS Wyoming (api.weather.gov), WYDOT road conditions, and RSS feeds from
          Oil City News, Cap City News, WyoFile, Buckrail, County 10, and SweetwaterNOW.
          Alerts auto-refresh every 60 seconds. This is the only Wyoming news dashboard that aggregates
          all these sources in real-time.
        </p>
      </div>
    </section>
  );
}