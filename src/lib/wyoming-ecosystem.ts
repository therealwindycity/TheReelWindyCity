import catalogJson from "@/data/wyoming-ecosystem.json";

export type WebsiteVerification = "repository" | "opened" | "state-publication" | "wikidata" | "directory-domain";
export type TacticStatus = "live" | "specified" | "fail-closed";
export type ArchitectureId =
  | "granicus-publisher"
  | "civicplus-agenda-center"
  | "civicplus-cms-page"
  | "clerk-file-index"
  | "pdf-packet-folder"
  | "clerk-html-page"
  | "county-site-unobserved"
  | "unobserved";

export type CatalogWebsite = { url: string; verification: WebsiteVerification; source: string };
export type CatalogEntity = { name: string; role: string; source: string; note?: string };
export type CatalogPosting = { url: string; label: string; observed: string };

export type CatalogMunicipality = {
  id: string;
  name: string;
  kind: "city" | "town";
  countyId: string;
  alsoCountyIds: string[];
  major: boolean;
  population: number | null;
  populationSource: string | null;
  phone: string | null;
  address: string;
  latitude: number;
  longitude: number;
  coordinateSource: string;
  website: CatalogWebsite | null;
  architectureId: ArchitectureId;
  tacticStatus: TacticStatus;
  posting: CatalogPosting | null;
  entities: CatalogEntity[];
  note: string | null;
  wamListed: boolean;
};

export type CatalogCounty = {
  id: string;
  name: string;
  fips: string;
  sameCode: string;
  seatId: string;
  clerk: { address: string; phone: string; website: CatalogWebsite; alternates: CatalogWebsite[] };
  commissionerNote: string | null;
  archiveNote: string | null;
  architectureId: "county-site-unobserved";
  tacticStatus: "fail-closed";
};

export type CountyOffice = { name: string; role: string; note?: string };

type CatalogFile = {
  captured: string;
  sources: Record<string, string>;
  countyOffices: CountyOffice[];
  counties: CatalogCounty[];
  municipalities: CatalogMunicipality[];
};

const catalog = catalogJson as CatalogFile;

export const ECOSYSTEM_CAPTURED = catalog.captured;
export const ECOSYSTEM_SOURCES = catalog.sources;
export const COUNTY_OFFICES = catalog.countyOffices;
export const COUNTIES: readonly CatalogCounty[] = catalog.counties;
export const MUNICIPALITIES: readonly CatalogMunicipality[] = catalog.municipalities;

export const COUNTY_BY_ID: Record<string, CatalogCounty> = Object.fromEntries(COUNTIES.map((county) => [county.id, county]));
export const PLACE_BY_ID: Record<string, CatalogMunicipality> = Object.fromEntries(MUNICIPALITIES.map((place) => [place.id, place]));

export type TacticId = "watch" | "hash" | "extract" | "evidence" | "draft" | "decouple" | "window" | "outcome";

export type TacticStep = {
  id: TacticId;
  name: string;
  cheyenne: string;
  here: string;
};

export type ArchitectureProfile = {
  id: ArchitectureId;
  name: string;
  summary: string;
  watcher: "live" | "specified" | "not-enabled";
};

export const ARCHITECTURES: readonly ArchitectureProfile[] = [
  {
    id: "granicus-publisher",
    name: "Granicus ViewPublisher",
    summary: "A semantic upcoming-events table. Cheyenne’s live watcher is calibrated to view_id=5 only.",
    watcher: "live",
  },
  {
    id: "civicplus-agenda-center",
    name: "CivicPlus Agenda Center",
    summary: "Category pages of agendas and minutes. The daily job hashes document rows and drops ASP.NET viewstate. It does not promote a row into the public snapshot.",
    watcher: "specified",
  },
  {
    id: "civicplus-cms-page",
    name: "CivicPlus CMS page",
    summary: "The site footer says CivicPlus, but the agendas live on a CMS document page. The daily job uses the CMS parser, not Agenda Center.",
    watcher: "specified",
  },
  {
    id: "clerk-file-index",
    name: "Clerk file index",
    summary: "Packets listed by date in HTML, sometimes on more than one portal. The daily job hashes each portal as its own stream.",
    watcher: "specified",
  },
  {
    id: "pdf-packet-folder",
    name: "PDF packet folder",
    summary: "The public record is a folder of council packets. The daily job hashes dated PDF names. A vendor mentioned inside a packet is not the publisher.",
    watcher: "specified",
  },
  {
    id: "clerk-html-page",
    name: "Clerk HTML page",
    summary: "A clerk-maintained agendas page whose vendor was not identified. The daily job reads dated document links and does not guess CivicPlus or Granicus from the URL.",
    watcher: "specified",
  },
  {
    id: "county-site-unobserved",
    name: "County site, meetings unobserved",
    summary: "The clerk website is published. The daily job checks that this host still answers and has not moved. Commission software was not opened, so no meeting parser is attached.",
    watcher: "not-enabled",
  },
  {
    id: "unobserved",
    name: "No posting surface observed",
    summary: "No digital agenda publisher was opened. The daily job records the government and does not fetch it. Absence of a portal is not absence of a meeting.",
    watcher: "not-enabled",
  },
];

