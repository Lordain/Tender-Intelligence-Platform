import { getAllTenders } from "@/lib/tenders";
import { SavedView } from "@/components/tenders/SavedView";

export default async function SavedPage() {
  const tenders = await getAllTenders();
  return <SavedView tenders={tenders} />;
}
