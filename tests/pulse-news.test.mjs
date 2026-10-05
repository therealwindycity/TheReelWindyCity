import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyPublisherStory, parsePublisherFeed } from "../scripts/lib/pulse-news.mjs";

const feed = { id: "wyoming-desk", name: "Wyoming Desk", website: "https://example.com/" };

test("parses RSS headlines, CDATA summaries, dates, and direct publisher links", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[Wyoming lawmakers debate a new bill]]></title>
    <link>https://example.com/news/legislature/</link>
    <pubDate>Fri, 02 Oct 2026 15:00:00 GMT</pubDate>
    <description><![CDATA[<p>County officials described the proposal.</p>]]></description>
  </item></channel></rss>`;
  const [story] = parsePublisherFeed(xml, feed, "2026-10-04T00:00:00.000Z");
  assert.equal(story.title, "Wyoming lawmakers debate a new bill");
  assert.equal(story.source_id, "https://example.com/news/legislature/");
  assert.equal(story.category, "government");
  assert.equal(story.summary, "County officials described the proposal.");
  assert.equal(story.event_time, "2026-10-02T15:00:00.000Z");
});

test("parses Atom link attributes and classifies public-safety headlines", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Crash closes Wyoming highway near Pinedale</title>
    <link href="https://example.com/news/crash" />
    <updated>2026-10-03T09:00:00Z</updated>
    <summary>Two vehicles collided on US 191.</summary>
  </entry></feed>`;
  const [story] = parsePublisherFeed(xml, feed, "2026-10-04T00:00:00.000Z");
  assert.equal(story.source_id, "https://example.com/news/crash");
  assert.equal(story.category, "accident");
  assert.equal(story.severity, "informational");
});

test("loads only real, source-linked Wyoming seed stories for offline and failed-feed fallback", async () => {
  const seed = JSON.parse(await readFile(new URL("../src/data/wyoming-pulse-seed.json", import.meta.url), "utf8"));
  assert.equal(seed.mode, "curated-seed");
  assert.equal(seed.counts.total, seed.alerts.length);
  assert.equal(seed.alerts.length, 23);
  assert.ok(seed.alerts.every((story) => /^https:\/\//.test(story.source_id)));
  assert.ok(seed.alerts.some((story) => /Pinedale/.test(story.title)));
  assert.ok(seed.alerts.some((story) => /Supreme Court/.test(story.title)));
  assert.ok(seed.alerts.some((story) => /Belt Loop/.test(story.title)));
  assert.ok(seed.alerts.some((story) => story.category === "sports" && /Star Valley/.test(story.summary)));
  assert.ok(seed.alerts.some((story) => /Tomb Petty/.test(story.summary)));
  assert.ok(seed.alerts.some((story) => /data center/i.test(story.title)));
  assert.ok(seed.alerts.every((story) => !/^demo-/i.test(story.source_id)));
});

test("news classification routes environment, elections, and community stories", () => {
  assert.equal(classifyPublisherStory("Wyoming voters weigh a property-tax initiative"), "election");
  assert.equal(classifyPublisherStory("National forest travel rules draw public comments"), "environment");
  assert.equal(classifyPublisherStory("Mental-health suicide prevention review names local risk factors"), "health");
  assert.equal(classifyPublisherStory("Wyoming high school football scoreboard: Star Valley wins in overtime"), "sports");
  assert.equal(classifyPublisherStory("Casper community celebrates a local arts festival"), "community");
});
