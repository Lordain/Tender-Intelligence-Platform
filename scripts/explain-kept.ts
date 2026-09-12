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
 *   npm run explain:kept -- --country=Colombia          (只看某个国家)
 *   npm run explain:kept -- --country=Colombia --signal=金额   (把某一桶的标题全部列出)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { explainKeptSignal, NATIONAL_PRIORITY_SOURCE_NAME } from "../lib/relevance";

const args = process.argv.slice(2);
const EXAMPLES = Number(args.find((a) => a.startsWith("--examples="))?.split("=")[1] ?? 5);
/** Substring of a bucket label; prints every title in the buckets it matches, so one bucket can be reviewed in full. */
const ONLY = args.find((a) => a.startsWith("--signal="))?.split("=").slice(1).join("=");
/**
 * Case-insensitive country filter, e.g. --country=Colombia.
 *
 * A rule change lands in one country at a time — the Colombia modalidad gate
 * added ~100 rows in a single import — and the useful question then is which
 * rules are keeping THOSE, not the distribution across a corpus that Mexico
 * dominates.
 */
const COUNTRY = args.find((a) => a.startsWith("--country="))?.split("=").slice(1).join("=");

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
const allRows = parse(readFileSync(path), { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
const rows = COUNTRY
  ? allRows.filter((row) => (row.country ?? "").toLowerCase().includes(COUNTRY.toLowerCase()))
  : allRows;
console.log(
  COUNTRY
    ? `${path}：${allRows.length} 条保留，其中 ${COUNTRY} ${rows.length} 条\n`
    : `${path}：${rows.length} 条保留\n`,
);
if (COUNTRY && rows.length === 0) {
  console.log(`没有 country 含「${COUNTRY}」的行。CSV 里出现过的国家：${[...new Set(allRows.map((r) => r.country))].join("、")}`);
}

type Bucket = { count: number; byCountry: Map<string, number>; examples: string[] };
const PROTECTED = "管理员手动设置（分类规则未参与）";
const buckets = new Map<string, Bucket>();
for (const row of rows) {
  const title = row.title_es || row.title_zh || "";
  // A hand-set tier is not the rules' doing, and reporting it under whichever
  // rule would have fired misattributes it — an admin-protected row showed up
  // in the "excluded（不该出现在 kept 里）" bucket on 2026-09-11 and read as a
  // classifier bug when it was the protection working as designed.
  if ((row.manually_protected ?? "").toLowerCase() === "true" || row.manually_protected === "yes") {
    const bucket: Bucket = buckets.get(PROTECTED) ?? { count: 0, byCountry: new Map<string, number>(), examples: [] };
    bucket.count += 1;
    bucket.byCountry.set(row.country, (bucket.byCountry.get(row.country) ?? 0) + 1);
    if (ONLY ? PROTECTED.includes(ONLY) : bucket.examples.length < EXAMPLES) bucket.examples.push(title.slice(0, 110));
    buckets.set(PROTECTED, bucket);
    continue;
  }
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
