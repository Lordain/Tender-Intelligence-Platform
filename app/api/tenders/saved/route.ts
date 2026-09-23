import { NextResponse, type NextRequest } from "next/server";
import { getCachedTenderList } from "@/lib/tenders";
import { toTenderCardData } from "@/lib/tender-card";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { canViewCountry, canUseTenderListMemberFeatures } from "@/lib/access-control";

/**
 * The cards for the tenders this browser has saved.
 *
 * /saved used to be rendered from the whole table: the server had no way to
 * know which tenders a visitor saved — useSavedTenderIds reads localStorage —
 * so it sent every tender it had and let the client filter. That was fixed
 * once already, for the leak (the projection and the login gate), but the
 * payload was never addressed: a signed-in member still received the entire
 * catalogue, projected and with the 投标重点预览 attached, on every visit, to
 * render the handful of cards they actually saved.
 *
 * So the ids come up instead of the table going down. This is the same shape
 * as /api/tenders/saved-reminders, which answers the same question for the
 * deadline strip.
 *
 * Signed in is the bar, NOT a subscription — the same rule app/saved/page.tsx
 * already applies and for the same reason: SaveTenderButton has only ever
 * required a login, so a lapsed account already has saved tenders, and
 * refusing them here would empty a list they built while paying. They get the
 * redacted projection instead, exactly as on /tenders.
 */
const MAX_SAVED_IDS = 200;

export async function POST(request: NextRequest) {
  const entitlement = await getViewerEntitlement();
  const role = entitlement.role;
  // A guest has saved nothing the server should resolve. SavedView renders
  // its own login prompt and never reaches this.
  if (role === "guest") return NextResponse.json([], { status: 401 });

  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_SAVED_IDS)
    : [];
  if (ids.length === 0) return NextResponse.json([]);

  const wanted = new Set(ids);
  const memberView = canUseTenderListMemberFeatures(role);
  // Filtered out of the cached list rather than mapped over `ids`, so the
  // order is the one the rest of the site lists tenders in — which is the
  // order this page showed before it stopped receiving the whole list.
  const cards = (await getCachedTenderList())
    .filter((tender) => wanted.has(tender.id))
    .map((tender) => {
      const visible = memberView && canViewCountry(entitlement, tender.country);
      return toTenderCardData(tender, { memberView: visible, includeAnalysisPreview: visible });
    });

  return NextResponse.json(cards);
}
