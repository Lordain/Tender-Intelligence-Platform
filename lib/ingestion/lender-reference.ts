import { slugify } from "@/lib/ingestion/text-utils";

/**
 * One externally financed call, two places it is published: the World Bank's
 * procurement notices (worldbank-mapper.ts) and the country's own system
 * (Bolivia's SICOES, pasted by hand). User, 2026-10-09: 也增加bolivia的手动接
 * 入，但是要确保项目不和世界银行重复.
 *
 * Both carry the World Bank's STEP reference — SICOES as 「Código de la
 * entidad para identificar al proceso」, the API as bid_reference_no — e.g.
 * BO-ENDE-568419-CW-RFB: country, agency, activity number, procurement group
 * (CW works, GO goods, NC non-consulting, CS consulting) and method (RFB, RFP,
 * RFQ, QCBS …). When a call has one, both sources use it as the tender number
 * and derive the same slug from it, and the write (an upsert on slug) makes
 * them one row whichever source comes first.
 */
const STEP_REFERENCE = /^[A-Z]{2}-[A-Z0-9][A-Z0-9-]*-(?:CW|GO|NC|CS)-[A-Z]{2,6}$/;

/** "BO-ENDE-568419-CW-RFB" (any case, stray spaces) → the reference in upper case; anything else → undefined. */
export function lenderReference(code: string | undefined): string | undefined {
  const value = code?.replace(/\s+/g, "").toUpperCase();
  return value && STEP_REFERENCE.test(value) ? value : undefined;
}

/** The slug both sources use for a call with a STEP reference: bolivia-bo-ende-568419-cw-rfb. */
export function lenderReferenceSlug(country: string, reference: string): string {
  return `${slugify(country)}-${slugify(reference)}`;
}
