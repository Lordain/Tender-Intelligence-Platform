/**
 * Who counts as staff, as a pure function of ADMIN_EMAILS.
 *
 * Split out of lib/admin-auth.ts, which carries `import "server-only"` for
 * getAdminUser()'s sake and therefore throws the moment anything outside a
 * Server Component imports it — a CLI script included. Nothing about matching
 * an address against an env var is server-only, and scripts/create-qa-account.ts
 * needs exactly this check: an admin address short-circuits
 * getViewerEntitlement() to subscriber/enterprise before any subscription is
 * read, so creating a QA account on one produces a test subject that passes
 * every check for the wrong reason.
 *
 * Copying the predicate into the script instead would have left two answers to
 * "is this person staff", which is the one question that must have a single
 * answer. lib/admin-auth.ts re-exports this, so every existing import is
 * unchanged.
 *
 * Fails CLOSED: an unset or empty ADMIN_EMAILS means nobody is admin, not
 * everyone.
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
