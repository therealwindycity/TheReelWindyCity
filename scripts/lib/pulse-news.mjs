import { parse } from "node-html-parser";

const CATEGORY_RULES = [
  ["breaking", /\b(breaking|urgent|emergency|evacuation|disaster)\b/i],
  ["weather", /\b(weather|forecast|snow|blizzard|storm|wind warning|wind advisory|flood|fog|temperature|rainfall|drought|heat wave)\b/i],
  ["fire", /\b(wildfire|wild fire|fire ban|burn ban|red flag|fire weather|firefighter|brush fire)\b/i],
  ["election", /\b(election|ballot|voter|voting|campaign|candidate|primary|polling|initiative|referendum)\b/i],
  ["court", /\b(court|judge|lawsuit|legal challenge|supreme court|ruling|trial|sentenced|plea|appeal|immunity)\b/i],
  ["government", /\b(lawmakers?|legislature|governor|commissioners?|county commission|city council|state agency|public hearing|ordinance|bill would|draft bill|government|tax policy)\b/i],
  ["crime", /\b(police|sheriff|arrest|crime|shooting|stabbing|drug|narcotics|assault|robbery|investigation|swatting)\b/i],
  ["accident", /\b(crash|accident|collision|wreck|fatal|killed|injured|overturn|pileup)\b/i],
  ["environment", /\b(environment|wildlife|public lands?|national parks?|national forest|conservation|climate|energy|coal|oil|gas|uranium|wind turbine|solar|river|water rights|ecosystem|park service|outdoors)\b/i],
  ["health", /\b(healthcare|health care|mental health|health department|hospital|clinic|medical|medicaid|suicide prevention|ambulance|paramedic)\b/i],
  ["road_conditions", /\b(road|highway|interstate|traffic|closure|closed|construction|travel conditions?|detour|chain law|wyodot)\b/i],
  ["sports", /\b(sport|football|basketball|volleyball|baseball|softball|soccer|wrestling|tennis|golf|cross[- ]country|swimming|rodeo|scoreboard|playoffs?|championship|all-state|touchdown|standings)\b/i],
];

/**
 * Decide how a build snapshot should describe itself. A feed that is reachable
 * but empty is not live coverage, so the curated fallback keeps its honest
 * "curated-seed" label unless at least one source actually returned items.
 */
export function publisherSnapshotMode(agencyResults = [], publisherResults = []) {
  const returnedStories = (results) => results.some((result) => (
    result?.status === "ok" && Array.isArray(result.alerts) && result.alerts.length > 0
  ));
  return returnedStories(agencyResults) || returnedStories(publisherResults)
    ? "published-snapshot"
    : "curated-seed";
}

function tagName(node) {
  return String(node?.rawTagName ?? node?.tagName ?? "").toLowerCase();
}

function childByName(parent, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return parent?.childNodes?.find((node) => wanted.has(tagName(node))) ?? null;
}

function textContent(node) {
  if (!node) return "";
  return String(node.text ?? node.textContent ?? "").trim();
}

function fieldText(item, names) {
  return textContent(childByName(item, names));
}

function fieldMarkup(item, names) {
  const node = childByName(item, names);
  return String(node?.innerHTML ?? node?.text ?? "").trim();
}

export function stripFeedMarkup(value, limit = 360) {
  const unwrapped = String(value ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const text = parse(unwrapped).text
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\n ]+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function classifyPublisherStory(title, summary = "") {
  const text = `${title} ${summary}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return "community";
}

function safeArticleUrl(item, feed) {
  const linkNode = childByName(item, ["link"]);
  const href = linkNode?.getAttribute?.("href");
  const nodeLink = textContent(linkNode);
  const linkIndex = item.childNodes?.indexOf(linkNode) ?? -1;
  const siblingLink = linkIndex >= 0
    ? item.childNodes.slice(linkIndex + 1).find((node) => !tagName(node) && /^https?:\/\//i.test(textContent(node)))
    : null;
  const guid = fieldText(item, ["guid", "id"]);
  const link = href || nodeLink || textContent(siblingLink) || (/^https?:\/\//i.test(guid) ? guid : "");
  if (!link) return "";
  try {
    const resolved = new URL(link, feed.website);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.toString() : "";
  } catch {
    return "";
  }
}

function publishedAt(item, now) {
  const dateText = fieldText(item, ["pubdate", "published", "updated", "dc:date", "date"]);
  if (!dateText) return now;
  const date = new Date(dateText);
  return Number.isFinite(date.getTime()) ? date.toISOString() : now;
}

/** Parse both common RSS 2.0 items and Atom entries into source-attributed headlines. */
export function parsePublisherFeed(xml, feed, now = new Date().toISOString()) {
  const document = parse(String(xml ?? ""));
  const entries = [...document.querySelectorAll("item"), ...document.querySelectorAll("entry")];
  const seen = new Set();
  const alerts = [];

  for (const item of entries) {
    const title = stripFeedMarkup(fieldMarkup(item, ["title"]), 240);
    if (!title) continue;

    const articleUrl = safeArticleUrl(item, feed);
    const sourceId = articleUrl || `${feed.id}:${title}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const summary = stripFeedMarkup(
      fieldMarkup(item, ["description", "summary", "content:encoded", "content"]),
      360,
    );
    const eventTime = publishedAt(item, now);
    alerts.push({
      source: `rss-${feed.id}`,
      source_id: sourceId,
      severity: /\b(breaking|urgent|emergency|evacuation)\b/i.test(`${title} ${summary}`)
        ? "urgent"
        : "informational",
      category: classifyPublisherStory(title, summary),
      title,
      summary,
      location: {},
      event_time: eventTime,
      ingested_at: now,
      tags: [feed.name],
    });
  }

  return alerts.slice(0, 12);
}
