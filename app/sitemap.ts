import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://floodreportassam.vercel.app";

// Served at /sitemap.xml — submit this in Google Search Console.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      lastModified: new Date(),
      changeFrequency: "hourly", // flood data updates through the day
      priority: 1,
    },
  ];
}