const ARCHITECTURE_BY_ID: Record<ArchitectureId, ArchitectureProfile> = Object.fromEntries(
  ARCHITECTURES.map((item) => [item.id, item]),
) as Record<ArchitectureId, ArchitectureProfile>;

const CHEYENNE: Record<TacticId, { name: string; cheyenne: string }> = {
  watch: {
    name: "Watch the posting surface",
    cheyenne: "An hourly watcher reads Granicus ViewPublisher view_id=5 and fails closed if the Name/Date/Agenda table is gone.",
  },
  hash: {
    name: "Hash the record, not the page",
    cheyenne: "The hash covers body, date, time, and the canonical agenda URL. Session ids, nonces, and tracking parameters are discarded.",
  },
  extract: {
    name: "Extract the packet by layout",
    cheyenne: "Agenda PDFs are read by position, column by column. A scanned or empty file fails loudly. It never becomes a blank success.",
  },
  evidence: {
    name: "Cite or drop",
    cheyenne: "Findings must quote the agenda verbatim. A model pass is quarantined behind the same gate. Invented outcomes never commit.",
  },
  draft: {
    name: "Draft to a printed address only",
    cheyenne: "Citizen drafts are mailto links. They go only to an address the agenda or the official contact page actually prints. No portal is filled in.",
  },
  decouple: {
    name: "Keep the pipeline off the public site",
    cheyenne: "Sync artifacts land in data/meetings/, which the site build does not read. A human promotes anything that becomes a curated snapshot.",
  },
  window: {
    name: "Name the publisher",
    cheyenne: "The hub loads one publisher window at a time, only after a click, and keeps a direct link for when the frame is blocked.",
  },
  outcome: {
    name: "An agenda is not a decision",
    cheyenne: "Posted items stay proposals until minutes or adopted text say otherwise. Second reading is not enactment.",
  },
};

