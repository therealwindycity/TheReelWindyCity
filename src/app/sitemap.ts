import type { MetadataRoute } from "next";
import { MEETINGS } from "@/lib/civic-data";
import { SITE_URL, siteUrl } from "@/lib/site-config";

export const dynamic = "force-static";

/**
 * Each meeting has its own statically rendered, canonical detail page. Keep
 * every indexed meeting in the sitemap so Google can discover the full archive.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      priority: 1,
    },
    {
      url: siteUrl("meetings/"),
      priority: 0.9,
    },
    {
      url: siteUrl("transcripts/"),
      priority: 0.8,
    },
    ...MEETINGS.map((meeting) => ({
      url: siteUrl(`meetings/${meeting.id}/`),
      priority: 0.7,
    })),
  ];
}
