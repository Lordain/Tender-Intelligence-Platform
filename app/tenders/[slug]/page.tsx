import { cache } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTenderBySlug } from "@/lib/tenders";
import { TenderDetailView } from "@/components/tenders/TenderDetailView";
import { getViewerRole } from "@/lib/access-control-server";
import { canOpenTenderDetail, isPublicArchive, tenderDetailPrompt } from "@/lib/access-control";
import type { Tender } from "@/types/tender";
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

/** Requirements live in three arrays on Tender but one table in the database. */
function analysisPresence(tender: Tender) {
  return {
    requirementCount:
      tender.qualifications.length + tender.experienceRequirements.length + tender.requiredDocuments.length,
    riskCount: tender.risks.length,
  };
}

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
  // Indexable exactly when it is readable without an account: the free-preview
  // slugs, and closed tenders that carry analysis. Anything still biddable
  // stays out of the index, because what a crawler would get is the access
  // prompt — and a closed tender with no analysis stays out because what it
  // would get is an empty page under a real project name.
  const indexable = isFreePreview || isPublicArchive(tender.status, analysisPresence(tender));

  const summary = tender.summary.zh.trim();
  return {
    ...pageMetadata({
      title: tender.title.zh,
      description: summary.length > 155 ? `${summary.slice(0, 154)}…` : summary,
      path: `/tenders/${slug}`,
    }),
    // Only the free-preview slugs are indexable; every other one renders an
    // access prompt, and a crawler must not be told that page is the tender.
    // Its share card still carries the real title and summary — a paywalled
    // page is still worth forwarding to a colleague.
    robots: indexable ? undefined : { index: false, follow: true },
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

  // A closed tender WITH analysis is readable by anyone — see
  // isPublicArchive(). The status here is the DERIVED one (lib/db/tenders.ts
  // runs deriveTenderStatus when it maps the row), so a deadline that passed
  // this morning counts.
  const isClosed = isPublicArchive(tender.status, analysisPresence(tender));

  if (!canOpenTenderDetail(viewerRole, isHomepageFreePreview, isClosed)) {
    return (
      <main className="min-h-[65vh] bg-[#f6f4ef]">
        <AccessPrompt open kind={tenderDetailPrompt(viewerRole)} nextPath={`/tenders/${slug}`} />
      </main>
    );
  }

  // The CTA now also covers the visitor this change exists for: someone who
  // arrived from a search engine on a closed tender, read the whole analysis,
  // and has no other reason to learn that live projects exist here.
  const showTrialCta =
    viewerRole === "guest" && ((isHomepageFreePreview && from === "homepage") || isClosed);

  return <TenderDetailView tender={tender} showTrialCta={showTrialCta} />;
}
