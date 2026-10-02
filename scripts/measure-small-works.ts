/**
 * How many small civil-works / water-works projects reach the feed, and at
 * what size — the measurement behind a value floor for them (user,
 * 2026-10-02: 土建、水工程类的项目占比太高 … 收紧小型土建/水工程入库).
 *
 * Read-only. Takes every stored tender published in the window and picks the
 * "pure works" rows: industries are construction and/or water and nothing
 * else (a road is construction + transportation, a hospital construction +
 * healthcare — those are not what the floor is about). For them it prints,
 * per country, the split by tier and by disclosed USD value, and what each
 * candidate floor would have removed, next to the share of works in the whole
 * feed before and after.
 *
 *   npm run measure:small-works                       # since 2026-08-01
 *   npm run measure:small-works -- --from 2026-09-01
 *
 * Output: downloads/measure-small-works/small-works-<from>.csv — one line per
 * pure-works row below US$ 5M or with no value, with its title and buyer, so
 * the floor can be checked against the actual projects it would drop. Send
 * the console output (and the CSV, if a floor looks borderline) back.
 *
 * Nothing is written to the database. A floor decided from this applies to
 * future imports only; stored rows stay as they are.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { convertToUsd } from "../lib/currency";
import type { LocalizedText, TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 500;
const WORKS = new Set(["construction", "water"]);
/** Candidate floors in USD. A row with no disclosed value is reported apart: a floor cannot judge it. */
const FLOORS = [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000];
const BANDS: { key: string; max: number }[] = [
  { key: "<50万", max: 500_000 },
  { key: "50-100万", max: 1_000_000 },
  { key: "100-200万", max: 2_000_000 },
  { key: "200-300万", max: 3_000_000 },
  { key: "300-500万", max: 5_000_000 },
  { key: "≥500万", max: Infinity },
];

type Row = {
  slug: string;
  tender_number: string;
  title: LocalizedText | null;
  title_zh_short: string | null;
  buyer: string;
  country: string;
  government_level: string | null;
  industries: string[] | null;
  procedure_type: string | null;
  publication_date: string;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
  source_name: string;
};

function parseFrom(argv: string[]): string {
  const index = argv.indexOf("--from");
  const from = index >= 0 ? argv[index + 1] : undefined;
  return from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "2026-08-01";
}

function isPureWorks(row: Row): boolean {
  const industries = row.industries ?? [];
  return industries.length > 0 && industries.every((industry) => WORKS.has(industry));
}

