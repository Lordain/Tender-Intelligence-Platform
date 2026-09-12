/**
 * Peru's Obras por Impuestos is not a tender in the sense the rest of this
 * site means it.
 *
 * Everywhere else on this platform, a listing means: the State wants to buy
 * something, you bid, you get paid. Under Ley N.° 29230 the private company
 * BUILDS THE PROJECT WITH ITS OWN MONEY FIRST and is repaid in CIPRL/CIPGN
 * certificates, which are only worth anything against Peruvian
 * third-category income tax. A Chinese company with no Peruvian taxable
 * income gains nothing from winning one as the financing party — the usable
 * role there is empresa ejecutora, the contractor the financing company
 * hires.
 *
 * That is a big enough difference that these rows must not be read as
 * ordinary tenders (user, 2026-09-11: Obras por Impuestos 要在前台页面特别
 * 标记提醒), hence a badge in the list and a callout on the detail page.
 *
 * Matched on the source name rather than a stored flag because that is what
 * the mapper already writes for every OxI row and nothing else
 * (PERU_OXI_SOURCE_NAME, lib/ingestion/peru-oxi-mapper.ts) — no migration,
 * and no way for the two to drift apart on a re-import.
 */
const OBRAS_POR_IMPUESTOS = /obras por impuestos/i;

export const OBRAS_POR_IMPUESTOS_GUIDE = "/guides/peru-obras-por-impuestos";

export const OBRAS_POR_IMPUESTOS_BADGE = "以工程抵税 OxI";

export function isObrasPorImpuestos(tender: { sourceName?: string | null }): boolean {
  return OBRAS_POR_IMPUESTOS.test(tender.sourceName ?? "");
}
