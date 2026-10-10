/**
 * Find — and, with --write, remove — the same procurement stored twice.
 *
 * User, 2026-10-10: 请检查，确保不是重复. Groups rows that match on country,
 * buyer, amount, deadline day and folded title (lib/ingestion/
 * duplicate-procurement.ts — the same rule the import now applies to new
 * rows). Within a group it keeps one row and lists the rest:
 *   - a row an admin locked (relevance_manually_overridden) is kept first,
 *     and a second locked row is listed but never removed;
 *   - otherwise the one imported first (created_at), then the lower slug.
 *
 * A removed row is deleted the way the admin list deletes one — the row goes
 * and its slug is tombstoned in tender_manual_deletions, so the next import
 * does not bring it back. Rows that share buyer, amount and deadline but NOT
 * the title are listed separately for a human to look at, and never removed.
 *
 *   npm run dedupe:tenders              (preview — writes nothing)
 *   npm run dedupe:tenders -- --write   (removes the listed duplicates)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { procurementFingerprint } from "../lib/ingestion/duplicate-procurement";
import { convertToUsd } from "../lib/currency";

const PAGE_SIZE = 1000;
const write = process.argv.includes("--write");

type Row = {
  slug: string;
  tender_number: string;
  country: string;
  buyer: string;
  title: { es?: string; zh?: string } | null;
  estimated_value: number | null;
  currency: string | null;
  submission_deadline: string | null;
  status: string;
  relevance_manually_overridden: boolean | null;
  created_at: string;
};

const label = (row: Row) => (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 50);
const money = (row: Row) => {
  const usd = row.estimated_value === null ? null : convertToUsd(row.estimated_value, row.currency ?? undefined);
  return usd === null ? "无金额" : `$${(usd / 1_000_000).toFixed(1)}M`;
};

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, country, buyer, title, estimated_value, currency, submission_deadline, status, relevance_manually_overridden, created_at")
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const groups = new Map<string, Row[]>();
  const looseGroups = new Map<string, Row[]>();
  for (const row of rows) {
    const input = {
      country: row.country,
      buyer: row.buyer,
      estimatedValue: row.estimated_value,
      currency: row.currency,
      submissionDeadline: row.submission_deadline,
    };
    const strict = procurementFingerprint({ ...input, title: row.title?.es });
    if (strict) groups.set(strict, [...(groups.get(strict) ?? []), row]);
    // Same everything but the title — "x" stands in for it.
    const loose = procurementFingerprint({ ...input, title: "x" });
    if (loose) looseGroups.set(loose, [...(looseGroups.get(loose) ?? []), row]);
  }

  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  const toRemove: Row[] = [];
  console.log(`共 ${rows.length} 条项目，发现 ${duplicates.length} 组重复（同一采购单位、金额、截止日、标题）。\n`);
  for (const group of duplicates) {
    const [keep, ...rest] = [...group].sort(
      (a, b) =>
        Number(b.relevance_manually_overridden === true) - Number(a.relevance_manually_overridden === true) ||
        a.created_at.localeCompare(b.created_at) ||
        a.slug.localeCompare(b.slug),
    );
    // A second locked row is an admin's decision too: listed, never removed.
    toRemove.push(...rest.filter((row) => row.relevance_manually_overridden !== true));
    console.log(`  ${keep.country} ${money(keep)} 截止 ${keep.submission_deadline?.slice(0, 10)}  ${label(keep)}`);
    console.log(`    保留 ${keep.slug}${keep.relevance_manually_overridden ? "（人工锁定）" : ""}`);
    for (const row of rest) console.log(row.relevance_manually_overridden ? `    不删 ${row.slug}（也是人工锁定，请在后台自己决定）` : `    删除 ${row.slug}`);
  }

  const strictSlugs = new Set(duplicates.flat().map((row) => row.slug));
  const suspicious = [...looseGroups.values()].filter((group) => group.length > 1 && group.some((row) => !strictSlugs.has(row.slug)));
  if (suspicious.length > 0) {
    console.log(`\n另有 ${suspicious.length} 组「采购单位、金额、截止日相同，但标题不同」——可能是不同标段，只列出，不删除：`);
    for (const group of suspicious) {
      console.log(`  ${group[0].country} ${money(group[0])} 截止 ${group[0].submission_deadline?.slice(0, 10)}`);
      for (const row of group) console.log(`    ${row.slug}  ${label(row)}`);
    }
  }

  if (!write) {
    console.log(`\n预览，没有写入。将删除 ${toRemove.length} 条重复项目。确认无误后执行：npm run dedupe:tenders -- --write`);
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const row of toRemove) {
    const { error } = await supabase.from("tenders").delete().eq("slug", row.slug);
    if (error) {
      failed += 1;
      console.error(`  ${row.slug} 删除失败：${error.message}`);
      continue;
    }
    removed += 1;
    const { error: tombstoneError } = await supabase
      .from("tender_manual_deletions")
      .upsert({ slug: row.slug, tender_number: row.tender_number, title: row.title?.es ?? null, deleted_at: new Date().toISOString() }, { onConflict: "slug" });
    if (tombstoneError) console.error(`  ${row.slug} 已删除，但没能记入 tender_manual_deletions：${tombstoneError.message}`);
  }
  console.log(`\n已删除 ${removed} 条重复项目${failed ? `，${failed} 条失败` : ""}，并记入手动删除名单，之后的导入不会再写回。`);
}

main();
