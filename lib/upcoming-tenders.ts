/**
 * Sources whose rows are ANNOUNCEMENTS of a tender the buyer plans to open,
 * not tenders that are open (user, 2026-09-26: 需要备注是预告即将招标).
 *
 * A row from one of these keeps its stored "planned" status on every surface
 * — lib/tender-status.ts otherwise reads "planned" as 招标中 (rule 1) — and
 * shows as 即将招标 with a 招标预告 notice on its page. Kept in a file of its
 * own so tender-status.ts, which every page imports, does not pull in an
 * ingestion module to learn one name.
 */
export const METRO_SANTIAGO_PREVIEW_SOURCE_NAME = "Metro de Santiago — Próximas Licitaciones";

const UPCOMING_TENDER_SOURCES = new Set<string>([METRO_SANTIAGO_PREVIEW_SOURCE_NAME]);

export function isUpcomingTenderSource(sourceName: string | null | undefined): boolean {
  return Boolean(sourceName && UPCOMING_TENDER_SOURCES.has(sourceName));
}
