#!/usr/bin/env node
/**
 * Write the statewide catalog JSON and the downloadable site map.
 * Facts come from scripts/data/wyoming-ecosystem-catalog.mjs. No network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_CAPTURED,
  CATALOG_SOURCES,
  COUNTY_OFFICES,
  COUNTIES,
  MUNICIPALITIES,
} from "./data/wyoming-ecosystem-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "data");
const mapDir = path.join(root, "public", "maps");
mkdirSync(dataDir, { recursive: true });
mkdirSync(mapDir, { recursive: true });

const catalog = {
  captured: CATALOG_CAPTURED,
  sources: CATALOG_SOURCES,
  countyOffices: COUNTY_OFFICES,
  counties: COUNTIES,
  municipalities: MUNICIPALITIES,
};

const byId = new Map(MUNICIPALITIES.map((place) => [place.id, place]));
const features = [
  ...MUNICIPALITIES.map((place) => ({
    type: "Feature",
    id: `place-${place.id}`,
    properties: {
      layer: "municipality",
      id: place.id,
      name: place.name,
      kind: place.kind,
      countyId: place.countyId,
      architectureId: place.architectureId,
      tacticStatus: place.tacticStatus,
      website: place.website?.url ?? null,
      websiteVerification: place.website?.verification ?? null,
      href: `hub/wyoming/places/${place.id}/`,
    },
    geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
  })),
  ...COUNTIES.map((county) => {
    const seat = byId.get(county.seatId);
    return {
      type: "Feature",
      id: `county-${county.id}`,
      properties: {
        layer: "county",
        id: county.id,
        name: `${county.name} County`,
        kind: "county",
        seatId: county.seatId,
        seatName: seat?.name ?? null,
        architectureId: county.architectureId,
        tacticStatus: county.tacticStatus,
        website: county.clerk.website.url,
        websiteVerification: county.clerk.website.verification,
        plottedAt: "county-seat",
        href: `hub/wyoming/counties/${county.id}/`,
      },
      geometry: { type: "Point", coordinates: [seat.longitude, seat.latitude] },
    };
  }),
];

const geojson = {
  type: "FeatureCollection",
  name: "Wyoming city and county government sites",
  captured: CATALOG_CAPTURED,
  notice: "Reference points only. County markers use the county-seat reference point, not a surveyed county centroid or a legal boundary. Not an official map.",
  features,
};

writeFileSync(path.join(dataDir, "wyoming-ecosystem.json"), `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(path.join(mapDir, "wyoming-government-sites.geojson"), `${JSON.stringify(geojson)}\n`);
console.log(`Wrote ${COUNTIES.length} counties and ${MUNICIPALITIES.length} municipalities.`);
