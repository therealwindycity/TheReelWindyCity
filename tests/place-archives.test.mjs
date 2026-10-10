import assert from "node:assert/strict";
import test from "node:test";
import { documentLinks, repoName, roster, volumeForCount, VOLUME } from "../scripts/sync/place-archives.mjs";

test("every government has its own archive repo name", () => {
  const rows = roster();
  assert.equal(rows.length, 122);
  assert.equal(new Set(rows.map((row) => repoName(row.layer, row.id))).size, 122);
  assert.equal(repoName("place", "cheyenne"), "civic-wy-place-cheyenne");
  assert.equal(repoName("county", "laramie", 2), "civic-wy-county-laramie-docs-2");
  assert.equal(volumeForCount(0), 1);
  assert.equal(volumeForCount(249), 1);
  assert.equal(volumeForCount(250), 2);
  assert.equal(repoName("place", "casper", Math.floor(250 / VOLUME) + 1), "civic-wy-place-casper-docs-2");
});

test("document copy stays on the pinned host", () => {
  const html = `<a href="/packet.pdf">packet</a><a href="https://evil.example/secret.pdf">no</a><a href="notes.html">no</a>`;
  assert.deepEqual(documentLinks(html, "https://www.casperwy.gov/agendas/"), ["https://www.casperwy.gov/packet.pdf"]);
});

test("a directory-only town is not given an invented harvest URL", () => {
  const lost = roster().find((row) => row.id === "lost-springs");
  assert.equal(lost.url, null);
  assert.equal(roster().find((row) => row.id === "cheyenne").url.includes("view_id=5"), true);
});
