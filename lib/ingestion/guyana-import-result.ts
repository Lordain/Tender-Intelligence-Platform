/**
 * What the 圭亚那 tab's import button gets back from /api/admin/import-guyana:
 * a slim row per opportunity, never whole Tender objects. Its own file so the
 * client form can import the type without pulling in the connector (node:fs,
 * child_process, pdf.js).
 */
export type GuyanaImportRow = {
  projectId: string;
  slug: string;
  title: string;
  /** flagship | significant | standard | excluded */
  tier: string;
  competition: "international" | "national" | null;
  /** The facts came from a sibling lot's notice (this one was a scan). */
  fromSibling: boolean;
  financier: string | null;
};

export type GuyanaImportResponse = {
  write: boolean;
  listedCount: number;
  readNoticeCount: number;
  kept: GuyanaImportRow[];
  excluded: GuyanaImportRow[];
  staleWarning: string | null;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};
