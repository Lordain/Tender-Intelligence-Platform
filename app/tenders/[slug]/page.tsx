import { notFound } from "next/navigation";
import { getTenderBySlug } from "@/lib/tenders";
import { TenderDetailView } from "@/components/tenders/TenderDetailView";
import { getViewerRole } from "@/lib/access-control-server";
import { canOpenTenderDetail, tenderDetailPrompt } from "@/lib/access-control";
import { isHomepageFreePreviewSlug } from "@/lib/homepage-selection";
import { AccessPrompt } from "@/components/access/AccessPrompt";

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
    getTenderBySlug(slug),
    isHomepageFreePreviewSlug(slug),
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
