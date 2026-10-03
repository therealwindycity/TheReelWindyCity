"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowUpRight, FileText, File, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, X, Download, Bookmark, Check, LoaderCircle, AlertCircle, Link2, ExternalLink } from "lucide-react";
import Github from "./github-icon";
import { ARCHIVE_OWNER, ARCHIVE_REPO, REPOSITORIES, githubUrl, rawUrl, readableName, type SourceFile, type Bookmark as SavedBookmark } from "@/lib/civic-data";
import { fetchArchive } from "@/lib/archive";
import { loadSource, sourceContentUrl, type LoadedSource } from "@/lib/source-content";

export type SourceDocument = { title: string; kind: "document" | "text" | "binary" | "auto"; url: string; originalUrl: string; downloadUrl: string; repo?: string; path?: string; warning?: string; external?: boolean };
export function documentFromFile(file: SourceFile): SourceDocument {
  return { title: readableName(file.path), kind: /\.pdf$/i.test(file.path) ? "document" : /\.bin$/i.test(file.path) ? "auto" : /\.(md|txt|json|csv|sh|yml|yaml|js|ts|css|html)$/i.test(file.path) ? "text" : "binary", url: sourceContentUrl(file.repo, file.path), originalUrl: githubUrl(file.repo, file.path), downloadUrl: rawUrl(file.repo, file.path), repo: file.repo, path: file.path,
    warning: file.type === "Transcript" ? "This transcript uses auto-generated captions. Names and quotations should be checked against the official meeting video." : undefined,
  };
}
function formatSize(bytes: number) { return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }

