import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export const dynamic = "force-static";

/**
 * robots.txt for the project path.
 *
 * Two things worth knowing before editing this file:
 *
 * 1. Crawlers only read robots.txt from the host root, and GitHub Pages serves
 *    nothing at https://therealwindycity.github.io/robots.txt for a project
 *    site. That 404 means "no restrictions", so nothing here is blocking
 *    Googlebot today — and nothing here can accidentally block it either.
 *    The authoritative way to point Google at this sitemap is submitting the
 *    URL below in Search Console.
 * 2. The `Sitemap:` line must be absolute, because it is read from outside the
 *    site's own base path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}sitemap.xml`,
  };
}
