import { useSyncExternalStore } from "react";
import {
  NEWSPACE_DEFAULTS,
  NEWSPACE_STORAGE_KEY,
  normalizeCustomization,
  type NewspaceCustomization,
} from "./newspace";

/**
 * The one mutable thing about a MyNewSpace profile: what *this browser* has
 * chosen to look like.
 *
 * Server output never changes — the record is the record — so the store starts at
 * the frozen defaults on both the server and the first client render, and only
 * reads localStorage after mount. That ordering is what keeps the static export
 * hydration-clean and keeps the page readable with scripts switched off.
 */
let current: NewspaceCustomization = NEWSPACE_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStorage(): NewspaceCustomization | null {
  try {
    const raw = window.localStorage.getItem(NEWSPACE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeCustomization(JSON.parse(raw));
  } catch {
    // A disabled/blocked storage area or hand-edited JSON is not an error worth
    // surfacing: the profile simply renders with the published defaults.
    return null;
  }
}

function writeStorage(next: NewspaceCustomization) {
  try {
    window.localStorage.setItem(NEWSPACE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy mode: the change still applies for this view, it just
    // will not survive a reload. The studio says so after saving.
  }
}

export function hydrateNewspace(): NewspaceCustomization {
  if (!loaded) {
    loaded = true;
    const stored = readStorage();
    if (stored) {
      current = stored;
      emit();
    }
  }
  return current;
}

export function patchNewspace(patch: Partial<NewspaceCustomization>): NewspaceCustomization {
  // normalizeCustomization runs on the merged object so a partial write cannot
  // smuggle in an unknown section id, a non-https embed URL, or an oversize blob.
  current = normalizeCustomization({ ...current, ...patch });
  writeStorage(current);
  emit();
  return current;
}

export function resetNewspace() {
  current = { ...NEWSPACE_DEFAULTS };
  try {
    window.localStorage.removeItem(NEWSPACE_STORAGE_KEY);
  } catch {
    /* a browser that will not write will still accept an in-memory reset */
  }
  emit();
}

function getSnapshot(): NewspaceCustomization {
  return current;
}

function getServerSnapshot(): NewspaceCustomization {
  return NEWSPACE_DEFAULTS;
}

export function useNewspace(): NewspaceCustomization {
  // `hydrateNewspace` doubles as the snapshot reader: localStorage is consulted on
  // the first read, once, and only in the browser. The server snapshot stays the
  // frozen default, which is exactly what the exported HTML was built from, so
  // there is no hydration mismatch and no effect-driven re-render to schedule.
  return useSyncExternalStore(subscribe, hydrateNewspace, () => NEWSPACE_DEFAULTS);
}
