/**
 * Why one country has many live tenders and another few — read-only.
 *
 * User, 2026-10-12, looking at the 当前在招 counts on the map (Peru 136,
 * Colombia 49, Chile 30, Argentina 19): 秘鲁项目数多，其他非大国项目数少，这正常吗？
 *
 * The public count is NOT every live tender in the database. The public list
 * shows only tenders whose bid documents have been analysed
 * (fetchAllTendersFromDb in lib/db/tenders.ts), so a country's number
 * depends as much on how many of its tenders got analysed as on how many
 * came in. This prints both, per country, then splits the public ones by
 * source, tier and procedure, and the hidden ones by source.
 *
 * "Live" is the 当前在招 rule: derived status planned/open/clarification and a
 * deadline not before today (lib/tender-links.ts liveCandidates).
 *
 *   npm run audit:live-by-country
 *   npm run audit:live-by-country -- --country Peru     (one country, more detail)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { deriveTenderStatus, platformDay } from "../lib/tender-status";
import { LIVE_TENDER_STATUSES } from "../lib/tender-list-page";
import { isStagedCountry } from "../lib/staged-countries";
import { convertToUsd } from "../lib/currency";
import type { TenderRelevanceTier, TenderStatus } from "../types/tender";

const PAGE_SIZE = 1000;
const countryIndex = process.argv.indexOf("--country");
const ONLY = countryIndex >= 0 ? process.argv[countryIndex + 1] : undefined;
const TIER_ZH: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规" };
const ZH: Record<string, string> = {
  Mexico: "墨西哥", Brazil: "巴西", Peru: "秘鲁", Colombia: "哥伦比亚", Chile: "智利", Argentina: "阿根廷",
  "Dominican Republic": "多米尼加", Ecuador: "厄瓜多尔", Panama: "巴拿马", Bolivia: "玻利维亚", Uruguay: "乌拉圭",
  Guyana: "圭亚那", Suriname: "苏里南", Guatemala: "危地马拉",
};

type Row = {
  id: string;
  slug: string;
  country: string;
  source_name: string | null;
  procedure_type: string | null;
  relevance_tier: TenderRelevanceTier | null;
  status: TenderStatus;
  submission_deadline: string | null;
  publication_date: string | null;
  estimated_value: number | null;
  currency: string | null;
  title: { zh?: string; es?: string } | null;
};

function tally<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function printTally(title: string, entries: [string, number][], limit = 8) {
  console.log(`    ${title}`);
  for (const [key, count] of entries.slice(0, limit)) console.log(`      ${String(count).padStart(4)}  ${key}`);
  if (entries.length > limit) console.log(`      …另有 ${entries.length - limit} 类`);
}

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
      .select("id, slug, country, source_name, procedure_type, relevance_tier, status, submission_deadline, publication_date, estimated_value, currency, title")
      .neq("relevance_tier", "excluded")
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

  // Same "has analysis" test as the public list: any requirement or risk row.
  const analysed = new Set<string>();
  for (const table of ["tender_requirements", "tender_risks"] as const) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from(table).select("tender_id").order("tender_id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error(`读取 ${table} 失败：${error.message}`);
        process.exit(1);
      }
      for (const row of (data ?? []) as { tender_id: string | null }[]) if (row.tender_id) analysed.add(row.tender_id);
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }

  const now = new Date();
  const today = platformDay(now);
  const live = rows.filter((row) => {
    // A staged country is left out unless asked for by name (--country Guyana);
    // none of its rows is public, analysed or not.
    if (isStagedCountry(row.country) && row.country !== ONLY) return false;
    const status = deriveTenderStatus(row.status, { submissionDeadline: row.submission_deadline, publicationDate: row.publication_date, sourceName: row.source_name }, now);
    if (!LIVE_TENDER_STATUSES.includes(status)) return false;
    if (!row.submission_deadline || !today) return true;
    const day = platformDay(row.submission_deadline);
    return day === null || day >= today;
  });

  const byCountry = tally(live, (row) => row.country);
  console.log(`投标中、未被过滤的项目（库内）：${live.length} 条；其中已做标书分析、会在网站显示的：${live.filter((row) => analysed.has(row.id)).length} 条。\n`);
  console.log("国家          库内在招   网站显示(已分析)   未分析(网站不显示)   显示比例");
  for (const [country] of byCountry) {
    const all = live.filter((row) => row.country === country);
    const shown = isStagedCountry(country) ? 0 : all.filter((row) => analysed.has(row.id)).length;
    console.log(`  ${(ZH[country] ?? country).padEnd(8)}  ${String(all.length).padStart(6)}   ${String(shown).padStart(10)}         ${String(all.length - shown).padStart(10)}          ${Math.round((shown / all.length) * 100)}%`);
  }
  console.log("");

  for (const [country] of byCountry) {
    if (ONLY && country !== ONLY) continue;
    const all = live.filter((row) => row.country === country);
    const staged = isStagedCountry(country);
    const shown = all.filter((row) => !staged && analysed.has(row.id));
    const hidden = all.filter((row) => staged || !analysed.has(row.id));
    console.log(`==== ${ZH[country] ?? country}${staged ? "（未公开）" : ""}：网站显示 ${shown.length} 条 / 库内在招 ${all.length} 条 ====`);
    printTally("网站显示的：按来源", tally(shown, (row) => row.source_name ?? "(无)"));
    printTally("网站显示的：按规模", tally(shown, (row) => TIER_ZH[row.relevance_tier ?? "standard"] ?? row.relevance_tier ?? "常规"));
    printTally("网站显示的：按采购方式", tally(shown, (row) => (row.procedure_type ?? "(无)").slice(0, 50)));
    printTally("网站显示的：按金额", tally(shown, (row) => {
      const usd = row.estimated_value === null ? null : convertToUsd(row.estimated_value, row.currency ?? "USD");
      if (usd === null || usd === undefined) return "无金额";
      return usd < 2e6 ? "< 200万美元" : usd < 5e6 ? "200–500万" : usd < 10e6 ? "500–1000万" : "≥ 1000万";
    }));
    printTally("未分析（网站不显示）：按来源", tally(hidden, (row) => row.source_name ?? "(无)"));
    if (ONLY && staged) {
      console.log("    未公开国家，库内在招的全部：");
      for (const row of hidden.slice(0, 40)) console.log(`      ${(TIER_ZH[row.relevance_tier ?? "standard"] ?? "").padEnd(3)} ${(row.submission_deadline ?? "").slice(0, 10)} ${(row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 50)}`);
    } else if (ONLY) {
      console.log("    网站显示的前 40 条：");
      for (const row of shown.slice(0, 40)) console.log(`      ${(TIER_ZH[row.relevance_tier ?? "standard"] ?? "").padEnd(3)} ${(row.source_name ?? "").slice(0, 22).padEnd(22)} ${(row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 50)}`);
    }
    console.log("");
  }
}

main();