const DELTAS: Record<ArchitectureId, Record<TacticId, string>> = {
  "granicus-publisher": {
    watch: "This is the calibrated surface. Another city’s Granicus view_id is a different publisher and needs its own seed. Do not copy view_id=5.",
    hash: "Same canonical hash. A new view_id still has to be proven against a real upcoming table before the first scheduled run.",
    extract: "The layout-aware PDF engine can be reused when the artifact is a text PDF. A different agenda grammar still has to be checked against that city’s packet.",
    evidence: "Same gate. Cheyenne quotes do not transfer.",
    draft: "Same mailto rule. A Cheyenne council address is not a valid recipient for any other body.",
    decouple: "Same split. Nothing from a new view_id reaches the public snapshot until a person promotes it.",
    window: "Same click-to-load rule. Name both the city and Granicus.",
    outcome: "Same rule. A Granicus agenda viewer is not the record of the vote.",
  },
  "civicplus-agenda-center": {
    watch: "The daily job reads Agenda Center ViewFile rows. It does not point the Granicus table parser here, and it does not run hourly.",
    hash: "Hash category, meeting date, and document title. Drop ASP.NET viewstate, event validation, and session cookies. Those change on every request.",
    extract: "The PDF engine can read a packet once a human supplies the file. The HTML category page is not a Cheyenne agenda and needs its own grammar.",
    evidence: "Same verbatim gate, against this city’s packet only.",
    draft: "No draft is generated. A directory-domain email is not a printed recipient.",
    decouple: "The daily job may commit a content hash under data/wyoming-sync-state.json. It does not write a meeting into the public snapshot.",
    window: "Link the Agenda Center URL directly. Do not iframe it until a person has checked the publisher’s frame policy.",
    outcome: "An Agenda Center row dated years ago is a file, not proof the body still meets.",
  },
  "civicplus-cms-page": {
    watch: "The daily job uses the CMS-page parser. Agenda Center and Granicus both fail closed if this page is handed to them.",
    hash: "Hash the meeting title, date, and packet link on the CMS page. Ignore the CivicPlus chrome, search widgets, and notify-me forms.",
    extract: "Reuse the PDF engine only on a packet linked from that page. Do not scrape the whole CMS.",
    evidence: "Same gate.",
    draft: "No draft. The CMS contact form is exactly the portal this project refuses to post into.",
    decouple: "A hash may be stored. A meeting is not promoted.",
    window: "Open the agendas page by link. A CivicPlus shell often blocks framing.",
    outcome: "A ‘watch live’ link is not minutes.",
  },
  "clerk-file-index": {
    watch: "There is no upcoming table. Casper’s PHP index and the older portal are separate daily streams. If one disappears or changes host, that stream fails closed instead of borrowing the other.",
    hash: "Hash the file name, meeting date, and document kind (agenda, packet, minutes, video). Ignore portal session ids in the older CMS URL.",
    extract: "Packet PDFs can use the layout engine after a human fetch. Do not merge the two portals into one reading order.",
    evidence: "Same gate, per portal. A video page is not a quote source for a motion.",
    draft: "No draft.",
    decouple: "Each portal may store its own hash. Neither portal is promoted into the public snapshot.",
    window: "Show both surfaces as separate publishers when both were observed. Do not hide the older one.",
    outcome: "A packet link is not an adopted ordinance.",
  },
  "pdf-packet-folder": {
    watch: "The public surface is a folder of PDFs. The Granicus table parser has nothing to read. A payment to Granicus inside a packet does not create a ViewPublisher.",
    hash: "Hash packet file name and date. A new file in the folder is a change. A rearranged HTML shell around the same file is not.",
    extract: "This is where Cheyenne’s PDF engine actually transfers. It still fails closed on a scanned packet.",
    evidence: "Quotes must come from the packet text, not from a news story about the meeting.",
    draft: "No draft. An email printed in a packet may be used later, by a person. It is not harvested into a mailer.",
    decouple: "The daily job hashes the folder listing. It does not download every packet into the public build.",
    window: "Link the packet. Do not pretend a PDF folder embeds like Granicus.",
    outcome: "Minutes copied into a later packet are still minutes of that earlier meeting, not a new vote.",
  },
  "clerk-html-page": {
    watch: "The daily job reads dated document links on the clerk page. A numeric path is not treated as CivicPlus, and a Granicus table fails closed.",
    hash: "Once calibrated, hash visible meeting titles and dates, not the theme markup. That calibration has not been done.",
    extract: "Only a linked PDF. The HTML page itself is not a Cheyenne agenda.",
    evidence: "Same gate.",
    draft: "No draft.",
    decouple: "A hash may be stored. The clerk page is not copied into the public meeting index.",
    window: "Direct link, publisher named as the city clerk, vendor listed as unconfirmed.",
    outcome: "An archive category is not a current calendar.",
  },
  "county-site-unobserved": {
    watch: "The daily job requests the pinned clerk host and fails closed if it redirects to a different host. It does not parse commission meetings. The Granicus watcher is not pointed at it.",
    hash: "The hash is the pinned host plus a 2xx/other class. Page markup is not hashed. An alternate hostname is not silently accepted.",
    extract: "No county packet is pulled automatically. A person can still run the PDF engine on a file they already have.",
    evidence: "Same gate, if a packet is ever reviewed by hand.",
    draft: "No draft. The clerk phone is a records contact, not a mailto target invented from the county name.",
    decouple: "Fail closed. Laramie County’s existing archive in this repository is a curated index, not a live county sync.",
    window: "Link the clerk site published by WYDOT. Name every alternate host as alternate, not as the current door.",
    outcome: "A county website does not record a city vote, and a city agenda does not record a commission vote.",
  },
  unobserved: {
    watch: "The daily job records this government and does not request a URL. A directory domain that was never opened is not probed.",
    hash: "There is no surface to hash. A free-mail clerk address is not a posting surface.",
    extract: "Nothing to extract until a person has a packet. Physical posting at town hall may be the legal notice.",
    evidence: "No findings are generated from silence.",
    draft: "No draft. Do not invent council@town.wy.gov.",
    decouple: "Fail closed.",
    window: "Show the phone and address. If a directory domain exists, label it as unopened. Do not draw an iframe.",
    outcome: "No portal is not the same as no government. It means this catalog cannot yet say what was proposed.",
  },
};

export function architectureById(id: ArchitectureId): ArchitectureProfile {
  return ARCHITECTURE_BY_ID[id];
}

