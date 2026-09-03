import "server-only";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * Admin gate for write-capable /admin routes (tender create/edit/delete —
 * see app/admin/tenders/). Deliberately distinct from the "any logged-in
 * user" gate DocumentsNeededView.tsx uses for its read-only worklist: that
 * one is fine for a page that only reads data, but a page that can rename
 * or delete a tender needs a real allowlist, since /register lets anyone
 * create an account.
 *
 * Fails CLOSED: an unset or empty ADMIN_EMAILS means nobody is admin, not
 * "everyone is admin" — a misconfigured env var should never silently open
 * write access. Add real addresses to ADMIN_EMAILS in .env.local
 * (comma-separated) to grant access; see .env.example.
 */
function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowlist = adminEmailAllowlist();
  return allowlist.length > 0 && allowlist.includes(email.toLowerCase());
}

/** For Route Handlers, which only need a single yes/no check (unlike app/admin/tenders/layout.tsx, which also needs the plain "is anyone logged in at all" case to pick between a login redirect and an "unauthorized" message). */
export async function getAdminUser() {
  const user = await getCurrentUser();
  return isAdminEmail(user?.email) ? user : null;
}
