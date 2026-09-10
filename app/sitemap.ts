import type { MetadataRoute } from "next";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { selectHomepageTenders } from "@/lib/homepage-selection";
import { getCachedTenderList } from "@/lib/tenders";
import { siteOrigin } from "@/lib/site-url";
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
 * Tender detail pages are the interesting case. There are hundreds of them and
 * they are the only real long-tail content this site has, but a guest can open
 * exactly the homepage free-preview ones (canOpenTenderDetail) — every other
 * slug renders an access prompt. Listing those would be submitting a few
 * hundred URLs that all serve the same "subscribe to continue" page to the
 * crawler, so only the free-preview slugs go in, resolved through the same
 * selectHomepageTenders() the access check itself uses. That set changes when
 * an admin edits 首页控制, and the sitemap follows it automatically.
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
      lastModified: new Date(guide.verifiedAtIso),
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
    const [tenders, settings] = await Promise.all([
      getCachedTenderList(),
      fetchHomepageControlSettings(),
    ]);
    const { featured } = selectHomepageTenders(tenders, settings);
    return [
      ...staticPages,
      ...featured.map((tender) => ({
        url: `${origin}/tenders/${tender.slug}`,
        lastModified: new Date(tender.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] Could not read the free-preview tenders; serving static pages only", error);
    return staticPages;
  }
}
