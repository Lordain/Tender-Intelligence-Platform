import { SavedView } from "@/components/tenders/SavedView";
import { getViewerRole } from "@/lib/access-control-server";
import { canUseTenderListMemberFeatures } from "@/lib/access-control";

/**
 * Dynamic, because it reads the session. It has to be: this page used to
 * server-render getAllTenders() straight into SavedView, a "use client"
 * component, which put EVERY tender in the database — original titles,
 * publishing bodies, source URLs, procedure numbers, exact budgets — into
 * the HTML of a route with no server-side gate at all. SavedView's login
 * prompt runs in the browser, so it hid the page without withholding the
 * data: one unauthenticated request for /saved returned the whole table
 * (2026-09-19).
 *
 * Which tenders a visitor saved is known only to their browser
 * (useSavedTenderIds reads localStorage), so the server cannot send just
 * those from here. It no longer sends the alternative either: the page ships
 * no tender data at all, and SavedView posts its ids to
 * /api/tenders/saved, which returns only those cards (2026-09-20). The
 * projection and the entitlement rule live in that route now; all this page
 * decides is whether there is anything to ask for.
 *
 * The bar is a signed-in account, NOT a subscription, even though every other
 * list tool is entitled: SaveTenderButton has only ever required a login, so a
 * lapsed account already has saved tenders, and raising the bar here would
 * empty their list without explaining why. They get the same redacted
 * projection a guest gets on /tenders.
 */
export default async function SavedPage() {
  // A guest has saved nothing and can filter nothing. SavedView renders its
  // own login prompt when it sees no signed-in user.
  return <SavedView canLoadTenders={canUseTenderListMemberFeatures(await getViewerRole())} />;
}
