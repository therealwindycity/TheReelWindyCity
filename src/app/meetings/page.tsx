import type { Metadata } from "next";
import { MEETINGS, MEETING_STATS, MEETINGS_CAPTURED, type Meeting } from "@/lib/civic-data";
import { SITE_NAME, SITE_URL, siteUrl } from "@/lib/site-config";

const archiveUrl = siteUrl("meetings/");
const earliestYear = MEETING_STATS.earliest?.slice(0, 4) ?? "2008";
const latestYear = MEETING_STATS.latest?.slice(0, 4) ?? "present";
const archiveDescription = `Browse ${MEETING_STATS.totalMeetings.toLocaleString()} indexed Cheyenne public meetings from ${earliestYear} through ${latestYear}, with links to official records, archived documents, and available transcripts.`;

export const metadata: Metadata = {
  title: `Cheyenne Public Meeting Archive, ${earliestYear}–${latestYear} | ${SITE_NAME}`,
  description: archiveDescription,
  alternates: { canonical: archiveUrl },
  openGraph: {
    type: "website",
    url: archiveUrl,
    siteName: SITE_NAME,
    title: `Cheyenne Public Meeting Archive, ${earliestYear}–${latestYear}`,
    description: archiveDescription,
  },
  twitter: {
    card: "summary",
    title: `Cheyenne Public Meeting Archive, ${earliestYear}–${latestYear}`,
    description: archiveDescription,
  },
};

function groupMeetings(): Array<{ label: string; meetings: Meeting[] }> {
  const groups = new Map<string, Meeting[]>();
  for (const meeting of MEETINGS) {
    const label = meeting.upcoming ? "Upcoming agendas" : meeting.date.slice(0, 4);
    const items = groups.get(label) ?? [];
    items.push(meeting);
    groups.set(label, items);
  }
  return [...groups].map(([label, meetings]) => ({ label, meetings }));
}

function sectionId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const collectionData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${archiveUrl}#collection`,
  url: archiveUrl,
  name: `Cheyenne Public Meeting Archive, ${earliestYear}–${latestYear}`,
  description: archiveDescription,
  isPartOf: { "@id": `${SITE_URL}#website` },
  inLanguage: "en-US",
};

export default function MeetingArchivePage() {
  const groups = groupMeetings();

  return (
    <div className="seo-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionData).replace(/</g, "\\u003c") }}
      />
      <header className="seo-site-header">
        <a className="seo-brand" href={SITE_URL}>
          <span>{SITE_NAME}</span>
          <small>Independent index of Cheyenne public records</small>
        </a>
        <nav aria-label="Site navigation">
          <a href={SITE_URL}>Civic Cheyenne home</a>
          <a href={siteUrl("transcripts/")}>Transcript archive</a>
          <a href="https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas" target="_blank" rel="noreferrer">
            Official city records
          </a>
        </nav>
      </header>

      <main className="seo-container seo-archive-page">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <a href={SITE_URL}>Home</a><span aria-hidden="true">/</span><span>Meeting archive</span>
        </nav>

        <header className="seo-page-heading">
          <p className="seo-eyebrow">PUBLIC RECORDS · CHEYENNE, WYOMING</p>
          <h1>Cheyenne public meeting archive</h1>
          <p className="seo-lede">
            Browse {MEETING_STATS.totalMeetings.toLocaleString()} meeting entries across nine government bodies, from {MEETING_STATS.earliest} through {MEETING_STATS.latest}.
            Each record page lists available official links, archived repository files, and a timestamped transcript where one is indexed.
          </p>
          <p className="seo-capture-note">Archive and official-link snapshot captured {MEETINGS_CAPTURED}. Upcoming agenda details may change; check the linked city source for updates.</p>
        </header>

        <section className="seo-stats-grid" aria-label="Archive coverage statistics">
          <div><strong>{MEETING_STATS.pastMeetings.toLocaleString()}</strong><span>historical meeting entries</span></div>
          <div><strong>{MEETING_STATS.upcomingMeetings.toLocaleString()}</strong><span>posted agenda snapshots</span></div>
          <div><strong>{MEETING_STATS.totalDocuments.toLocaleString()}</strong><span>archived documents indexed</span></div>
          <div><strong>{MEETING_STATS.totalTranscripts.toLocaleString()}</strong><span>timestamped transcript files</span></div>
        </section>

        <nav className="seo-year-nav" aria-label="Jump to a year">
          <span>Jump to:</span>
          {groups.map((group) => (
            <a key={group.label} href={`#${sectionId(group.label)}`}>{group.label}</a>
          ))}
        </nav>

        <div className="seo-archive-groups">
          {groups.map((group) => (
            <section className="seo-card seo-archive-year" id={sectionId(group.label)} key={group.label} aria-labelledby={`${sectionId(group.label)}-heading`}>
              <div className="seo-archive-year-heading">
                <div>
                  <p className="seo-eyebrow">{group.label === "Upcoming agendas" ? "AGENDA POSTED" : "ARCHIVE YEAR"}</p>
                  <h2 id={`${sectionId(group.label)}-heading`}>{group.label}</h2>
                </div>
                <span>{group.meetings.length.toLocaleString()} meeting entries</span>
              </div>
              <ol className="seo-archive-links">
                {group.meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <a href={siteUrl(`meetings/${meeting.id}/`)}>
                      <span className="seo-archive-date">{meeting.dateLabel}</span>
                      <strong>{meeting.bodyLabel}</strong>
                      {meeting.notes?.length ? <small>{meeting.notes.join(" · ")}</small> : null}
                      {!meeting.notes?.length && meeting.upcoming ? <small>Agenda posted · {meeting.items?.length ?? 0} items</small> : null}
                    </a>
                    <span className="seo-archive-counts">
                      {meeting.docs.length ? `${meeting.docs.length} file${meeting.docs.length === 1 ? "" : "s"}` : "Official links"}
                      {meeting.transcript ? " · transcript" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <footer className="seo-footer">
          <p>This is an independent civic-learning index, not an official City of Cheyenne service. Agenda entries are proposals, not recorded decisions.</p>
          <a href={SITE_URL}>Civic Cheyenne home</a>
        </footer>
      </main>
    </div>
  );
}
