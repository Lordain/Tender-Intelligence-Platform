import { Suspense } from "react";
import { getCachedTenderList } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";
import { getViewerRole } from "@/lib/access-control-server";
import { canInteractWithTenderList } from "@/lib/access-control";
import { buildTenderListPage, LOCKED_TENDER_PAGE_SIZE, TENDER_PAGE_SIZE, type TenderListSearchParams } from "@/lib/tender-list-page";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "招标项目列表",
  description: "浏览墨西哥、哥伦比亚政府公开招标项目，按行业、金额与项目规模筛选，全部信息已整理为中文。",
};

/**
 * This page is DYNAMIC, and not by choice: getViewerRole() reads the session
 * cookie, which opts the whole route into request-time rendering. It has to —
 * what a guest, a trial user and a lapsed free user may do on this list
 * differs, and a shared prerendered HTML file cannot hold three answers.
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

  // A locked visitor/free account must always receive the same initial list.
  // UI capture below handles ordinary clicks; this redirect closes the
  // server-side bypass where someone types ?q=, ?page= or filter params into
  // the address bar directly.
  if (!canInteractWithTenderList(viewerRole) && Object.keys(params).length > 0) {
    redirect("/tenders");
  }
  const pageData = buildTenderListPage(allTenders, params, {
    pageSize: canInteractWithTenderList(viewerRole) ? TENDER_PAGE_SIZE : LOCKED_TENDER_PAGE_SIZE,
  });

  return (
    <div className="mx-auto w-full max-w-[94rem] px-5 py-6 sm:px-8 sm:py-8">
      <Suspense>
        <TenderExplorer {...pageData} viewerRole={viewerRole} />
      </Suspense>
    </div>
  );
}
