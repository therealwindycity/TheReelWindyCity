import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { COUNTIES, MUNICIPALITIES } from "../scripts/data/wyoming-ecosystem-catalog.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("catalog covers every Wyoming county and incorporated municipality", () => {
  assert.equal(COUNTIES.length, 23);
  assert.equal(MUNICIPALITIES.length, 99);
  assert.equal(MUNICIPALITIES.filter((place) => place.kind === "city").length, 19);
  assert.equal(MUNICIPALITIES.filter((place) => place.kind === "town").length, 80);
  assert.equal(new Set(MUNICIPALITIES.map((place) => place.id)).size, 99);
  assert.equal(new Set(COUNTIES.map((county) => county.id)).size, 23);
});

test("every seat, county, and coordinate is a real reference in Wyoming", () => {
  const places = new Map(MUNICIPALITIES.map((place) => [place.id, place]));
  const counties = new Set(COUNTIES.map((county) => county.id));
  for (const county of COUNTIES) {
    assert.ok(places.has(county.seatId), `${county.name} seat is missing`);
    assert.equal(county.architectureId, "county-site-unobserved");
    assert.equal(county.tacticStatus, "fail-closed");
    assert.match(county.clerk.website.url, /^https:\/\//);
    assert.equal(county.sameCode, `0${county.fips}`);
  }
  for (const place of MUNICIPALITIES) {
    assert.ok(counties.has(place.countyId), `${place.name} county is missing`);
    for (const extra of place.alsoCountyIds) assert.ok(counties.has(extra));
    assert.ok(place.latitude > 40.9 && place.latitude < 45.1, place.name);
    assert.ok(place.longitude < -104 && place.longitude > -111.2, place.name);
    if (place.website) assert.match(place.website.url, /^https:\/\//);
    if (place.tacticStatus === "live") assert.equal(place.id, "cheyenne");
    if (place.architectureId === "unobserved") assert.equal(place.tacticStatus, "fail-closed");
  }
  assert.equal(MUNICIPALITIES.filter((place) => !place.wamListed).map((place) => place.id).join(), "la-barge");
  assert.equal(places.get("la-barge").population, null);
  assert.deepEqual(places.get("frannie").alsoCountyIds, ["park"]);
});

test("Cheyenne stays the only live Granicus watcher", () => {
  const cheyenne = MUNICIPALITIES.find((place) => place.id === "cheyenne");
  assert.equal(cheyenne.architectureId, "granicus-publisher");
  assert.equal(cheyenne.tacticStatus, "live");
  assert.match(cheyenne.posting.url, /cheyenne\.granicus\.com\/ViewPublisher\.php\?view_id=5$/);
  const live = MUNICIPALITIES.filter((place) => place.tacticStatus === "live");
  assert.equal(live.length, 1);
});

test("generated site map matches the catalog", () => {
  const built = spawnSync(process.execPath, ["scripts/build-ecosystem-data.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const catalog = JSON.parse(readFileSync(path.join(root, "src/data/wyoming-ecosystem.json"), "utf8"));
  const map = JSON.parse(readFileSync(path.join(root, "public/maps/wyoming-government-sites.geojson"), "utf8"));
  assert.equal(catalog.counties.length, 23);
  assert.equal(catalog.municipalities.length, 99);
  assert.equal(map.features.length, 122);
  assert.equal(map.features.filter((feature) => feature.properties.layer === "county").length, 23);
  const cheyenne = map.features.find((feature) => feature.properties.id === "cheyenne" && feature.properties.layer === "municipality");
  assert.ok(cheyenne);
  assert.equal(cheyenne.geometry.coordinates[0], MUNICIPALITIES.find((place) => place.id === "cheyenne").longitude);
});
