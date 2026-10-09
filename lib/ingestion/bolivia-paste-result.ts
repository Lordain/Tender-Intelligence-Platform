/**
 * Client-safe shapes for the 玻利维亚 tab's paste import
 * (components/admin/ImportBoliviaPasteForm.tsx), split out of
 * import-bolivia-paste.ts so the browser bundle does not pull in server code.
 */
import type { TenderRelevanceTier } from "@/types/tender";

/**
 * What the import does with a pasted Ficha, under the platform's usual rules.
 * "short_window" is still written — manual pastes are exempt from the 12-day
 * rule — and says so.
 */
export type BoliviaImportOutcome = "write" | "excluded" | "closed" | "short_window" | "not_open" | "manual_keep";

/** The tiers an admin can keep an excluded process at, as for Ecuador (user, 2026-10-06: 我手动保留，规则不变). */
export type BoliviaKeepTier = "flagship" | "significant" | "standard";
export const BOLIVIA_KEEP_TIERS: readonly BoliviaKeepTier[] = ["standard", "significant", "flagship"];

export type BoliviaImportRow = {
  cuce: string;
  title: string;
  buyer: string;
  procedureType: string;
  scopeType: string;
  budget?: number;
  currency?: string;
  /** budget in US$ at the platform's rate, for the 100 万美元 check the admin sees. */
  budgetUsd?: number;
  international: boolean;
  publicationDate?: string;
  submissionDeadline?: string;
  keyDates: number;
  tier: TenderRelevanceTier;
  reasonZh: string;
  /** The rules' own verdict, before any 「手动保留」. */
  ruleTier: TenderRelevanceTier;
  outcome: BoliviaImportOutcome;
  outcomeZh: string;
  /** Already on the platform under this CUCE or reference: the write updates that row. */
  existingSlug?: string;
  /** That row came from another source — the World Bank's notice of the same call. */
  existingSource?: string;
  /** The World Bank STEP reference the call is stored under, instead of its CUCE. */
  lenderReference?: string;
};

export type BoliviaImportResponse = {
  rows: BoliviaImportRow[];
  written?: number;
  failed?: { slug: string; error: string }[];
};