export function countyById(id: string): CatalogCounty | undefined {
  return COUNTY_BY_ID[id];
}

export function placeById(id: string): CatalogMunicipality | undefined {
  return PLACE_BY_ID[id];
}

export function placesInCounty(countyId: string): CatalogMunicipality[] {
  return MUNICIPALITIES.filter((place) => place.countyId === countyId || place.alsoCountyIds.includes(countyId))
    .slice()
    .sort((a, b) => (b.population ?? -1) - (a.population ?? -1) || a.name.localeCompare(b.name));
}

export function seatOf(county: CatalogCounty): CatalogMunicipality | undefined {
  return PLACE_BY_ID[county.seatId];
}

export function tacticMirror(architectureId: ArchitectureId): TacticStep[] {
  const deltas = DELTAS[architectureId];
  return (Object.keys(CHEYENNE) as TacticId[]).map((id) => ({
    id,
    name: CHEYENNE[id].name,
    cheyenne: CHEYENNE[id].cheyenne,
    here: deltas[id],
  }));
}

export function verificationLabel(verification: WebsiteVerification): string {
  switch (verification) {
    case "opened":
      return "Homepage or agenda page opened";
    case "repository":
      return "Already cited in this repository";
    case "state-publication":
      return "Printed in a state publication";
    case "wikidata":
      return "Wikidata / Wikipedia official-website statement";
    case "directory-domain":
      return "Directory domain · homepage not opened";
    default:
      return verification;
  }
}

export function statusLabel(status: TacticStatus): string {
  switch (status) {
    case "live":
      return "Live watcher";
    case "specified":
      return "Daily watch · not promoted";
    case "fail-closed":
      return "Fail closed";
    default:
      return status;
  }
}

export type ListedEntity = CatalogEntity & { basis: "observed" | "model" };

export function placeEntities(place: CatalogMunicipality): ListedEntity[] {
  const governing = place.kind === "city" ? "City Council" : "Town Council";
  const observed = place.entities.map((item) => ({ ...item, basis: "observed" as const }));
  const names = new Set(observed.map((item) => item.name));
  const model: ListedEntity[] = [];
  if (!names.has(governing)) {
    model.push({
      name: governing,
      role: "governing-body",
      basis: "model",
      source: "Catalog model for every Wyoming " + place.kind + ". Members and seat count are not stated.",
      note: "Listed because this catalog treats every incorporated place as having a governing body. It is not a claim about who sits on it.",
    });
  }
  if (!names.has("Mayor")) {
    model.push({
      name: "Mayor",
      role: "elected-office",
      basis: "model",
      source: "Catalog model. The officeholder is not named.",
      note: "Included so the municipal office is not omitted. This is not a roster and not a term calendar.",
    });
  }
  return [...observed, ...model];
}

export function countyEntities(county: CatalogCounty): ListedEntity[] {
  return COUNTY_OFFICES.map((office) => ({
    ...office,
    basis: office.name === "Board of County Commissioners" && county.commissionerNote ? "observed" as const : "model" as const,
    source: office.name === "Board of County Commissioners" && county.commissionerNote
      ? county.clerk.website.url
      : ECOSYSTEM_SOURCES.commissionerHandbook,
    note: office.name === "Board of County Commissioners" && county.commissionerNote
      ? [office.note, county.commissionerNote].filter(Boolean).join(" ")
      : office.note,
  }));
}

export function populationLabel(place: CatalogMunicipality): string {
  if (place.population == null) return "Not published here";
  return place.population.toLocaleString("en-US");
}

