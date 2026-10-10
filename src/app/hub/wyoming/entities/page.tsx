import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { EcosystemDisclaimer } from "@/components/ecosystem-detail";
import { asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";
import {
  COUNTIES,
  COUNTY_OFFICES,
  ECOSYSTEM_CAPTURED,
  ECOSYSTEM_SOURCES,
  placesInCounty,
  populationLabel,
  seatOf,
  statusLabel,
  verificationLabel,
} from "@/lib/wyoming-ecosystem";

const canonical = siteUrl("hub/wyoming/entities/");
const description = "Directory of all 23 Wyoming counties and 99 incorporated municipalities, with clerk and city contacts, public sites, and the architecture label for each.";

export const metadata: Metadata = {
  title: "Wyoming City and County Directory",
  description,
  alternates: { canonical },
  openGraph: { type: "website", url: canonical, siteName: SITE_NAME, title: "Every Wyoming city, town, and county in this catalog", description },
};

export default function WyomingEntitiesPage() {
  return (
    <main className="gov-hub-main">
      <nav className="gov-breadcrumb" aria-label="Breadcrumb">
        <a href={asset("")}>Civic Cheyenne</a><span aria-hidden="true">/</span>
        <a href={asset("hub/wyoming/")}>Wyoming</a><span aria-hidden="true">/</span>
        <span>Entities</span>
      </nav>
      <section className="gov-page-hero eco-hero" aria-labelledby="eco-entities-title">
        <div>
          <p className="gov-kicker"><span className="gov-kicker-dot" /> FULL DIRECTORY · {ECOSYSTEM_CAPTURED}</p>
          <h1 id="eco-entities-title">Every Wyoming city, town, and county in this catalog.</h1>
          <p>23 county governments and 99 incorporated municipalities. County offices follow the WCCA commissioner handbook’s officer list. Municipal pages add a mayor and a council as a catalog model, and name extra boards only where a public page was opened. No officeholders are listed.</p>
        </div>
      </section>

      <section aria-labelledby="eco-county-offices-title">
        <h2 id="eco-county-offices-title">Offices present in every county</h2>
        <ul className="eco-office-row">
          {COUNTY_OFFICES.map((office) => <li key={office.name}><strong>{office.name}</strong>{office.note && <span>{office.note}</span>}</li>)}
        </ul>
        <p className="eco-source-line">Source: <a href={ECOSYSTEM_SOURCES.commissionerHandbook}>WCCA County Commissioner Handbook 2025–2026</a>. This is the pattern, not a statement that every office is full-time in every county.</p>
      </section>

      {COUNTIES.map((county) => {
        const seat = seatOf(county);
        const places = placesInCounty(county.id);
        return (
          <section key={county.id} className="eco-county-block" id={county.id} aria-labelledby={`county-${county.id}`}>
            <div className="eco-county-head">
              <div>
                <p className="gov-kicker">COUNTY · FIPS {county.fips} · SEAT {seat?.name}</p>
                <h2 id={`county-${county.id}`}><a href={asset(`hub/wyoming/counties/${county.id}/`)}>{county.name} County</a></h2>
                <p>{county.clerk.address} · {county.clerk.phone}</p>
                <p><a href={county.clerk.website.url}>{county.clerk.website.url}</a> · {verificationLabel(county.clerk.website.verification)}</p>
              </div>
              <a className="gov-text-link" href={asset(`hub/wyoming/counties/${county.id}/`)}>County record <ArrowUpRight size={13} aria-hidden="true" /></a>
            </div>
            <div className="eco-table-wrap">
              <table className="eco-table">
                <caption>{places.length} incorporated {places.length === 1 ? "place" : "places"} associated with {county.name} County</caption>
                <thead>
                  <tr>
                    <th scope="col">Government</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Directory figure</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Site</th>
                    <th scope="col">Architecture</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => (
                    <tr key={place.id}>
                      <th scope="row"><a href={asset(`hub/wyoming/places/${place.id}/`)}>{place.name}</a>{place.alsoCountyIds.includes(county.id) ? " · also in this county" : ""}</th>
                      <td>{place.kind}{county.seatId === place.id ? " · seat" : ""}</td>
                      <td>{populationLabel(place)}</td>
                      <td>{place.phone ?? "—"}</td>
                      <td>{place.website ? <a href={place.website.url}>{place.website.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : "None confirmed"}</td>
                      <td>{statusLabel(place.tacticStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <EcosystemDisclaimer />
    </main>
  );
}
