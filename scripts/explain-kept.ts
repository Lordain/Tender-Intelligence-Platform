/**
 * Reads a tenders-kept-*.csv produced by reclassify-tenders.ts and reports
 * WHICH rule kept each row.
 *
 * "Too many are being kept" is not actionable on its own — the useful
 * question is which pattern is doing the keeping, because that is what
 * gets tightened. This groups the kept set by the first positive signal
 * that fired, so a single loose pattern shows up as a large bucket with
 * real example titles under it.
 *
 * Read-only, local: it needs no Supabase access at all, just the CSV.
 *
 * Usage:
 *   npm run explain:kept                                  (newest exports/tenders-kept-*.csv)
 *   npm run explain:kept -- exports/tenders-kept-2026-09-07.csv
 *   npm run explain:kept -- --examples=8
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { explainKeptSignal, NATIONAL_PRIORITY_SOURCE_NAME } from "../lib/relevance";

const args = process.argv.slice(2);
const EXAMPLES = Number(args.find((a) => a.startsWith("--examples="))?.split("=")[1] ?? 5);
/** Substring of a bucket label; prints every title in the buckets it matches, so one bucket can be reviewed in full. */
const ONLY = args.find((a) => a.startsWith("--signal="))?.split("=").slice(1).join("=");

function newestKeptCsv(): string {
  const dir = "exports";
  // By modification time, NOT by name: reclassify falls back to
  // "tenders-kept-<date>-2.csv" when the plain file is open in Excel, and
  // that name sorts BEFORE the plain one ("-" is 45, "." is 46), so an
  // alphabetical pick would silently read the older export — which is
  // exactly the failure this whole path exists to avoid.
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("tenders-kept-") && f.endsWith(".csv"))
    .map((f) => ({ path: join(dir, f), at: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => a.at - b.at);
  if (files.length === 0) throw new Error("exports/ 里没有 tenders-kept-*.csv，先跑 npm run reclassify:tenders");
  return files[files.length - 1].path;
}

const path = args.find((a) => !a.startsWith("--")) ?? newestKeptCsv();
const rows = parse(readFileSync(path), { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
console.log(`${path}：${rows.length} 条保留\n`);

type Bucket = { count: number; byCountry: Map<string, number>; examples: string[] };
const buckets = new Map<string, Bucket>();
for (const row of rows) {
  const title = row.title_es || row.title_zh || "";
  const signal = explainKeptSignal({
    title,
    scopeType: (row.scope_type || undefined) as never,
    // Read from the export, not omitted: without it the municipal rule
    // cannot fire here and this diagnostic would disagree with the real
    // classification — the same kind of divergence it exists to catch.
    governmentLevel: (row.government_level || undefined) as never,
    // summary and the priority-source flag were both missing here, and both
    // caused the diagnostic to report rows as excluded that the classifier
    // keeps — 30 of them in one real export, every one a federal strategic
    // corridor kept by isNationalPriorityProject. A diagnostic that sees
    // less than the classifier does not explain it, it contradicts it.
    summary: row.summary_es || undefined,
    isNationalPriorityProject: row.source_name === NATIONAL_PRIORITY_SOURCE_NAME,
    industries: (row.industries ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
    estimatedValue: row.estimated_value ? Number(row.estimated_value) : undefined,
    currency: row.currency || undefined,
    country: row.country || undefined,
    buyer: row.buyer || undefined,
  });
  const bucket: Bucket = buckets.get(signal) ?? { count: 0, byCountry: new Map<string, number>(), examples: [] };
  bucket.count += 1;
  bucket.byCountry.set(row.country, (bucket.byCountry.get(row.country) ?? 0) + 1);
  if (ONLY ? signal.includes(ONLY) : bucket.examples.length < EXAMPLES) bucket.examples.push(title.slice(0, 110));
  buckets.set(signal, bucket);
}

for (const [signal, bucket] of [...buckets].sort((a, b) => b[1].count - a[1].count)) {
  if (ONLY && !signal.includes(ONLY)) continue;
  const countries = [...bucket.byCountry].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ");
  console.log(`${String(bucket.count).padStart(4)}  ${signal}`);
  console.log(`      ${countries}`);
  for (const example of bucket.examples) console.log(`        · ${example}`);
  console.log();
}
