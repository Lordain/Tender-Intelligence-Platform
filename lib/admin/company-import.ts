/** Shared by app/api/admin/import-company/route.ts and components/admin/ImportCompanySourceForm.tsx. */
export const COMPANY_IMPORT_SOURCES = ["petronect", "cemig", "upme", "petroperu"] as const;
export type CompanyImportSource = (typeof COMPANY_IMPORT_SOURCES)[number];

export type CompanyImportSample = {
  slug: string;
  tenderNumber: string;
  title: string;
  tier: string;
  submissionDeadline?: string;
};

export type CompanyImportResult = {
  source: CompanyImportSource;
  days: number;
  /** One line saying what was read and what survived the window and the rules. */
  summary: string;
  staleWarning: string | null;
  kept: CompanyImportSample[];
  write: boolean;
  upsertedCount?: number;
  /** Not written, with why — past deadline, bidding window too short. */
  notWritten?: string[];
  failed?: { slug: string; error: string }[];
};

