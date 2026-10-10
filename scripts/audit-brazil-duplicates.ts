/**
 * Brazil rows imported in the last few days that may be the same procurement
 * as another stored row — a looser look than `npm run dedupe:tenders`.
 *
 * User, 2026-10-10: 巴西这两天进了很多重型机械的标，请帮我确认没有重复. The
 * import guard (lib/ingestion/duplicate-procurement.ts) only links two PNCP
 * rows that share buyer, amount to the cent and deadline day. A Pregão with a
 * confidential budget (orçamento sigiloso) is stored without an amount, so it
 * never gets a key; a notice reposted with a new deadline gets a different
 * one. This lists, for each recent row, other Brazil rows from the SAME buyer
 * (CNPJ) that match on any of:
 *   - the same amount to the cent (any deadline) — a repost;
 *   - the same deadline day and a similar title;
 *   - a nearly identical title (any deadline, any amount);
 * and, across buyers, the same title and the same amount.
 *
 * It only lists. Whether a pair is one procurement is decided against PNCP
 * (each row's PNCP page is printed): same edital/processo number = duplicate;
 * different numbers = separate purchases, even if the machine is the same.
 * Read-only — nothing is written.
 *
 *   npm run audit:brazil-duplicates                (rows added in the last 3 days)
 *   npm run audit:brazil-duplicates -- --days 7
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { convertToUsd } from "../lib/currency";

const PAGE_SIZE = 1000;
const daysIndex = process.argv.indexOf("--days");
const DAYS = daysIndex >= 0 && Number(process.argv[daysIndex + 1]) > 0 ? Number(process.argv[daysIndex + 1]) : 3;

type Row = {
  slug: string;
  buyer: string;
  title: { es?: string; zh?: string } | null;
  estimated_value: number | null;
  currency: string | null;
  submission_deadline: string | null;
  status: string;
  procedure_type: string | null;
  relevance_manually_overridden: boolean | null;
  created_at: string;
};

const STOPWORDS = new Set([
  "para", "pela", "pelo", "com", "dos", "das", "nos", "nas", "uma", "como", "sobre", "entre",
  "aquisicao", "aquisicoes", "contratacao", "empresa", "registro", "precos", "preco", "futura", "eventual",
  "atender", "atendimento", "necessidades", "secretaria", "municipal", "municipio", "objeto", "conforme", "especificacoes",
]);
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (text: string) => new Set((fold(text).match(/[a-z0-9]{4,}/g) ?? []).filter((word) => !STOPWORDS.has(word)));
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** brazil-<cnpj>-<esfera>-<seq>-<year> → the PNCP keys; null for any other Brazil source. */
function pncpKey(slug: string): { cnpj: string; seq: string; year: string } | null {
  const match = /^brazil-(\d{14})-\d+-(\d{6})-(\d{4})$/.exec(slug);
  return match ? { cnpj: match[1], seq: match[2], year: match[3] } : null;
}
const buyerKey = (row: Row) => pncpKey(row.slug)?.cnpj ?? fold(row.buyer).replace(/[^a-z0-9]/g, "");
const day = (row: Row) => row.submission_deadline?.slice(0, 10) ?? null;
const amount = (row: Row) => (row.estimated_value !== null && row.estimated_value > 0 ? row.estimated_value.toFixed(2) : null);
const money = (row: Row) => {
  const usd = row.estimated_value ? convertToUsd(row.estimated_value, row.currency ?? undefined) : null;
  return usd === null ? "无金额" : `$${(usd / 1_000_000).toFixed(2)}M`;
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
      .select("slug, buyer, title, estimated_value, currency, submission_deadline, status, procedure_type, relevance_manually_overridden, created_at")
      .eq("country", "Brazil")
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

  const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  const recent = rows.filter((row) => new Date(row.created_at).getTime() >= since);
  const wordsOf = new Map(rows.map((row) => [row.slug, words(row.title?.es ?? "")]));
  const pregao = recent.filter((row) => /preg[aã]o/i.test(row.procedure_type ?? "")).length;
  console.log(`巴西共 ${rows.length} 条；最近 ${DAYS} 天新增 ${recent.length} 条（其中 Pregão ${pregao} 条）。\n`);

  // Union-find over every pair with a reason, so a chain of reposts lands in one group.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id);
    if (up === undefined || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const reasons = new Map<string, Set<string>>();
  const link = (a: Row, b: Row, reason: string) => {
    const [ra, rb] = [find(a.slug), find(b.slug)];
    if (ra !== rb) parent.set(ra, rb);
    const key = [a.slug, b.slug].sort().join(" ↔ ");
    reasons.set(key, new Set([...(reasons.get(key) ?? []), reason]));
  };

  const byBuyer = new Map<string, Row[]>();
  for (const row of rows) byBuyer.set(buyerKey(row), [...(byBuyer.get(buyerKey(row)) ?? []), row]);
  const byTitleAmount = new Map<string, Row[]>();
  for (const row of rows) {
    const value = amount(row);
    const title = fold(row.title?.es ?? "").replace(/[^a-z0-9]/g, "");
    if (value && title) byTitleAmount.set(`${title}|${value}`, [...(byTitleAmount.get(`${title}|${value}`) ?? []), row]);
  }

  for (const row of recent) {
    const mine = wordsOf.get(row.slug)!;
    for (const other of byBuyer.get(buyerKey(row)) ?? []) {
      if (other.slug === row.slug) continue;
      const sim = similarity(mine, wordsOf.get(other.slug)!);
      if (amount(row) && amount(row) === amount(other)) link(row, other, "同单位、金额相同");
      if (day(row) && day(row) === day(other) && sim >= 0.5) link(row, other, `同单位、同截止日、标题相近(${Math.round(sim * 100)}%)`);
      if (sim >= 0.8) link(row, other, `同单位、标题几乎一样(${Math.round(sim * 100)}%)`);
    }
    const value = amount(row);
    const title = fold(row.title?.es ?? "").replace(/[^a-z0-9]/g, "");
    for (const other of value && title ? byTitleAmount.get(`${title}|${value}`) ?? [] : []) {
      if (other.slug !== row.slug && buyerKey(other) !== buyerKey(row)) link(row, other, "不同单位，但标题和金额完全相同");
    }
  }

  const linked = new Set([...reasons.keys()].flatMap((pair) => pair.split(" ↔ ")));
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!linked.has(row.slug)) continue;
    const root = find(row.slug);
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }
  const found = [...groups.values()].filter((group) => group.length > 1);

  if (found.length === 0) {
    console.log("没有发现疑似重复：最近新增的巴西项目，和库里同一采购单位的其他项目在金额、截止日、标题上都对不上。");
  } else {
    console.log(`发现 ${found.length} 组疑似重复（只是候选，要到 PNCP 核对编号才能确定）：\n`);
    for (const [index, group] of found.entries()) {
      console.log(`【${index + 1}】${group[0].buyer}`);
      for (const row of group.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const key = pncpKey(row.slug);
        const url = key ? `https://pncp.gov.br/app/editais/${key.cnpj}/${key.year}/${Number(key.seq)}` : "";
        console.log(`    ${row.slug}  ${money(row)}  截止 ${day(row) ?? "无"}  ${row.status}${row.relevance_manually_overridden ? "  人工锁定" : ""}  入库 ${row.created_at.slice(0, 10)}`);
        console.log(`      ${(row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 70)}`);
        if (url) console.log(`      ${url}`);
      }
      const slugs = new Set(group.map((row) => row.slug));
      for (const [pair, why] of reasons) {
        const [a, b] = pair.split(" ↔ ");
        if (slugs.has(a) && slugs.has(b)) console.log(`    依据：${[...why].join("；")}  (${a.replace(/^brazil-/, "")} ↔ ${b.replace(/^brazil-/, "")})`);
      }
      console.log("");
    }
  }
  console.log("只读，没有写入任何数据。把上面的输出整段发我，我到 PNCP 逐组核对编号。");
}

main();
