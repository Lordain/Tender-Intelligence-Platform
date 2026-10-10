import type { Tender } from "@/types/tender";
import { PETROPERU_SOURCE_NAME } from "@/lib/relevance-petroperu";
import { PROINVERSION_APP_SOURCE_NAME } from "@/lib/proinversion-app-source";

export { DEADLINE_IN_DOCUMENTS_LABEL } from "@/lib/deadline-labels";

/**
 * Sources whose bid date is deliberately not imported because it lives in the
 * bid documents, not on the list we read (user, 2026-09-25, Petroperú: 截止日
 * 写「见招标文件」). A missing deadline there is expected, so the pages say
 * where to find it instead of 未提供. ProInversión's APP concursos are the
 * same case: the bases set the date (lib/proinversion-app-source.ts).
 *
 * Carried to the client as this boolean, never as the source name — see
 * TenderCardData.isObrasPorImpuestos for why the name stays server-side.
 */
const SOURCES = new Set([PETROPERU_SOURCE_NAME, PROINVERSION_APP_SOURCE_NAME]);

export function deadlineIsInDocuments(tender: Pick<Tender, "sourceName" | "submissionDeadline">): boolean {
  return !tender.submissionDeadline && SOURCES.has(tender.sourceName ?? "");
}
