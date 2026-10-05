"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowUpRight,
  AudioLines,
  CircleAlert,
  CloudSun,
  FileText,
  LoaderCircle,
  Play,
  Radio,
  RotateCw,
  Route,
  Video,
} from "lucide-react";
import { publisherHost, type HubSource } from "@/lib/hub-sources";

const ICONS = {
  agenda: FileText,
  recording: Video,
  scanner: Radio,
  weather: CloudSun,
  roads: Route,
} as const;

/**
 * How a publisher window is presented:
 *  - idle:    the frame is in the page but has not been pointed at the
 *             publisher yet, so no third-party request has been made
 *  - loading: the visitor asked for it and the frame is opening
 *  - ready:   the frame reported that it loaded
 *  - slow:    it never reported back; the publisher may be unreachable or may
 *             block embedded viewing (we cannot tell which from the outside)
 */
type FrameState = "idle" | "loading" | "ready" | "slow";

type FrameSession = { nonce: number; state: FrameState };

/** If a frame has not reported a load in this long, surface the fallback instead of a spinner. */
const SLOW_FRAME_MS = 12_000;

const SOURCE_HASH = /^#source-(.+)$/;

export default function HubSourceDeck({
  sources,
  initialSourceId = "agenda",
}: {
  sources: HubSource[];
  initialSourceId?: string;
}) {
  const [activeId, setActiveId] = useState(initialSourceId);
  const [sessions, setSessions] = useState<Record<string, FrameSession>>({});
  const frameRef = useRef<HTMLIFrameElement>(null);
  const hydrated = useRef(false);

  /**
   * The address bar tracks the open window so a source can be linked and
   * re-found: /hub/#source-scanner opens straight onto the scanner feed.
   */
  useEffect(() => {
    const match = SOURCE_HASH.exec(window.location.hash);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    if (sources.some((source) => source.id === id)) setActiveId(id);
  }, [sources]);

  useEffect(() => {
    // Skip the first pass so an incoming #source-… link is read before it is rewritten.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const next = `#source-${activeId}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [activeId]);

  const active = sources.find((source) => source.id === activeId) ?? sources[0];
  const session = active ? sessions[active.id] : undefined;
  const frameState: FrameState = session?.state ?? "idle";

  useEffect(() => {
    const id = active?.id;
    if (!id) return;
    const current = sessions[id];
    if (current?.state !== "loading") return;
    const timer = window.setTimeout(() => {
      setSessions((prev) =>
        prev[id]?.state === "loading" ? { ...prev, [id]: { ...prev[id], state: "slow" } } : prev,
      );
    }, SLOW_FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [active?.id, sessions]);

  // The "Load window" button unmounts once a frame opens, so hand focus to the
  // frame itself rather than letting it fall back to the top of the document.
  useEffect(() => {
    if (frameState === "loading" || frameState === "ready") frameRef.current?.focus();
  }, [frameState, active?.id]);

  if (!active) return null;

  const Icon = ICONS[active.id as keyof typeof ICONS] ?? AudioLines;
  const armed = Boolean(session);
  const host = publisherHost(active.embedUrl);

  function openFrame(id: string) {
    setSessions((prev) => ({ ...prev, [id]: { nonce: (prev[id]?.nonce ?? 0) + 1, state: "loading" } }));
  }

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

  const statusMessage =
    frameState === "loading"
      ? `Opening the ${active.sourceName} window.`
      : frameState === "ready"
        ? `${active.label} is open in the window below.`
        : frameState === "slow"
          ? `The ${active.sourceName} window has not finished opening. It may be unavailable, or the publisher may block embedded viewing. Use the direct source link instead.`
          : `${active.label} has not been loaded. No request has been sent to ${host} yet.`;

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
          {/*
            The iframe is always in the markup so the deck still describes a real
            framed document, but `src` is only set once a visitor asks for it.
            Until then nothing is requested from the publisher: no third-party
            cookies, no tracking, and no surprise downloads on a civic page.
          */}
          <iframe
            key={`${active.id}-${session?.nonce ?? 0}`}
            ref={frameRef}
            src={armed ? active.embedUrl : undefined}
            title={`${active.label} — ${active.sourceName}`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={active.sandbox}
            allow={active.allow}
            allowFullScreen={active.mode === "video"}
            onLoad={() =>
              setSessions((prev) => {
                const id = prev[active.id];
                if (id?.state !== "loading" && id?.state !== "slow") return prev;
                return { ...prev, [active.id]: { ...id, state: "ready" } };
              })
            }
          />

          {frameState !== "ready" && (
            <div className="gov-frame-gate">
              {frameState === "idle" ? (
                <>
                  <span className="gov-frame-gate-icon"><Icon size={20} aria-hidden="true" /></span>
                  <div className="gov-frame-gate-copy">
                    <p className="gov-frame-gate-title">Load {active.sourceName} here</p>
                    <p>
                      Nothing is loaded from <strong>{host}</strong> until you choose to open it. This window connects
                      your browser straight to the publisher, so their own cookies and playback settings apply.
                    </p>
                  </div>
                  <div className="gov-frame-gate-actions">
                    <button
                      type="button"
                      className="gov-frame-button gov-frame-button-primary"
                      onClick={() => openFrame(active.id)}
                    >
                      <Play size={14} aria-hidden="true" /> Load window
                    </button>
                    <a
                      className="gov-frame-button"
                      href={active.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open original source <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  </div>
                </>
              ) : (
                <div className="gov-frame-status">
                  {frameState === "loading" ? (
                    <>
                      <LoaderCircle size={17} className="gov-frame-spinner" aria-hidden="true" />
                      <span>Opening the {host} window…</span>
                    </>
                  ) : (
                    <>
                      <CircleAlert size={17} aria-hidden="true" />
                      <span>
                        <strong>This window has not finished opening.</strong> The publisher may be unavailable, or it may
                        block embedded viewing — there is no way to tell from here. Open the original source to read it
                        directly.
                      </span>
                    </>
                  )}
                  <div className="gov-frame-status-actions">
                    <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Open original source <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                    <button type="button" className="gov-frame-button" onClick={() => openFrame(active.id)}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {frameState === "ready" && (
            <>
              <div className="gov-frame-overlay" aria-hidden="true">
                <span>{active.mode === "audio" ? <Radio size={14} /> : active.mode === "video" ? <Video size={14} /> : <FileText size={14} />}</span>
                <span>External publisher window</span>
              </div>
              <div className="gov-frame-tools">
                <button
                  type="button"
                  className="gov-frame-tool"
                  onClick={() => openFrame(active.id)}
                  title={`Reload the ${active.sourceName} window`}
                >
                  <RotateCw size={13} aria-hidden="true" /> Reload
                </button>
                <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer" className="gov-frame-tool">
                  Original source <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </div>
            </>
          )}
        </div>

        <p className="gov-frame-share-note">
          The address bar tracks the window you are viewing, so you can copy the link to share this exact source.
        </p>

        {/* Screen readers are told what the frame is doing; the visual state lives in the panel above. */}
        <p className="gov-visually-hidden" role="status" aria-live="polite">{statusMessage}</p>

        <p className="gov-embed-note">
          Some publishers block embedded viewing or require their own cookies and playback settings. If the window is
          blank, blocked, or out of date, use <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer">Open original source <ArrowUpRight size={12} aria-hidden="true" /></a>.
        </p>
      </div>
    </section>
  );
}
