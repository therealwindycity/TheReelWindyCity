import type { MetadataRoute } from "next";
import { MEETINGS, MEETINGS_CAPTURED } from "@/lib/civic-data";
import { SITE_URL, siteUrl } from "@/lib/site-config";

export const dynamic = "force-static";

/**
 * `<lastmod>` must describe a real change to the record, not the moment the
 * site was built. Google discounts a lastmod that is simply "now" on every
 * deploy, so every entry carries the archive snapshot date the index was last
 * assembled from (`captured` in src/data/meetings.json). A future-dated or
 * unparseable snapshot falls back to the newest meeting in the index.
 */
function snapshotDate(): Date {
  const parsed = new Date(`${MEETINGS_CAPTURED}T00:00:00.000Z`);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) return parsed;
  const newest = MEETINGS.map((meeting) => meeting.date).sort().at(-1);
  const fallback = new Date(`${newest ?? "1970-01-01"}T00:00:00.000Z`);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

/**
 * Every meeting has its own statically rendered, canonical detail page. Keep
 * every indexed meeting in the sitemap, with a lastmod that reflects when the
 * underlying record snapshot changed — historical records are frozen, while
 * posted agendas are still being updated by the city.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = snapshotDate();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: siteUrl("meetings/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: siteUrl("transcripts/"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...MEETINGS.map((meeting): MetadataRoute.Sitemap[number] => ({
      url: siteUrl(`meetings/${meeting.id}/`),
      lastModified,
      // A posted agenda is still changing; a past record is a settled archive entry.
      changeFrequency: meeting.upcoming ? "daily" : "yearly",
      priority: meeting.upcoming ? 0.8 : 0.7,
    })),
  ];
}
