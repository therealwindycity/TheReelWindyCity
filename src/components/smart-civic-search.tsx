"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, CalendarDays, Clock3, FileText, Landmark, LoaderCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { SourceDocument } from "./source-library";
import {
  embedCandidates,
  ensureDocumentEmbeddings,
  generateEmbedding,
  hitToDocument,
  indexHasEmbeddings,
  initEmbeddingModel,
  lexicalSearch,
  loadVectorIndex,
  localSemanticSearch,
  type SearchHit,
  type VectorIndex,
} from "@/lib/vectorSearch";

const SUGGESTIONS = [
  "zoning updates in Ward 1",
  "affordable housing budget",
  "accessory dwelling parking",
  "administrative inspection warrants",
  "East Cheyenne annexation",
];

export function SmartCivicSearch({
  compact = false,
  onOpenSource,
  onOpenMeeting,
  onOpenOrdinance,
}: {
  compact?: boolean;
  onOpenSource?: (doc: SourceDocument) => void;
  onOpenMeeting?: (id: string) => void;
  onOpenOrdinance?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Semantic engine idle");
  const [error, setError] = useState("");
  const [index, setIndex] = useState<VectorIndex | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [mode, setMode] = useState<"lexical" | "semantic" | "hybrid">("lexical");

  useEffect(() => {
    let cancelled = false;
    loadVectorIndex()
      .then((data) => {
        if (cancelled) return;
        setIndex(data);
        const compiled = indexHasEmbeddings(data);
        setStatus(
          compiled
            ? `Compiled index ready · ${data.itemCount.toLocaleString()} records`
            : `Corpus ready · ${data.itemCount.toLocaleString()} records · first semantic query indexes locally`,
        );
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Unable to load the compiled transcript index.");
          setStatus("Index unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    initEmbeddingModel()
      .then(() => {
        if (cancelled) return;
        setModelReady(true);
        setStatus((current) =>
          current.startsWith("Index unavailable") ? current : "Local WebAssembly model ready",
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("Lexical search ready · WASM model blocked on this network");
      });
    return () => {
      cancelled = true;
    };
  }, [compact]);

  const caption = useMemo(() => {
    if (!index) return "Loading the compiled transcript index…";
    return `${index.itemCount.toLocaleString()} precompiled civic records · MiniLM-L6 · zero server cost`;
  }, [index]);

  async function runSearch(raw: string) {
    const nextQuery = raw.trim();
    if (!nextQuery) return;
    setQuery(nextQuery);
    setLoading(true);
    setError("");
    try {
      const data = index ?? (await loadVectorIndex());
      if (!index) setIndex(data);

      const poolSize = compact ? 24 : 40;
      const topK = compact ? 3 : 5;
      const lexicalHits = lexicalSearch(nextQuery, data.items, poolSize);
      setResults(lexicalHits.slice(0, topK));
      setMode("lexical");

      setStatus("Embedding your question on-device…");
      if (!modelReady) await initEmbeddingModel();
      setModelReady(true);

      const queryVector = await generateEmbedding(nextQuery);
      let semanticHits: SearchHit[];
      if (indexHasEmbeddings(data)) {
        const vectors = await ensureDocumentEmbeddings(data);
        semanticHits = localSemanticSearch(queryVector, data.items, vectors, topK);
      } else {
        const candidates = lexicalHits.length ? lexicalHits : data.items.slice(0, poolSize);
        setStatus(`Reranking ${candidates.length} compiled records in WebAssembly…`);
        const vectors = await embedCandidates(candidates, (done, total) => {
          setStatus(`Reranking compiled records… ${done}/${total}`);
        });
        semanticHits = localSemanticSearch(queryVector, candidates, vectors, topK);
      }
      const merged = mergeDisplayed(semanticHits, lexicalHits.slice(0, topK), topK);
      setResults(merged);
      setMode(lexicalHits.length ? "hybrid" : "semantic");
      setStatus("Semantic Engine Ready (Local WebAssembly Active)");
    } catch (err) {
      console.error(err);
      setError("Semantic search could not finish. Keyword matches from the compiled index are shown when available.");
      setStatus("Keyword fallback");
    } finally {
      setLoading(false);
    }
  }

  function openHit(hit: SearchHit) {
    if (hit.kind === "ordinance" && onOpenOrdinance) {
      onOpenOrdinance(hit.id.replace(/^ordinance:/, ""));
      return;
    }
    if (hit.kind === "meeting" && hit.meetingId && onOpenMeeting) {
      onOpenMeeting(hit.meetingId);
      return;
    }
    if (onOpenSource) onOpenSource(hitToDocument(hit));
    else window.open(hit.videoUrl || hit.sourceUrl, "_blank", "noreferrer");
  }

  return (
    <section className={`semantic-engine ${compact ? "compact" : ""}`} aria-label="Civic semantic search">
      <div className="semantic-engine-header">
        <div>
          <div className="eyebrow">
            <Sparkles size={13} /> {compact ? "ASK THIS RECORD" : "CLIENT-SIDE RAG · WASM"}
          </div>
          <h3>{compact ? "Ask a question of the public record." : "Civic Cheyenne Semantic Engine"}</h3>
          {!compact && <p>{caption}</p>}
        </div>
        <span className={`semantic-status ${modelReady ? "ready" : ""}`}>{status}</span>
      </div>

      <form
        className="semantic-form"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <div className="source-search semantic-input">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a natural question (e.g., “zoning updates in Ward 1” or “affordable housing budget”)…"
            aria-label="Semantic search of council records"
          />
        </div>
        <button className="button button-primary" type="submit" disabled={loading || !query.trim()}>
          {loading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          {loading ? "Searching…" : "Analyze"}
        </button>
      </form>

      {!compact && (
        <div className="semantic-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void runSearch(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="semantic-error">
          <AlertCircle size={16} />
          <p>{error}</p>
        </div>
      )}

      <div className="semantic-results" aria-live="polite">
        {results.map((hit) => (
          <article key={hit.id} className="semantic-hit">
            <button className="semantic-hit-main" onClick={() => openHit(hit)}>
              <div className="semantic-hit-topline">
                <span className="pill pill-neutral">{labelForKind(hit.kind)}</span>
                <span className="semantic-score">Match: {(Math.max(0, hit.confidenceScore) * 100).toFixed(1)}%</span>
              </div>
              {hit.title && <h4>{hit.title}</h4>}
              <p>“{truncate(hit.text, compact ? 220 : 360)}”</p>
            </button>
            <div className="semantic-hit-meta">
              <span>
                <CalendarDays size={13} /> {hit.meetingDate}
              </span>
              {hit.timestamp && (
                <span>
                  <Clock3 size={13} /> {hit.timestamp}
                </span>
              )}
              <a href={hit.videoUrl || hit.sourceUrl} target="_blank" rel="noreferrer">
                <FileText size={13} /> View verified source <ArrowUpRight size={12} />
              </a>
            </div>
          </article>
        ))}
        {results.length === 0 && !loading && (
          <p className="semantic-empty">
            Enter a conceptual query to instantly search compiled transcripts, ordinances, and meeting records.
          </p>
        )}
      </div>

      <div className="semantic-footnote">
        <ShieldCheck size={15} />
        <p>
          Every hit cites its original date, timestamp, and source URL. Captions can misidentify names — check the official
          video. {mode === "lexical" ? "Showing keyword matches until the on-device model finishes." : "Ranked with on-device MiniLM cosine similarity."}
        </p>
        {!compact && (
          <span>
            <Landmark size={13} /> No API keys · no server embeddings
          </span>
        )}
      </div>
    </section>
  );
}

function mergeDisplayed(semantic: SearchHit[], lexical: SearchHit[], topK: number): SearchHit[] {
  const byId = new Map<string, SearchHit>();
  for (const hit of semantic) byId.set(hit.id, hit);
  for (const hit of lexical) {
    if (!byId.has(hit.id)) byId.set(hit.id, { ...hit, confidenceScore: Math.min(hit.confidenceScore, 0.6) });
  }
  return [...byId.values()].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, topK);
}

function labelForKind(kind: SearchHit["kind"]): string {
  if (kind === "transcript") return "Transcript";
  if (kind === "ordinance") return "Ordinance";
  return "Meeting";
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
