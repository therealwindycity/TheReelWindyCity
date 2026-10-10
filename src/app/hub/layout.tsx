import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowUpRight, Landmark } from "lucide-react";
import { asset } from "@/lib/civic-data";

export const metadata: Metadata = {
  title: {
    default: "Live Civic Hub",
    template: "%s | Civic Cheyenne",
  },
};

const HUB_LINKS = [
  { href: "hub/", label: "Live desk" },
  { href: "hub/meetings/", label: "Meetings" },
  { href: "hub/signals/", label: "Live signals" },
  { href: "hub/learn/", label: "Learn the record" },
  { href: "hub/wyoming/", label: "Wyoming" },
];

export default function CivicHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gov-hub-site">
      <header className="gov-hub-header">
        <div className="gov-hub-header-inner">
          <a className="gov-hub-brand" href={asset("hub/")} aria-label="Civic Cheyenne Live Government Hub home">
            <span className="gov-hub-brand-mark"><Landmark size={21} strokeWidth={1.8} aria-hidden="true" /></span>
            <span><strong>CIVIC CHEYENNE</strong><small>LIVE GOVERNMENT HUB</small></span>
          </a>
          <nav className="gov-hub-nav" aria-label="Live civic hub pages">
            {HUB_LINKS.map((link) => (
              <a key={link.href} href={asset(link.href)}>{link.label}</a>
            ))}
          </nav>
          <a className="gov-hub-main-link" href={asset("")}>
            Main experience <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </header>
      <div className="gov-hub-independent-bar">
        <span><i aria-hidden="true" /> Independent public-information guide</span>
        <span>Cheyenne, Wyoming <b>·</b> Not an official city service</span>
      </div>
      {children}
      <footer className="gov-hub-footer">
        <div><strong>CIVIC CHEYENNE</strong><span>Public information, connected to its sources.</span></div>
        <p>Independent civic-learning project. Third-party feeds and embeds may be delayed, unavailable, or changed by their publishers.</p>
        <nav aria-label="Footer navigation">
          <a href={asset("hub/wyoming/")}>Wyoming ecosystem</a>
          <a href={asset("meetings/")}>Meeting archive</a>
          <a href={asset("transcripts/")}>Transcript archive</a>
          <a href="https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas" target="_blank" rel="noopener noreferrer">Official city records <ArrowUpRight size={12} aria-hidden="true" /></a>
        </nav>
      </footer>
    </div>
  );
}
