/** Client-safe shapes for the admin 世界银行 tab (components/admin/WorldBankReviewForm.tsx). */
export type WorldBankReviewRow = {
  id: string;
  country: string;
  tenderNumber: string;
  title: string;
  buyer: string;
  submissionDeadline?: string;
  tier: string;
  outcome: "write" | "duplicate" | "review" | "excluded" | "closed";
  /** The stored row it resembles, for a review or duplicate. */
  matchSlug?: string;
  matchTitle?: string;
  matchSource?: string;
  matchKind?: string;
  sourceUrl: string;
};

export type WorldBankReviewResponse = { rows: WorldBankReviewRow[]; written?: number; failed?: { slug: string; error: string }[] };
