/**
 * Which Chinese companies have already won Colombian public contracts?
 *
 * The sibling of find:chinese-bidders, pointed at the source instead of at
 * this database — which is what made it necessary. That script found nothing,
 * because `awarded_to` is empty for a structural reason: the tenders table
 * holds what is biddable NOW. Awards land after a deadline, awarded rows are
 * old by publication date, and purge:old-tenders deletes by publication date.
 * The feed is doing exactly what it should; the award history simply is not
 * kept here, and asking this database about it will keep returning nothing.
 *
 * SECOP II publishes the whole history on Socrata (datos.gov.co, resource
 * p6dx-8zbt — the same one colombia-mapper reads), and `nombre_del_proveedor`
 * is queryable server-side. So this asks Colombia directly, across every
 * procedure it has ever published, rather than across the couple of hundred
 * rows that happen to be live here.
 *
 * Colombia only, and deliberately: it is the one of the three countries whose
 * award data sits behind a public query API. Mexico's equivalents arrive as
 * bulk CSV exports (see compranet5-mapper, compras-mx-contracts-mapper) and
 * Peru's OCDS record has no supplier-name search, so both would need a
 * download-and-scan rather than a query — worth doing, not the same script.
 *
 * WHY THIS IS A SALES LIST, not a report. A Chinese company that has already
 * won a contract in Colombia has already paid the cost this platform removes:
 * finding the notice, reading the pliego in Spanish, deciding whether to bid —
 * and did it with none of these tools. It does not need to be convinced the
 * market exists, which is the expensive half of selling anything.
 *
 * TOUCHES NO DATABASE. It reads a public API and writes a CSV. Nothing here
 * can add a row to the tender feed, which matters: the feed is curated to what
 * is biddable, and dumping years of finished contracts into it would undo that.
 *
 * Matching runs in two stages, because one is not enough. The server-side
 * `like` is a substring test with no notion of words, so '%CHINA%' also
 * matches MAQUINARIA COCHINA and similar. Brand tokens (HUAWEI, SANY) are
 * accepted as they come; the generic ones (CHINA, CHINESE) are re-checked
 * here against a word boundary. Both are still guesses — a Chinese firm bids
 * through a Colombian subsidiary whose name may carry no signal at all — so
 * every row prints WHY it matched and the judgement stays with a person.
 *
 * Usage:
 *   npm run find:chinese-suppliers
 *   npm run find:chinese-suppliers -- --min-value=1000000000   (COP, default 0)
 *   npm run find:chinese-suppliers -- --keyword=HUAWEI         (probe one name)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toCsv } from "../lib/ingestion/review-csv";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? "";
const MIN_VALUE = Number(flag("min-value") || "0");
const ONE_KEYWORD = flag("keyword").toUpperCase().trim();

const ENDPOINT = "https://www.datos.gov.co/resource/p6dx-8zbt.json";
const OUT_DIR = "exports";
const PER_KEYWORD_LIMIT = 5000;

/**
 * `generic: true` means the token is a real Spanish substring risk and has to
 * survive a word-boundary re-check below. The brand tokens do not: no Spanish
 * word contains "HUAWEI".
 */
const KEYWORDS: { token: string; generic?: boolean }[] = [
  { token: "CHINA", generic: true },
  { token: "CHINESE", generic: true },
  { token: "SINOHYDRO" }, { token: "SINOPEC" }, { token: "SINOMA" }, { token: "SINOSTEEL" },
  { token: "POWERCHINA" }, { token: "ENERGYCHINA" }, { token: "NORINCO" }, { token: "CITIC" },
  { token: "HUAWEI" }, { token: "ZTE" }, { token: "HIKVISION" }, { token: "DAHUA" },
  { token: "BYD" }, { token: "CATL" }, { token: "YUTONG" }, { token: "FOTON" },
  { token: "SINOTRUK" }, { token: "SHACMAN" }, { token: "DONGFENG" }, { token: "CHERY" },
  { token: "GEELY" }, { token: "SANY" }, { token: "XCMG" }, { token: "ZOOMLION" },
  { token: "LIUGONG" }, { token: "SHANTUI" }, { token: "GOLDWIND" }, { token: "MINGYANG" },
  { token: "ENVISION" }, { token: "LONGI" }, { token: "JINKO" }, { token: "TRINA" },
  { token: "JA SOLAR" }, { token: "RISEN" }, { token: "SUNGROW" }, { token: "TBEA" },
  { token: "CHINT" }, { token: "HAIER" }, { token: "MIDEA" }, { token: "GREE" },
  { token: "LENOVO" }, { token: "XIAOMI" }, { token: "TCL" }, { token: "TRANSSION" },
  { token: "CRRC" }, { token: "CRCC" }, { token: "CCCC" }, { token: "CMEC" },
  { token: "GEZHOUBA" }, { token: "HARBOUR ENGINEERING" }, { token: "SHANGHAI" },
  { token: "BEIJING" }, { token: "SHENZHEN" }, { token: "GUANGZHOU" }, { token: "HONG KONG" },
];

type SecopRow = {
  entidad?: string;
  departamento_entidad?: string;
  id_del_proceso?: string;
  nombre_del_procedimiento?: string;
  nombre_del_proveedor?: string;
  valor_total_adjudicacion?: string;
  fecha_adjudicacion?: string;
  modalidad_de_contratacion?: string;
  tipo_de_contrato?: string;
  urlproceso?: { url?: string };
};

type Award = {
  supplier: string;
  matchedOn: string;
  buyer: string;
  department: string;
  procedure: string;
  value: number;
  date: string;
  url: string;
};

