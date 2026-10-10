import { ARCHIVE_OWNER } from "@/lib/civic-data";
import { WYOMING_CITIES, type WyomingScannerFeed } from "@/lib/wyoming-cities";
import { COUNTIES, COUNTY_BY_ID, MUNICIPALITIES, PLACE_BY_ID } from "@/lib/wyoming-ecosystem";

export const PLACE_ARCHIVE_OWNER = ARCHIVE_OWNER;
export const PLACE_DOC_VOLUME = 250;

export type CivicLayer = "place" | "county";

export type CivicIdentity = {
  id: string;
  layer: CivicLayer;
  name: string;
  title: string;
  wordmark: string;
  kind: string;
  countyName: string;
  href: string;
  repo: string;
  repoUrl: string;
  website: string | null;
  phone: string | null;
  address: string;
  latitude: number;
  longitude: number;
  scanners: readonly WyomingScannerFeed[];
  cheyenne: boolean;
};

export function placeRepoName(layer: CivicLayer, id: string, volume = 1): string {
  const base = `civic-wy-${layer}-${id}`;
  return volume <= 1 ? base : `${base}-docs-${volume}`;
}

export function placeRepoUrl(layer: CivicLayer, id: string, volume = 1): string {
  return `https://github.com/${PLACE_ARCHIVE_OWNER}/${placeRepoName(layer, id, volume)}`;
}

/** Which archive repo receives the next copied file. Volume 1 fills, then a new repo is opened. */
export function repoForDocumentCount(layer: CivicLayer, id: string, existingFiles: number): { repo: string; volume: number } {
  const volume = Math.floor(Math.max(0, existingFiles) / PLACE_DOC_VOLUME) + 1;
  return { repo: placeRepoName(layer, id, volume), volume };
}

function scannersFor(name: string, countyName: string, layer: CivicLayer): readonly WyomingScannerFeed[] {
  if (layer === "place") {
    return WYOMING_CITIES.find((city) => city.id === name || city.name.toLowerCase() === name.toLowerCase())?.scanners ?? [];
  }
  return WYOMING_CITIES.filter((city) => city.county === countyName).flatMap((city) => city.scanners);
}

export function civicPlace(layer: CivicLayer, id: string): CivicIdentity | null {
  if (layer === "county") {
    const county = COUNTY_BY_ID[id];
    if (!county) return null;
    const seat = PLACE_BY_ID[county.seatId];
    const title = `${county.name} County`;
    return {
      id: county.id,
      layer,
      name: county.name,
      title,
      wordmark: title.toUpperCase(),
      kind: "county",
      countyName: title,
      href: `civic/counties/${county.id}/`,
      repo: placeRepoName(layer, county.id),
      repoUrl: placeRepoUrl(layer, county.id),
      website: county.clerk.website.url,
      phone: county.clerk.phone,
      address: county.clerk.address,
      latitude: seat?.latitude ?? 43,
      longitude: seat?.longitude ?? -107.5,
      scanners: scannersFor(county.name, title, layer),
      cheyenne: false,
    };
  }
  const place = PLACE_BY_ID[id];
  if (!place) return null;
  const county = COUNTY_BY_ID[place.countyId];
  return {
    id: place.id,
    layer,
    name: place.name,
    title: place.name,
    wordmark: place.name.toUpperCase(),
    kind: place.kind,
    countyName: county ? `${county.name} County` : place.countyId,
    href: `civic/places/${place.id}/`,
    repo: placeRepoName(layer, place.id),
    repoUrl: placeRepoUrl(layer, place.id),
    website: place.website?.url ?? null,
    phone: place.phone,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    scanners: scannersFor(place.id, county ? `${county.name} County` : "", layer),
    cheyenne: place.id === "cheyenne",
  };
}

export function allCivicPlaces(): CivicIdentity[] {
  return [
    ...MUNICIPALITIES.map((place) => civicPlace("place", place.id)!),
    ...COUNTIES.map((county) => civicPlace("county", county.id)!),
  ];
}

export function searchCivicPlaces(query: string): CivicIdentity[] {
  const needle = query.trim().toLowerCase();
  const all = allCivicPlaces();
  if (!needle) return all;
  return all.filter((place) => `${place.title} ${place.countyName} ${place.kind}`.toLowerCase().includes(needle));
}

export function civicRoutes(): string[] {
  return [
    ...MUNICIPALITIES.map((place) => `civic/places/${place.id}/`),
    ...COUNTIES.map((county) => `civic/counties/${county.id}/`),
  ];
}
