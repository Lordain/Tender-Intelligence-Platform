import { Suspense } from "react";
import { getCachedTenderList } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { buildTenderListPage, TENDER_PAGE_SIZE, tenderListViewerRules, type TenderListSearchParams } from "@/lib/tender-list-page";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { TenderListStructuredData } from "@/components/seo/TenderStructuredData";

export const metadata: Metadata = pageMetadata({
  title: "拉美政府招标项目｜墨西哥、巴西、哥伦比亚、秘鲁、智利、阿根廷、多米尼加、巴拿马、厄瓜多尔、玻利维亚采购信息",
  description:
    "查找墨西哥、巴西、哥伦比亚、秘鲁、智利、阿根廷、多米尼加、巴拿马、厄瓜多尔和玻利维亚的政府招标，以及 Petrobras、Pemex、CFE、Codelco 等国有石油、电力、矿业公司的采购项目；查看中文标题、项目摘要、采购方式、金额与计划交标时间，并按国家、行业和项目类型筛选。",
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
  const [allTenders, entitlement, params] = await Promise.all([
    getCachedTenderList(),
    getViewerEntitlement(),
    searchParams,
  ]);

  const pageData = buildTenderListPage(allTenders, params, {
    pageSize: TENDER_PAGE_SIZE,
    // One set of viewer rules for every member/guest difference on this list:
    // the publisher, the exact budget and the exact deadline are all withheld
    // from guests and lapsed free accounts, visually AND in the serialized
    // React payload. The saved-search reminder route applies the same rules.
    ...tenderListViewerRules(entitlement),
  });

  return (
    <div className="mx-auto w-full max-w-[108rem] px-5 py-6 sm:px-8 sm:py-8">
      <TenderListStructuredData tenders={pageData.tenders} />
      <Suspense>
        <TenderExplorer {...pageData} viewerRole={entitlement.role} />
      </Suspense>
    </div>
  );
}
