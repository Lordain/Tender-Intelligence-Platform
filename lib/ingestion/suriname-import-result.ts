/**
 * What the 苏里南 tab's import button gets back from /api/admin/import-suriname:
 * a slim row per gov.sr post, never whole Tender objects. Its own file so the
 * client form can import the type without pulling in the connector.
 */
export type SurinameImportRow = {
  postId: number;
  slug: string;
  title: string;
  url: string;
  /** flagship | significant | standard | excluded */
  tier: string;
  /** write | excluded | closed | no_deadline — see ingest-suriname.ts. */
  outcome: string;
  method: "icb" | "ncb" | "eoi" | null;
  financier: string | null;
  deadline?: string;
};

export type SurinameImportResponse = {
  write: boolean;
  postCount: number;
  /** Kept and still taking bids — what a write writes. */
  kept: SurinameImportRow[];
  /** Kept by the rule but with no readable deadline: open the post. */
  noDeadline: SurinameImportRow[];
  /** Excluded by the rule, or kept but closed. */
  others: SurinameImportRow[];
  staleWarning: string | null;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};
