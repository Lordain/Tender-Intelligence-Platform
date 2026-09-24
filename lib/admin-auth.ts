import "server-only";
import { isAdminEmail } from "@/lib/admin-emails";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * Admin gate for write-capable /admin routes (tender create/edit/delete —
 * see app/admin/tenders/). Deliberately distinct from the "any logged-in
 * user" gate DocumentsNeededView.tsx uses for its read-only worklist: that
 * one is fine for a page that only reads data, but a page that can rename
 * or delete a tender needs a real allowlist, since /register lets anyone
 * create an account.
 *
 * The predicate itself now lives in lib/admin-emails.ts, which carries no
 * `server-only` marker so a CLI script can ask the same question — see that
 * file. Re-exported here so every existing import keeps working, and so
 * there stays exactly one answer to "is this person staff".
 */
export { isAdminEmail } from "@/lib/admin-emails";

/** For Route Handlers, which only need a single yes/no check (unlike app/admin/tenders/layout.tsx, which also needs the plain "is anyone logged in at all" case to pick between a login redirect and an "unauthorized" message). */
export async function getAdminUser() {
  const user = await getCurrentUser();
  return isAdminEmail(user?.email) ? user : null;
}
