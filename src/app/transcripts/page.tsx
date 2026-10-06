import type { Metadata } from "next";
import transcriptTree from "@/data/transcript-tree.json";
import { ARCHIVE_OWNER, MEETINGS, TRANSCRIPT_REPO, type Meeting } from "@/lib/civic-data";
import { SITE_NAME, SITE_URL, siteUrl } from "@/lib/site-config";

const LOCAL_TRANSCRIPT_REPO = "TheReelWindyCity";
const archiveUrl = siteUrl("transcripts/");
const snapshotTranscriptFiles = transcriptTree.tree
  .filter((entry) => entry.type === "blob" && entry.path.startsWith("cheyenne-2026-transcripts/") && entry.path.toLowerCase().endsWith(".md") && entry.path !== "cheyenne-2026-transcripts/README.md")
  .map((entry) => {
    const path = entry.path;
    const relatedMeeting = MEETINGS.find((meeting) => meeting.transcripts?.some((transcript) => transcript.path === path));
    const dateMatch = path.match(/^cheyenne-\d{4}-transcripts\/[^/]+\/(\d{4}-\d{2}-\d{2})/);
    return { path, repo: TRANSCRIPT_REPO, relatedMeeting, date: dateMatch?.[1] ?? "", size: entry.size ?? 0, local: false as const, publicPath: undefined };
  });
const localTranscriptFiles = MEETINGS.flatMap((relatedMeeting) => (relatedMeeting.transcripts ?? [])
  .filter((transcript) => transcript.local && transcript.publicPath)
  .map((transcript) => ({
    path: transcript.path,
    repo: transcript.repo,
    relatedMeeting,
    date: relatedMeeting.date,
    size: transcript.size ?? 0,
    local: true as const,
    publicPath: transcript.publicPath,
  })));
const transcriptFiles = [...snapshotTranscriptFiles, ...localTranscriptFiles]
  .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));

const description = `Browse ${transcriptFiles.length} transcript files and caption copies for Cheyenne public meetings, with links to each meeting record.`;

export const metadata: Metadata = {
  title: `Cheyenne Public Meeting Transcripts | ${SITE_NAME}`,
  description,
  alternates: { canonical: archiveUrl },
  openGraph: {
    type: "website",
    url: archiveUrl,
    siteName: SITE_NAME,
    title: `Cheyenne Public Meeting Transcripts | ${SITE_NAME}`,
    description,
  },
  twitter: { card: "summary", title: `Cheyenne Public Meeting Transcripts | ${SITE_NAME}`, description },
};

function githubSourceUrl(repo: string, path: string): string {
  return `https://github.com/${ARCHIVE_OWNER}/${encodeURIComponent(repo)}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function labelFor(path: string, meeting?: Meeting): string {
  if (meeting) return `${meeting.bodyLabel} transcript · ${meeting.dateLabel}`;
  return path.split("/").pop()?.replace(/\.md$/i, "").replace(/-/g, " ") ?? path;
}

export default function TranscriptArchivePage() {
  return (
    <div className="seo-page">
      <header className="seo-site-header">
        <a className="seo-brand" href={SITE_URL}>
          <span>{SITE_NAME}</span>
          <small>Independent index of Cheyenne public records</small>
        </a>
        <nav aria-label="Site navigation">
          <a href={siteUrl("meetings/")}>All meetings</a>
          <a href={siteUrl("hub/")}>Live Government Hub</a>
          <a href={SITE_URL}>Civic Cheyenne home</a>
          <a href="https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas" target="_blank" rel="noreferrer">Official city records</a>
        </nav>
      </header>

      <main className="seo-container seo-transcript-page">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <a href={SITE_URL}>Home</a><span aria-hidden="true">/</span>
          <a href={siteUrl("meetings/")}>Meeting archive</a><span aria-hidden="true">/</span>
          <span>Transcript archive</span>
        </nav>
        <header className="seo-page-heading">
          <p className="seo-eyebrow">TIMESTAMPED PUBLIC-MEETING CAPTIONS</p>
          <h1>Cheyenne public meeting transcripts</h1>
          <p className="seo-lede">
            Browse {transcriptFiles.length} transcript files in the public archive, including alternate copies and locally hosted captions when available.
            Each entry links to its meeting record and its repository source where applicable.
          </p>
          <p className="seo-capture-note">Transcripts and captions may be automatically generated and can misidentify people. Verify names and quotations against the official meeting video or minutes.</p>
        </header>

        <section className="seo-card" aria-labelledby="transcript-list-heading">
          <div className="seo-archive-year-heading">
            <div>
              <p className="seo-eyebrow">PUBLIC TRANSCRIPT ARCHIVES</p>
              <h2 id="transcript-list-heading">Transcript files ({transcriptFiles.length})</h2>
            </div>
            <div className="seo-page-actions">
              <a className="seo-secondary-link" href={`https://github.com/${ARCHIVE_OWNER}/${TRANSCRIPT_REPO}`} target="_blank" rel="noreferrer">Open 2026 transcript repository</a>
              <a className="seo-secondary-link" href={`https://github.com/${ARCHIVE_OWNER}/${LOCAL_TRANSCRIPT_REPO}/tree/main/src/data/transcripts`} target="_blank" rel="noreferrer">Open locally archived captions</a>
            </div>
          </div>
          <ol className="seo-archive-links seo-transcript-links">
            {transcriptFiles.map(({ path, repo, relatedMeeting, date, size, local, publicPath }) => (
              <li key={`${repo}/${path}`}>
                <div className="seo-transcript-link-group">
                  <a href={local && publicPath ? siteUrl(publicPath) : githubSourceUrl(repo, path)} target="_blank" rel="noreferrer">
                    <span className="seo-archive-date">{relatedMeeting?.dateLabel ?? (date || "Undated transcript")}</span>
                    <strong>{labelFor(path, relatedMeeting)}</strong>
                    <small>{path.split("/").pop()}</small>
                  </a>
                  {relatedMeeting && <a className="seo-meeting-backlink" href={siteUrl(`meetings/${relatedMeeting.id}/`)}>Meeting record: {relatedMeeting.shortDate}</a>}
                  {local && <a className="seo-meeting-backlink" href={githubSourceUrl(repo, path)} target="_blank" rel="noreferrer">Repository copy · {repo}</a>}
                </div>
                <span className="seo-archive-counts">{Math.ceil(size / 1024)} KB</span>
              </li>
            ))}
          </ol>
        </section>
        <footer className="seo-footer">
          <p>Independent public-record index, not an official City of Cheyenne service.</p>
          <a href={siteUrl("meetings/")}>Browse all meeting records</a>
        </footer>
      </main>
    </div>
  );
}
