/**
 * Unpaired UTF-16 surrogates are invalid Unicode — JSON.stringify() doesn't
 * validate this locally, but an LLM API can reject the whole request once
 * it's re-decoded server-side (real case, 2026-09-03: a Proyectos México
 * row's summary field, translate-tenders.ts). Shared by every provider's
 * translate-titles-*.ts, since the same source text (real, sometimes
 * messy government CSV/PDF data) goes to all of them.
 */
export function sanitizeForApi(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}
