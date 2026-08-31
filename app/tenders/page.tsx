import { getAllTenders } from "@/lib/tenders";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";

export default async function TendersPage() {
  const tenders = await getAllTenders();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <TenderExplorer tenders={tenders} />
    </div>
  );
}
