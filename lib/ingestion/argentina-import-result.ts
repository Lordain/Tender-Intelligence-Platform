/** The shapes the admin tab's manual Argentina import sends and receives — no server imports, so the client form can use them. */

export type ArgentinaSourceId = "comprar" | "contratar" | "adif" | "boletin";

export type ArgentinaImportRow = {
  slug: string;
  source: ArgentinaSourceId;
  tenderNumber: string;
  title: string;
  buyer: string;
  tier: string;
  /** The rule that decided, in Chinese. */
  reason: string;
  submissionDeadline?: string;
  estimatedUsd?: number;
};

export type ArgentinaImportSource = {
  id: ArgentinaSourceId;
  label: string;
  listed: number;
  mapped: number;
  kept: number;
  skipped: number;
  failures: number;
  error?: string;
  seconds: number;
};

export type ArgentinaImportResponse = {
  write: boolean;
  sources: ArgentinaImportSource[];
  kept: ArgentinaImportRow[];
  excluded: ArgentinaImportRow[];
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};
