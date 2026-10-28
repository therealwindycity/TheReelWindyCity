import type { MetadataRoute } from "next";
import { MEETINGS, MEETINGS_CAPTURED } from "@/lib/civic-data";
import { SITE_URL, siteUrl } from "@/lib/site-config";
import { civicRoutes } from "@/lib/civic-places";
import { ECOSYSTEM_CAPTURED, ecosystemRoutes } from "@/lib/wyoming-ecosystem";

export const dynamic = "force-static";

// Preserve source snapshot dates rather than claiming every deploy changes every record.
function snapshotDate(): Date {
  const parsed = new Date(`${MEETINGS_CAPTURED}T00:00:00.000Z`);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) return parsed;
  const newest = MEETINGS.map((meeting) => meeting.date).sort().at(-1);
  const fallback = new Date(`${newest ?? "1970-01-01"}T00:00:00.000Z`);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = snapshotDate();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    // These pages have no independently tracked modification date; do not invent one.
    ...["explore/", "explore/public-safety/", "community/", "about/", "workspace/"].map((route): MetadataRoute.Sitemap[number] => ({
      url: siteUrl(route), changeFrequency: "monthly", priority: 0.7,
    })),
    { url: siteUrl("meetings/"), lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: siteUrl("transcripts/"), lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: siteUrl("mynewspace/"), lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: siteUrl("hub/"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: siteUrl("hub/meetings/"), lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: siteUrl("hub/signals/"), lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: siteUrl("hub/learn/"), lastModified, changeFrequency: "monthly", priority: 0.7 },
    ...ecosystemRoutes().map((route): MetadataRoute.Sitemap[number] => ({
      url: siteUrl(route),
      lastModified: new Date(`${ECOSYSTEM_CAPTURED}T00:00:00.000Z`),
      changeFrequency: "monthly",
      priority: route === "hub/wyoming/" ? 0.8 : 0.6,
    })),
    ...civicRoutes().map((route): MetadataRoute.Sitemap[number] => ({
      url: siteUrl(route),
      lastModified: new Date(`${ECOSYSTEM_CAPTURED}T00:00:00.000Z`),
      changeFrequency: "weekly",
      priority: 0.7,
    })),
    ...MEETINGS.map((meeting): MetadataRoute.Sitemap[number] => ({
      url: siteUrl(`meetings/${meeting.id}/`),
      lastModified,
      changeFrequency: meeting.upcoming ? "daily" : "yearly",
      priority: meeting.upcoming ? 0.8 : 0.7,
    })),
  ];
}
