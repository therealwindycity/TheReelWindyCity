import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, MapPinned, ShieldCheck } from "lucide-react";
import WyomingEcosystemMap, { type EcosystemMapPoint } from "@/components/wyoming-ecosystem-map";
import { EcosystemDisclaimer } from "@/components/ecosystem-detail";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import {
  ARCHITECTURES,
  COUNTIES,
  ECOSYSTEM_CAPTURED,
  MUNICIPALITIES,
  OUT_OF_SCOPE,
  PLACE_BY_ID,
  architectureById,
  ecosystemStats,
} from "@/lib/wyoming-ecosystem";

const canonical = siteUrl("hub/wyoming/");
const description = "Every Wyoming county and incorporated municipality, plotted by the public site it actually publishes and by how Cheyenne’s meeting tactics have to change there.";

export const metadata: Metadata = {
  title: "Wyoming Government Ecosystem",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "Wyoming’s governments are not one Granicus table", description },
  twitter: { card: "summary", title: "Wyoming government ecosystem", description },
};

function points(): EcosystemMapPoint[] {
  const counties = COUNTIES.map((county): EcosystemMapPoint => {
    const seat = PLACE_BY_ID[county.seatId];
    return {
      id: `county-${county.id}`,
      layer: "county",
      name: `${county.name} County`,
      kind: "county",
      countyName: "Plotted at the county seat",
      architectureId: county.architectureId,
      tacticStatus: county.tacticStatus,
      website: county.clerk.website.url,
      verification: county.clerk.website.verification,
      longitude: seat.longitude,
      latitude: seat.latitude,
      href: `hub/wyoming/counties/${county.id}/`,
      civicHref: `civic/counties/${county.id}/`,
    };
  });
  const places = MUNICIPALITIES.map((place): EcosystemMapPoint => ({
    id: `place-${place.id}`,
    layer: "municipality",
    name: place.name,
    kind: place.kind,
    countyName: `${COUNTIES.find((county) => county.id === place.countyId)?.name ?? place.countyId} County`,
    architectureId: place.architectureId,
    tacticStatus: place.tacticStatus,
    website: place.website?.url ?? null,
    verification: place.website?.verification ?? null,
    longitude: place.longitude,
    latitude: place.latitude,
    href: `hub/wyoming/places/${place.id}/`,
    civicHref: `civic/places/${place.id}/`,
  }));
  return [...counties, ...places];
}

export default function WyomingEcosystemPage() {
  const stats = ecosystemStats();
  const observed = ARCHITECTURES.filter((item) => item.id !== "unobserved" && item.id !== "county-site-unobserved");

  return (
    <main className="gov-hub-main">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span><a href={asset("hub/")}>Live government hub</a><span aria-hidden="true">/</span><span>Wyoming</span>
      </nav>
      <section className="gov-page-hero eco-hero" aria-labelledby="wyoming-eco-title">
        <div>
          <p className="gov-kicker"><span className="gov-kicker-dot" /> STATEWIDE · {ECOSYSTEM_CAPTURED} CATALOG</p>
          <h1 id="wyoming-eco-title">Wyoming’s governments are not one Granicus table.</h1>
          <p>Cheyenne’s watcher reads one publisher. A daily job now checks the other 22 counties and 98 municipalities on their own doors. It fetches a calibrated page, checks a pinned county host, or records the government and does not guess a URL.</p>
          <div className="gov-hero-actions">
            <a className="gov-button gov-button-primary" href={asset("hub/wyoming/entities/")}>List every entity <ArrowRight size={15} aria-hidden="true" /></a>
            <a className="gov-button gov-button-light" href={asset("hub/wyoming/architecture/")}>See the tactic differences <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a className="gov-button gov-button-outline" href={asset("maps/wyoming-government-sites.geojson")}>Download the site map <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="eco-stat-board" aria-label="Catalog counts">
          <div><strong>{stats.counties}</strong><span>counties</span></div>
          <div><strong>{stats.municipalities}</strong><span>cities and towns</span></div>
          <div><strong>{stats.live}</strong><span>live watcher</span></div>
          <div><strong>{stats.specified}</strong><span>municipal surfaces on the daily watch</span></div>
          <div><strong>{stats.noWebsite}</strong><span>municipalities with no confirmed site</span></div>
          <div><strong>{stats.hostDriftCounties}</strong><span>counties with more than one published host</span></div>
        </div>
      </section>

      <section className="eco-map-section" aria-labelledby="eco-map-title">
        <div className="gov-section-heading">
          <div>
            <p className="gov-kicker"><MapPinned size={13} aria-hidden="true" /> DISPARATE SITES</p>
            <h2 id="eco-map-title">One state. Different publishers.</h2>
          </div>
          <p>County rings sit on the county-seat reference point. They are not a second location and not legal boundaries. Click a dot for the municipality; click the ring outside the dot, or use the list, for the county.</p>
        </div>
        <WyomingEcosystemMap points={points()} />
      </section>

      <section className="eco-arch-grid" aria-label="Observed architecture families">
        {observed.map((item) => (
          <article key={item.id} className={`eco-arch-card eco-arch-${item.id}`}>
            <p className="gov-kicker">{item.watcher === "live" ? "LIVE" : "DAILY WATCH"}</p>
            <h3>{item.name}</h3>
            <p>{item.summary}</p>
            <small>{MUNICIPALITIES.filter((place) => place.architectureId === item.id).map((place) => place.name).join(" · ") || "No municipality assigned."}</small>
          </article>
        ))}
        <article className="eco-arch-card eco-arch-unobserved">
          <p className="gov-kicker">FAIL CLOSED</p>
          <h3>{architectureById("unobserved").name}</h3>
          <p>{architectureById("unobserved").summary}</p>
          <small>{stats.failClosed - stats.counties} municipalities are recorded and not fetched. Every county clerk host is checked daily. Commission software is still not parsed.</small>
          <a href={asset("hub/wyoming/architecture/")}>What the daily job will not fetch <ArrowRight size={13} aria-hidden="true" /></a>
        </article>
      </section>

      <section className="eco-scope" aria-labelledby="eco-scope-title">
        <h2 id="eco-scope-title">What this map refuses to flatten</h2>
        <ul>
          {OUT_OF_SCOPE.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <EcosystemDisclaimer />
      <p className="eco-captured"><ShieldCheck size={14} aria-hidden="true" /> Catalog captured {ECOSYSTEM_CAPTURED}. County clerk sites from the WYDOT title-office publication. Municipal phones and directory figures from the Wyoming Association of Municipalities 2026 directory, except La Barge.</p>
    </main>
  );
}
