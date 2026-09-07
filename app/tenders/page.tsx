import { Suspense } from "react";
import { getCachedTenderList } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";
import { getViewerRole } from "@/lib/access-control-server";

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

export default async function TendersPage() {
  const [tenders, viewerRole] = await Promise.all([getCachedTenderList(), getViewerRole()]);

  return (
    <div className="mx-auto w-full max-w-[94rem] px-5 py-6 sm:px-8 sm:py-8">
      <Suspense>
        <TenderExplorer tenders={tenders} viewerRole={viewerRole} />
      </Suspense>
    </div>
  );
}
