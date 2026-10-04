/**
 * What the 多米尼加 tab's import button gets back from
 * /api/admin/import-dominicana: a slim row per public tender, never whole
 * Tender objects. Its own file so the client form can import the type without
 * pulling in the connector.
 */
export type DominicanaImportRow = {
  code: string;
  slug: string;
  title: string;
  /** flagship | significant | standard | excluded */
  tier: string;
  /** False once the offer deadline has passed — such rows are never written. */
  open: boolean;
  modalidad: string;
  amount: number | null;
  currency: string | null;
  buyer: string;
};

export type DominicanaImportResponse = {
  write: boolean;
  days: number;
  listedCount: number;
  publicTenderCount: number;
  kept: DominicanaImportRow[];
  /** Excluded by the rules, or no longer taking bids. */
  notKept: DominicanaImportRow[];
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: number;
};

/** The windows the form offers; the route accepts any whole number in range. */
export const DOMINICANA_IMPORT_DAYS = [3, 7, 14, 30] as const;
export const DOMINICANA_IMPORT_MAX_DAYS = 30;
