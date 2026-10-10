"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, PenLine, Trash2 } from "lucide-react";

export type WallEntry = {
  id: string;
  author: string;
  role: string;
  at: string;
  body: string;
  sourceLabel: string;
  href: string;
};

type LocalNote = { id: string; name: string; body: string; at: string };

const NOTES_KEY = "mynewspace.notes.v1";
const MAX_NOTES = 12;

function decodeNote(raw: unknown): LocalNote | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.body !== "string" || !value.body.trim()) return null;
  return {
    id: typeof value.id === "string" ? value.id.slice(0, 40) : `${Date.now()}`,
    name: typeof value.name === "string" ? value.name.slice(0, 30) : "you",
    body: value.body.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 400),
    at: typeof value.at === "string" ? value.at.slice(0, 40) : "",
  };
}

/**
 * Friend Space: the comments left on a profile.
 *
 * The printed part is real &mdash; quoted, timestamped remarks from an archived
 * public meeting, each linked to the transcript it came from, because that is the
 * only "wall" this city actually has. What you add below it stays in this browser
 * as a note to yourself: there is no account, no queue, and nothing to moderate.
 */
export default function NewspaceWall({ entries }: { entries: WallEntry[] }) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setNotes(parsed.map(decodeNote).filter((note): note is LocalNote => note !== null));
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function persist(next: LocalNote[]) {
    setNotes(next);
    try {
      window.localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      setNotice(next.length ? "Saved in this browser only." : "Notebook empty.");
    } catch {
      setNotice("This browser refused to store notes (private mode or quota), so it lasts for this view.");
    }
  }

  function submit() {
    const text = body.trim();
    if (!text) {
      setNotice("Write something first.");
      return;
    }
    const note = decodeNote({
      id: `${Date.now()}`,
      name: name.trim() || "you",
      body: text,
      at: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    });
    if (!note) return;
    persist([note, ...notes].slice(0, MAX_NOTES));
    setBody("");
  }

  return (
    <div className="nsp-wall">
      <ol className="nsp-wall-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div className="nsp-wall-avatar" aria-hidden="true">
              {entry.author.slice(0, 1).toUpperCase()}
            </div>
            <div className="nsp-wall-body">
              <p className="nsp-wall-byline">
                <strong>{entry.author}</strong>
                <span>{entry.role}</span>
                <em>{entry.at}</em>
              </p>
              <blockquote>{entry.body}</blockquote>
              <a href={entry.href} target="_blank" rel="noopener noreferrer">
                {entry.sourceLabel} <ArrowUpRight size={11} aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ol>

      <div className="nsp-wall-compose">
        <p className="nsp-compose-label">
          <PenLine size={12} aria-hidden="true" /> Leave a note on this profile
        </p>
        <p className="nsp-compose-hint">
          The old box posted your comment to everyone. This one writes to <code>localStorage</code> in your browser,
          because a civic record should not collect unmoderated public comments about itself. Yours sits above the
          real ones while you are here.
        </p>
        <div className="nsp-compose-row">
          <input
            aria-label="Your display name"
            placeholder="display name"
            maxLength={30}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="button" className="nsp-tool nsp-tool-primary" onClick={submit}>
            Post to my view
          </button>
        </div>
        <textarea
          aria-label="Your note"
          placeholder="Say something about the record…"
          maxLength={400}
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="nsp-compose-foot">
          <span>
            {body.length}/400 · {notes.length} of {MAX_NOTES} kept
          </span>
          {notes.length > 0 && (
            <button type="button" className="nsp-tool" onClick={() => persist([])}>
              <Trash2 size={12} aria-hidden="true" /> Clear my notes
            </button>
          )}
        </div>

        {loaded && notes.length > 0 && (
          <ul className="nsp-wall-local">
            {notes.map((note) => (
              <li key={note.id}>
                <p className="nsp-wall-byline">
                  <strong>{note.name}</strong>
                  <span>your note · local</span>
                  <em>{note.at}</em>
                </p>
                <p>{note.body}</p>
                <button
                  type="button"
                  className="nsp-tool"
                  onClick={() => persist(notes.filter((item) => item.id !== note.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <p className="nsp-wall-notice" role="status" aria-live="polite">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
