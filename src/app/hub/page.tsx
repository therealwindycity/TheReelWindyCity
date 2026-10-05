import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, FileStack, Landmark, Radio, ShieldCheck } from "lucide-react";
import HubSourceDeck from "@/components/hub-source-deck";
import { getHubSources } from "@/lib/hub-sources";
import { MEETINGS_CAPTURED, MEETING_STATS, NEXT_MEETING, asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

const canonical = siteUrl("hub/");
const description = "A source-linked live civic hub for Cheyenne: posted government agendas, official meeting video, public-safety audio, weather, road conditions, syndicated signals, and practical civic learning.";

export const metadata: Metadata = {
  title: "Cheyenne Live Government Hub | Civic Cheyenne",
  description,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    siteName: SITE_NAME,
    title: "Cheyenne Live Civic Hub | Civic Cheyenne",
    description,
  },
  twitter: { card: "summary", title: "Cheyenne Live Civic Hub", description },
};

export default function CivicHubHomePage() {
  const sources = getHubSources();
  const agendaUrl = NEXT_MEETING.official.agenda ?? NEXT_MEETING.official.granicus;
  const stats = [
    { value: MEETING_STATS.totalMeetings.toLocaleString(), label: "indexed public meetings", icon: CalendarDays },
    { value: MEETING_STATS.totalDocuments.toLocaleString(), label: "archived source documents", icon: FileStack },
    { value: String(MEETING_STATS.totalTranscripts), label: "timestamped transcripts", icon: BookOpen },
  ];

  return (
    <main className="gov-hub-main">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span><span>Live government hub</span>
      </nav>

      <section className="gov-hero" aria-labelledby="gov-hub-title">
        <div className="gov-hero-copy">
          <p className="gov-kicker"><span className="gov-kicker-dot" /> CHEYENNE · PUBLIC INFORMATION, WITH CONTEXT</p>
          <h1 id="gov-hub-title">Local government is easier to follow when the source is one click away.</h1>
          <p className="gov-hero-lede">A live civic desk that brings posted meetings, public records, weather, road conditions, scanner audio, and statewide reporting into one source-linked place.</p>
          <div className="gov-hero-actions">
            <a className="gov-button gov-button-primary" href={asset("hub/signals/")}><Radio size={16} aria-hidden="true" /> Open the live signal desk <ArrowRight size={16} aria-hidden="true" /></a>
            <a className="gov-button gov-button-light" href={asset("hub/meetings/")}>Find a public meeting <ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
          <p className="gov-hero-trust"><ShieldCheck size={15} aria-hidden="true" /> Independent guide · Every external window names its publisher · Verify decisions in official records</p>
        </div>
        <div className="gov-hero-image-wrap">
          <Image src={asset("images/council-chambers-session.png")} alt="Cheyenne City Council chambers during a real public meeting" fill priority sizes="(max-width: 760px) 100vw, 50vw" />
          <div className="gov-hero-image-caption"><span>THE PUBLIC RECORD</span><strong>Real rooms. Real agendas. Real decisions.</strong><small>Cheyenne Municipal Building · 2101 O’Neil Avenue</small></div>
          <span className="gov-image-stamp"><Landmark size={14} aria-hidden="true" /> CIVIC DESK</span>
        </div>
      </section>

      <section className="gov-stat-strip" aria-label="Public archive coverage">
        {stats.map(({ value, label, icon: Icon }) => (
          <div className="gov-stat" key={label}><span className="gov-stat-icon"><Icon size={16} aria-hidden="true" /></span><strong>{value}</strong><span>{label}</span></div>
        ))}
        <div className="gov-stat-captured"><span>ARCHIVE SNAPSHOT</span><strong>{MEETINGS_CAPTURED}</strong><small>Coverage and live-source availability can change.</small></div>
      </section>

      <section className="gov-featured-agenda" aria-labelledby="gov-featured-agenda-title">
        <div className="gov-featured-icon"><CalendarDays size={22} aria-hidden="true" /></div>
        <div className="gov-featured-copy">
          <p className="gov-kicker">FEATURED POSTED AGENDA · {NEXT_MEETING.dateLabel.toUpperCase()}</p>
          <h2 id="gov-featured-agenda-title">{NEXT_MEETING.bodyLabel}</h2>
          <p>{NEXT_MEETING.dayLabel}{NEXT_MEETING.time ? ` · ${NEXT_MEETING.time}` : ""}{NEXT_MEETING.location ? ` · ${NEXT_MEETING.location}` : ""}</p>
          <small>{NEXT_MEETING.items?.length ?? 0} items in the captured agenda · Snapshot captured {MEETINGS_CAPTURED}</small>
        </div>
        <div className="gov-featured-actions">
          {agendaUrl && <a className="gov-button gov-button-outline" href={agendaUrl} target="_blank" rel="noopener noreferrer">Open original agenda <ArrowUpRight size={14} aria-hidden="true" /></a>}
          <a className="gov-text-link" href={asset(`meetings/${NEXT_MEETING.id}/`)}>View source-linked meeting page <ArrowRight size={14} aria-hidden="true" /></a>
        </div>
      </section>

      <HubSourceDeck sources={sources} initialSourceId="agenda" />

      <section className="gov-hub-pathways" aria-labelledby="gov-pathways-title">
        <div className="gov-section-heading">
          <div><p className="gov-kicker">THREE WAYS IN</p><h2 id="gov-pathways-title">From a signal to the original record.</h2></div>
          <p>Use the hub as a starting point, then follow the citation back to the public source.</p>
        </div>
        <div className="gov-pathway-grid">
          <a className="gov-pathway-card" href={asset("hub/meetings/")}>
            <span className="gov-pathway-number">01</span><span className="gov-pathway-icon"><CalendarDays size={19} aria-hidden="true" /></span>
            <h3>Meetings &amp; agendas</h3><p>See posted items, meeting details, and archived records together. Learn the difference between a proposal and a recorded vote.</p>
            <span className="gov-pathway-link">Browse meeting desk <ArrowRight size={14} aria-hidden="true" /></span>
          </a>
          <a className="gov-pathway-card" href={asset("hub/signals/")}>
            <span className="gov-pathway-number">02</span><span className="gov-pathway-icon"><Radio size={19} aria-hidden="true" /></span>
            <h3>Live signals</h3><p>One syndicated feed brings together public alerts, road reports, fire and seismic data, scanner metadata, and Wyoming newsrooms.</p>
            <span className="gov-pathway-link">Open the signal desk <ArrowRight size={14} aria-hidden="true" /></span>
          </a>
          <a className="gov-pathway-card" href={asset("hub/learn/")}>
            <span className="gov-pathway-number">03</span><span className="gov-pathway-icon"><BookOpen size={19} aria-hidden="true" /></span>
            <h3>Learn the record</h3><p>A short field guide to agendas, meeting video, minutes, readings, and how to check what actually became law.</p>
            <span className="gov-pathway-link">Start the field guide <ArrowRight size={14} aria-hidden="true" /></span>
          </a>
        </div>
      </section>

      <aside className="gov-caution-card">
        <ShieldCheck size={20} aria-hidden="true" /><p><strong>Useful context, not an emergency service.</strong> The hub is independent and is not affiliated with the City of Cheyenne. Live publishers can be delayed or unavailable; agenda items are proposals, and emergency instructions should come from official authorities.</p>
      </aside>

      <div className="gov-page-bottom-links">
        <a href={asset("meetings/")}>Explore the full meeting archive <ArrowUpRight size={13} aria-hidden="true" /></a>
        <a href={asset("transcripts/")}>Browse timestamped transcripts <ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
    </main>
  );
}
