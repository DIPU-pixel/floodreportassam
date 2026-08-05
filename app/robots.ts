import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://assamfloodwatch.com";

// Served at /robots.txt — lets search engines crawl everything and points them
// at the sitemap. API routes are non-HTML, so they're excluded from crawling.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
