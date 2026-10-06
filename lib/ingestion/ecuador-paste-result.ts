/**
 * Client-safe shapes for the 厄瓜多尔 tab's paste import
 * (components/admin/ImportEcuadorPasteForm.tsx), split out of
 * import-ecuador-paste.ts so the browser bundle does not pull in server code.
 */
import type { TenderRelevanceTier } from "@/types/tender";

/**
 * What the import does with a pasted procedure page, under the platform's
 * usual rules. "short_window" is still written — manual pastes are exempt
 * from the 12-day rule — and says so.
 */
export type EcuadorImportOutcome = "write" | "excluded" | "closed" | "short_window" | "not_open";

export type EcuadorImportRow = {
  code: string;
  title: string;
  buyer: string;
  procedureType: string;
  scopeType: string;
  budget?: number;
  publicationDate?: string;
  submissionDeadline?: string;
  keyDates: number;
  tier: TenderRelevanceTier;
  reasonZh: string;
  outcome: EcuadorImportOutcome;
  outcomeZh: string;
  /** Already on the platform under this code: the write updates that row. */
  existingSlug?: string;
};

export type EcuadorImportResponse = {
  rows: EcuadorImportRow[];
  written?: number;
  failed?: { slug: string; error: string }[];
};
