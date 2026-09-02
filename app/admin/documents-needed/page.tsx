import { fetchTendersNeedingDocumentsFromDb } from "@/lib/db/tenders";
import { DocumentsNeededView } from "@/components/admin/DocumentsNeededView";

export default async function DocumentsNeededPage() {
  const tenders = await fetchTendersNeedingDocumentsFromDb();
  return <DocumentsNeededView tenders={tenders ?? []} />;
}
