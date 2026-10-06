/**
 * Client-safe shapes for the 「CFE 网站粘贴导入」 panel
 * (components/admin/ImportCfePasteForm.tsx), split out of
 * import-cfe-paste.ts so the browser bundle does not pull in the server code.
 */
import type { TenderRelevanceTier } from "@/types/tender";

/**
 * What the import does with a pasted procedure, under the platform's usual
 * rules. "short_window" is still written — manual pastes are exempt from the
 * 12-day rule — and says so, so the admin knows the DOF would not have.
 */
export type CfePasteOutcome = "write" | "excluded" | "closed" | "short_window" | "not_open";

export type CfePasteRow = {
  number: string;
  title: string;
  buyer: string;
  location?: string;
  procedureType: string;
  scopeType: string;
  publicationDate?: string;
  submissionDeadline?: string;
  status: string;
  tier: TenderRelevanceTier;
  reasonZh: string;
  outcome: CfePasteOutcome;
  outcomeZh: string;
  files: number;
  keyDates: number;
  /** The row this updates instead of adding a second one — usually the same call imported from the DOF. */
  existingSlug?: string;
};

export type CfePasteResponse = {
  rows: CfePasteRow[];
  written?: number;
  failed?: { slug: string; error: string }[];
};
