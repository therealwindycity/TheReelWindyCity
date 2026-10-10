"use client";

import { useEffect, useState } from "react";
import {
  buildLayoutCss,
  escapeAttribute,
  prepareCustomModule,
  resolveModule,
  sanitizeCustomCss,
  type NewspaceModule,
} from "@/lib/newspace";
import { useNewspace } from "@/lib/newspace-store";

/**
 * Injects the visitor's own layer: layout rules (module order/visibility), the
 * accent variable, and whatever CSS the studio holds. Nothing here runs before
 * hydration, so the exported HTML in `out/` is always the plain, readable page.
 */
export function NewspaceStyle() {
  const custom = useNewspace();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nspPattern = custom.pattern;
    root.style.setProperty("--nsp-accent", custom.accent);
  }, [custom.pattern, custom.accent]);

  useEffect(() => {
    const id = "nsp-custom-css";
    let tag = document.getElementById(id) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = id;
      tag.setAttribute("data-source", "mynewspace-studio");
      document.head.appendChild(tag);
    }
    // Order matters: the visitor's sheet comes last so it can win over the
    // studio's own layout rules the way a profile override used to.
    tag.textContent = [buildLayoutCss(custom), sanitizeCustomCss(custom.css)].join("\n");
  }, [custom]);

  return null;
}

/** A text field a visitor may have overwritten in their own browser. */
export function NewspaceText({
  field,
  module,
}: {
  field: "name" | "headline" | "status" | "song" | "location";
  module: NewspaceModule;
}) {
  const custom = useNewspace();
  const resolved = resolveModule(custom, module);
  const value = resolved[field];
  // Text fields fall back to the published record value, so blanking a field in
  // the studio restores reality rather than leaving a hole in the page.
  const customized = value !== module[field];
  return (
    <>
      {value}
      {customized && (
        <span
          className="nsp-custom-flag"
          title="Only this browser sees this. Saved in localStorage, never published."
        >
          yours
        </span>
      )}
    </>
  );
}

/**
 * The custom HTML module — the old profile box, with the 2006 hole in it closed.
 *
 * Your markup is rendered into a `srcdoc` iframe with `sandbox` and no
 * same-origin access, so a `<marquee>` still scrolls and a table still lays out,
 * but the module cannot read this page, this browser's storage, or a session that
 * does not exist. Scripts are off unless you turn them on, and even then they run
 * in that sealed frame.
 */
export function NewspaceCustomModule({ fallbackNote }: { fallbackNote: string }) {
  const custom = useNewspace();
  const [doc, setDoc] = useState<{ src: string; scripts: boolean } | null>(null);

  useEffect(() => {
    if (!custom.html.trim()) {
      setDoc(null);
      return;
    }
    setDoc({ src: escapeAttribute(prepareCustomModule(custom.html)), scripts: custom.allowScripts });
  }, [custom.html, custom.allowScripts]);

  if (!doc) {
    return <p className="nsp-empty">{fallbackNote}</p>;
  }

  return (
    <div className="nsp-module-frame-wrap">
      <iframe
        className="nsp-module-frame"
        title="Your custom profile module"
        // No src is set on the server; this frame only ever exists after you have
        // saved markup in the studio, and its content comes from your own browser.
        srcDoc={doc.src}
        sandbox={doc.scripts ? "allow-scripts" : ""}
        referrerPolicy="no-referrer"
      />
      <p className="nsp-module-frame-note">
        Sealed frame · {doc.scripts ? "scripts allowed inside it" : "scripts disabled"} · cannot read this page or your
        storage
      </p>
    </div>
  );
}

/** The 2006 autoplay slot, honestly: a label, not a player. */
export function NewspaceSong({ fallback }: { fallback: string }) {
  const custom = useNewspace();
  const song = custom.song || fallback;
  return (
    <p className="nsp-song">
      <span className="nsp-song-note">PROFILE SONG</span>
      <strong>{song}</strong>
      <small>No file, no autoplay — this site publishes a document, not a sound.</small>
    </p>
  );
}
