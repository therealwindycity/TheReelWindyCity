/**
 * Shared shape for the MyNewSpace profile page.
 *
 * MyNewSpace is a deliberately retro homage: a 2006-style profile whose fields
 * are filled from the same public record the rest of this site uses, plus a
 * customization studio so a visitor can restyle their own view the way the old
 * profile HTML box used to let people rewrite a page.
 *
 * Two rules are load-bearing here and are enforced by tests:
 *  1. Everything rendered server-side comes from the committed record. The
 *     studio only changes how a visitor *sees* the page, in their own browser.
 *  2. Visitor-authored CSS/HTML is treated as untrusted input. CSS is stripped
 *     of the legacy expression/behavior hooks and any `</style>` breakout; the
 *     HTML module is rendered inside a sandboxed iframe so it can never read
 *     this page or its storage.
 */

/** Stable id for every module a visitor can move or hide. */
export const NEWSPACE_SECTIONS = [
  "about",
  "agenda",
  "interests",
  "meet",
  "friends",
  "wall",
  "custom",
] as const;

export type NewspaceSectionId = (typeof NEWSPACE_SECTIONS)[number];

/** Labels shown in the studio's module manager. */
export const SECTION_LABELS: Record<NewspaceSectionId, string> = {
  about: "About Me",
  agenda: "Next public meeting",
  interests: "Interests",
  meet: "Who I'd like to meet",
  friends: "My Top 8 Friends",
  wall: "Friend Space",
  custom: "Your custom HTML module",
};

export type NewspacePattern = "none" | "stars" | "grid" | "plaid";

export type NewspaceCustomization = {
  name: string;
  headline: string;
  status: string;
  song: string;
  location: string;
  accent: string;
  pattern: NewspacePattern;
  hidden: NewspaceSectionId[];
  order: NewspaceSectionId[];
  css: string;
  html: string;
  allowScripts: boolean;
  arenaUrl: string;
};

export const NEWSPACE_STORAGE_KEY = "mynewspace.custom.v1";

/**
 * Arena does not publish a documented embeddable widget, so the window URL is a
 * visitor-editable setting rather than a hard-coded partner endpoint: it defaults
 * to the public Arena agent page and the studio says plainly that embedding is
 * up to Arena's own frame policy. The code console is the path that always works.
 */
export const DEFAULT_ARENA_URL = "https://arena.ai/agent";

export const NEWSPACE_DEFAULTS: NewspaceCustomization = Object.freeze({
  name: "",
  headline: "",
  status: "",
  song: "",
  location: "",
  accent: "#ffcc33",
  pattern: "none",
  hidden: [],
  order: [...NEWSPACE_SECTIONS],
  css: "",
  html: "",
  allowScripts: false,
  arenaUrl: DEFAULT_ARENA_URL,
});

const SECTION_SET = new Set<string>(NEWSPACE_SECTIONS);
const PATTERN_SET = new Set<string>(["none", "stars", "grid", "plaid"]);

/** Only accept a `#rrggbb` / `#rgb` colour; anything else is dropped. */
export function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : fallback;
}

function safeText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  // Control characters are how a crafted value tries to break out of an
  // attribute or a style block on the way back out of storage.
  return trimmed.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

/**
 * Neutralize the parts of CSS that were never cosmetic: the old IE `expression()`
 * and `behavior:` hooks, `@import` of a remote sheet, `data:` URLs, and every
 * angle bracket — the `</style>` breakout is the one thing a profile box cannot
 * allow. Length is capped because the result is stored in localStorage and
 * injected into the document head.
 */