export function SourceLibrary({ initialFiles, initialQuery = "", bookmarks, onOpen, onBookmark }: { initialFiles: SourceFile[]; initialQuery?: string; bookmarks: SavedBookmark[]; onOpen: (doc: SourceDocument) => void; onBookmark: (repo: string, path: string) => Promise<void> }) {
  const [repo, setRepo] = useState(ARCHIVE_REPO);
  const [files, setFiles] = useState(initialFiles);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("All sources");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(true);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, SourceFile[]>([[ARCHIVE_REPO, initialFiles]]));
  useEffect(() => { setQuery(initialQuery); setPage(1); }, [initialQuery]);
  useEffect(() => {
    let cancelled = false;
    const cached = cache.current.get(repo);
    if (cached) { setFiles(cached); setLoading(false); } else { setFiles([]); setLoading(true); }
    setError("");
    fetchArchive(repo).then((data) => { if (!cancelled) { cache.current.set(repo, data.files); setFiles(data.files); setSnapshot(data.snapshot); } }).catch((e) => { if (!cancelled && !cached) setError(e.message || "Unable to reach this archive."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repo, retry]);
  useEffect(() => { setPage(1); }, [repo, query, filter]);
  const matches = useMemo(() => files.filter((file) => {
    const p = file.path.toLowerCase();
    if (query && !p.includes(query.toLowerCase().trim())) return false;
    if (filter === "Agendas") return /(^|\/)(agenda[^/]*\.pdf|[^/]*-agenda[^/]*\.pdf)$/i.test(file.path);
    if (filter === "Supporting documents") return /supporting|attachment|agenda-packet/.test(p);
    if (filter === "Minutes") return /minute/.test(p);
    if (filter === "Transcripts") return file.type === "Transcript";
    if (filter === "Saved sources") return bookmarks.some((b) => b.repo === file.repo && b.path === file.path);
    return true;
  }).sort((a,b) => b.path.localeCompare(a.path)), [files, query, filter, bookmarks]);
  const pages = Math.max(1, Math.ceil(matches.length / 24));
  const shown = matches.slice((Math.min(page, pages) - 1) * 24, Math.min(page, pages) * 24);
  return <section className="source-library-page page-enter">
    <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> THE PUBLIC RECORD</div><h1>Every decision has a paper trail.</h1><p>Read the original records. Follow the discussion. Make up your own mind.</p></div><a className="button button-outline" href={`https://github.com/${ARCHIVE_OWNER}/${repo}`} target="_blank" rel="noreferrer"><Github size={16}/> Open repository <ArrowUpRight size={15}/></a></div>
    <div className="archive-banner"><div className="archive-banner-icon"><Github size={25}/></div><div><strong>{REPOSITORIES.find((r) => r.id === repo)?.label}</strong><span>{ARCHIVE_OWNER} / {repo}</span></div><div className="archive-index-status"><span className="status-dot"/> {snapshot ? "Repository snapshot" : "GitHub index connected"}<small>All repository files are accessible</small></div></div>
    <div className="source-toolbar"><div className="source-search"><Search size={18}/><input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meeting dates, documents, or file names…" aria-label="Search all repository source files"/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={16}/></button>}</div><div className="select-wrap"><FolderOpen size={16}/><select value={repo} onChange={(e) => { setRepo(e.target.value); setQuery(""); setFilter("All sources"); }} aria-label="Choose GitHub archive">{REPOSITORIES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select><ChevronDown size={14}/></div></div>
    <div className="source-filters">{["All sources", "Agendas", "Supporting documents", "Minutes", "Transcripts", "Saved sources"].map((name) => <button key={name} className={filter === name ? "active" : ""} onClick={() => setFilter(name)}>{name}{name === "All sources" && <span>{files.length}</span>}</button>)}</div>
    <div className="source-results-caption"><span>{loading ? "Loading the complete index…" : `${matches.length.toLocaleString()} ${matches.length === 1 ? "source" : "sources"}${query ? ` matching “${query}”` : " in this archive"}`}</span><span>Original material · no generated records</span></div>
    {loading && <div className="empty-state"><LoaderCircle className="spin" size={30}/><h3>Opening the archive</h3><p>Fetching the complete repository file index.</p></div>}
    {error && <div className="empty-state"><AlertCircle size={32}/><h3>We couldn’t reach this archive</h3><p>{error}</p><button className="button button-primary" onClick={() => setRetry((r) => r + 1)}>Try again</button><a className="text-link" href={`https://github.com/${ARCHIVE_OWNER}/${repo}`} target="_blank" rel="noreferrer">Open the original repository <ArrowUpRight size={15}/></a></div>}
    {!loading && !error && shown.length === 0 && <div className="empty-state"><FolderOpen size={34}/><h3>No matching sources</h3><p>Try another meeting date or switch to all sources. The archive may not contain records of every document type.</p><button className="button button-outline" onClick={() => { setQuery(""); setFilter("All sources"); }}>Clear filters</button></div>}
    {!loading && !error && <div className="source-file-grid">{shown.map((file) => {
      const saved = bookmarks.some((b) => b.repo === file.repo && b.path === file.path);
      const folder = file.path.includes("/") ? file.path.split("/").slice(0,-1).join("/").replace(/^\d{10}/, "") : "Repository root";
      return <article className="source-file-card" key={file.path}><button className="source-card-main" onClick={() => onOpen(documentFromFile(file))}><span className={`source-file-icon ${file.type.toLowerCase()}`}>{file.type === "Source" ? <File size={22}/> : <FileText size={22}/>}</span><span><span className="source-file-name">{readableName(file.path)}</span><span className="source-file-folder">{folder}</span><span className="source-file-meta">{file.type === "PDF" ? "Archived document" : file.type} <i/> {formatSize(file.size)}</span></span><ArrowUpRight size={16} className="source-open-arrow"/></button><button className={`source-save-button ${saved ? "saved" : ""}`} title={saved ? "Remove saved source" : "Save source to your notebook"} aria-label={saved ? `Unsave ${readableName(file.path)}` : `Save ${readableName(file.path)}`} onClick={() => void onBookmark(file.repo, file.path)}>{saved ? <Bookmark size={16} fill="currentColor"/> : <Bookmark size={16}/>}</button></article>;
    })}</div>}
    {!loading && !error && matches.length > 0 && <div className="pagination"><span>Showing {(Math.min(page, pages)-1)*24+1}–{Math.min(Math.min(page,pages)*24,matches.length)} of {matches.length.toLocaleString()} sources</span><div><button onClick={() => { setPage((p) => Math.max(1,p-1)); window.scrollTo({top:270,behavior:"smooth"}); }} disabled={page <= 1} aria-label="Previous source page"><ChevronLeft size={17}/></button><span>Page {Math.min(page,pages)} of {pages}</span><button onClick={() => { setPage((p) => Math.min(pages,p+1)); window.scrollTo({top:270,behavior:"smooth"}); }} disabled={page >= pages} aria-label="Next source page"><ChevronRight size={17}/></button></div></div>}
    <div className="source-notice"><AlertCircle size={16}/><p>This is an independent archive. Consult official adopted text and minutes for legal status. File names and automated captions can contain errors; records are shown as archived, not rewritten.</p></div>
  </section>;
}

type DocumentViewerProps = { document: SourceDocument; bookmarks: SavedBookmark[]; onClose: () => void; onBookmark: (repo: string, path: string) => Promise<void>; onCopy: (success: boolean) => void };

export function DocumentViewer({ document: doc, bookmarks, onClose, onBookmark, onCopy }: DocumentViewerProps) {
  const [loaded, setLoaded] = useState<LoadedSource | null>(doc.external ? { kind: "binary" } : null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const old = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const modal = close.current?.closest("[role='dialog']");
        const focusable = modal?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),textarea,input,iframe");
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length-1];
        if (e.shiftKey && window.document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && window.document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.document.body.style.overflow = old; window.removeEventListener("keydown", handleKey); };
  }, [onClose]);
  useEffect(() => {
    if (doc.external) { setLoaded(null); return; }
    let cancelled = false;
    setLoaded(null);
    loadSource(doc.url, doc.path || doc.url).then((result) => { if (!cancelled) setLoaded(result); });
    return () => { cancelled = true; };
  }, [doc]);
  useEffect(() => () => { if (loaded && loaded.kind === "pdf") URL.revokeObjectURL(loaded.objectUrl); }, [loaded]);
  const saved = bookmarks.some((b) => b.repo === doc.repo && b.path === doc.path);
  return <div className="modal-backdrop" onClick={onClose}><section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="source-document-title" onClick={(e) => e.stopPropagation()}><div className="document-header"><div className="document-title-icon"><FileText size={23}/></div><div><span className="eyebrow">ORIGINAL SOURCE MATERIAL</span><h2 id="source-document-title">{doc.title}</h2></div><button ref={close} className="icon-button modal-close" aria-label="Close source reader" onClick={onClose}><X size={21}/></button></div><div className="document-actions"><a className="button button-small button-outline" href={doc.originalUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Original source</a><a className="button button-small button-outline" href={doc.downloadUrl} target="_blank" rel="noreferrer"><Download size={14}/> Download</a>{doc.repo && doc.path && <button className={`button button-small ${saved ? "button-tinted" : "button-outline"}`} onClick={() => void onBookmark(doc.repo!, doc.path!)}>{saved ? <Check size={14}/> : <Bookmark size={14}/>} {saved ? "Saved to notebook" : "Save source"}</button>}<button className="button button-small button-outline document-copy" onClick={() => { void navigator.clipboard.writeText(doc.originalUrl).then(() => onCopy(true)).catch(() => onCopy(false)); }}><Link2 size={14}/> Copy source link</button></div>{doc.warning && <div className="document-warning"><AlertCircle size={15}/>{doc.warning}</div>}<div className="document-content">{doc.external ? <div className="empty-state"><ExternalLink size={40}/><h3>Read the original record</h3><p>This document is hosted at its official source. Use the buttons above to read it or download the complete record.</p><a className="button button-primary" href={doc.originalUrl} target="_blank" rel="noreferrer">Open original source <ArrowUpRight size={16}/></a></div> : !loaded ? <div className="empty-state"><LoaderCircle size={28} className="spin"/><p>Opening the original document…</p></div> : loaded.kind === "pdf" ? <iframe title={doc.title} src={loaded.objectUrl} className="document-frame"/> : loaded.kind === "html" ? <iframe title={doc.title} srcDoc={loaded.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="document-frame"/> : loaded.kind === "text" ? <pre className="document-text">{loaded.text}</pre> : loaded.kind === "binary" ? <div className="empty-state"><File size={40}/><h3>This file can be downloaded</h3><p>Archives and binary source files don’t have an inline text preview. The complete original is available below.</p><a className="button button-primary" href={doc.downloadUrl} target="_blank" rel="noreferrer"><Download size={16}/> Download original file</a></div> : <div className="empty-state"><AlertCircle size={30}/><h3>Preview unavailable</h3><p>{loaded.message}</p><a className="button button-primary" href={doc.originalUrl} target="_blank" rel="noreferrer">Read at the original source <ArrowUpRight size={16}/></a></div>}</div><div className="document-footer"><span className="status-dot"/> Original public record · no generated content<span>Having trouble viewing? Use “Original source”.</span></div></section></div>;
}
