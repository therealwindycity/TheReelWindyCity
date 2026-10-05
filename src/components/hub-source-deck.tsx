"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUpRight, AudioLines, CloudSun, FileText, Radio, Route, Video } from "lucide-react";
import type { HubSource } from "@/lib/hub-sources";

const ICONS = {
  agenda: FileText,
  recording: Video,
  scanner: Radio,
  weather: CloudSun,
  roads: Route,
} as const;

export default function HubSourceDeck({
  sources,
  initialSourceId = "agenda",
}: {
  sources: HubSource[];
  initialSourceId?: string;
}) {
  const [activeId, setActiveId] = useState(initialSourceId);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % sources.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + sources.length) % sources.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = sources.length - 1;
    else return;
    event.preventDefault();
    const next = sources[nextIndex];
    if (!next) return;
    setActiveId(next.id);
    document.getElementById(`gov-source-tab-${next.id}`)?.focus();
  }
  const active = sources.find((source) => source.id === activeId) ?? sources[0];
  if (!active) return null;

  const Icon = ICONS[active.id as keyof typeof ICONS] ?? AudioLines;

  return (
    <section className="gov-source-deck" aria-labelledby="gov-source-deck-title">
      <div className="gov-source-deck-heading">
        <div>
          <p className="gov-kicker">OPEN SOURCE WINDOWS</p>
          <h2 id="gov-source-deck-title">Explore the original channels</h2>
          <p>Choose a window to view a publisher’s page here, or open that source directly.</p>
        </div>
        <span className="gov-source-count">{sources.length} publisher windows</span>
      </div>

      <div className="gov-source-tabs" role="tablist" aria-label="Choose a public information source">
        {sources.map((source, index) => {
          const TabIcon = ICONS[source.id as keyof typeof ICONS] ?? AudioLines;
          const selected = active.id === source.id;
          return (
            <button
              key={source.id}
              id={`gov-source-tab-${source.id}`}
              className={`gov-source-tab${selected ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="gov-source-panel"
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => setActiveId(source.id)}
            >
              <TabIcon size={15} aria-hidden="true" />
              <span>{source.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div
        id="gov-source-panel"
        className="gov-source-panel"
        role="tabpanel"
        aria-labelledby={`gov-source-tab-${active.id}`}
        tabIndex={0}
      >
        <div className="gov-source-panel-copy">
          <div className="gov-source-panel-title">
            <span className="gov-source-icon"><Icon size={19} aria-hidden="true" /></span>
            <div>
              <span className="gov-kicker">{active.category}</span>
              <h3>{active.label}</h3>
            </div>
          </div>
          <p>{active.description}</p>
          <div className="gov-source-context"><span>READ WITH CONTEXT</span>{active.context}</div>
          <div className="gov-source-meta">
            <span><i aria-hidden="true" /> Publisher: <strong>{active.sourceName}</strong></span>
            <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open original source <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className={`gov-frame-wrap gov-frame-wrap--${active.mode}`}>
          <iframe
            key={active.id}
            src={active.embedUrl}
            title={`${active.label} — ${active.sourceName}`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={active.sandbox}
            allow={active.allow}
            allowFullScreen={active.mode === "video"}
          />
          <div className="gov-frame-overlay" aria-hidden="true">
            <span>{active.mode === "audio" ? <Radio size={14} /> : active.mode === "video" ? <Video size={14} /> : <FileText size={14} />}</span>
            <span>External publisher window</span>
          </div>
        </div>
        <p className="gov-embed-note">
          Some publishers block embedded viewing or require their own cookies and playback settings. If the window is blank, blocked, or out of date, use <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">Open original source <ArrowUpRight size={12} aria-hidden="true" /></a>.
        </p>
      </div>
    </section>
  );
}
