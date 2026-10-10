import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityList, EcosystemDisclaimer, RelatedLinks, TacticMirror, WebsiteLine } from "@/components/ecosystem-detail";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import {
  COUNTY_BY_ID,
  ECOSYSTEM_CAPTURED,
  MUNICIPALITIES,
  placeById,
  placeEntities,
  placeNarrative,
  placesInCounty,
  populationLabel,
  type CatalogMunicipality,
} from "@/lib/wyoming-ecosystem";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return MUNICIPALITIES.map((place) => ({ id: place.id }));
}

function load(id: string): CatalogMunicipality | undefined {
  return placeById(id);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const place = load(id);
  if (!place) return {};
  const county = COUNTY_BY_ID[place.countyId];
  const title = `${place.name} ${place.kind} government`;
  const description = `${place.name}, ${place.kind} in ${county.name} County, Wyoming: public contact, site status, and the local difference from Cheyenne’s meeting tactics.`;
  const canonical = siteUrl(`hub/wyoming/places/${place.id}/`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title, description },
  };
}

export default async function PlaceEcosystemPage({ params }: PageProps) {
  const { id } = await params;
  const place = load(id);
  if (!place) notFound();
  const county = COUNTY_BY_ID[place.countyId];
  const narrative = placeNarrative(place);
  const siblings = placesInCounty(county.id).filter((item) => item.id !== place.id);
  const canonical = siteUrl(`hub/wyoming/places/${place.id}/`);
  const structured = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: canonical,
    name: `${place.name} ${place.kind} government`,
    description: narrative[0],
    isPartOf: siteUrl("hub/wyoming/"),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Civic Cheyenne", item: siteUrl("") },
      { "@type": "ListItem", position: 2, name: "Wyoming", item: siteUrl("hub/wyoming/") },
      { "@type": "ListItem", position: 3, name: `${county.name} County`, item: siteUrl(`hub/wyoming/counties/${county.id}/`) },
      { "@type": "ListItem", position: 4, name: place.name, item: canonical },
    ],
  };

  return (
    <main className="gov-hub-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span>
        <a href={asset("hub/wyoming/")}>Wyoming</a><span aria-hidden="true">/</span>
        <a href={asset(`hub/wyoming/counties/${county.id}/`)}>{county.name} County</a><span aria-hidden="true">/</span>
        <span>{place.name}</span>
      </nav>
      <section className="gov-page-hero eco-hero" aria-labelledby="place-eco-title">
        <div>
          <p className="gov-kicker"><span className="gov-kicker-dot" /> {place.kind.toUpperCase()} · {county.name.toUpperCase()} COUNTY{place.major ? " · MAJOR ECOSYSTEM" : ""}</p>
          <h1 id="place-eco-title">{place.name} {place.kind} government</h1>
          {narrative.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>
      <section className="eco-fact-grid" aria-label={`${place.name} directory facts`}>
        <div><span>Directory figure</span><strong>{populationLabel(place)}</strong></div>
        <div><span>Phone</span><strong>{place.phone ?? "Not in the directory extract"}</strong></div>
        <div><span>Address</span><strong>{place.address}</strong></div>
        <div><span>Reference point</span><strong>{place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</strong></div>
      </section>
      <h2>Public site</h2>
      <WebsiteLine website={place.website} empty="No confirmed public website. This catalog does not invent one from a free-mail address." />
      {place.posting && (
        <p className="eco-website">
          <a href={place.posting.url} target="_blank" rel="noopener noreferrer">{place.posting.label}</a>
          <small>{place.posting.observed}</small>
        </p>
      )}
      <p className="eco-source-line">Coordinates: {place.coordinateSource}. They are a reference point for the map, not a surveyed boundary or a city-limit file. Catalog captured {ECOSYSTEM_CAPTURED}.</p>
      <EntityList
        entities={placeEntities(place)}
        heading={`${place.name} government entities`}
        intro="Observed boards come from a page opened for this catalog or from this repository’s Cheyenne archive. The mayor, and the council where it was not itself observed, are the catalog model. Members are not named."
      />
      <TacticMirror architectureId={place.architectureId} status={place.tacticStatus} />
      <h2>Nearby governments in the same county record</h2>
      <RelatedLinks
        countyHref={`hub/wyoming/counties/${county.id}/`}
        countyLabel={`${county.name} County`}
        places={siblings.slice(0, 12).map((item) => ({ href: `hub/wyoming/places/${item.id}/`, label: item.name }))}
      />
      <EcosystemDisclaimer />
    </main>
  );
}
