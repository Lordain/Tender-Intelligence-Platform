/**
 * The shared CSV shape every "review this classification by hand" export
 * uses — reclassify-tenders.ts (what is already in Supabase) and
 * scripts/ingest-peru-live.ts (what a fresh import WOULD bring in).
 *
 * They deliberately emit the same columns so scripts/explain-kept.ts can read
 * either one without knowing which produced it: the useful question about a
 * kept set ("which rule kept these?") is the same question whether the rows
 * are already stored or still hypothetical. That only stays true if there is
 * one header list, hence this module rather than a second copy.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export type CsvValue = string | number | boolean | null | undefined;

export function csvField(value: CsvValue): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvField).join(","))].join("\n");
}

/**
 * Column order is load-bearing only in the sense that explain-kept.ts reads
 * these by NAME — but a row array is built positionally in both writers, so
 * the two must be edited together.
 *
 * `previous_tier` / `tier_changed` / `manually_protected` are meaningful only
 * for a reclassify export (a row that already exists in Supabase has a
 * previous tier and can be admin-locked). A fresh-import preview fills them
 * with the honest answers for a row that does not exist yet — empty, "n/a",
 * "no" — rather than dropping the columns and breaking the shared reader.
 */
export const REVIEW_CSV_HEADERS = [
  "slug",
  "tender_number",
  "title_zh",
  "title_es",
  "buyer",
  "country",
  "government_level",
  "source_name",
  "summary_es",
  "industries",
  "scope_type",
  "estimated_value",
  "currency",
  "previous_tier",
  "new_tier",
  "tier_changed",
  "manually_protected",
  "reason_zh",
  "source_url",
  "publication_date",
];

/**
 * Writes `csv` to `<dir>/<baseName>.csv`, falling back to a numbered name
 * when the plain one is locked.
 *
 * A locked file is not a disk hiccup, it is the normal state of an export the
 * reviewer is reading in Excel — and it has cost two full review cycles: the
 * run reports its real counts, writes nothing, and explain-kept.ts then reads
 * the PREVIOUS run's file and reports a distribution for rules that are no
 * longer in force. Losing the export of the run you just did is the expensive
 * part, so take a new name rather than give up.
 *
 * Returns the path written, or null (having logged) if it could not write —
 * never throws, because for both callers the export is a convenience and the
 * real work is already done by this point.
 */
export function writeReviewCsv(options: {
  dir: string;
  /** Without the `.csv` extension or the collision suffix. */
  baseName: string;
  csv: string;
  /** Prefix for log lines, e.g. "reclassify-tenders". */
  label: string;
  /** Appended to a hard-failure message to make clear what was NOT lost. */
  failureNote?: string;
}): string | null {
  const { dir, baseName, csv, label, failureNote } = options;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`[${label}] Could not create ${dir}/ (${(err as Error).message}); CSV export skipped.`);
    return null;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const path = join(dir, `${baseName}${attempt === 0 ? "" : `-${attempt + 1}`}.csv`);
    try {
      writeFileSync(path, csv);
      return path;
    } catch (err) {
      const locked = (err as NodeJS.ErrnoException).code === "EBUSY" || (err as NodeJS.ErrnoException).code === "EPERM";
      if (!locked) {
        console.error(
          `[${label}] Failed to write ${baseName}.csv${failureNote ? ` (${failureNote})` : ""}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }
  }
  console.error(`[${label}] Could not write ${baseName}.csv — six candidate names were all locked. Close them and re-run.`);
  return null;
}