export function sanitizeCustomCss(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .slice(0, 20_000)
    // Terminated or not: stylesheets have no legitimate use for an angle bracket,
    // and removing all of them makes it impossible to close the injected <style>
    // element and continue as markup.
    .replace(/<[^>]*>?/g, " ")
    .replace(/@import[^;]*;?/gi, " ")
    .replace(/expression\s*\(/gi, " ")
    .replace(/behaviou?r\s*:/gi, " ")
    .replace(/-moz-binding\s*:/gi, " ")
    .replace(/javascript\s*:/gi, " ")
    // A blocked url() has to stay syntactically dead. Leaving an open comment here
    // would silently swallow the rest of the visitor's own sheet.
    .replace(/url\s*\(\s*["']?\s*data:/gi, "url(blocked:");
}

/**
 * Hide the module affordances a profile box should not contain, then hand the
 * rest to a sandboxed iframe. `sandbox=""` means: no scripts, no same-origin,
 * no top navigation, no popups, no forms.
 */
export function prepareCustomModule(html: string): string {
  const body = (typeof html === "string" ? html : "")
    .slice(0, 40_000)
    .replace(/<(meta|base)\b[^>]*>/gi, " ");
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<style>",
    "html,body{margin:0;padding:0;background:transparent;",
    "font:11px Verdana,Geneva,'DejaVu Sans',sans-serif;color:#12233f}",
    "a{color:#003399}img{max-width:100%;height:auto}",
    "body{padding:10px}",
    "</style></head><body>",
    body,
    "</body></html>",
  ].join("");
}

/** Escape a string for use inside a double-quoted HTML attribute (srcdoc). */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Coerce anything read from storage into a valid customization. */
export function normalizeCustomization(raw: unknown): NewspaceCustomization {
  if (!raw || typeof raw !== "object") return { ...NEWSPACE_DEFAULTS };
  const value = raw as Record<string, unknown>;

  const order = Array.isArray(value.order) ? value.order.filter((id): id is NewspaceSectionId => SECTION_SET.has(String(id))) : [];
  const missing = NEWSPACE_SECTIONS.filter((id) => !order.includes(id));
  const hidden = Array.isArray(value.hidden) ? value.hidden.filter((id): id is NewspaceSectionId => SECTION_SET.has(String(id))) : [];

  const arenaUrl = typeof value.arenaUrl === "string" ? value.arenaUrl.trim() : "";
  const parsedArena = /^https:\/\/[^\s]+$/i.test(arenaUrl) ? arenaUrl : DEFAULT_ARENA_URL;

  return {
    name: safeText(value.name, NEWSPACE_DEFAULTS.name, 40),
    headline: safeText(value.headline, NEWSPACE_DEFAULTS.headline, 120),
    status: safeText(value.status, NEWSPACE_DEFAULTS.status, 90),
    song: safeText(value.song, NEWSPACE_DEFAULTS.song, 80),
    location: safeText(value.location, NEWSPACE_DEFAULTS.location, 60),
    accent: safeColor(value.accent, NEWSPACE_DEFAULTS.accent),
    pattern: PATTERN_SET.has(String(value.pattern)) ? (value.pattern as NewspacePattern) : "none",
    hidden: [...new Set(hidden)],
    // Unknown ids are dropped and absent ones are appended, so a saved profile
    // from an older build still renders every module exactly once.
    order: [...order, ...missing],
    css: typeof value.css === "string" ? value.css.slice(0, 20_000) : "",
    html: typeof value.html === "string" ? value.html.slice(0, 40_000) : "",
    allowScripts: value.allowScripts === true,
    // https only: the frame is opened by a click, but a downgrade would still be
    // a plain-text origin for whatever the visitor types into it.
    arenaUrl: parsedArena,
  };
}

export type NewspaceModule = {
  name: string;
  headline: string;
  status: string;
  song: string;
  location: string;
  accent: string;
  pattern: NewspacePattern;
  css: string;
  html: string;
  allowScripts: boolean;
  arenaUrl: string;
};

/**
 * Fallbacks are the server-rendered record values, so a visitor who never opens
 * the studio sees the real thing, and one who blanks a field gets it back rather
 * than an empty paragraph.
 */
export function resolveModule(custom: NewspaceCustomization, fallback: NewspaceModule): NewspaceModule {
  return {
    name: custom.name || fallback.name,
    headline: custom.headline || fallback.headline,
    status: custom.status || fallback.status,
    song: custom.song || fallback.song,
    location: custom.location || fallback.location,
    accent: custom.accent,
    pattern: custom.pattern,
    css: custom.css,
    html: custom.html,
    allowScripts: custom.allowScripts,
    arenaUrl: custom.arenaUrl,
  };
}

/**
 * Layout rules for the studio's module manager. Order and visibility are applied
 * as CSS so the server-rendered document keeps its real text — a visitor's
 * private layout preference must never change what a crawler or a neighbour
 * reads, and it means the page still works with scripts disabled.
 */
export function buildLayoutCss(custom: NewspaceCustomization): string {
  const hidden = new Set(custom.hidden);
  const rules = custom.order.map((id, index) => `#nsp-sec-${id}{order:${index + 1}}`);
  for (const id of hidden) rules.push(`#nsp-sec-${id}{display:none}`);
  return rules.join("");
}

/**
 * Studio prompt recipes. Each one asks Arena for a change expressed in the
 * tokens this page actually publishes, so the answer is paste-ready rather than
 * a generic stylesheet.
 */
export type NewspaceRecipe = {
  id: string;
  title: string;
  blurb: string;
  prompt: (facts: Record<string, string>) => string;
};

const CONTRACT_RULES =
  "Keep text readable: WCAG AA contrast for body text, never white-on-white or black-on-black, and wrap any animation in @media (prefers-reduced-motion: no-preference).";

export const NEWSPACE_RECIPES: NewspaceRecipe[] = [
  {
    id: "marquee",
    title: "Scrolling motto bar",
    blurb: "The classic <marquee> header line, rebuilt as CSS that respects reduced motion.",
    prompt: (facts) =>
      `Write CSS for my MyNewSpace profile page. Make a scrolling ticker under the profile header that repeats this line: ` +
      `"${facts.headline} · ${facts.status}". ` +
      `Target #nsp-custom-css hooks or a class you define, and also give me the matching HTML for the custom module box using a modern CSS animation instead of the <marquee> tag. ` +
      `${CONTRACT_RULES}`,
  },
  {
    id: "darkmode",
    title: "2006 dark side theme",
    blurb: "Navy-and-black with a tiled star field, the 'my profile, my rules' look.",
    prompt: () =>
      `Write a CSS theme for my MyNewSpace profile page: near-black background, a subtle repeating star/grid pattern, ` +
      `hot-yellow section headers, and link colours that still pass contrast on the dark background. ` +
      `Use only the documented section ids (#nsp-modules, #nsp-sec-about, #nsp-sec-agenda, #nsp-sec-interests, ` +
      `#nsp-sec-friends, #nsp-sec-wall, #nsp-sec-custom) and the --nsp-accent variable. ${CONTRACT_RULES} ` +
      `Return only the CSS, no markdown fences.`,
  },
  {
    id: "record",
    title: "Put the record first",
    blurb: "Reorder and enlarge the public-meeting module so the agenda leads the page.",
    prompt: (facts) =>
      `Write CSS for my MyNewSpace profile page so the "Next public meeting" module reads like a masthead: ` +
      `it is the first module, its header is ${facts.accent}, and its body is larger text with a left rule. ` +
      `Do not hide any other module. ${CONTRACT_RULES}`,
  },
  {
    id: "top8",
    title: "Rework the Top 8 grid",
    blurb: "Turn the friends grid into a statewide map-ish layout with pop names.",
    prompt: () =>
      `Write CSS for the "My Top 8 Friends" module on my MyNewSpace profile page: a responsive grid of square tiles, ` +
      `each tile showing the place name and population under a 1px bevel border with a hover state, ` +
      `and no layout shift on hover. Keep it legible at 320px wide. ${CONTRACT_RULES}`,
  },
];

/**
 * The data sheet a visitor can hand to Arena so generated code refers to real
 * values instead of invented ones.
 */
export function buildFactSheet(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}
