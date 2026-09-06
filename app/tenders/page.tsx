import { Suspense } from "react";
import { getAllTenders } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";

/**
 * ISR, not the default (2026-09-06). This page reads Supabase through a
 * service-role client and uses no request-time API, so Next prerendered it
 * at BUILD time with no revalidation at all — confirmed from a real
 * `next build` route table (`○ /tenders`). Every tender ingested after a
 * deploy was therefore invisible on the public list until the next
 * deploy, while `/tenders/[slug]` (dynamic) showed the fresh row: the
 * list and the detail page disagreed. Serving it from cache is still the
 * right call for browsing speed — this is an unbounded full-table query
 * whose result is identical for every visitor — so it stays cached, just
 * with a lifetime. Ingestion runs a few times a day, so five minutes is
 * far below the real update rate and costs one regeneration per window.
 */
export const revalidate = 300;

export default async function TendersPage() {
  const tenders = await getAllTenders();

  return (
    <div className="mx-auto w-full max-w-[94rem] px-5 py-6 sm:px-8 sm:py-8">
      <Suspense>
        <TenderExplorer tenders={tenders} />
      </Suspense>
    </div>
  );
}
