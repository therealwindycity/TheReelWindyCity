import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { asset } from "@/lib/civic-data";
import {
  architectureById,
  statusLabel,
  tacticMirror,
  verificationLabel,
  type ArchitectureId,
  type CatalogWebsite,
  type ListedEntity,
  type TacticStatus,
} from "@/lib/wyoming-ecosystem";

export function EcosystemDisclaimer() {
  return (
    <aside className="gov-caution-card">
      <ShieldCheck size={20} aria-hidden="true" />
      <p><strong>A catalog of public doors, not an official directory.</strong> Independent of every city and county it names. Markers are reference points, not boundaries. A directory domain was not opened. An agenda, where one was seen, is not a vote.</p>
    </aside>
  );
}

export function WebsiteLine({ website, empty }: { website: CatalogWebsite | null; empty: string }) {
  if (!website) return <p className="eco-missing">{empty}</p>;
  return (
    <p className="eco-website">
      <a href={website.url} target="_blank" rel="noopener noreferrer">{website.url} <ArrowUpRight size={12} aria-hidden="true" /></a>
      <small>{verificationLabel(website.verification)}. {website.source}</small>
    </p>
  );
}

export function TacticMirror({ architectureId, status }: { architectureId: ArchitectureId; status: TacticStatus }) {
  const profile = architectureById(architectureId);
  const steps = tacticMirror(architectureId);
  const headingId = `eco-tactic-${architectureId}`;
  return (
    <section className="eco-tactic" aria-labelledby={headingId}>
      <div className="gov-section-heading">
        <div>
          <p className="gov-kicker">CHEYENNE TACTIC · LOCAL DIFFERENCE</p>
          <h2 id={headingId}>{profile.name}</h2>
        </div>
        <p>{statusLabel(status)}. {profile.summary}</p>
      </div>
      <ol className="eco-steps">
        {steps.map((step, index) => (
          <li key={step.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.name}</h3>
              <p><strong>Cheyenne. </strong>{step.cheyenne}</p>
              <p><strong>Here. </strong>{step.here}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function EntityList({ entities, heading, intro }: { entities: ListedEntity[]; heading: string; intro: string }) {
  const headingId = `eco-entities-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="eco-entity-block" aria-labelledby={headingId}>
      <div className="gov-section-heading">
        <div>
          <p className="gov-kicker">GOVERNMENT ENTITIES</p>
          <h2 id={headingId}>{heading}</h2>
        </div>
        <p>{intro}</p>
      </div>
      <ul className="eco-entities">
        {entities.map((entity) => (
          <li key={`${entity.basis}-${entity.name}`}>
            <div>
              <strong>{entity.name}</strong>
              <small>{entity.basis === "observed" ? "Observed" : "Catalog model"} · {entity.role.replace(/-/g, " ")}</small>
            </div>
            {entity.note && <p>{entity.note}</p>}
            <p className="eco-source-line">Source: {entity.source}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RelatedLinks({ countyHref, countyLabel, places }: { countyHref?: string; countyLabel?: string; places: Array<{ href: string; label: string }> }) {
  return (
    <nav className="eco-related" aria-label="Related governments">
      {countyHref && countyLabel && <a href={asset(countyHref)}>{countyLabel} <ArrowUpRight size={13} aria-hidden="true" /></a>}
      {places.map((place) => <a key={place.href} href={asset(place.href)}>{place.label} <ArrowUpRight size={13} aria-hidden="true" /></a>)}
    </nav>
  );
}
