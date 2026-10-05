import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARCHIVE_OWNER, MEETINGS, MEETINGS_CAPTURED, readableName, type Meeting } from "@/lib/civic-data";
import { SITE_NAME, SITE_URL, siteUrl } from "@/lib/site-config";

export const dynamic = "force-static";
export const dynamicParams = false;

type MeetingPageProps = { params: Promise<{ id: string }> };
type ExternalLink = { label: string; url: string };

function findMeeting(id: string): Meeting | undefined {
  return MEETINGS.find((meeting) => meeting.id === id);
}

function meetingQualifier(meeting: Meeting): string {
  const hasSameDayEntry = MEETINGS.some((item) => item.id !== meeting.id && item.body === meeting.body && item.date === meeting.date);
  if (!hasSameDayEntry) return "";
  const note = meeting.notes?.find((item) => !/^upcoming\b/i.test(item));
  return note ? ` · ${note}` : "";
}

function meetingName(meeting: Meeting): string {
  const qualifier = meetingQualifier(meeting);
  return `${meeting.bodyLabel}${qualifier || " Meeting"}`;
}

function meetingHeading(meeting: Meeting): string {
  return `${meetingName(meeting)} — ${meeting.dateLabel}`;
}

function meetingTitle(meeting: Meeting): string {
  return `${meetingName(meeting)} — ${meeting.shortDate} | ${SITE_NAME}`;
}

function meetingDescription(meeting: Meeting): string {
  const records: string[] = [];
  if (meeting.official.agenda) records.push("official agenda");
  if (meeting.official.minutes) records.push("official minutes");
  if (meeting.official.video) records.push("meeting video");
  const transcriptCount = meeting.transcripts?.length ?? (meeting.transcript ? 1 : 0);
  if (transcriptCount) records.push(`${transcriptCount} timestamped transcript${transcriptCount === 1 ? "" : "s"}`);
  if (meeting.docs.length) records.push(`${meeting.docs.length} archived source files`);
  if (meeting.items?.length) records.push(`${meeting.items.length} posted agenda items`);
  const summary = records.length ? ` Browse the ${records.join(", ")}.` : " Browse the available public record.";
  return `${meetingName(meeting)} public-record index for ${meeting.dateLabel} in Cheyenne, Wyoming.${summary} Independent civic resource, not an official city service.`;
}

function officialLinks(meeting: Meeting): ExternalLink[] {
  const candidates: Array<[string, string | undefined]> = [
    ["Official agenda", meeting.official.agenda],
    ["Official minutes", meeting.official.minutes],
    ["Official meeting video", meeting.official.video],
    ["Granicus meeting page", meeting.official.granicus],
  ];
  const seen = new Set<string>();
  return candidates.flatMap(([label, url]) => {
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ label, url }];
  });
}

