"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  LoaderCircle,
  Play,
  RotateCw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  DEFAULT_ARENA_URL,
  NEWSPACE_RECIPES,
  SECTION_LABELS,
  NEWSPACE_SECTIONS,
  buildFactSheet,
  sanitizeCustomCss,
  type NewspacePattern,
  type NewspaceSectionId,
} from "@/lib/newspace";
import { patchNewspace, resetNewspace, useNewspace } from "@/lib/newspace-store";

const ICON_BUTTON = "nsp-tool";
const PATTERNS: { id: NewspacePattern; label: string }[] = [
  { id: "none", label: "Plain" },
  { id: "stars", label: "Stars" },
  { id: "grid", label: "Graph paper" },
  { id: "plaid", label: "Plaid" },
];

type TabId = "arena" | "theme" | "modules" | "code";

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "that address";
  }
}

/**
 * The studio behind the retro profile.
 *
 * Two halves, deliberately: an Arena window for generating the code, and a code
 * console that accepts it. The window is visitor-initiated and may be refused by
 * Arena's own frame policy — nothing here pretends otherwise — while the console
 * is the part that is guaranteed to work, offline, with no account and no
 * network. Both write to the same localStorage record.
 */
export default function NewspaceStudio({ facts }: { facts: Record<string, string> }) {
  const custom = useNewspace();
  const [tab, setTab] = useState<TabId>("arena");
  const [status, setStatus] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [cssDraft, setCssDraft] = useState(custom.css);
  const [htmlDraft, setHtmlDraft] = useState(custom.html);
  const [arenaDraft, setArenaDraft] = useState(custom.arenaUrl || DEFAULT_ARENA_URL);
  const [frame, setFrame] = useState<"idle" | "loading" | "ready" | "slow">("idle");
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const copyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Which tab is open is part of the URL, not just local state: a shared
  // "#studio-code" link opens the console, and a reload returns you where you
  // were. Read after mount so the exported HTML always hydrates onto the same
  // first tab the server rendered.
  useEffect(() => {
    const match = /^#studio-(arena|theme|modules|code)$/.exec(window.location.hash);
    if (match) setTab(match[1] as TabId);
  }, []);

  // Only after the visitor picks a tool — the URL of someone who never opened
  // the studio stays exactly as it was shared.
  const hashOwned = useRef(false);
  useEffect(() => {
    if (!hashOwned.current) {
      hashOwned.current = true;
      return;
    }
    const next = `#studio-${tab}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [tab]);

  const factSheet = useMemo(() => buildFactSheet(facts), [facts]);
  const arenaUrl = /^https:\/\/[^\s]+$/i.test(arenaDraft.trim()) ? arenaDraft.trim() : DEFAULT_ARENA_URL;
  const arenaHost = hostOf(arenaUrl);
  const activeFields = Boolean(custom.name || custom.headline || custom.status || custom.css || custom.html);

  // Keep the drafts in step when the studio is reset from anywhere on the page.
  useEffect(() => {
    setCssDraft(custom.css);
    setHtmlDraft(custom.html);
  }, [custom.css, custom.html]);

  useEffect(() => {
    if (frame !== "loading") return;
    const timer = window.setTimeout(() => setFrame((state) => (state === "loading" ? "slow" : state)), 12_000);
    return () => window.clearTimeout(timer);
  }, [frame, nonce]);

  function flash(message: string) {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 4_500);
  }

  function apply(patch: Parameters<typeof patchNewspace>[0], message: string) {
    patchNewspace(patch);
    setSaved(true);
    flash(message);
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied. Paste it into the Arena window, or open Arena in a tab.");
    } catch {
      // Clipboard permission is often refused; selecting the field still works.
      const node = copyRefs.current[key];
      if (node) {
        node.focus();
        node.setSelectionRange(0, node.value.length);
      }
      flash("Clipboard blocked — the text is selected instead, so copy it with Ctrl/⌘+C.");
    }
  }

  function openFrame() {
    setFrame("loading");
    setNonce((value) => value + 1);
    window.setTimeout(() => frameRef.current?.focus(), 0);
  }

  function moveSection(id: NewspaceSectionId, direction: -1 | 1) {
    const order = [...custom.order];
    const at = order.indexOf(id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    apply({ order }, `${SECTION_LABELS[id]} moved ${direction === -1 ? "up" : "down"}.`);
  }

  function toggleSection(id: NewspaceSectionId) {
    const hidden = custom.hidden.includes(id) ? custom.hidden.filter((item) => item !== id) : [...custom.hidden, id];
    apply({ hidden }, hidden.includes(id) ? `${SECTION_LABELS[id]} hidden for you.` : `${SECTION_LABELS[id]} back.`);
  }

  return (
    <section className="nsp-studio" id="nsp-studio" aria-labelledby="nsp-studio-title">
      <div className="nsp-studio-head">
        <div>
          <p className="nsp-kicker">
            <Sparkles size={12} aria-hidden="true" /> THE OLD PROFILE-HTML BOX, REBUILT
          </p>
          <h2 id="nsp-studio-title">Customize mynewspace</h2>
          <p>
            Back in 2006 you pasted HTML into a box and your profile stopped looking like everyone else&apos;s. Here
            the box is an <strong>Arena</strong> window: ask for what you want, paste what comes back, and your
            profile changes &mdash; in this browser, for you, saved locally. The address bar tracks which tool is
            open, so a saved view can be linked.
          </p>
        </div>
        <div className="nsp-studio-state">
          {activeFields ? (
            <span className="nsp-badge nsp-badge-on">
              <Check size={12} aria-hidden="true" /> your overrides are live
            </span>
          ) : (
            <span className="nsp-badge">nothing customized yet</span>
          )}
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={() => {
              resetNewspace();
              setCssDraft("");
              setHtmlDraft("");
              setArenaDraft(DEFAULT_ARENA_URL);
              flash("Reset to the published profile.");
            }}
          >
            <Eraser size={13} aria-hidden="true" /> Reset
          </button>
        </div>
      </div>

      <div className="nsp-tabs" role="tablist" aria-label="Customization tools">
        {(
          [
            { id: "arena", label: "Arena window" },
            { id: "theme", label: "Identity & theme" },
            { id: "modules", label: "Modules" },
            { id: "code", label: "Code console" },
          ] as { id: TabId; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`nsp-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="nsp-tabpanel"
            className={`nsp-tab${tab === entry.id ? " active" : ""}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="nsp-panel" id="nsp-tabpanel" role="tabpanel" aria-labelledby={`nsp-tab-${tab}`} tabIndex={-1}>
        {tab === "arena" && (
          <div className="nsp-arena">
            <div className="nsp-arena-copy">
              <p className="nsp-eyebrow">STEP 1 · ASK</p>
              <p>
                Pick a starting point, copy the prompt, and send it to Arena. Each prompt already names the ids and
                variables this page publishes, so the answer fits the profile instead of a blank canvas.
              </p>
              <ul className="nsp-recipes">
                {NEWSPACE_RECIPES.map((recipe) => {
                  const prompt = recipe.prompt({ ...facts, accent: custom.accent });
                  return (
                    <li key={recipe.id}>
                      <div>
                        <strong>{recipe.title}</strong>
                        <p>{recipe.blurb}</p>
                        <textarea
                          readOnly
                          ref={(node) => {
                            copyRefs.current[recipe.id] = node;
                          }}
                          value={prompt}
                          rows={3}
                          aria-label={`Prompt for ${recipe.title}`}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </div>
                      <button
                        type="button"
                        className="nsp-tool nsp-tool-primary"
                        onClick={() => copyText(recipe.id, prompt)}
                      >
                        <Copy size={13} aria-hidden="true" /> Copy prompt
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="nsp-eyebrow">STEP 2 · PASTE THE ANSWER</p>
              <p>
                CSS goes in <strong>Code console → stylesheet</strong> and restyles the real profile. HTML goes in{" "}
                <strong>Code console → custom module</strong> and renders in a sealed frame, so it can decorate but
                never rewrite the record or read your browser.
              </p>
              <details className="nsp-factsheet">
                <summary>Copy the data sheet to send with your prompt</summary>
                <textarea
                  readOnly
                  ref={(node) => {
                    copyRefs.current.facts = node;
                  }}
                  value={factSheet}
                  rows={9}
                  aria-label="Profile data sheet"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className={ICON_BUTTON} onClick={() => copyText("facts", factSheet)}>
                  <Copy size={13} aria-hidden="true" /> Copy data sheet
                </button>
                <p>
                  These are this site&apos;s published values. Sending them along means Arena styles your real numbers
                  instead of inventing them.
                </p>
              </details>
            </div>

            <div className="nsp-frame-col">
              <label className="nsp-field">
                <span>Arena window URL</span>
                <input
                  type="url"
                  value={arenaDraft}
                  onChange={(event) => setArenaDraft(event.target.value)}
                  onBlur={() => {
                    if (arenaUrl !== custom.arenaUrl) apply({ arenaUrl }, `Window pointed at ${arenaHost}.`);
                  }}
                />
              </label>
              <p className="nsp-field-note">
                Default: <code>{DEFAULT_ARENA_URL}</code>. Arena does not publish an embed-widget endpoint, so this is
                just the address your browser is asked to frame. If Arena sends{" "}
                <code>X-Frame-Options</code> or a CSP <code>frame-ancestors</code> that refuses embedding, the window
                stays blank and only the direct link works &mdash; that is their policy, not a bug on this page.
              </p>

              <div className="nsp-frame-wrap">
                <iframe
                  key={`${arenaUrl}-${nonce}`}
                  ref={frameRef}
                  title={`Arena agent window — ${arenaHost}`}
                  src={frame === "idle" ? undefined : arenaUrl}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  onLoad={() => setFrame((state) => (state === "loading" ? "ready" : state))}
                />
                {frame !== "ready" && (
                  <div className="nsp-frame-gate">
                    {frame === "idle" ? (
                      <>
                        <p className="nsp-frame-gate-title">Open {arenaHost} in this frame</p>
                        <p>
                          Nothing is requested from <strong>{arenaHost}</strong> until you press the button. Signing
                          in, if you want to, happens inside their frame with their cookies.
                        </p>
                        <div className="nsp-frame-actions">
                          <button type="button" className="nsp-tool nsp-tool-primary" onClick={openFrame}>
                            <Play size={13} aria-hidden="true" /> Load Arena window
                          </button>
                          <a className="nsp-tool" href={arenaUrl} target="_blank" rel="noopener noreferrer">
                            Open in a new tab <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <p className="nsp-frame-status">
                        {frame === "loading" ? (
                          <>
                            <LoaderCircle size={15} className="nsp-spin" aria-hidden="true" /> Opening {arenaHost}…
                          </>
                        ) : (
                          <>
                            <CircleAlert size={15} aria-hidden="true" />
                            <span>
                              <strong>This window has not reported back.</strong> {arenaHost} may be offline, or it may
                              refuse to be framed. The code console below works either way.
                            </span>
                          </>
                        )}
                        <span className="nsp-frame-actions">
                          <button type="button" className={ICON_BUTTON} onClick={openFrame}>
                            <RotateCw size={12} aria-hidden="true" /> Retry
                          </button>
                          <a href={arenaUrl} target="_blank" rel="noopener noreferrer" className={ICON_BUTTON}>
                            Open directly <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="nsp-frame-note">
                {frame === "ready"
                  ? `Frame reported a load. Reload keeps whatever you typed inside Arena; it cannot touch this page.`
                  : "No request has been sent to this host yet. Opening Arena in a tab does not load the frame."}
              </p>
            </div>
          </div>
        )}

        {tab === "theme" && (
          <div className="nsp-grid2">
            <div>
              <p className="nsp-eyebrow">TEXT FIELDS · PUBLISHED DEFAULTS IN BRACKETS</p>
              {(
                [
                  { field: "name", label: "Display name", max: 40 },
                  { field: "headline", label: "Motto line", max: 120 },
                  { field: "status", label: "Status", max: 90 },
                  { field: "song", label: "Profile song label", max: 80 },
                  { field: "location", label: "Location", max: 60 },
                ] as const
              ).map((entry) => (
                <label className="nsp-field" key={entry.field}>
                  <span>{entry.label}</span>
                  <input
                    maxLength={entry.max}
                    placeholder={facts[entry.field] ?? ""}
                    defaultValue={custom[entry.field]}
                    onChange={(event) => apply({ [entry.field]: event.target.value }, "")}
                  />
                  <em>{facts[entry.field]}</em>
                </label>
              ))}
            </div>
            <div>
              <p className="nsp-eyebrow">COLOUR &amp; BACKGROUND</p>
              <div className="nsp-field-row">
                <label className="nsp-field nsp-field-color">
                  <span>Accent</span>
                  <input
                    type="color"
                    value={custom.accent}
                    onChange={(event) => apply({ accent: event.target.value }, "")}
                  />
                </label>
                <div className="nsp-field">
                  <span>Pattern</span>
                  <div className="nsp-segment">
                    {PATTERNS.map((pattern) => (
                      <button
                        key={pattern.id}
                        type="button"
                        className={custom.pattern === pattern.id ? "on" : ""}
                        aria-pressed={custom.pattern === pattern.id}
                        onClick={() => apply({ pattern: pattern.id }, "")}
                      >
                        {pattern.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="nsp-field-note">
                The accent is published to CSS as <code>--nsp-accent</code>, which is the one variable generated
                stylesheets should paint with. Patterns are this site&apos;s own inline SVG &mdash; no third-party
                tiled GIFs to fetch.
              </p>
              <div className="nsp-contrast">
                <WandSparkles size={14} aria-hidden="true" />
                <span>
                  Anything Arena writes here lands on a page of real public records. If a theme drops contrast below
                  what you can read at 3am, the studio will not stop you &mdash; but the printed text stays in the
                  export, so a theme only ever hides, never rewrites.
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === "modules" && (
          <div>
            <p className="nsp-eyebrow">ORDER &amp; VISIBILITY · YOUR VIEW ONLY</p>
            <p className="nsp-panel-lede">
              MySpace profiles were rearranged by hand. Same idea, applied with CSS <code>order</code> so the
              exported page stays in reading order for everyone else and for a crawler.
            </p>
            <ol className="nsp-modules">
              {custom.order.map((id, index) => {
                const hidden = custom.hidden.includes(id);
                return (
                  <li key={id} className={hidden ? "off" : ""}>
                    <span className="nsp-module-index">{index + 1}</span>
                    <span className="nsp-module-name">{SECTION_LABELS[id]}</span>
                    <span className="nsp-module-actions">
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        onClick={() => moveSection(id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${SECTION_LABELS[id]} up`}
                      >
                        <ArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        onClick={() => moveSection(id, 1)}
                        disabled={index === custom.order.length - 1}
                        aria-label={`Move ${SECTION_LABELS[id]} down`}
                      >
                        <ArrowDown size={13} aria-hidden="true" />
                      </button>
                      <button type="button" className={ICON_BUTTON} onClick={() => toggleSection(id)}>
                        {hidden ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                        {hidden ? "Show" : "Hide"}
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        onClick={() => document.getElementById(`nsp-sec-${id}`)?.scrollIntoView({ block: "start" })}
                      >
                        View
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
            {custom.hidden.length > 0 && custom.hidden.length >= NEWSPACE_SECTIONS.length - 1 && (
              <p className="nsp-warn">
                Almost everything is hidden. The record still exists; this is just your view of it.
              </p>
            )}
          </div>
        )}

        {tab === "code" && (
          <div className="nsp-grid2">
            <div>
              <p className="nsp-eyebrow">STYLESHEET · APPLIED TO THE REAL PROFILE</p>
              <textarea
                className="nsp-code"
                rows={12}
                spellCheck={false}
                value={cssDraft}
                placeholder={":root { --nsp-accent: #ffcc33; }\n\n#nsp-sec-wall .nsp-module-head { background: #141a2b; }"}
                onChange={(event) => setCssDraft(event.target.value)}
                aria-label="Custom CSS"
              />
              <div className="nsp-code-actions">
                <button
                  type="button"
                  className="nsp-tool nsp-tool-primary"
                  onClick={() => {
                    const clean = sanitizeCustomCss(cssDraft);
                    setCssDraft(clean);
                    apply({ css: clean }, clean ? "Stylesheet applied." : "Stylesheet cleared.");
                  }}
                >
                  <Check size={13} aria-hidden="true" /> Apply stylesheet
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  onClick={() => {
                    setCssDraft("");
                    apply({ css: "" }, "Stylesheet cleared.");
                  }}
                >
                  Clear
                </button>
                <span>{cssDraft.length.toLocaleString()} chars</span>
              </div>
              <p className="nsp-field-note">
                <code>expression()</code>, <code>behavior:</code>, <code>-moz-binding</code>, <code>@import</code> and{" "}
                <code>data:</code> URLs are stripped, and every <code>&lt;</code> goes with them &mdash; one stray
                angle bracket is all a <code>&lt;/style&gt;</code> breakout needs. Those were the tricks that made
                2006 profile CSS a security hole.
              </p>
            </div>
            <div>
              <p className="nsp-eyebrow">CUSTOM MODULE · SEALED FRAME</p>
              <textarea
                className="nsp-code"
                rows={12}
                spellCheck={false}
                value={htmlDraft}
                placeholder={'<marquee>The agenda is posted.</marquee>\n<h3 style="color:#ffcc33">my corner of the record</h3>'}
                onChange={(event) => setHtmlDraft(event.target.value)}
                aria-label="Custom HTML module"
              />
              <div className="nsp-code-actions">
                <button
                  type="button"
                  className="nsp-tool nsp-tool-primary"
                  onClick={() => {
                    apply({ html: htmlDraft }, htmlDraft.trim() ? "Module saved." : "Module removed.");
                    window.setTimeout(
                      () => document.getElementById("nsp-sec-custom")?.scrollIntoView({ block: "center" }),
                      30,
                    );
                  }}
                >
                  <Check size={13} aria-hidden="true" /> Save module
                </button>
                <label className="nsp-check">
                  <input
                    type="checkbox"
                    checked={custom.allowScripts}
                    onChange={(event) => apply({ allowScripts: event.target.checked }, "")}
                  />
                  Allow scripts in the frame
                </label>
                <span>{htmlDraft.length.toLocaleString()} chars</span>
              </div>
              <p className="nsp-field-note">
                Your markup is wrapped in its own document and rendered in a sandboxed <code>srcdoc</code> frame with
                no same-origin access. A <code>&lt;marquee&gt;</code> still scrolls and a table still lays out, but
                the module cannot read this page, cannot write to your profile, and cannot send anything anywhere
                &mdash; unless you tick the box above, in which case scripts run inside that sealed frame only.
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="nsp-status" role="status" aria-live="polite">
        {status || (saved ? "Saved in this browser." : "Nothing is uploaded. This studio has no server to save to.")}
      </p>
    </section>
  );
}
