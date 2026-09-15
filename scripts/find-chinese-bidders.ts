/**
 * Which Chinese companies have already won the tenders in this database?
 *
 * Every awarded tender records its winner in `awarded_to` (0006). That column
 * exists to show a result on the public page, but it is also the only
 * first-party sales asset this product has: a Chinese company that has
 * already won a contract in Mexico, Colombia or Peru is a company that has
 * already paid the cost this platform removes — sourcing the notice,
 * reading the pliego in Spanish, and deciding whether to bid — and did it
 * without any of the tools here. It needs no convincing that the market
 * exists, which is the expensive half of selling anything.
 *
 * Matching is deliberately generous and deliberately NOT authoritative. A
 * Chinese firm bidding in Latin America appears under a local subsidiary
 * ("HUAWEI TECHNOLOGIES MEXICO S.A. DE C.V."), a romanisation nobody spells
 * twice the same way, occasionally Chinese characters, and sometimes a name
 * with no signal in it at all — a joint venture named after the project.
 * So this casts a wide net and prints WHY each row matched, leaving the
 * judgement to a person. Reading twenty false positives costs a minute;
 * missing the one real lead costs the lead.
 *
 * WHAT IT ACTUALLY FOUND (2026-09-15): nothing — awarded_to is empty across
 * the whole table, and for a structural reason rather than a bug. This table
 * holds what is biddable NOW: awards land after a deadline, an awarded row is
 * old by publication date, and purge:old-tenders deletes by publication date.
 * Four mappers do populate awardedTo (compranet5, compras-mx-contracts,
 * colombia, ecopetrol-contracts) and the import gate deliberately exempts
 * status "awarded" (recency.ts), so the plumbing is real — but none of those
 * contract importers runs in the daily workflow, which imports open
 * procedures only.
 *
 * So this stays as the check against our own data, and find:chinese-suppliers
 * is the one that answers the question: it asks SECOP II's public API across
 * Colombia's entire award history instead of across the couple of hundred
 * live rows here.
 *
 * Read-only. Writes nothing, to Postgres or anywhere else.
 *
 * Usage:
 *   npm run find:chinese-bidders            (matches only)
 *   npm run find:chinese-bidders -- --all   (every awarded tender, matched or not)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const args = process.argv.slice(2);
const SHOW_ALL = args.includes("--all");

const PAGE_SIZE = 1000;

/**
 * Each rule says what it saw, so the output can be judged rather than
 * trusted. Ordered strongest signal first — the first match is what prints.
 */
