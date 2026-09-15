import type { MetadataRoute } from "next";
import { getCachedTenderList } from "@/lib/tenders";
import { siteOrigin } from "@/lib/site-url";
import { fetchTenderSitemapEntriesFromDb } from "@/lib/db/tenders";
import { participationGuides } from "@/lib/participation-guides";

/**
 * What a crawler is allowed to know about.
 *
 * The static entries are the pages any visitor can read in full. Everything
 * behind auth (/account, /saved, /notifications) is left out here and
 * disallowed in robots.ts; /login and /register are excluded too, since they
 * are forms rather than content and indexing them only competes with the
 * pages that matter.
 *
 * Every tender detail URL now serves a distinct public Chinese summary and
 * procurement-facts block. The protected analysis is not serialized for a
 * crawler, but the landing page is real content and belongs in the sitemap.
 * A dedicated minimal query includes every database slug without transferring
 * the private analysis tables just to build this XML file.
 *
 * Degrades instead of failing: with Supabase unreachable this still returns
 * the static pages rather than throwing and serving no sitemap at all.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: origin, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/tenders`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/guides`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...participationGuides.map((guide) => ({
      url: `${origin}/guides/${guide.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${origin}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/clarifications`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const fromDb = await fetchTenderSitemapEntriesFromDb();
    const tenders = fromDb ?? (await getCachedTenderList()).map((tender) => ({
      slug: tender.slug,
      updatedAt: tender.updatedAt,
    }));

    return [
      ...staticPages,
      ...tenders.map((tender) => ({
        url: `${origin}/tenders/${tender.slug}`,
        lastModified: new Date(tender.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] Could not read tender entries; serving static pages only", error);
    return staticPages;
  }
}
