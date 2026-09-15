import { Suspense } from "react";
import { getCachedTenderList } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";
import { getViewerRole } from "@/lib/access-control-server";
import { canUseTenderListMemberFeatures } from "@/lib/access-control";
import { buildTenderListPage, TENDER_PAGE_SIZE, type TenderListSearchParams } from "@/lib/tender-list-page";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "招标项目列表",
  description:
    "浏览墨西哥、哥伦比亚、秘鲁政府公开招标项目，按行业、金额与项目规模筛选，全部信息已整理为中文。",
  path: "/tenders",
});

/**
 * This page is DYNAMIC, and not by choice: getViewerRole() reads the session
 * cookie, which opts the whole route into request-time rendering. It has to —
 * account-specific tools still differ for guests, trials and subscribers,
 * even though discovery itself is now public.
 *
 * It used to carry `export const revalidate = 300`. That export is gone
 * because a dynamic segment ignores it: keeping it would have read as five
 * minutes of caching that a real `next build` route table (`ƒ /tenders`)
 * shows does not exist. The caching itself did not go away — it moved into
 * getCachedTenderList(), which is the part that is genuinely the same for
 * every visitor. See its comment in lib/tenders.ts.
 */

export default async function TendersPage({
  searchParams,
}: {
  searchParams: Promise<TenderListSearchParams>;
}) {
  const [allTenders, viewerRole, params] = await Promise.all([
    getCachedTenderList(),
    getViewerRole(),
    searchParams,
  ]);

  const pageData = buildTenderListPage(allTenders, params, {
    pageSize: TENDER_PAGE_SIZE,
    // The publisher is withheld from guests and lapsed free accounts both
    // visually and from the serialized React payload.
    includeBuyer: canUseTenderListMemberFeatures(viewerRole),
    searchPublicFieldsOnly: !canUseTenderListMemberFeatures(viewerRole),
  });

  return (
    <div className="mx-auto w-full max-w-[94rem] px-5 py-6 sm:px-8 sm:py-8">
      <Suspense>
        <TenderExplorer {...pageData} viewerRole={viewerRole} />
      </Suspense>
    </div>
  );
}