function githubBlobUrl(repo: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${ARCHIVE_OWNER}/${encodeURIComponent(repo)}/blob/main/${encodedPath}`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Original source";
  }
}

export function generateStaticParams(): Array<{ id: string }> {
  return MEETINGS.map((meeting) => ({ id: meeting.id }));
}

export async function generateMetadata({ params }: MeetingPageProps): Promise<Metadata> {
  const { id } = await params;
  const meeting = findMeeting(id);
  if (!meeting) return { title: `Meeting not found | ${SITE_NAME}`, robots: { index: false, follow: false } };

  const title = meetingTitle(meeting);
  const description = meetingDescription(meeting);
  const canonical = siteUrl(`meetings/${meeting.id}/`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function MeetingRecordPage({ params }: MeetingPageProps) {
  const { id } = await params;
  const meeting = findMeeting(id);
  if (!meeting) notFound();

  const title = meetingTitle(meeting);
  const canonical = siteUrl(`meetings/${meeting.id}/`);
  const sources = officialLinks(meeting);
  const transcripts = meeting.transcripts?.length
    ? [...meeting.transcripts].sort((a, b) => Number(b.path === meeting.transcript?.path) - Number(a.path === meeting.transcript?.path))
    : meeting.transcript ? [meeting.transcript] : [];
  const siblings = MEETINGS.filter((item) => item.body === meeting.body)
    .sort((a, b) => b.date.localeCompare(a.date));
  const siblingPosition = siblings.findIndex((item) => item.id === meeting.id);
  const nearbyMeetings = siblings
    .slice(Math.max(0, siblingPosition - 2), siblingPosition + 3)
    .filter((item) => item.id !== meeting.id);
  const interactiveUrl = new URL(SITE_URL);
  interactiveUrl.searchParams.set("meeting", meeting.id);
  interactiveUrl.hash = "sessions";

  const webPageData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description: meetingDescription(meeting),
    isPartOf: { "@id": `${SITE_URL}#website` },
    inLanguage: "en-US",
  };
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Meeting archive", item: siteUrl("meetings/") },
      { "@type": "ListItem", position: 3, name: `${meetingName(meeting)} · ${meeting.shortDate}`, item: canonical },
    ],
  };

  return (
    <div className="seo-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageData).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData).replace(/</g, "\\u003c") }}
      />
      <header className="seo-site-header">
        <a className="seo-brand" href={SITE_URL}>
          <span>{SITE_NAME}</span>
          <small>Independent index of Cheyenne public records</small>
        </a>
        <nav aria-label="Site navigation">
          <a href={siteUrl("meetings/")}>All meetings</a>
          <a href={siteUrl("hub/")}>Live Government Hub</a>
          <a href={siteUrl("transcripts/")}>Transcript archive</a>
          <a href="https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas" target="_blank" rel="noreferrer">
            Official city records
          </a>
        </nav>
      </header>

      <main className="seo-container seo-meeting-page">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <a href={SITE_URL}>Home</a><span aria-hidden="true">/</span>
          <a href={siteUrl("meetings/")}>Meeting archive</a><span aria-hidden="true">/</span>
          <span>{meetingName(meeting)} · {meeting.shortDate}</span>
        </nav>

        <header className="seo-page-heading">
          <p className="seo-eyebrow">{meeting.upcoming ? "POSTED PUBLIC AGENDA SNAPSHOT" : "HISTORICAL PUBLIC-RECORD ENTRY"}</p>
          <h1>{meetingHeading(meeting)}</h1>
          <p className="seo-lede">
            This independent index brings together the available public records for the {meeting.bodyLabel} on {meeting.dateLabel}.
            It links to source documents and does not replace the official city record.
          </p>
          <div className="seo-page-actions">
            <a className="seo-primary-link" href={interactiveUrl.toString()}>Open this meeting in Civic Cheyenne</a>
            <a className="seo-secondary-link" href={siteUrl("meetings/")}>Browse all {MEETINGS.length.toLocaleString()} meetings</a>
          </div>
        </header>

        <section className="seo-card" aria-labelledby="meeting-facts-heading">
          <h2 id="meeting-facts-heading">Meeting record</h2>
          <dl className="seo-facts">
            <div><dt>Government body</dt><dd>{meeting.bodyLabel}</dd></div>
            <div><dt>Date</dt><dd><time dateTime={meeting.date}>{meeting.dateLabel}</time></dd></div>
            {meeting.time && <div><dt>Posted time</dt><dd>{meeting.time}</dd></div>}
            {meeting.location && <div><dt>Posted location</dt><dd>{meeting.location}</dd></div>}
            <div><dt>Archive documents</dt><dd>{meeting.docs.length}</dd></div>
            <div><dt>Timestamped transcript</dt><dd>{meeting.transcript ? "Available" : "Not linked in this index"}</dd></div>
            {meeting.notes?.map((note) => <div key={note}><dt>Archive note</dt><dd>{note}</dd></div>)}
          </dl>
          {meeting.upcoming && (
            <p className="seo-record-notice">
              This agenda snapshot was captured on {MEETINGS_CAPTURED}. Agendas describe proposed business; consult later official minutes for recorded actions.
            </p>
          )}
          {meeting.notes?.some((note) => /cancelled|canceled/i.test(note)) && (
            <p className="seo-record-notice">The archive marks this meeting as cancelled. Check the linked city record for the official notice.</p>
          )}
        </section>

        {meeting.items?.length ? (
          <section className="seo-card" aria-labelledby="agenda-items-heading">
            <h2 id="agenda-items-heading">Agenda items as posted</h2>
            <p className="seo-section-intro">These are agenda descriptions from the captured posting. An agenda entry is not a recorded vote or an adopted law.</p>
            <ol className="seo-agenda-items">
              {meeting.items.map((item) => (
                <li key={item.number}>
                  <span>Item {item.number} · {item.kind}</span>
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="seo-card" aria-labelledby="official-sources-heading">
          <h2 id="official-sources-heading">Official source links</h2>
          {sources.length ? (
            <ul className="seo-source-list">
              {sources.map((source) => (
                <li key={`${source.label}-${source.url}`}>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                  <span>{hostLabel(source.url)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No official URL is included in this snapshot. Use the City of Cheyenne’s official meeting index to locate any later records.</p>
          )}
        </section>

        {transcripts.length > 0 && (
          <section className="seo-card" aria-labelledby="transcript-heading">
            <h2 id="transcript-heading">Timestamped transcript{transcripts.length === 1 ? "" : "s"} ({transcripts.length})</h2>
            <p className="seo-section-intro">Transcript and caption text may be automatically generated and can misidentify names. Verify quotations against the official video or minutes. The preferred cleaned copy is listed first where one is marked.</p>
            <ul className="seo-document-list">
              {transcripts.map((transcript) => (
                <li key={`${transcript.repo}/${transcript.path}`}>
                  <a href={githubBlobUrl(transcript.repo, transcript.path)} target="_blank" rel="noreferrer">{readableName(transcript.path)}</a>
                  <span>{transcript.path === meeting.transcript?.path ? "Preferred transcript · " : "Transcript source · "}{transcript.repo}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="seo-card" aria-labelledby="archive-files-heading">
          <h2 id="archive-files-heading">Archived repository documents ({meeting.docs.length})</h2>
          {meeting.docs.length ? (
            <ul className="seo-document-list">
              {meeting.docs.map((document) => (
                <li key={`${document.repo}/${document.path}`}>
                  <a href={githubBlobUrl(document.repo, document.path)} target="_blank" rel="noreferrer">{readableName(document.path)}</a>
                  <span>{document.repo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>This snapshot does not associate repository files with this date. Review the official source links above for the available agenda, minutes, or recording.</p>
          )}
          <p className="seo-source-disclaimer">Archived repository files are copies or indexes of source material. Confirm legal actions and current status in the official record.</p>
        </section>

        {nearbyMeetings.length ? (
          <nav className="seo-card seo-nearby" aria-labelledby="nearby-meetings-heading">
            <h2 id="nearby-meetings-heading">More {meeting.bodyLabel} records</h2>
            <ul>
              {nearbyMeetings.map((neighbor) => (
                <li key={neighbor.id}><a href={siteUrl(`meetings/${neighbor.id}/`)}>{meetingName(neighbor)} · {neighbor.dateLabel}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}

        <footer className="seo-footer">
          <p>Civic Cheyenne is an independent civic-learning project, not an official City of Cheyenne service.</p>
          <a href={SITE_URL}>Civic Cheyenne home</a>
        </footer>
      </main>
    </div>
  );
}
