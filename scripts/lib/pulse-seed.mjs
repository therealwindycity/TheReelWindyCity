/**
 * Seed maintenance for the Wyoming Pulse fallback snapshot.
 *
 * The curated seed is what the desk shows when a publisher feed cannot be
 * reached at build time, so every entry must stay real and source-linked. These
 * helpers are shared by `scripts/refresh-pulse-seed.mjs` and the Pulse tests.
 */

export const MAX_SEED_ITEMS = 60;

/** Return human-readable problems with a candidate seed story (empty = valid). */
export function validateSeedStory(story) {
  const problems = [];
  if (!/^https:\/\//.test(String(story?.source_id ?? ""))) problems.push("source_id must be an https article URL");
  if (!String(story?.title ?? "").trim()) problems.push("title is required");
  if (!Array.isArray(story?.tags) || !story.tags.length) problems.push("tags must include the publisher name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(story?.event_time ?? ""))) problems.push("event_time must be YYYY-MM-DD");
  if (!String(story?.source ?? "").startsWith("rss-")) problems.push("source must be an rss-<publisher-id> tag");
  return problems;
}

/**
 * Merge verified stories into a seed payload. Rejects invalid or duplicate
 * entries, keeps the newest MAX_SEED_ITEMS items, and advances capturedAt to the
 * newest story date so the desk never labels itself fresher than its content.
 */
export function mergeSeedStories(seed, incoming, { capturedAt: capturedAtOverride } = {}) {
  if (!Array.isArray(incoming)) throw new TypeError("incoming stories must be an array");

  const known = new Set(seed.alerts.map((alert) => alert.source_id));
  const accepted = [];
  const rejected = [];
  for (const story of incoming) {
    const problems = validateSeedStory(story);
    if (problems.length) {
      rejected.push(`${story?.title ?? "(untitled)"}: ${problems.join("; ")}`);
      continue;
    }
    if (known.has(story.source_id)) {
      rejected.push(`${story.title}: already in the seed`);
      continue;
    }
    known.add(story.source_id);
    accepted.push(story);
  }

  const alerts = [...seed.alerts, ...accepted]
    .sort((a, b) => String(b.event_time).localeCompare(String(a.event_time)))
    .slice(0, MAX_SEED_ITEMS);
  const capturedAt = capturedAtOverride
    ?? alerts.reduce((newest, alert) => (String(alert.event_time) > newest ? String(alert.event_time) : newest), seed.capturedAt);

  return {
    seed: {
      ...seed,
      capturedAt,
      counts: { ...seed.counts, total: alerts.length, rss: alerts.length },
      alerts,
    },
    accepted,
    rejected,
  };
}
