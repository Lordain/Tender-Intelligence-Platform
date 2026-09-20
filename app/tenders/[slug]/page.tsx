import { cache } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTenderByPublicSlug } from "@/lib/tenders";
import { TenderDetailView } from "@/components/tenders/TenderDetailView";
import { getViewerRole } from "@/lib/access-control-server";
import { canViewTenderProtectedContent, tenderDetailPrompt } from "@/lib/access-control";
import { isHomepageFreePreviewSlug } from "@/lib/homepage-selection";
import { PublicTenderDetailView } from "@/components/tenders/PublicTenderDetailView";
import { toPublicTenderDetail } from "@/lib/public-tender";
import { publicTenderPath } from "@/lib/public-tender-url";
import { countryLabel, industryLabel } from "@/lib/tender-labels";
import { TenderStructuredData } from "@/components/seo/TenderStructuredData";

// generateMetadata and the page itself both need these two answers, and
// neither underlying function is request-cached — without this the detail
// page, the most-viewed route on the site, would make two extra Supabase
// round-trips per view just to fill in a <title>. Wrapped here rather than at
// the source because lib/tenders.ts is also reachable from plain tsx scripts,
// where React's cache() has no request to scope itself to.
const loadTender = cache(getTenderByPublicSlug);
const loadIsFreePreview = cache(isHomepageFreePreviewSlug);

/**
 * Every tender has a useful public landing page containing the Chinese title,
 * summary and procurement facts. The protected analysis is omitted from both
 * the HTML and the React payload for guests/free users, so the canonical page
 * can be indexed without exposing subscriber content.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tender = await loadTender(slug);
  if (!tender) return { title: "项目不存在" };

  // Metadata is public too. Build it from the exact same allow-list as the
  // visitor page so an untranslated source title or protected publisher can
  // never leak through <title>, Open Graph or a search-result snippet.
  const publicTender = toPublicTenderDetail(tender);
  const country = countryLabel(publicTender.country, "zh");
  const title = `${publicTender.titleZh}｜${country}政府招标`;
  // The place name used to sit at the end of this description. It came out
  // (2026-09-19) because a town plus a budget plus a month is enough to find
  // the original notice, and a search snippet is the one place a visitor
  // reads without even opening the page. Industry tags took its slot rather
  // than leaving the description shorter: they are the words this page is
  // actually meant to rank for ("墨西哥 输配电 招标"), whereas nobody searches
  // for a specific municipality by name unless they already know the project.
  const industries = publicTender.industries.map((industry) => industryLabel(industry, "zh")).join("、");
  const descriptionSource = `${publicTender.summaryZh} ${country}政府采购；${publicTender.procedureType}${industries ? `；行业：${industries}` : ""}`;
  const description = descriptionSource.length > 155
    ? `${descriptionSource.slice(0, 154)}…`
    : descriptionSource;

  return {
    ...pageMetadata({
      title,
      description,
      path: publicTenderPath(tender),
    }),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
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
  const [tender, viewerRole] = await Promise.all([
    loadTender(slug),
    getViewerRole(),
  ]);

  if (!tender) {
    notFound();
  }

  const isHomepageFreePreview = await loadIsFreePreview(tender.slug);

  const enteredFromHomepage = from === "homepage";
  const publicTender = toPublicTenderDetail(tender);
  const mayViewProtectedContent = canViewTenderProtectedContent(
    viewerRole,
    isHomepageFreePreview,
    enteredFromHomepage,
  );

  if (!mayViewProtectedContent) {
    return (
      <>
        <TenderStructuredData tender={publicTender} />
        <PublicTenderDetailView tender={publicTender} promptKind={tenderDetailPrompt(viewerRole)} />
      </>
    );
  }

  const showTrialCta = viewerRole === "guest" && isHomepageFreePreview && enteredFromHomepage;

  return (
    <>
      <TenderStructuredData tender={publicTender} />
      <TenderDetailView tender={tender} showTrialCta={showTrialCta} />
    </>
  );
}
