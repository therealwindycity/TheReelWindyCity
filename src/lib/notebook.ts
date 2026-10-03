import { ORDINANCES, type Bookmark, type CivicProgress } from "./civic-data";

/**
 * Personal civic notebook, persisted in the visitor's browser (localStorage).
 *
 * The original deployment stored reflections in PostgreSQL; GitHub Pages is a
 * static host, so the notebook lives client-side. Reflections never leave the
 * visitor's browser and can be exported as JSON from the notebook page.
 */
const KEY = "civic-notebook-v1";
const STAGES = ["read", "watch", "impact", "reflect"];
const POSITIONS = ["support", "questions", "oppose"];

export type NotebookState = { progress: CivicProgress[]; bookmarks: Bookmark[] };

const EMPTY: NotebookState = { progress: [], bookmarks: [] };

function isValid(state: unknown): state is NotebookState {
  return !!state && typeof state === "object" && Array.isArray((state as NotebookState).progress) && Array.isArray((state as NotebookState).bookmarks);
}

export function loadNotebook(): NotebookState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function persist(state: NotebookState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function saveProgress(ordinanceId: string, stage: string, position: string | null, reflection: string): { progress?: CivicProgress; error?: string } {
  if (!ORDINANCES.some((o) => o.id === ordinanceId) || !STAGES.includes(stage)) return { error: "Choose a valid ordinance and reading stage." };
  if (position != null && !POSITIONS.includes(position)) return { error: "Invalid reflection position." };
  if (typeof reflection !== "string" || reflection.length > 5000) return { error: "Reflections must be 5,000 characters or fewer." };
  const state = loadNotebook();
  const record: CivicProgress = { ordinanceId, stage, position: position || null, reflection, updatedAt: new Date().toISOString() };
  const next: NotebookState = { ...state, progress: [...state.progress.filter((item) => item.ordinanceId !== ordinanceId), record] };
  if (!persist(next)) return { error: "Your notebook could not be saved in this browser." };
  return { progress: record };
}

export function toggleBookmark(repo: string, path: string): { removed?: boolean; bookmark?: Bookmark; error?: string } {
  if (!repo || typeof path !== "string" || !path || path.length > 1500) return { error: "Invalid source." };
  const state = loadNotebook();
  const existing = state.bookmarks.some((b) => b.repo === repo && b.path === path);
  const next: NotebookState = existing
    ? { ...state, bookmarks: state.bookmarks.filter((b) => !(b.repo === repo && b.path === path)) }
    : { ...state, bookmarks: [...state.bookmarks, { id: `${repo}:${path}`, repo, path }] };
  if (!persist(next)) return { error: "Your changes could not be saved in this browser." };
  return existing ? { removed: true } : { bookmark: { id: `${repo}:${path}`, repo, path } };
}
