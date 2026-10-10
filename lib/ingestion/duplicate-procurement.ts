/**
 * The same procurement stored under two slugs.
 *
 * Found 2026-10-10 (user: 请检查，确保不是重复): AGETO, Tocantins' transport
 * agency, published the TO-428 road contract on PNCP twice an hour apart —
 * 17684344000160-1-000053/2026 from Comprasnet and …-000054/2026 by hand —
 * same processo (2026/38960/000678), same R$67,559,727.19, same deadline.
 * Slugs are built from the source's own id, so each posting became its own
 * tender. The same pattern showed in several other Brazilian groups.
 *
 * Two rows are the same procurement when ALL of these match: country, buyer,
 * estimated amount (to the cent, same currency), the submission deadline's
 * calendar day, and the title once case, accents, punctuation and spacing are
 * folded away. Deliberately strict: separate lots of one programme carry
 * different amounts or titles, and a reposted notice with a new deadline is a
 * different row. A row without an amount or a deadline is never matched.
 */

export type ProcurementFingerprintInput = {
  country: string | null | undefined;
  buyer: string | null | undefined;
  title: string | null | undefined;
  estimatedValue: number | null | undefined;
  currency: string | null | undefined;
  submissionDeadline: string | null | undefined;
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The matching key, or null when the row lacks a field the rule needs. */
export function procurementFingerprint(input: ProcurementFingerprintInput): string | null {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(input.submissionDeadline ?? "")?.[0];
  const title = fold(input.title ?? "");
  const buyer = fold(input.buyer ?? "");
  if (!day || !title || !buyer || !input.country) return null;
  if (input.estimatedValue === null || input.estimatedValue === undefined || !Number.isFinite(input.estimatedValue) || input.estimatedValue <= 0) return null;
  return [input.country, buyer, (input.currency ?? "").toUpperCase(), input.estimatedValue.toFixed(2), day, title].join("|");
}
