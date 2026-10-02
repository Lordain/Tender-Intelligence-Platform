/**
 * The numbers behind the monthly 拉美政府招标分析报告 (user, 2026-10-02: 发
 * 9月拉美政府招标月度分析报告 on 小红书 / 公众号 / 领英 / 脉脉).
 *
 * Read-only. Takes every tender PUBLISHED in the month (publication_date, the
 * stored UTC day) and writes one JSON file with, per country:
 *   - project counts by tier, and by industry × tier (a tender can carry more
 *     than one industry, so the industry rows add up to more than the total);
 *   - counts by budget band, in USD through lib/currency.ts;
 *   - the top 5 by USD value among recommended (non-excluded) tenders (the
 *     report uses 3; the spares cover a value that is a source typo);
 *   - counts by participation scope (Carácter del procedimiento), where the
 *     source states it;
 *   - for every analysed tender (one with extracted requirements or risks):
 *     its qualification / experience / document / risk titles — the raw
 *     material for 常见资质 / 文件 / 风险, grouped by theme afterwards.
 *
 *   npm run report:monthly -- --month 2026-09
 *
 * Output: downloads/monthly-report/report-<month>.json (downloads/ is
 * gitignored). Send that file back for the write-up.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { convertToUsd } from "../lib/currency";
import type { LocalizedText, TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 200;

type Requirement = { kind: "qualification" | "experience" | "document"; title: LocalizedText | null; mandatory: boolean | null };
type Risk = { level: string; title: LocalizedText | null };
type Row = {
  slug: string;
  public_slug: string | null;
  tender_number: string;
  title: LocalizedText | null;
  title_zh_short: string | null;
  title_zh_public: string | null;
  buyer: string;
  country: string;
  industries: string[] | null;
  scope_type: string;
  procedure_type: string | null;
  participation_scope: string | null;
  publication_date: string;
  submission_deadline: string | null;
  estimated_value: number | null;
  currency: string | null;
  status: string;
  relevance_tier: TenderRelevanceTier | null;
  source_name: string;
  tender_requirements: Requirement[];
  tender_risks: Risk[];
};

// Edges at the tier lines in lib/relevance.ts (中型 $5M, 大型 $10M), so a band
// reads against the 大型 / 中型 / 常规 counts beside it.
const BUDGET_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: "lt1m", label: "< 100 万美元", min: 0, max: 1_000_000 },
  { key: "1m_5m", label: "100 万 – 500 万美元", min: 1_000_000, max: 5_000_000 },
  { key: "5m_10m", label: "500 万 – 1000 万美元", min: 5_000_000, max: 10_000_000 },
  { key: "10m_50m", label: "1000 万 – 5000 万美元", min: 10_000_000, max: 50_000_000 },
  { key: "gte50m", label: "≥ 5000 万美元", min: 50_000_000, max: Infinity },
];

function text(value: LocalizedText | null | undefined): { zh: string; es: string } {
  return { zh: value?.zh?.trim() ?? "", es: value?.es?.trim() ?? "" };
}

function parseMonth(argv: string[]): string {
  const index = argv.indexOf("--month");
  const month = index >= 0 ? argv[index + 1] : undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) return month;
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return previous.toISOString().slice(0, 7);
}

function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7);
}

function increment(record: Record<string, number>, key: string, by = 1) {
  record[key] = (record[key] ?? 0) + by;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const month = parseMonth(process.argv.slice(2));
  const from = `${month}-01T00:00:00.000Z`;
  const to = `${nextMonth(month)}-01T00:00:00.000Z`;
  console.log(`统计 ${month} 发布的项目（publication_date ${from} ～ ${to}）…`);

  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, public_slug, tender_number, title, title_zh_short, title_zh_public, buyer, country, industries, scope_type, procedure_type, participation_scope, publication_date, submission_deadline, estimated_value, currency, status, relevance_tier, source_name, tender_requirements ( kind, title, mandatory ), tender_risks ( level, title )",
      )
      .gte("publication_date", from)
      .lt("publication_date", to)
      .order("slug", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`读取 tenders 失败：${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    process.stdout.write(`\r已读取 ${rows.length} 条`);
    if (!data || data.length < PAGE_SIZE) break;
  }
  console.log("");

  const { count: databaseTotal } = await supabase.from("tenders").select("slug", { count: "exact", head: true });

  type CountryStats = {
    total: number;
    tiers: Record<string, number>;
    industries: Record<string, Record<string, number>>;
    budgetBands: Record<string, number>;
    budgetBandsRecommended: Record<string, number>;
    participationScope: Record<string, number>;
    participationScopeRecommended: Record<string, number>;
    /** Sum of the disclosed estimated values, in USD. */
    disclosedUsd: number;
    analysedCount: number;
    analysedRecommendedCount: number;
    top3: unknown[];
  };
  const countries: Record<string, CountryStats> = {};
  const analysed: unknown[] = [];

  for (const row of rows) {
    const tier = row.relevance_tier ?? "standard";
    const recommended = tier !== "excluded";
    const stats = (countries[row.country] ??= {
      total: 0,
      tiers: {},
      industries: {},
      budgetBands: {},
      budgetBandsRecommended: {},
      participationScope: {},
      participationScopeRecommended: {},
      disclosedUsd: 0,
      analysedCount: 0,
      analysedRecommendedCount: 0,
      top3: [],
    });
    stats.total += 1;
    increment(stats.tiers, tier);
    for (const industry of row.industries?.length ? row.industries : ["general"]) {
      increment((stats.industries[industry] ??= {}), tier);
    }

    const usd = row.estimated_value ? convertToUsd(row.estimated_value, row.currency ?? undefined) : null;
    const band = usd === null ? "undisclosed" : (BUDGET_BANDS.find((b) => usd >= b.min && usd < b.max)?.key ?? "undisclosed");
    increment(stats.budgetBands, band);
    if (usd !== null) stats.disclosedUsd += Math.round(usd);
    if (recommended) increment(stats.budgetBandsRecommended, band);
    const scope = row.participation_scope ?? "not_stated";
    increment(stats.participationScope, scope);
    if (recommended) increment(stats.participationScopeRecommended, scope);

    const hasAnalysis = row.tender_requirements.length > 0 || row.tender_risks.length > 0;
    if (hasAnalysis) {
      stats.analysedCount += 1;
      if (recommended) stats.analysedRecommendedCount += 1;
      analysed.push({
        slug: row.slug,
        country: row.country,
        tier,
        industries: row.industries ?? [],
        qualifications: row.tender_requirements.filter((r) => r.kind === "qualification").map((r) => ({ ...text(r.title), mandatory: r.mandatory })),
        experience: row.tender_requirements.filter((r) => r.kind === "experience").map((r) => ({ ...text(r.title), mandatory: r.mandatory })),
        documents: row.tender_requirements.filter((r) => r.kind === "document").map((r) => ({ ...text(r.title), mandatory: r.mandatory })),
        risks: row.tender_risks.map((r) => ({ ...text(r.title), level: r.level })),
      });
    }
  }

  // Top 3 by USD value among the recommended rows of each country — five are
  // kept, so a source typo (PNCP's UFSCar theatre at R$ 3.16 bn, 2026-09) can
  // be dropped from the write-up without another run.
  for (const [country, stats] of Object.entries(countries)) {
    stats.top3 = rows
      .filter((row) => row.country === country && row.relevance_tier !== "excluded" && row.estimated_value)
      .map((row) => ({ row, usd: convertToUsd(row.estimated_value!, row.currency ?? undefined) ?? 0 }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 5)
      .map(({ row, usd }) => ({
        slug: row.slug,
        publicSlug: row.public_slug,
        tenderNumber: row.tender_number,
        titleZh: row.title_zh_short ?? row.title_zh_public ?? row.title?.zh ?? "",
        titleEs: row.title?.es ?? "",
        buyer: row.buyer,
        tier: row.relevance_tier,
        industries: row.industries,
        estimatedValue: row.estimated_value,
        currency: row.currency,
        usd: Math.round(usd),
        procedureType: row.procedure_type,
        participationScope: row.participation_scope,
        publicationDate: row.publication_date.slice(0, 10),
        submissionDeadline: row.submission_deadline?.slice(0, 10) ?? null,
        status: row.status,
        sourceName: row.source_name,
      }));
  }

  const output = {
    month,
    generatedAt: new Date().toISOString(),
    databaseTotal,
    monthTotal: rows.length,
    budgetBands: BUDGET_BANDS.map(({ key, label }) => ({ key, label })),
    countries,
    analysed,
  };
  const dir = join(process.cwd(), "downloads", "monthly-report");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `report-${month}.json`);
  writeFileSync(file, JSON.stringify(output));

  console.log(`\n库里共 ${databaseTotal ?? "?"} 个项目，其中 ${month} 发布 ${rows.length} 个：`);
  for (const [country, stats] of Object.entries(countries).sort((a, b) => b[1].total - a[1].total)) {
    const t = stats.tiers;
    console.log(
      `  ${country.padEnd(10)} ${String(stats.total).padStart(5)} 个｜大型 ${t.flagship ?? 0}、中型 ${t.significant ?? 0}、常规 ${t.standard ?? 0}、已过滤 ${t.excluded ?? 0}｜已分析标书 ${stats.analysedCount}`,
    );
  }
  console.log(`\n已写入 ${file}`);
  console.log("把这个文件发给 Claude，用来整理月度报告。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
