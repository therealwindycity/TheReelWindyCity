import type { Metadata } from "next";
import { ArrowRight, Radio, ShieldAlert } from "lucide-react";
import PulseBroadcast from "@/components/pulse-broadcast";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

const canonical = siteUrl("hub/signals/");
const description = "A source-attributed signal desk for Cheyenne and Wyoming, combining scanner feeds and public alerts with a historical, carefully contextualized reading of Cheyenne PD and Laramie County Citizen Connect incident records.";

export const metadata: Metadata = {
  title: "Live Signal Desk",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "Cheyenne & Wyoming Live Signal Desk", description },
  twitter: { card: "summary", title: "Cheyenne & Wyoming Live Signal Desk", description },
};

export default function CivicHubSignalsPage() {
  return (
    <main className="gov-hub-main gov-hub-page gov-hub-signals-page">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb"><a href={asset("hub/")}>Live civic hub</a><span aria-hidden="true">/</span><span>Live signals</span></nav>
      <header className="gov-page-hero gov-page-hero--signals">
        <span className="gov-page-hero-icon"><Radio size={22} aria-hidden="true" /></span>
        <div><p className="gov-kicker">SYNDICATED · SOURCE-LINKED · CHEYENNE &amp; WYOMING</p><h1>Live signal desk</h1><p>One view of public feeds from agencies, roads, weather services, and Wyoming newsrooms.</p></div>
        <a className="gov-page-hero-link" href={asset("hub/learn/")}>How to read these signals <ArrowRight size={14} aria-hidden="true" /></a>
      </header>
      <aside className="gov-live-warning"><ShieldAlert size={18} aria-hidden="true" /><p><strong>For awareness, not response.</strong> Feeds may be delayed, incomplete, or unavailable. They are not official dispatch and do not replace 911, emergency alerts, or an issuing agency’s instructions.</p></aside>
      <PulseBroadcast embedded />
    </main>
  );
}