export function placeNarrative(place: CatalogMunicipality): string[] {
  const county = COUNTY_BY_ID[place.countyId];
  const seat = county.seatId === place.id;
  const also = place.alsoCountyIds.map((id) => COUNTY_BY_ID[id]?.name).filter(Boolean);
  const kind = place.kind === "city" ? "a city" : "a town";
  const where = also.length
    ? `${place.name} is ${kind} in ${county.name} County, and it is also in ${also.join(" and ")} County.`
    : `${place.name} is ${kind} in ${county.name} County${seat ? ", and it is the county seat" : ""}.`;
  const people = place.population == null
    ? "No population figure is published in this catalog."
    : `The WAM 2026 directory prints ${place.population.toLocaleString("en-US")} for ${place.name}. That is a directory figure, not a new estimate.`;
  const contact = place.phone
    ? `Directory phone ${place.phone}. Address on file: ${place.address}.`
    : `Address on file: ${place.address}.`;
  const site = place.website
    ? `Public site candidate: ${place.website.url} (${verificationLabel(place.website.verification)}).`
    : "No public website is confirmed. A free-mail clerk address, where the directory had one, is not turned into a URL.";
  const arch = ARCHITECTURE_BY_ID[place.architectureId];
  const mirror = `${arch.name}. ${arch.summary} Status: ${statusLabel(place.tacticStatus)}.`;
  const split = seat
    ? `The municipal government and ${county.name} County are different publishers. County clerk contact: ${county.clerk.address}. County site: ${county.clerk.website.url}.`
    : `${county.name} County’s own site is ${county.clerk.website.url}. A posting there is not a ${place.name} posting.`;
  const lines = [where, `${people} ${contact}`, site, mirror, split];
  if (place.note) lines.push(place.note);
  if (!place.wamListed) lines.push("This town was not in the WAM HTML directory retrieved for this catalog. It is included from Census and Wikipedia incorporation, and that gap is labeled rather than smoothed over.");
  return lines;
}

export function countyNarrative(county: CatalogCounty): string[] {
  const seat = PLACE_BY_ID[county.seatId];
  const places = placesInCounty(county.id);
  const lines = [
    `${county.name} County is one of 23 Wyoming counties. Its seat is ${seat?.name ?? county.seatId}. The county government is not the government of ${seat?.name ?? "the seat"}.`,
    `County clerk, as printed by WYDOT: ${county.clerk.address}. Phone ${county.clerk.phone}. Site ${county.clerk.website.url}.`,
    county.clerk.alternates.length
      ? `Other hosts have been published for this county: ${county.clerk.alternates.map((item) => item.url).join(", ")}. They are alternates, not a second government. A future watcher would pin one host and fail closed on an unexpected redirect.`
      : "No alternate county host was recorded in this catalog.",
    `${places.length} incorporated ${places.length === 1 ? "municipality is" : "municipalities are"} plotted in this county. Each keeps its own architecture. The daily job checks this clerk host and fails closed if it moves. The commission’s meeting software was not opened, so no county agenda is parsed.`,
  ];
  if (county.commissionerNote) lines.push(county.commissionerNote);
  if (county.archiveNote) lines.push(county.archiveNote);
  return lines;
}

export type EcosystemStats = {
  counties: number;
  municipalities: number;
  cities: number;
  towns: number;
  major: number;
  live: number;
  specified: number;
  failClosed: number;
  withWebsite: number;
  directoryDomainOnly: number;
  noWebsite: number;
  hostDriftCounties: number;
};

export function ecosystemStats(): EcosystemStats {
  const places = MUNICIPALITIES;
  return {
    counties: COUNTIES.length,
    municipalities: places.length,
    cities: places.filter((place) => place.kind === "city").length,
    towns: places.filter((place) => place.kind === "town").length,
    major: places.filter((place) => place.major).length,
    live: places.filter((place) => place.tacticStatus === "live").length,
    specified: places.filter((place) => place.tacticStatus === "specified").length,
    failClosed: places.filter((place) => place.tacticStatus === "fail-closed").length + COUNTIES.length,
    withWebsite: places.filter((place) => place.website).length + COUNTIES.length,
    directoryDomainOnly: places.filter((place) => place.website?.verification === "directory-domain").length,
    noWebsite: places.filter((place) => !place.website).length,
    hostDriftCounties: COUNTIES.filter((county) => county.clerk.alternates.length > 0).length,
  };
}

export function ecosystemRoutes(): string[] {
  return [
    "hub/wyoming/",
    "hub/wyoming/architecture/",
    "hub/wyoming/entities/",
    ...COUNTIES.map((county) => `hub/wyoming/counties/${county.id}/`),
    ...MUNICIPALITIES.map((place) => `hub/wyoming/places/${place.id}/`),
  ];
}

export const OUT_OF_SCOPE = [
  "School boards, fire districts, hospital districts, cemetery districts, conservation districts, and weed-and-pest districts are local governments. They are not city councils or county commissions, so they are not enumerated here.",
  "Joint powers boards are included only when this project already named one. Sweetwater Combined Communications is a dispatch board in the scanner desk, not a city council.",
  "The Eastern Shoshone Tribe and the Northern Arapaho Tribe are sovereign. Fremont County overlaps the Wind River Reservation. Tribal councils are not mirrored as county commissions.",
  "State agencies — the Legislature, WYDOT, the Weather Service — stay publishers on the Cheyenne hub. They are not municipal ecosystems.",
] as const;