const SIGNALS: { label: string; test: RegExp }[] = [
  { label: "中文字符", test: /[一-鿿]/ },
  {
    label: "国企/央企常见名",
    test: /\b(sinopec|sinohydro|sinoma|sinosteel|sinotrans|sinochem|cnpc|cnooc|cccc|crcc|crbc|cgcoc|cmec|cmc|cnbm|cnee|ceec|cheec|chec|cwe|powerchina|energychina|state\s*grid|china\s*(railway|harbour|communications|energy|state|national|machinery|gezhouba|civil|road|nuclear|three\s*gorges)|norinco|citic)\b/i,
  },
  {
    label: "已知中国品牌",
    test: /\b(huawei|zte|byd|catl|goldwind|sany|xcmg|zoomlion|liugong|shantui|yutong|king\s*long|foton|dongfeng|sinotruk|shacman|faw|saic|chery|geely|haier|midea|gree|tbea|xd\s*group|pinggao|nari|ming\s*yang|envision|longi|jinko|trina|ja\s*solar|canadian\s*solar|risen|astronergy|sungrow|huasun|hikvision|dahua|xiaomi|lenovo|tcl|oppo|vivo|transsion|chint|delixi|hongfa|wanhua|lg\s*chem)\b/i,
  },
  {
    label: "拼音/中国地名",
    test: /\b(beijing|shanghai|shenzhen|guangzhou|guangdong|tianjin|chongqing|hangzhou|suzhou|nanjing|wuhan|xian|xi'an|chengdu|shenyang|harbin|dalian|qingdao|jinan|zhengzhou|changsha|hefei|fuzhou|xiamen|ningbo|wenzhou|wuxi|kunming|nanning|urumqi|lanzhou|taiyuan|shijiazhuang|jiangsu|zhejiang|shandong|henan|hebei|hunan|hubei|fujian|anhui|sichuan|shaanxi|liaoning|jilin|heilongjiang|yunnan|guizhou|gansu|xinjiang|jiangxi|shanxi|hainan|inner\s*mongolia)\b/i,
  },
  { label: "名称含 China / Chinese", test: /\bchin(a|ese)\b/i },
  {
    label: "香港/澳门/台湾",
    test: /\b(hong\s*kong|hongkong|macau|macao|taiwan|taipei)\b/i,
  },
];

type Row = {
  slug: string;
  public_slug: string;
  tender_number: string;
  title: { zh?: string; es?: string } | null;
  buyer: string;
  country: string;
  status: string;
  awarded_to: string | null;
  awarded_value: number | null;
  award_date: string | null;
  currency: string | null;
};

function signalFor(name: string): string | null {
  for (const signal of SIGNALS) if (signal.test.test(name)) return signal.label;
  return null;
}

const money = (value: number | null, currency: string | null) =>
  value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency ?? ""}`.trim();

async function main() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY（以及 NEXT_PUBLIC_SUPABASE_URL）必须设置。");

  // Paged and ordered: an unbounded select is silently capped at 1000 rows by
  // PostgREST, and a sales list that quietly stops at row 1000 is worse than
  // no list, because nothing about it looks truncated.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("tenders")
      .select("slug, public_slug, tender_number, title, buyer, country, status, awarded_to, awarded_value, award_date, currency")
      .not("awarded_to", "is", null)
      .order("award_date", { ascending: false, nullsFirst: false })
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`招标读取失败：${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    console.log("数据库里没有任何项目记录了中标方（awarded_to 全是空的）。");
    console.log("这是正常的：本表只装「现在还能投」的项目，而中标发生在截止之后，");
    console.log("授标记录按发布日期算又属于旧数据，会被 purge:old-tenders 清掉。");
    console.log("");
    console.log("要找已经中标的中国企业，用 npm run find:chinese-suppliers —— 它直接问");
    console.log("SECOP II 的公开接口，覆盖哥伦比亚全部授标历史，而不是本库这两百来条。");
    return;
  }

  const matched: { row: Row; signal: string }[] = [];
  const unmatched: Row[] = [];
  for (const row of rows) {
    const name = (row.awarded_to ?? "").trim();
    if (!name) continue;
    const signal = signalFor(name);
    if (signal) matched.push({ row, signal });
    else unmatched.push(row);
  }

  console.log(`已记录中标方的项目：${rows.length} 个`);
  console.log(`其中疑似中国企业：${matched.length} 个\n`);

  if (matched.length > 0) {
    for (const { row, signal } of matched) {
      console.log(`  ${row.awarded_to}`);
      console.log(`      命中：${signal}`);
      console.log(`      项目：${row.title?.zh ?? row.title?.es ?? row.slug}`);
      console.log(`      采购方：${row.buyer}（${row.country}）  中标金额：${money(row.awarded_value, row.currency)}  ${row.award_date ?? "无授标日期"}`);
      console.log(`      https://latintender.com/tenders/${row.public_slug}`);
      console.log("");
    }
    console.log("以上是按名称特征猜的，不是结论 —— 逐条看一眼再用。");
    console.log("对得上的就是最热的外呼名单：这家公司已经在这个市场投过标、已经付过「找标看标」的成本。\n");
  } else {
    console.log("没有按名称特征命中的中国企业。");
    console.log("这不代表没有 —— 中国公司常以当地子公司名义投标（例如「… MEXICO S.A. DE C.V.」），名称里可能没有任何线索。");
    console.log("用 --all 把全部中标方列出来自己扫一遍。\n");
  }

  if (SHOW_ALL && unmatched.length > 0) {
    console.log(`其余 ${unmatched.length} 个中标方（未命中特征）：`);
    for (const row of unmatched) {
      console.log(`  ${row.awarded_to}  ·  ${row.country}  ·  ${money(row.awarded_value, row.currency)}  ·  ${row.slug}`);
    }
  } else if (unmatched.length > 0) {
    console.log(`另有 ${unmatched.length} 个中标方未命中特征 —— 加 --all 可以全部列出来人工扫。`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
