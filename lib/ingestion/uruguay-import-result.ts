/**
 * What the 乌拉圭 tab's import button gets back from /api/admin/import-uruguay:
 * a slim row per call, never whole Tender objects. Its own file so the client
 * form can import the type without pulling in the connector.
 */
export type UruguayImportRow = {
  /** "Licitación Pública 16/2026 (ID 1369499)" */
  tenderNumber: string;
  slug: string;
  title: string;
  buyer: string;
  /** flagship | significant | standard | excluded */
  tier: string;
  /** Deadline already passed: read, but not written. */
  closed: boolean;
  /** Why the rules excluded it; empty for kept rows. */
  reason: string;
};

export type UruguayImportResponse = {
  write: boolean;
  /** New calls in the window, every procedure. */
  listedCount: number;
  /** Calls in scope: every Licitación Pública and the key buyers' Licitaciones Abreviadas. */
  inScopeCount: number;
  failedReads: number;
  kept: UruguayImportRow[];
  excluded: UruguayImportRow[];
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};
