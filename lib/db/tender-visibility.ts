/**
 * The one Colombia visibility predicate, kept in its own module because
 * `lib/db/tenders.ts` starts with `import "server-only"` — which makes it
 * unimportable from a plain Node/tsx process. `scripts/translate-
 * tenders.ts` needs this rule and nothing else from that file, so
 * importing it from there crashed the whole CLI on startup ("This module
 * cannot be imported from a Client Component module") before a single
 * tender was read. Found 2026-09-08.
 *
 * Keep this module free of `server-only`, of `react`, and of any Supabase
 * import: its only job is to be shared by both the Next.js server code
 * and the terminal scripts. `lib/db/tenders.ts` re-exports it, so every
 * existing `from "@/lib/db/tenders"` import keeps working.
 *
 * The rule (2026-09-05, explicit request): a Colombia tender with no
 * `submissionDeadline` (SECOP's "Fecha de presentación de ofertas") is
 * hidden — from the public feed AND from the admin list, so it never gets
 * translated or analyzed. See the visibility notes above
 * `fetchAllTendersFromDb()` in lib/db/tenders.ts for how this sits
 * alongside the awarded-with-no-analysis rule.
 */
export function isHiddenColombiaNoDeadline(country: string, submissionDeadline: string | null | undefined): boolean {
  return country === "Colombia" && !submissionDeadline;
}
