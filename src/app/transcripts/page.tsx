import type { Metadata } from "next";
import transcriptTree from "@/data/transcript-tree.json";
import { ARCHIVE_OWNER, MEETINGS, MEETING_STATS, TRANSCRIPT_REPO, type Meeting } from "@/lib/civic-data";
import { SITE_NAME, SITE_URL, siteUrl } from "@/lib/site-config";

const archiveUrl = siteUrl("transcripts/");
const transcriptFiles = transcriptTree.tree
  .filter((entry) => entry.type === "blob" && entry.path.startsWith("cheyenne-2026-transcripts/") && entry.path.toLowerCase().endsWith(".md") && entry.path !== "cheyenne-2026-transcripts/README.md")
  .map((entry) => {
    const path = entry.path;
    const relatedMeeting = MEETINGS.find((meeting) => meeting.transcripts?.some((transcript) => transcript.path === path));
    const dateMatch = path.match(/^cheyenne-\d{4}-transcripts\/[^/]+\/(\d{4}-\d{2}-\d{2})/);
    return { path, relatedMeeting, date: dateMatch?.[1] ?? "", size: entry.size ?? 0 };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));

const description = `Browse ${MEETING_STATS.totalTranscripts} timestamped Cheyenne public-meeting transcripts, including cleaned and alternate transcript copies, with links to each meeting record.`;

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

function sourceUrl(path: string): string {
  return `https://github.com/${ARCHIVE_OWNER}/${TRANSCRIPT_REPO}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;
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
            Browse {MEETING_STATS.totalTranscripts} timestamped transcript files in the public archive, plus alternate cleaned copies where both versions were preserved.
            Each entry links to its original transcript repository and, when matched, to its individual meeting record page.
          </p>
          <p className="seo-capture-note">Transcripts and captions may be automatically generated and can misidentify people. Verify names and quotations against the official meeting video or minutes.</p>
        </header>

        <section className="seo-card" aria-labelledby="transcript-list-heading">
          <div className="seo-archive-year-heading">
            <div>
              <p className="seo-eyebrow">PUBLIC ARCHIVE · {TRANSCRIPT_REPO}</p>
              <h2 id="transcript-list-heading">Transcript files ({transcriptFiles.length})</h2>
            </div>
            <a className="seo-secondary-link" href={`https://github.com/${ARCHIVE_OWNER}/${TRANSCRIPT_REPO}`} target="_blank" rel="noreferrer">Open transcript repository</a>
          </div>
          <ol className="seo-archive-links seo-transcript-links">
            {transcriptFiles.map(({ path, relatedMeeting, date, size }) => (
              <li key={path}>
                <div className="seo-transcript-link-group">
                  <a href={sourceUrl(path)} target="_blank" rel="noreferrer">
                    <span className="seo-archive-date">{relatedMeeting?.dateLabel ?? (date || "Undated transcript")}</span>
                    <strong>{labelFor(path, relatedMeeting)}</strong>
                    <small>{path.split("/").pop()}</small>
                  </a>
                  {relatedMeeting && <a className="seo-meeting-backlink" href={siteUrl(`meetings/${relatedMeeting.id}/`)}>Meeting record: {relatedMeeting.shortDate}</a>}
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
