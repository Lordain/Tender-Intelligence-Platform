import { fetchTendersNeedingDocumentsFromDb } from "@/lib/db/tenders";
import { DocumentsNeededView } from "@/components/admin/DocumentsNeededView";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Every other /admin page renders dynamically because it reads a cookie;
 * this one's data comes from a service-role query with no request-time
 * API, so it was silently prerendered at build time instead (confirmed
 * `○ /admin/documents-needed` in a real `next build` route table) — an
 * admin worklist frozen at deploy time, where router.refresh() could
 * never show a newly-ingested tender or drop one just analyzed. Admin
 * data is always live by definition and this page is behind auth, so
 * there is nothing to gain from caching it.
 */
export const dynamic = "force-dynamic";

export default async function DocumentsNeededPage() {
  const tenders = await fetchTendersNeedingDocumentsFromDb();
  return <AdminShell><DocumentsNeededView tenders={tenders ?? []} /></AdminShell>;
}
