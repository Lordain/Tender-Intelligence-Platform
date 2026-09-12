import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenderBySlug } from "@/lib/tenders";
import { TenderDetailView } from "@/components/tenders/TenderDetailView";
import { getViewerRole } from "@/lib/access-control-server";
import { canOpenTenderDetail, tenderDetailPrompt } from "@/lib/access-control";
import { isHomepageFreePreviewSlug } from "@/lib/homepage-selection";
import { AccessPrompt } from "@/components/access/AccessPrompt";

// generateMetadata and the page itself both need these two answers, and
// neither underlying function is request-cached — without this the detail
// page, the most-viewed route on the site, would make two extra Supabase
// round-trips per view just to fill in a <title>. Wrapped here rather than at
// the source because lib/tenders.ts is also reachable from plain tsx scripts,
// where React's cache() has no request to scope itself to.
const loadTender = cache(getTenderBySlug);
const loadIsFreePreview = cache(isHomepageFreePreviewSlug);

/**
 * A crawler is a guest, so what it can see is exactly the free-preview
 * allow-list — canOpenTenderDetail("guest", isFree) is isFree. Every other
 * slug serves an access prompt, and letting those be indexed would put a few
 * hundred near-identical "subscribe to continue" pages into the index under
 * real tender names, which is worse than not being indexed at all. app/
 * sitemap.ts draws the same line by only listing the free-preview slugs; this
 * is the half that covers a crawler arriving from the /tenders list instead.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [tender, isFreePreview] = await Promise.all([loadTender(slug), loadIsFreePreview(slug)]);
  if (!tender) return { title: "项目不存在" };

  const summary = tender.summary.zh.trim();
  return {
    title: tender.title.zh,
    description: summary.length > 155 ? `${summary.slice(0, 154)}…` : summary,
    robots: isFreePreview ? undefined : { index: false, follow: true },
    alternates: { canonical: `/tenders/${slug}` },
  };
}

export default async function TenderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const [tender, isHomepageFreePreview, viewerRole] = await Promise.all([
    loadTender(slug),
    loadIsFreePreview(slug),
    getViewerRole(),
  ]);

  if (!tender) {
    notFound();
  }

  if (!canOpenTenderDetail(viewerRole, isHomepageFreePreview)) {
    return (
      <main className="min-h-[65vh] bg-[#f6f4ef]">
        <AccessPrompt open kind={tenderDetailPrompt(viewerRole)} nextPath={`/tenders/${slug}`} />
      </main>
    );
  }

  return <TenderDetailView tender={tender} showTrialCta={viewerRole === "guest" && isHomepageFreePreview && from === "homepage"} />;
}
