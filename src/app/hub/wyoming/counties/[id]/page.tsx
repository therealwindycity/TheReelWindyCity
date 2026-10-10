import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityList, EcosystemDisclaimer, RelatedLinks, TacticMirror, WebsiteLine } from "@/components/ecosystem-detail";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import {
  COUNTIES,
  ECOSYSTEM_CAPTURED,
  countyById,
  countyEntities,
  countyNarrative,
  placesInCounty,
  seatOf,
  type CatalogCounty,
} from "@/lib/wyoming-ecosystem";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTIES.map((county) => ({ id: county.id }));
}

function load(id: string): CatalogCounty | undefined {
  return countyById(id);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const county = load(id);
  if (!county) return {};
  const title = `${county.name} County government`;
  const description = `${county.name} County, Wyoming: clerk contact, incorporated municipalities, and why Cheyenne’s Granicus watcher is not attached.`;
  const canonical = siteUrl(`hub/wyoming/counties/${county.id}/`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title, description },
  };
}

export default async function CountyEcosystemPage({ params }: PageProps) {
  const { id } = await params;
  const county = load(id);
  if (!county) notFound();
  const seat = seatOf(county);
  const places = placesInCounty(county.id);
  const narrative = countyNarrative(county);
  const canonical = siteUrl(`hub/wyoming/counties/${county.id}/`);
  const structured = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: canonical,
    name: `${county.name} County government`,
    description: narrative[0],
    isPartOf: siteUrl("hub/wyoming/"),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Civic Cheyenne", item: siteUrl("") },
      { "@type": "ListItem", position: 2, name: "Wyoming", item: siteUrl("hub/wyoming/") },
      { "@type": "ListItem", position: 3, name: `${county.name} County`, item: canonical },
    ],
  };

  return (
    <main className="gov-hub-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span>
        <a href={asset("hub/wyoming/")}>Wyoming</a><span aria-hidden="true">/</span>
        <span>{county.name} County</span>
      </nav>
      <section className="gov-page-hero eco-hero" aria-labelledby="county-eco-title">
        <div>
          <p className="gov-kicker"><span className="gov-kicker-dot" /> COUNTY · FIPS {county.fips} · SAME {county.sameCode}</p>
          <h1 id="county-eco-title">{county.name} County government</h1>
          {narrative.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>
      <section className="eco-fact-grid" aria-label="County clerk contact">
        <div><span>Seat</span><strong>{seat ? <a href={asset(`hub/wyoming/places/${seat.id}/`)}>{seat.name}</a> : county.seatId}</strong></div>
        <div><span>Clerk phone</span><strong>{county.clerk.phone}</strong></div>
        <div><span>Clerk office</span><strong>{county.clerk.address}</strong></div>
        <div><span>Incorporated places</span><strong>{places.length}</strong></div>
      </section>
      <h2>Published sites</h2>
      <WebsiteLine website={county.clerk.website} empty="No county site was published in the WYDOT clerk list." />
      {county.clerk.alternates.map((site) => <WebsiteLine key={site.url} website={site} empty="" />)}
      <p className="eco-source-line">Catalog captured {ECOSYSTEM_CAPTURED}. The primary site is the WYDOT county-clerk publication. Alternates are older or parallel hosts, not extra governments.</p>
      <EntityList
        entities={countyEntities(county)}
        heading={`${county.name} County offices`}
        intro="The same eight offices are listed for every county because the handbook names them as the county pattern. This page does not name the people who hold them."
      />
      <TacticMirror architectureId={county.architectureId} status={county.tacticStatus} />
      <h2>Municipalities associated with {county.name} County</h2>
      <RelatedLinks
        places={places.map((place) => ({
          href: `hub/wyoming/places/${place.id}/`,
          label: `${place.name}${place.alsoCountyIds.includes(county.id) ? " (also)" : ""}`,
        }))}
      />
      <EcosystemDisclaimer />
    </main>
  );
}
