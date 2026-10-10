/**
 * ProInversión's APP concursos (lib/ingestion/peru-proinversion-app-mapper.ts),
 * named in a file of its own so tender-status.ts and deadline-in-documents.ts,
 * which every page imports, do not pull in the classifier to learn one name.
 *
 * Its rows carry no deadline on purpose — the bases set it and circulars move
 * it — and a concurso runs for a year or more: Choquequirao was called in
 * March 2025 and expects its award in 2027. tender-status.ts's rule 5 closes
 * a row with no end date 45 days after publication, which read every one of
 * them as 已截止 on the day they were imported (user, 2026-10-10: 秘鲁的都显示
 * 已截止？). They are closed by the daily import instead, which reads each
 * project's state in the portfolio (ingest-peru-proinversion-app.ts).
 */
export const PROINVERSION_APP_SOURCE_NAME = "ProInversión — Proyectos APP en concurso (Perú)";

/** Sources whose rows the import itself closes, so rule 5's age guess must not. */
const CLOSED_BY_IMPORT_SOURCES = new Set<string>([PROINVERSION_APP_SOURCE_NAME]);

export function isClosedByImport(sourceName: string | null | undefined): boolean {
  return Boolean(sourceName && CLOSED_BY_IMPORT_SOURCES.has(sourceName));
}
