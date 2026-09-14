import type { MetadataRoute } from "next";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { selectHomepageTenders } from "@/lib/homepage-selection";
import { getCachedTenderList } from "@/lib/tenders";
import { siteOrigin } from "@/lib/site-url";
import { isClosedTender } from "@/lib/access-control";
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
 * Tender detail pages are the interesting case, and the answer changed on
 * 2026-09-15. A guest can open two kinds: the homepage free-preview slugs,
 * and every CLOSED tender — one nobody can bid on any more is worth nothing
 * to a subscriber and is the whole pitch to someone who has never heard of
 * this platform (see canOpenTenderDetail). Both kinds go in.
 *
 * What still does not: anything biddable. A crawler asking for one of those
 * gets the "subscribe to continue" prompt, so listing it would be submitting
 * a few hundred URLs that all serve the same page. The two sets are resolved
 * through the same functions the access check itself uses —
 * selectHomepageTenders() and isClosedTender() — so the sitemap cannot come
 * to disagree with what a visitor actually gets.
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
    const [tenders, settings] = await Promise.all([
      getCachedTenderList(),
      fetchHomepageControlSettings(),
    ]);
    const { featured } = selectHomepageTenders(tenders, settings);
    const bySlug = new Map<string, (typeof tenders)[number]>();
    for (const tender of featured) bySlug.set(tender.slug, tender);
    for (const tender of tenders) if (isClosedTender(tender.status)) bySlug.set(tender.slug, tender);

    return [
      ...staticPages,
      ...[...bySlug.values()].map((tender) => ({
        url: `${origin}/tenders/${tender.slug}`,
        lastModified: new Date(tender.updatedAt),
        // A closed tender does not change again; a featured one can. Weekly
        // for both is the honest middle — claiming daily on a finished
        // procedure is the kind of thing a crawler learns to ignore.
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] Could not read the free-preview tenders; serving static pages only", error);
    return staticPages;
  }
}
