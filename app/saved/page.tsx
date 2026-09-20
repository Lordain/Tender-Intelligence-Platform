import { getAllTenders } from "@/lib/tenders";
import { SavedView } from "@/components/tenders/SavedView";
import { getViewerRole } from "@/lib/access-control-server";
import { canUseTenderListMemberFeatures } from "@/lib/access-control";
import { toTenderCardData } from "@/lib/tender-card";

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
 * those and has to send the set to filter from. What it can decide is who
 * gets a set at all, and in what shape.
 *
 * The bar for getting one is a signed-in account, NOT a subscription, even
 * though every other list tool is entitled: SaveTenderButton has only ever
 * required a login, so a lapsed account already has saved tenders, and
 * raising the bar here would empty their list without explaining why. They
 * get the same redacted projection a guest gets on /tenders instead.
 */
export default async function SavedPage() {
  const role = await getViewerRole();
  // A guest has saved nothing and can filter nothing. SavedView renders its
  // own login prompt from this empty list.
  if (role === "guest") return <SavedView tenders={[]} />;

  // The projection follows the entitlement, not the login: a lapsed account
  // keeps its saved list, at the same level of detail a guest sees on
  // /tenders, but not the paywalled 投标重点预览.
  const memberView = canUseTenderListMemberFeatures(role);
  const tenders = await getAllTenders();
  const cards = tenders.map((tender) => toTenderCardData(tender, {
    memberView,
    includeAnalysisPreview: memberView,
  }));

  return <SavedView tenders={cards} />;
}