function hasWorks(row: Row): boolean {
  return (row.industries ?? []).some((industry) => WORKS.has(industry));
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "-";
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const from = parseFrom(process.argv.slice(2));
  console.log(`读取 ${from} 起发布的项目（只读）…`);

  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, tender_number, title, title_zh_short, buyer, country, government_level, industries, procedure_type, publication_date, estimated_value, currency, relevance_tier, relevance_manually_overridden, source_name",
      )
      .gte("publication_date", `${from}T00:00:00.000Z`)
      .order("slug", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`读取 tenders 失败：${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    process.stdout.write(`\r已读取 ${rows.length} 条`);
    if (!data || data.length < PAGE_SIZE) break;
  }
  console.log("");

  // Only what a visitor sees: an excluded row is not in the feed whose mix this is about.
  const feed = rows.filter((row) => row.relevance_tier !== "excluded" && row.country !== "Argentina");
  const usdOf = (row: Row) => (row.estimated_value ? convertToUsd(row.estimated_value, row.currency ?? undefined) : null);
  // A floor would never touch a 大型 / 中型 row (those are decided on value or a
  // major-project keyword first) or one an administrator locked by hand.
  const candidate = (row: Row) => isPureWorks(row) && row.relevance_tier === "standard" && !row.relevance_manually_overridden;

  const countries = [...new Set(feed.map((row) => row.country))].sort(
    (a, b) => feed.filter((row) => row.country === b).length - feed.filter((row) => row.country === a).length,
  );

  console.log(`\n推荐列表里（不含已过滤、不含阿根廷）共 ${feed.length} 个项目。`);
  console.log("「纯土建/水工程」= 行业标签只有土建和/或水工程；修路（+交通）、医院（+医疗）等不算。\n");

  for (const country of [...countries, "ALL"]) {
    const scope = country === "ALL" ? feed : feed.filter((row) => row.country === country);
    const pure = scope.filter(isPureWorks);
    const pool = scope.filter(candidate);
    const tiers: Record<string, number> = {};
    for (const row of pure) tiers[row.relevance_tier ?? "standard"] = (tiers[row.relevance_tier ?? "standard"] ?? 0) + 1;
    const undisclosed = pool.filter((row) => usdOf(row) === null).length;
    const bands = BANDS.map(({ key, max }, index) => {
      const min = index === 0 ? 0 : BANDS[index - 1].max;
      return `${key} ${pool.filter((row) => { const usd = usdOf(row); return usd !== null && usd >= min && usd < max; }).length}`;
    });
    const levels: Record<string, number> = {};
    for (const row of pool) levels[row.government_level ?? "?"] = (levels[row.government_level ?? "?"] ?? 0) + 1;
    const locked = scope.filter((row) => isPureWorks(row) && row.relevance_tier === "standard" && row.relevance_manually_overridden).length;

    console.log(`── ${country === "ALL" ? "合计" : country} ──（${scope.length} 个）`);
    console.log(`  带土建或水工程标签：${scope.filter(hasWorks).length}（${pct(scope.filter(hasWorks).length, scope.length)}）；纯土建/水工程：${pure.length}（${pct(pure.length, scope.length)}）`);
    console.log(`  纯土建/水工程按规模：大型 ${tiers.flagship ?? 0} · 中型 ${tiers.significant ?? 0} · 常规 ${tiers.standard ?? 0}${locked ? `（其中 ${locked} 个常规是后台手动锁定的，不计入下面）` : ""}`);
    console.log(`  常规的金额（美元）：未披露 ${undisclosed} · ${bands.join(" · ")}`);
    console.log(`  常规的发标层级：${Object.entries(levels).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    const floorLine = FLOORS.map((floor) => {
      const cut = pool.filter((row) => { const usd = usdOf(row); return usd !== null && usd < floor; }).length;
      const remaining = scope.length - cut;
      const works = scope.filter(hasWorks).length - cut;
      return `<${floor / 10_000}万 去掉 ${cut}（土建水占比 ${pct(works, remaining)}）`;
    });
    console.log(`  只按已披露金额设下限：${floorLine.join(" · ")}`);
    console.log(`  若未披露金额的常规也一并去掉：再去掉 ${undisclosed}\n`);
  }

  const lines = [
    ["country", "tier", "usd", "estimated_value", "currency", "government_level", "procedure_type", "industries", "title_zh", "title_es", "buyer", "tender_number", "slug", "publication_date", "source_name"].join(","),
  ];
  for (const row of feed.filter(candidate)) {
    const usd = usdOf(row);
    if (usd !== null && usd >= 5_000_000) continue;
    lines.push(
      [
        row.country,
        row.relevance_tier,
        usd === null ? "" : Math.round(usd),
        row.estimated_value,
        row.currency,
        row.government_level,
        row.procedure_type,
        (row.industries ?? []).join("|"),
        row.title_zh_short ?? row.title?.zh ?? "",
        row.title?.es ?? "",
        row.buyer,
        row.tender_number,
        row.slug,
        row.publication_date.slice(0, 10),
        row.source_name,
      ].map(csvCell).join(","),
    );
  }
  const dir = join(process.cwd(), "downloads", "measure-small-works");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `small-works-${from}.csv`);
  // BOM so Excel opens the Chinese and Spanish titles as UTF-8.
  writeFileSync(file, `﻿${lines.join("\n")}\n`);
  console.log(`明细（常规、纯土建/水工程、金额 < 500 万美元或未披露，共 ${lines.length - 1} 行）：${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