async function fetchKeyword(token: string): Promise<SecopRow[]> {
  // Socrata SoQL. upper() on the column rather than a case-insensitive
  // operator, because SODA2's `like` is case-SENSITIVE and supplier names
  // arrive in mixed case.
  const where = `upper(nombre_del_proveedor) like '%${token.replace(/'/g, "''")}%'`;
  const url =
    `${ENDPOINT}?$select=entidad,departamento_entidad,id_del_proceso,nombre_del_procedimiento,` +
    `nombre_del_proveedor,valor_total_adjudicacion,fecha_adjudicacion,modalidad_de_contratacion,` +
    `tipo_de_contrato,urlproceso&$where=${encodeURIComponent(where)}&$limit=${PER_KEYWORD_LIMIT}`;

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`datos.gov.co 返回 ${response.status} ${response.statusText}（关键词 ${token}）`);
  }
  return (await response.json()) as SecopRow[];
}

/** The second stage: a generic token has to appear as a WORD, not a substring. */
function survivesWordCheck(supplier: string, token: string, generic: boolean | undefined): boolean {
  if (!generic) return true;
  return new RegExp(`(^|[^A-Z])${token}([^A-Z]|$)`, "i").test(supplier.toUpperCase());
}

const money = (value: number) => (value > 0 ? `COP ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—");

async function main() {
  const keywords = ONE_KEYWORD ? [{ token: ONE_KEYWORD }] : KEYWORDS;
  console.log(`向 datos.gov.co 查询 ${keywords.length} 个关键词（SECOP II 全部历史，不限于本站数据库）...\n`);

  // Keyed by process id so the same award found by two keywords is counted once.
  const awardById = new Map<string, Award>();
  for (const { token, generic } of keywords) {
    let rows: SecopRow[];
    try {
      rows = await fetchKeyword(token);
    } catch (error) {
      console.log(`  ${token.padEnd(20)} 查询失败：${error instanceof Error ? error.message : error}`);
      continue;
    }
    let kept = 0;
    for (const row of rows) {
      const supplier = (row.nombre_del_proveedor ?? "").trim();
      if (!supplier || supplier === "No Definido") continue;
      if (!survivesWordCheck(supplier, token, generic)) continue;
      const value = Number(row.valor_total_adjudicacion ?? 0) || 0;
      if (value < MIN_VALUE) continue;
      const id = row.id_del_proceso ?? `${supplier}|${row.nombre_del_procedimiento ?? ""}`;
      if (awardById.has(id)) continue;
      awardById.set(id, {
        supplier,
        matchedOn: token,
        buyer: (row.entidad ?? "").trim(),
        department: (row.departamento_entidad ?? "").trim(),
        procedure: (row.nombre_del_procedimiento ?? "").trim(),
        value,
        date: (row.fecha_adjudicacion ?? "").slice(0, 10),
        url: row.urlproceso?.url ?? `https://www.datos.gov.co/resource/p6dx-8zbt.json?id_del_proceso=${row.id_del_proceso ?? ""}`,
      });
      kept += 1;
    }
    if (rows.length > 0) {
      const note = rows.length >= PER_KEYWORD_LIMIT ? `（达到 ${PER_KEYWORD_LIMIT} 条上限，可能还有更多）` : "";
      console.log(`  ${token.padEnd(20)} 返回 ${String(rows.length).padStart(5)} 条，留下 ${kept}${note}`);
    }
  }

  const awards = [...awardById.values()];
  if (awards.length === 0) {
    console.log("\n没有命中任何供应商。");
    console.log("这不代表没有中国企业中标 —— 它们常以哥伦比亚本地子公司名义投标，名称里可能没有任何线索。");
    console.log("可以用 --keyword=某个公司名 单独试探。");
    return;
  }

  // One line per COMPANY, not per contract: the sales target is the company.
  const bySupplier = new Map<string, { awards: Award[]; total: number }>();
  for (const award of awards) {
    const entry = bySupplier.get(award.supplier) ?? { awards: [], total: 0 };
    entry.awards.push(award);
    entry.total += award.value;
    bySupplier.set(award.supplier, entry);
  }
  const ranked = [...bySupplier.entries()].sort((a, b) => b[1].total - a[1].total);

  console.log(`\n疑似中国供应商 ${ranked.length} 家，合计 ${awards.length} 份合同：\n`);
  for (const [supplier, entry] of ranked) {
    const latest = entry.awards.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    console.log(`  ${supplier}`);
    console.log(`      ${entry.awards.length} 份合同  ·  合计 ${money(entry.total)}  ·  命中「${latest.matchedOn}」`);
    console.log(`      最近一份：${latest.date || "无日期"}  ${latest.buyer}${latest.department ? `（${latest.department}）` : ""}`);
    if (latest.procedure) console.log(`      ${latest.procedure.slice(0, 90)}`);
    console.log("");
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `chinese-suppliers-colombia-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(
    path,
    toCsv(
      ["supplier", "contracts", "total_cop", "matched_on", "latest_date", "latest_buyer", "department", "latest_procedure", "url"],
      ranked.map(([supplier, entry]) => {
        const latest = entry.awards.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
        return [supplier, entry.awards.length, entry.total, latest.matchedOn, latest.date, latest.buyer, latest.department, latest.procedure, latest.url];
      }),
    ),
    "utf8",
  );
  console.log(`CSV 已写入 ${path}\n`);
  console.log("这是按名称特征猜的，不是结论 —— 逐条看一眼再用。");
  console.log("对得上的，就是已经在哥伦比亚中过标的中国企业：市场不用你教育，他们已经自己付过「找标看标」的成本。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
