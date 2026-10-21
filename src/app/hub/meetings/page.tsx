import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, FileText, Info, Landmark } from "lucide-react";
import HubSnapshotFreshness from "@/components/hub-snapshot-freshness";
import HubSourceDeck from "@/components/hub-source-deck";
import { getHubSources } from "@/lib/hub-sources";
import { GRANICUS_UPCOMING_URL, MEETINGS_CAPTURED, NEXT_MEETING, UPCOMING_MEETINGS, noUpcomingMeetingNotice, asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

const canonical = siteUrl("hub/meetings/");
const description = "A guided desk for Cheyenne public meeting agendas and records: open source-linked agenda pages, understand meeting status, and continue to the full public archive.";

export const metadata: Metadata = {
  title: "Meetings & Agendas",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "Cheyenne Meetings & Agendas | Civic Cheyenne", description },
  twitter: { card: "summary", title: "Cheyenne Meetings & Agendas", description },
};

export default function CivicHubMeetingsPage() {
  const sources = getHubSources();
  const agenda = sources.find((source) => source.id === "agenda");
  const noUpcoming = noUpcomingMeetingNotice();

  return (
    <main className="gov-hub-main gov-hub-page">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb"><a href={asset("hub/")}>Live civic hub</a><span aria-hidden="true">/</span><span>Meetings &amp; agendas</span></nav>
      <header className="gov-page-hero gov-page-hero--meetings">
        <span className="gov-page-hero-icon"><Landmark size={22} aria-hidden="true" /></span>
        <div><p className="gov-kicker">THE GOVERNMENT DESK</p><h1>Meetings &amp; agendas</h1><p>Start with what was posted. Follow through to what the public body recorded.</p></div>
        <span className="gov-snapshot-label">Snapshot · {MEETINGS_CAPTURED}</span>
      </header>

      <section className="gov-meeting-feature" aria-labelledby="gov-meeting-feature-title">
        <div className="gov-meeting-feature-heading">
          <div>
            <p className="gov-kicker">{NEXT_MEETING ? "FEATURED POSTED AGENDA AS OF SNAPSHOT" : "FEATURED POSTED AGENDA · NONE CONFIRMED IN SNAPSHOT"}</p>
            <h2 id="gov-meeting-feature-title">{NEXT_MEETING ? NEXT_MEETING.bodyLabel : noUpcoming.headline}</h2>
            <p>{NEXT_MEETING ? `${NEXT_MEETING.dayLabel} · ${NEXT_MEETING.dateLabel}${NEXT_MEETING.time ? ` · ${NEXT_MEETING.time}` : " · Start time not verified"}` : noUpcoming.detail}</p>
          </div>
          <span className="gov-posted-pill"><i aria-hidden="true" /> {NEXT_MEETING ? (NEXT_MEETING.archiveUnavailable ? "Official posting detected; archive unavailable" : "Agenda in archive snapshot") : "No upcoming meeting confirmed"}</span>
        </div>
        <p className="gov-meeting-feature-note">
          {NEXT_MEETING
            ? NEXT_MEETING.archiveUnavailable
              ? "Official posting detected; archive unavailable. Open the official city schedule directly for agenda items and updates."
              : "The following item count and agenda text come from the captured city posting as of snapshot capture. Confirm later revisions or schedule changes on the official city source."
            : `${noUpcoming.provenanceLine}${noUpcoming.blockedPostingLine ? ` ${noUpcoming.blockedPostingLine}` : ""} Calendar status is evaluated in America/Denver and never infers whether a body met or how it voted.`}
        </p>
        <HubSnapshotFreshness note="check the city’s calendar for revisions posted since then." />
        <div className="gov-meeting-agenda-list">
          {(NEXT_MEETING?.items ?? []).map((item) => (
            <article key={`${item.number}-${item.text}`}>
              <span className="gov-agenda-number">{item.number}</span>
              <div><span className="gov-kicker">{item.kind}</span><p>{item.text}</p></div>
            </article>
          ))}
        </div>
        <div className="gov-meeting-feature-actions">
          {NEXT_MEETING && agenda && <a className="gov-button gov-button-primary" href={agenda.sourceUrl} target="_blank" rel="noopener noreferrer">Open posted agenda <ArrowUpRight size={14} aria-hidden="true" /></a>}
          {NEXT_MEETING
            ? <a className="gov-button gov-button-outline" href={asset(`meetings/${NEXT_MEETING.id}/`)}>Read the indexed meeting page <ArrowRight size={14} aria-hidden="true" /></a>
            : <a className="gov-button gov-button-outline" href={noUpcoming.scheduleUrl} target="_blank" rel="noopener noreferrer">Official meeting calendar <ArrowUpRight size={14} aria-hidden="true" /></a>}
          {!NEXT_MEETING && <a className="gov-text-link" href={GRANICUS_UPCOMING_URL} target="_blank" rel="noopener noreferrer">City posted-meeting table <ArrowUpRight size={14} aria-hidden="true" /></a>}
        </div>
      </section>

      <section className="gov-meeting-sequence" aria-labelledby="gov-meeting-sequence-title">
        <div><p className="gov-kicker">HOW TO FOLLOW A MEETING</p><h2 id="gov-meeting-sequence-title">A public record has a sequence.</h2></div>
        <div className="gov-sequence-grid">
          <article><span>01</span><FileText size={17} aria-hidden="true" /><h3>Agenda</h3><p>What a public body plans to consider. It is a forecast of business, not a decision.</p></article>
          <article><span>02</span><CalendarDays size={17} aria-hidden="true" /><h3>Meeting</h3><p>Watch the official recording when published. A proposal can be discussed, amended, referred, postponed, or voted on.</p></article>
          <article><span>03</span><CheckCircle2 size={17} aria-hidden="true" /><h3>Minutes &amp; adopted text</h3><p>Check the minutes for recorded action, then read later readings and final adopted text to confirm legal status.</p></article>
        </div>
      </section>

      <HubSourceDeck sources={sources} initialSourceId="agenda" />

      <section className="gov-upcoming-list" aria-labelledby="gov-upcoming-heading">
        <div className="gov-section-heading"><div><p className="gov-kicker">POSTED IN THE CAPTURED INDEX</p><h2 id="gov-upcoming-heading">Other listed meetings</h2></div><a className="gov-text-link" href={asset("meetings/")}>Browse the complete archive <ArrowRight size={14} aria-hidden="true" /></a></div>
        <div className="gov-upcoming-grid">
          {UPCOMING_MEETINGS.filter((meeting) => meeting.id !== NEXT_MEETING?.id).slice(0, 4).map((meeting) => (
            <article className="gov-upcoming-card" key={meeting.id}>
              <span className="gov-upcoming-date"><CalendarDays size={15} aria-hidden="true" /> {meeting.dateLabel}</span>
              <h3>{meeting.bodyLabel}</h3>
              <p>{meeting.dayLabel}{meeting.time ? ` · ${meeting.time}` : ""}{meeting.location ? ` · ${meeting.location}` : ""}</p>
              <small>{meeting.items?.length ?? 0} items · snapshot captured {MEETINGS_CAPTURED}</small>
              <a href={meeting.official.granicus ?? meeting.official.agenda ?? asset(`meetings/${meeting.id}/`)} target={meeting.official.granicus || meeting.official.agenda ? "_blank" : undefined} rel={meeting.official.granicus || meeting.official.agenda ? "noopener noreferrer" : undefined}>Open source listing <ArrowUpRight size={13} aria-hidden="true" /></a>
            </article>
          ))}
          {UPCOMING_MEETINGS.length <= 1 && (
            <article className="gov-upcoming-card gov-upcoming-empty">
              <Info size={19} aria-hidden="true" />
              <h3>{NEXT_MEETING ? "No other posted agendas in this snapshot" : "No upcoming meeting confirmed in this snapshot"}</h3>
              <p>{NEXT_MEETING ? "Check the City of Cheyenne’s official meeting calendar for newer postings." : noUpcoming.detail}</p>
              <a className="gov-text-link" href={noUpcoming.scheduleUrl} target="_blank" rel="noopener noreferrer">Official meeting calendar <ArrowUpRight size={13} aria-hidden="true" /></a>
            </article>
          )}
        </div>
      </section>

      <aside className="gov-caution-card"><Info size={19} aria-hidden="true" /><p><strong>Keep “agenda” and “outcome” separate.</strong> A listed ordinance, a reading-stage vote, and final enactment are different steps. The city’s official minutes and adopted text are the authoritative record.</p></aside>
    </main>
  );
}
