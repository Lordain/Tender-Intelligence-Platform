/**
 * Which language a tender's own text is written in.
 *
 * `LocalizedText.es` is not really "the Spanish" — it is the ORIGINAL, the
 * text the government published, mirrored into `en`/`zh` until something
 * writes a real translation (lib/ingestion/text-utils.ts's `untranslated`).
 * For every source built before 2026-09 that original happened to be
 * Spanish, so the field name and the language agreed and nothing had to
 * ask. Brazil breaks that: PNCP publishes in Portuguese, and it goes into
 * the same `es` slot because renaming the field would mean rewriting every
 * stored JSON column and every reader of it.
 *
 * So the language has to be derived instead, and this is the one place it
 * is derived. Two callers need it and they must never disagree:
 *
 *   - translate-all-tenders.ts, which picks the model prompt and must not
 *     put Portuguese and Spanish rows in the same batch (one batch is one
 *     prompt);
 *   - analyze-uploaded-document.ts, which picks the extraction prompt for
 *     a bid document.
 *
 * Keyed on `country` rather than on sniffing the text. Portuguese and
 * Spanish share too much orthography for a short procurement title to be
 * classified reliably — "CONSTRUCAO DE PONTE" and "CONSTRUCCION DE PUENTE"
 * are three characters apart once accents are stripped, and the rows most
 * likely to be misread are exactly the short ones. The country is stated
 * by the mapper, is never guessed, and is already on every row.
 */
export type TenderSourceLanguage = "es" | "pt";

/**
 * Countries whose tenders are published in Portuguese. A list rather than a
 * single `=== "Brazil"` because the question this answers is about the
 * language, not about Brazil — if a Portuguese-speaking source is ever added
 * (Portugal's BASE, Angola, Mozambique), it belongs here and everything
 * downstream follows without another change.
 */
const PORTUGUESE_COUNTRIES = new Set(["Brazil"]);

/**
 * Defaults to Spanish for an unknown or missing country.
 *
 * Deliberate: every source that exists today except Brazil is Spanish, so
 * the default is the overwhelmingly likely answer AND the pre-existing
 * behaviour — a row that somehow arrives with no country keeps being
 * handled exactly as it was before this function existed, rather than
 * silently changing language.
 */
export function sourceLanguageFor(country: string | null | undefined): TenderSourceLanguage {
  return country && PORTUGUESE_COUNTRIES.has(country) ? "pt" : "es";
}

/** For a log line or an admin-facing count, where "es"/"pt" means nothing to the reader. */
export const SOURCE_LANGUAGE_LABELS: Record<TenderSourceLanguage, string> = {
  es: "西班牙语",
  pt: "葡萄牙语",
};
