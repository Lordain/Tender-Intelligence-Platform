/**
 * A read-only trial of the World Bank's procurement notices. Added
 * 2026-10-09 (user: 要不要做世界银行接口？我建议做成所有国家通用，先在玻利维亚
 * 试运行 OK). It never connects to Supabase: it reads the public API, maps
 * each call as a Tender, runs it through the platform's relevance rules and
 * prints what would be kept.
 *
 * Usage:
 *   npm run dry-run:worldbank                          (Bolivia, the last 60 days)
 *   npm run dry-run:worldbank -- --country Ecuador --days 30
 *   npm run dry-run:worldbank -- --json exports/worldbank-dry-run.json
 *
 * Behind an HTTPS proxy, start Node with NODE_USE_ENV_PROXY=1 (see dry-run-panama.ts).
 */
import { writeFileSync } from "node:fs";
import { fetchWorldBankNotices } from "../lib/ingestion/connectors/worldbank-procnotices-live";
import { WORLDBANK_COUNTRIES, mapWorldBankNotice, worldBankSkipReason } from "../lib/ingestion/worldbank-mapper";
import { convertToUsd } from "../lib/currency";
import type { Tender } from "../types/tender";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
}

function money(tender: Tender): string {
  if (tender.estimatedValue === undefined) return "无金额";
  const usd = convertToUsd(tender.estimatedValue, tender.currency);
  return `${tender.currency} ${Math.round(tender.estimatedValue).toLocaleString("en-US")}${usd !== null && tender.currency !== "USD" ? `（约 US$${Math.round(usd).toLocaleString("en-US")}）` : ""}`;
}

async function main() {
  const country = flag("--country") ?? "Bolivia";
  if (!WORLDBANK_COUNTRIES[country]) throw new Error(`--country 需要是平台国家之一：${Object.keys(WORLDBANK_COUNTRIES).join("、")}`);
  const days = Number(flag("--days") ?? 60);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days 需要 1–365 之间的整数");
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { notices, truncated } = await fetchWorldBankNotices(country, since);
  console.log(`${country}：近 ${days} 天世界银行公告 ${notices.length} 条${truncated ? "（翻页上限，可能不全）" : ""}`);

  const skipped = new Map<string, number>();
  const tenders: Tender[] = [];
  for (const notice of notices) {
    const reason = worldBankSkipReason(notice);
    if (reason) skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    else tenders.push(mapWorldBankNotice(notice, now));
  }
  console.log(`\n=== 跳过（不是招标或小额方式）===`);
  for (const [reason, n] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${reason}`);

  const open = tenders.filter((tender) => tender.status === "open");
  const count = (list: Tender[], test: (tender: Tender) => boolean) => list.filter(test).length;
  console.log(`\n=== 招标公告 ${tenders.length} 条，其中仍在接受投标 ${open.length} 条 ===`);
  console.log(`  有金额 ${count(tenders, (t) => t.estimatedValue !== undefined)}，国际公开 ${count(tenders, (t) => t.participationScope === "international_open")}，国内 ${count(tenders, (t) => t.participationScope === "national")}，有世行编号 ${count(tenders, (t) => !t.slug.includes("-worldbank-"))}`);
  for (const tier of ["flagship", "significant", "standard", "excluded"]) {
    console.log(`  ${TIER_LABEL[tier]}：${count(tenders, (t) => t.relevance.tier === tier)}（其中招标中 ${count(open, (t) => t.relevance.tier === tier)}）`);
  }

  console.log(`\n=== 招标中的全部 ${open.length} 条 ===`);
  for (const tender of open.sort((a, b) => (a.submissionDeadline ?? "").localeCompare(b.submissionDeadline ?? ""))) {
    console.log(
      `  [${TIER_LABEL[tender.relevance.tier]}] ${tender.tenderNumber} | ${money(tender)} | ${tender.participationScope ?? "—"} | 截止 ${tender.submissionDeadline?.slice(0, 16) ?? "—"} | ${tender.buyer.slice(0, 30)} | ${tender.title.es.slice(0, 70)}`,
    );
    if (tender.relevance.tier === "excluded") console.log(`      排除：${tender.relevance.reason.zh.slice(0, 80)}`);
  }

  const jsonPath = flag("--json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(tenders, null, 2));
    console.log(`\n明细已写到 ${jsonPath}`);
  }
  console.log(`\n试运行：只读了世界银行的公开接口，没有连接数据库，什么都没写。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
