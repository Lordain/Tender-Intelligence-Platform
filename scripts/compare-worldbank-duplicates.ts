/**
 * How many World Bank calls the platform already holds from the countries'
 * own systems — a one-off, read-only report (user, 2026-10-09: 要知道重复到底
 * 有多少、比对规则准不准 … 只读、不写、不改任何东西。可以吗？ ok).
 *
 * For each country: the World Bank's calls of the last --days days, each
 * compared (lib/ingestion/cross-source-match.ts) with the stored rows of that
 * country published or closing in the same span and a month either side. It
 * only SELECTs; nothing is written. Prints every candidate pair with its
 * scores so the rule can be judged by eye.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/compare-worldbank-duplicates.ts --days 120
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchWorldBankNotices } from "../lib/ingestion/connectors/worldbank-procnotices-live";
import { WORLDBANK_COUNTRIES, mapWorldBankNotice, worldBankSkipReason } from "../lib/ingestion/worldbank-mapper";
import { lenderReference } from "../lib/ingestion/lender-reference";
import { findCrossSourceMatch, type MatchCandidate } from "../lib/ingestion/cross-source-match";

const PAGE = 1000;

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "es" in value) return String((value as { es: unknown }).es ?? "");
  return "";
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("需要 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  const days = Number(flag("--days") ?? 120);
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const storedFrom = new Date(since.getTime() - 30 * 86_400_000).toISOString();

  const totals = { calls: 0, reference: 0, strong: 0, weak: 0, none: 0 };
  for (const country of Object.keys(WORLDBANK_COUNTRIES)) {
    const { notices, truncated } = await fetchWorldBankNotices(country, since);
    const calls = notices.filter((notice) => !worldBankSkipReason(notice));

    const candidates: MatchCandidate[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("tenders")
        .select("slug,tender_number,title,summary,buyer,submission_deadline,source_name")
        .eq("country", country)
        .or(`publication_date.gte.${storedFrom},submission_deadline.gte.${storedFrom}`)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${country}：读取失败 ${error.message}`);
      for (const row of data ?? []) {
        candidates.push({
          slug: row.slug,
          tenderNumber: row.tender_number,
          title: textOf(row.title),
          summary: textOf(row.summary),
          buyer: row.buyer ?? "",
          submissionDeadline: row.submission_deadline,
          sourceName: row.source_name,
        });
      }
      if (!data || data.length < PAGE) break;
    }

    console.log(`\n=== ${country}：世界银行招标 ${calls.length} 条${truncated ? "（翻页上限）" : ""}；库里同期项目 ${candidates.length} 条 ===`);
    const counts = { reference: 0, strong: 0, weak: 0, none: 0 };
    for (const notice of calls) {
      const tender = mapWorldBankNotice(notice, now);
      const match = findCrossSourceMatch(
        { reference: lenderReference(notice.bid_reference_no), title: tender.title.es, buyer: tender.buyer, submissionDeadline: tender.submissionDeadline },
        candidates,
      );
      const kind = match?.kind ?? "none";
      counts[kind] += 1;
      const head = `  [${{ reference: "编号相同", strong: "很可能同一项目", weak: "可能", none: "库里没有" }[kind]}] ${tender.tenderNumber} | 截止 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | ${tender.status} | ${tender.relevance.tier}`;
      console.log(head);
      console.log(`      世行：${tender.buyer.slice(0, 50)} | ${tender.title.es.slice(0, 110)}`);
      if (match) {
        console.log(
          `      库里：${match.candidate.buyer.slice(0, 50)} | ${match.candidate.title.slice(0, 110)}\n` +
            `            ${match.candidate.slug} | ${match.candidate.sourceName ?? "—"} | 截止 ${match.candidate.submissionDeadline?.slice(0, 10) ?? "—"} | 标题重合 ${match.titleOverlap.toFixed(2)} 采购方重合 ${match.buyerOverlap.toFixed(2)} 截止差 ${match.deadlineDays?.toFixed(1) ?? "—"} 天`,
        );
      }
    }
    console.log(`  小计：编号相同 ${counts.reference}，很可能 ${counts.strong}，可能 ${counts.weak}，库里没有 ${counts.none}`);
    totals.calls += calls.length;
    for (const key of ["reference", "strong", "weak", "none"] as const) totals[key] += counts[key];
  }
  console.log(`\n=== 合计（近 ${days} 天）：世界银行招标 ${totals.calls} 条；编号相同 ${totals.reference}，很可能 ${totals.strong}，可能 ${totals.weak}，库里没有 ${totals.none} ===`);
  console.log("只读：只执行了查询，没有写入或修改数据库。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
