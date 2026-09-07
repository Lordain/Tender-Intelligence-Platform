import { NextResponse, type NextRequest } from "next/server";
import { getCachedTenderList } from "@/lib/tenders";
import { toTenderListItem } from "@/lib/tender-list-page";

const MAX_SAVED_IDS = 100;
const MAX_REMINDERS = 6;

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_SAVED_IDS) ?? [];

  if (ids.length === 0) return NextResponse.json([]);

  const wanted = new Set(ids);
  const reminders = (await getCachedTenderList())
    .filter((tender) => wanted.has(tender.id) && tender.submissionDeadline)
    .sort((a, b) => a.submissionDeadline!.localeCompare(b.submissionDeadline!))
    .slice(0, MAX_REMINDERS)
    .map(toTenderListItem);

  return NextResponse.json(reminders);
}
