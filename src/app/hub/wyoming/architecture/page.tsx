import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { EcosystemDisclaimer, TacticMirror } from "@/components/ecosystem-detail";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import { ARCHITECTURES, ECOSYSTEM_CAPTURED, MUNICIPALITIES, OUT_OF_SCOPE } from "@/lib/wyoming-ecosystem";

const canonical = siteUrl("hub/wyoming/architecture/");
const description = "How Cheyenne’s eight civic-record tactics change across Granicus, CivicPlus, clerk file indexes, PDF folders, and places with no observed posting surface.";

export const metadata: Metadata = {
  title: "Wyoming Architecture Differences",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "Cheyenne’s tactics do not transfer unchanged", description },
};

export default function WyomingArchitecturePage() {
  return (
    <main className="gov-hub-main">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span>
        <a href={asset("hub/wyoming/")}>Wyoming</a><span aria-hidden="true">/</span>
        <span>Architecture</span>
      </nav>
      <section className="gov-page-hero eco-hero" aria-labelledby="eco-arch-page-title">
        <div>
          <p className="gov-kicker"><span className="gov-kicker-dot" /> ADAPTERS · NOT A STATEWIDE SCRAPE</p>
          <h1 id="eco-arch-page-title">Cheyenne’s tactics do not transfer unchanged.</h1>
          <p>The live pipeline watches one Granicus table, hashes the record instead of the page, extracts PDFs by layout, drops anything it cannot quote, and never posts into a portal. Those habits are the tactics. The door they walk through is local. Copying the door is how a watcher fails open.</p>
        </div>
      </section>

      <section className="eco-principle-grid" aria-label="Rules that survive every architecture">
        <article>
          <h2>What stays</h2>
          <p>Fail closed on a surprise. Hash meaning, not markup. Quote verbatim or drop the finding. Mailto only, to an address that was printed. Keep pipeline files out of the public build until a person promotes them. An agenda is not a decision.</p>
        </article>
        <article>
          <h2>What changes</h2>
          <p>The parser and the fields worth hashing. A CivicPlus viewstate, a second Casper portal, a Gillette PDF folder, and a town with no site stay four different architectures. The daily job runs the matching one, or records the place and fetches nothing.</p>
        </article>
        <article>
          <h2>What this job refuses</h2>
          <p>No hourly job hits the other governments, and this job never calls Cheyenne’s PDF sync. A parsed row is a hash in the pipeline, not a public meeting, until a person promotes it. A directory domain that was never opened is not probed.</p>
        </article>
      </section>

      {ARCHITECTURES.map((profile) => (
        <section key={profile.id} className="eco-arch-block" id={profile.id}>
          <p className="eco-arch-count">{MUNICIPALITIES.filter((place) => place.architectureId === profile.id).length} municipalities use this label{profile.id === "county-site-unobserved" ? " · plus it is the label for every county" : ""}.</p>
          <TacticMirror architectureId={profile.id} status={profile.watcher === "live" ? "live" : profile.watcher === "specified" ? "specified" : "fail-closed"} />
        </section>
      ))}

      <section className="eco-scope" aria-labelledby="eco-arch-scope-title">
        <h2 id="eco-arch-scope-title">Boundaries that are architectural, not omissions</h2>
        <ul>{OUT_OF_SCOPE.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <EcosystemDisclaimer />
      <p className="eco-captured">Catalog captured {ECOSYSTEM_CAPTURED}. <a href={asset("hub/wyoming/")}>Back to the map <ArrowUpRight size={12} aria-hidden="true" /></a></p>
    </main>
  );
}
