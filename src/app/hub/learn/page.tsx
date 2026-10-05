import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, BookOpen, FileCheck2, FileText, Headphones, Landmark, Video } from "lucide-react";
import CivicKnowledgeCheck from "@/components/civic-knowledge-check";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

const canonical = siteUrl("hub/learn/");
const description = "An educational field guide to Cheyenne government sources: how to read an agenda, watch a meeting, confirm action in minutes, and distinguish a proposal from an adopted law.";

export const metadata: Metadata = {
  title: "Learn the Public Record",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "How to Read a Public Record | Civic Cheyenne", description },
  twitter: { card: "summary", title: "How to Read a Public Record", description },
};

const stages = [
  {
    number: "01",
    icon: FileText,
    title: "Start with the agenda",
    tag: "WHAT IS PLANNED",
    copy: "An agenda lists business a public body intends to consider. It is a useful map of the meeting, but it does not establish what happened or what passed.",
    tip: "Look for the meeting date, item number, ordinance reading, staff report, and links to exhibits. Compare the agenda with later records if it changes.",
  },
  {
    number: "02",
    icon: Video,
    title: "Watch the meeting",
    tag: "WHAT WAS DISCUSSED",
    copy: "The official recording can add context: questions, amendments, public testimony, and the sequence of motions. A speaker's statement is a perspective, not a finding by the city.",
    tip: "Use a transcript to find a timestamp, then replay the recording before quoting. Automatic captions can misidentify names and words.",
  },
  {
    number: "03",
    icon: FileCheck2,
    title: "Check the minutes",
    tag: "WHAT ACTION WAS RECORDED",
    copy: "Minutes capture the body's recorded action. A referral, postponement, or first- or second-reading vote is not the same thing as a final adopted ordinance.",
    tip: "Follow the item through later meetings. Read the final adopted text and effective date before describing the current rule.",
  },
  {
    number: "04",
    icon: Landmark,
    title: "Trace the effect carefully",
    tag: "WHAT CHANGES — AND WHAT IS UNKNOWN",
    copy: "Separate the existing baseline, what the proposal says it would change, the action actually recorded, and what the sources do not establish.",
    tip: "Avoid turning an illustrative map, a quoted opinion, or an agenda label into a legal boundary, official forecast, or final outcome.",
  },
];

export default function CivicHubLearnPage() {
  return (
    <main className="gov-hub-main gov-hub-page gov-learning-page">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb"><a href={asset("hub/")}>Live civic hub</a><span aria-hidden="true">/</span><span>Learn the record</span></nav>
      <header className="gov-page-hero gov-page-hero--learn">
        <span className="gov-page-hero-icon"><BookOpen size={22} aria-hidden="true" /></span>
        <div><p className="gov-kicker">A FIELD GUIDE FOR CURIOUS RESIDENTS</p><h1>Learn to follow a public decision.</h1><p>Four source checks help separate what was proposed, what happened, and what is actually in force.</p></div>
        <a className="gov-page-hero-link" href={asset("hub/meetings/")}>Choose a real meeting <ArrowRight size={14} aria-hidden="true" /></a>
      </header>

      <section className="gov-learning-stages" aria-label="Four steps for following a public decision">
        {stages.map(({ number, icon: Icon, title, tag, copy, tip }) => (
          <article className="gov-learning-stage" key={number}>
            <div className="gov-learning-stage-top"><span className="gov-stage-number">{number}</span><span className="gov-stage-icon"><Icon size={18} aria-hidden="true" /></span><span className="gov-stage-tag">{tag}</span></div>
            <h2>{title}</h2><p>{copy}</p>
            <div className="gov-learning-tip"><strong>Look for</strong><span>{tip}</span></div>
          </article>
        ))}
      </section>

      <section className="gov-reading-key" aria-labelledby="gov-reading-key-title">
        <div className="gov-reading-key-heading"><span className="gov-reading-key-icon"><Headphones size={18} aria-hidden="true" /></span><div><p className="gov-kicker">SOURCE LITERACY</p><h2 id="gov-reading-key-title">Not every window has the same authority.</h2></div></div>
        <div className="gov-source-levels">
          <article><span className="gov-source-level gov-source-level--official">OFFICIAL RECORD</span><h3>Agendas, minutes, adopted documents</h3><p>Published by the city or other government body. Use these to confirm dates, recorded action, and final legal text.</p></article>
          <article><span className="gov-source-level gov-source-level--agency">OFFICIAL AGENCY FEED</span><h3>Weather, road &amp; emergency updates</h3><p>Produced by the issuing agency. Check its current alert or instructions directly, especially when conditions are changing.</p></article>
          <article><span className="gov-source-level gov-source-level--relay">THIRD-PARTY RELAY</span><h3>Scanner audio &amp; syndicated news</h3><p>Helpful for situational awareness, but may be delayed, partial, unverified, or unavailable. It is not the official incident record.</p></article>
        </div>
      </section>

      <CivicKnowledgeCheck />

      <section className="gov-learning-next">
        <div><p className="gov-kicker">TAKE THE FIELD GUIDE INTO THE ARCHIVE</p><h2>Follow one real item from agenda to recorded action.</h2><p>Open a posted meeting, then compare its agenda with official follow-up records.</p></div>
        <a className="gov-button gov-button-primary" href={asset("hub/meetings/")}>Open the meetings desk <ArrowRight size={15} aria-hidden="true" /></a>
      </section>

      <div className="gov-page-bottom-links">
        <a href={asset("meetings/")}>Browse all indexed meetings <ArrowUpRight size={13} aria-hidden="true" /></a>
        <a href={asset("transcripts/")}>Use the transcript archive <ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
    </main>
  );
}
