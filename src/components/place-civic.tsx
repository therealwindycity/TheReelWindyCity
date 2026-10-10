import { ArrowUpRight, Landmark, MapPin, Radio, ShieldCheck } from "lucide-react";
import { PlacePickerButton } from "@/components/place-picker-button";
import { asset } from "@/lib/civic-data";
import { PLACE_ARCHIVE_OWNER, PLACE_DOC_VOLUME, type CivicIdentity } from "@/lib/civic-places";
import { COUNTY_BY_ID, PLACE_BY_ID, placesInCounty } from "@/lib/wyoming-ecosystem";

export function PlaceCivic({ place }: { place: CivicIdentity }) {
  const county = place.layer === "county" ? COUNTY_BY_ID[place.id] : COUNTY_BY_ID[PLACE_BY_ID[place.id]?.countyId ?? ""];
  const neighbors = place.layer === "place"
    ? placesInCounty(PLACE_BY_ID[place.id]?.countyId ?? "").filter((item) => item.id !== place.id).slice(0, 8)
    : placesInCounty(place.id).slice(0, 8);
  return (
    <div className="civic-shell" data-style="prairie">
      <aside className="sidebar">
        <a className="brand" href={asset(place.href)} aria-label={`${place.title} civic overview`}><span className="brand-symbol"><Landmark size={26} strokeWidth={1.6} /></span><span className="brand-wordmark">civic<span>{place.wordmark}</span></span></a>
        <PlacePickerButton label={`${place.title}, Wyoming`} />
        <div className="sidebar-section-label">THIS GOVERNMENT</div>
        <a className="sidebar-featured-link" href={asset("")}><span><Landmark size={17} /></span><span><strong>Civic Cheyenne</strong><small>Full council record</small></span><ArrowUpRight size={13} /></a>
        <a className="sidebar-featured-link" href={`https://github.com/${PLACE_ARCHIVE_OWNER}/TheReelWindyCity/tree/main/public/place-docs/${place.layer}/${place.id}`}><span><Radio size={17} /></span><span><strong>Document archive</strong><small>{place.repo}</small></span><ArrowUpRight size={13} /></a>
        <a className="sidebar-featured-link" href={asset(place.layer === "county" ? `hub/wyoming/counties/${place.id}/` : `hub/wyoming/places/${place.id}/`)}><span><MapPin size={17} /></span><span><strong>Ecosystem record</strong><small>Sites, offices, tactic</small></span><ArrowUpRight size={13} /></a>
        <div className="sidebar-bottom"><div className="public-record-note"><ShieldCheck size={22} /><h3>Real government. Copied records.</h3><p>Not a fictional city.<br />Not an official service.</p></div><div className="sidebar-city-mark"><span>{place.wordmark}</span><small>{place.countyName}</small></div></div>
      </aside>
      <div className="app-main">
        <header className="topbar"><div className="topbar-breadcrumb"><span>Wyoming</span><strong>{place.title}</strong></div></header>
        <main className="main-content">
          <div className="overview-page page-enter">
            <div className="page-intro">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot" /> {place.kind.toUpperCase()} · {place.countyName.toUpperCase()}</div>
                <h1>{place.title} civic record.</h1>
                <p>This is the {place.title} civic, not Cheyenne’s. The shell, the archive, and the documents follow this government. Cheyenne’s ordinances are not relabeled as {place.title}’s.</p>
              </div>
              <div className="overview-intro-actions">
                {place.cheyenne && <a className="button button-primary" href={asset("")}>Enter the full Cheyenne council record <ArrowUpRight size={14} /></a>}
                <a className="button button-outline" href={`https://github.com/${PLACE_ARCHIVE_OWNER}/TheReelWindyCity/tree/main/public/place-docs/${place.layer}/${place.id}`}>Open copied documents <ArrowUpRight size={14} /></a>
              </div>
            </div>
            <section className="statewide-entry">
              <div>
                <span className="eyebrow">PLACE ARCHIVE</span>
                <h2>Public documents copied for {place.title} live in their own repo.</h2>
                <p>The daily job copies files from this government’s own site into this archive. When a folder passes {PLACE_DOC_VOLUME} files, the scraper opens the next volume instead of stuffing one folder forever. A separate GitHub repo named {place.repo} is created when the archive token can open repositories. A file is not invented when the page has no document.</p>
              </div>
            </section>
            <section className="eco-fact-grid">
              <div><span>Government</span><strong>{place.title}</strong></div>
              <div><span>Phone</span><strong>{place.phone ?? "Not in the catalog"}</strong></div>
              <div><span>Address</span><strong>{place.address}</strong></div>
              <div><span>Public site</span><strong>{place.website ? <a href={place.website}>{place.website.replace(/^https?:\/\//, "")}</a> : "No confirmed site"}</strong></div>
            </section>
            <section className="eco-scope">
              <h2>What changes with this click</h2>
              <ul>
                <li>The wordmark, the meetings, and the document library are {place.title}’s. Cheyenne’s January 26 ordinances stay on the Cheyenne civic.</li>
                <li>The archive repo is {place.repo}. Overflow repos are created by the scraper, not by hand, when more files are copied.</li>
                <li>{county ? `${county.name} County’s clerk site is a different government from any city in it.` : "County and city remain different publishers."}</li>
                <li>Scanner audio, where a public Broadcastify feed is already in the desk, is linked. Premium audio is not downloaded without a session.</li>
              </ul>
            </section>
            {place.scanners.length > 0 && (
              <section className="eco-scope">
                <h2>Public scanner feeds</h2>
                <ul>
                  {place.scanners.slice(0, 6).map((feed) => (
                    <li key={feed.id}><a href={feed.listenUrl}>{feed.name}</a>{feed.archiveUrl ? <> · <a href={feed.archiveUrl}>archive</a></> : null}</li>
                  ))}
                </ul>
              </section>
            )}
            {neighbors.length > 0 && (
              <section className="eco-scope">
                <h2>Switch again</h2>
                <div className="eco-related">
                  {place.layer === "place" && county && <a href={asset(`civic/counties/${county.id}/`)}>{county.name} County</a>}
                  {neighbors.map((item) => <a key={item.id} href={asset(`civic/places/${item.id}/`)}>{item.name}</a>)}
                  <a href={asset("")}>Cheyenne</a>
                </div>
              </section>
            )}
            <p className="overview-footer-note"><ShieldCheck size={15} /> Independent of {place.title}. Copied files remain the publisher’s records. An agenda is not a vote.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
