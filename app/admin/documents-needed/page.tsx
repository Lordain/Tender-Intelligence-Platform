import { fetchTendersNeedingDocumentsFromDb } from "@/lib/db/tenders";
import { DocumentsNeededView } from "@/components/admin/DocumentsNeededView";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function DocumentsNeededPage() {
  const tenders = await fetchTendersNeedingDocumentsFromDb();
  return <AdminShell><DocumentsNeededView tenders={tenders ?? []} /></AdminShell>;
}
