import { NextResponse, type NextRequest } from "next/server";
import { getCachedTenderList } from "@/lib/tenders";
import { toTenderListItem } from "@/lib/tender-list-page";
import { getViewerRole } from "@/lib/access-control-server";
import { canUseTenderListMemberFeatures } from "@/lib/access-control";

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

  // Saving a tender is a member feature, so this endpoint answers as one —
  // but it takes arbitrary tender ids from the query string and had no
  // entitlement check at all, which made it a way to read list rows for any
  // id without an account. The role decides the projection rather than
  // rejecting the request outright: a guest with stale localStorage ids
  // still gets a working (redacted) reminder list instead of an error.
  const wanted = new Set(ids);
  const memberView = canUseTenderListMemberFeatures(await getViewerRole());
  const reminders = (await getCachedTenderList())
    .filter((tender) => wanted.has(tender.id) && tender.submissionDeadline)
    .sort((a, b) => a.submissionDeadline!.localeCompare(b.submissionDeadline!))
    .slice(0, MAX_REMINDERS)
    .map((tender) => toTenderListItem(tender, { memberView }));

  return NextResponse.json(reminders);
}
