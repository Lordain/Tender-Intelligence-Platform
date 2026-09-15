/**
 * Public project URLs must never fall back to Tender.slug: internal slugs are
 * derived from government procedure identifiers. Failing closed here makes a
 * missing migration visible without silently putting those identifiers back
 * into links, notifications or crawler-facing pages.
 */
export function requirePublicTenderSlug(tender: { publicSlug?: string }): string {
  const publicSlug = tender.publicSlug?.trim();
  if (!publicSlug) throw new Error("Tender is missing its opaque public slug; run migration 0050 before deploying this code.");
  return publicSlug;
}

export function publicTenderPath(tender: { publicSlug?: string }): string {
  return `/tenders/${encodeURIComponent(requirePublicTenderSlug(tender))}`;
}
