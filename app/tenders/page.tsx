import { Suspense } from "react";
import { getAllTenders } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";

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
