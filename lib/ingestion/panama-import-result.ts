/**
 * What the 巴拿马 tab's import button gets back from /api/admin/import-panama:
 * a slim row per procedure, never whole Tender objects. Its own file so the
 * client form can import the type without pulling in the connector.
 */
export type PanamaImportRow = {
  number: string;
  slug: string;
  title: string;
  buyer: string;
  /** flagship | significant | standard | excluded */
  tier: string;
  /** US$ (the balboa is at par). */
  value?: number;
  /** ISO, UTC. */
  deadline?: string;
};

export type PanamaImportResponse = {
  write: boolean;
  days: number;
  /** Unique formal tenders whose status changed in the window. */
  listedCount: number;
  /** Still in progress (taking bids, in evaluation, paused). */
  liveCount: number;
  /** Still taking bids, pliego read. */
  detailCount: number;
  detailErrors: number;
  unreadForTime: number;
  kept: PanamaImportRow[];
  /** Taking bids, pliego read, excluded by the platform's rules. */
  excluded: PanamaImportRow[];
  upsertedCount?: number;
  statusUpdates?: number;
  failed?: { slug: string; error: string }[];
};

/** The page offers 1–5 days; longer windows are the daily job's backfill. */
export const PANAMA_MANUAL_MAX_DAYS = 5;
