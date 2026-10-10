/**
 * A Bolivia 「Ficha del proceso」 pasted from SICOES
 * (lib/ingestion/bolivia-sicoes-paste.ts), against the two pages the user
 * pasted on 2026-10-09 (lib/ingestion/__fixtures__/sicoes-ficha-web-*.txt;
 * people's names, the uploader and the bank account replaced with
 * placeholders).
 *
 * Usage: npm run test:bolivia-paste
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boliviaAmount, boliviaGovernmentLevel, boliviaTime, mapSicoesToTender, parseSicoesProcesses } from "@/lib/ingestion/bolivia-sicoes-paste";
import { importBoliviaPaste } from "@/lib/ingestion/import-bolivia-paste";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { isStagedCountry } from "@/lib/staged-countries";
import { parseBoliviaListPaste, screenBoliviaListRow } from "@/lib/ingestion/bolivia-list-screen";

/** A stand-in database that accepts every call upsertTendersBatched() makes and records the rows upserted into tenders. */
function recordingSupabase(): { client: SupabaseClient; tenders: Record<string, unknown>[] } {
  const tenders: Record<string, unknown>[] = [];
  const builder = (table: string) => {
    let result: { data: unknown; error: null } = { data: [], error: null };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result);
          return (...args: unknown[]) => {
            if (prop === "upsert" && table === "tenders") {
              const rows = args[0] as Record<string, unknown>[];
              tenders.push(...rows);
              result = { data: rows.map((row) => ({ id: `id-${row.slug}`, slug: row.slug })), error: null };
            }
            return chain;
          };
        },
      },
    );
    return chain;
  };
  return { client: { from: builder } as unknown as SupabaseClient, tenders };
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const fixture = (name: string) => readFileSync(join(__dirname, `../lib/ingestion/__fixtures__/${name}`), "utf8");
const guardia = fixture("sicoes-ficha-web-2026-10-09.txt");
const ende = fixture("sicoes-ficha-web-ende-2026-10-09.txt");
const NOW = new Date("2026-10-09T22:00:00Z");

async function main() {
  console.log("数字与时间");
  check("美式千分位", boliviaAmount("5,741,536.00"), 5741536);
  check("欧式千分位", boliviaAmount("5.741.536,00"), 5741536);
  check("带小数", boliviaAmount("31,946,876.91"), 31946876.91);
  check("玻利维亚时间 UTC-4", boliviaTime("03/11/2026", "10:00"), "2026-11-03T14:00:00.000Z");
  check("只有日期取中午", boliviaTime("09/10/2026"), "2026-10-09T16:00:00.000Z");
  check("市政府", boliviaGovernmentLevel("GOBIERNO AUTONOMO MUNICIPAL DE LA GUARDIA"), "municipal");
  check("省政府", boliviaGovernmentLevel("Gobierno Autónomo Departamental De Oruro"), "state");
  check("国企 ENDE", boliviaGovernmentLevel("EMPRESA NACIONAL DE ELECTRICIDAD - ENDE"), "public_company");
  check("国企 YPFB", boliviaGovernmentLevel("Yacimientos Petroliferos Fiscales Bolivianos - Ypfb"), "public_company");

  console.log("拉瓜迪亚市道路（Licitación Pública，Bs 574 万）");
  const [g] = parseSicoesProcesses(guardia);
  check("CUCE", g.cuce, "26-1704-00-1694954-1-1");
  check("采购方", g.entity, "GOBIERNO AUTONOMO MUNICIPAL DE LA GUARDIA");
  check("机构内部编号", g.entityCode, "GAMLG-LP-O N° 05/2026");
  check("参考价总额", g.total, 5741536);
  check("日程 13 项", g.activities.length, 13);
  const gt = mapSicoesToTender(g, NOW);
  check("标题", gt.title.es, "CONST. PAVIMENTACION DE CALLES DISTRITO MUNICIPAL N° 3");
  check("方式", gt.procedureType, "Licitación Pública · Convocatoria Pública Nacional");
  check("范围", gt.scopeType, "works");
  check("货币", gt.currency, "BOB");
  check("发布日", gt.publicationDate, "2026-10-09T16:00:00.000Z");
  check("交标截止", gt.submissionDeadline, "2026-11-03T14:00:00.000Z");
  check("状态", gt.status, "open");
  check("国内招标", gt.participationScope, "national");
  check("低于 100 万美元 → 排除", gt.relevance.tier, "excluded");
  check("Subasta 不按反向竞价排除（原因是金额）", /金额/.test(gt.relevance.reason.zh), true);
  check("关键日期含竞价开始", gt.keyDates.some((date) => date.id.endsWith("-auction")), true);

  console.log("ENDE 农村电网（世界银行出资，Bs 3,195 万）");
  const [e] = parseSicoesProcesses(ende);
  check("出资方", e.financiers, ["Banco Internacional de Reconstrucción y Fomento"]);
  const et = mapSicoesToTender(e, NOW);
  check("去掉标题引号", et.title.es, "CONST. ELECTRIFICACIÓN RURAL DE LA PROVINCIA MENDEZ (TARIJA)");
  check("方式写明资金方规则", et.procedureType, "Otras modalidades (Normativa del Financiador (BM)) · Convocatoria Pública Nacional");
  check("交标截止", et.submissionDeadline, "2026-11-06T19:00:00.000Z");
  check("约 267 万美元 → 常规", et.relevance.tier, "standard");
  check("行业含电力", et.industries.includes("power"), true);
  check("世行出资 → 按世行编号保存", et.tenderNumber, "BO-ENDE-568419-CW-RFB");
  check("世行出资 → 与世行公告同一 slug", et.slug, "bolivia-bo-ende-568419-cw-rfb");
  check("非世行项目仍按 CUCE", [gt.tenderNumber, gt.slug], ["26-1704-00-1694954-1-1", "bolivia-26-1704-00-1694954-1-1"]);
  check("摘要里保留 CUCE", et.summary.es.includes("26-0514-00-1695257-1-1"), true);

  console.log("个人信息与银行账户不保存");
  const stored = JSON.stringify([gt, et, g.fields, e.fields]);
  check("没有人员姓名", /Persona (Uno|Dos|Tres|Cuatro)|PERSONA CINCO|PERSONA CUATRO|NOMBRE APELLIDO/.test(stored), false);
  check("没有上传人账号", stored.includes("usuario.placeholder"), false);
  check("没有银行账户", /BANCO UNION|0000000000/.test(stored), false);
  check("没有日程地点里的邮箱", stored.includes("@example.bo"), false);

  console.log("国际招标、截止已过、重复粘贴");
  const intl = mapSicoesToTender(parseSicoesProcesses(ende.replace("Convocatoria Publica Nacional", "Convocatoria Publica Internacional"))[0], NOW);
  check("国际公开招标", intl.participationScope, "international_open");
  check("方式写国际", intl.procedureType.endsWith("Convocatoria Pública Internacional"), true);
  check("截止已过 → 已截止", mapSicoesToTender(e, new Date("2026-11-07T00:00:00Z")).status, "submission_closed");
  check("两页连贴 → 2 个", parseSicoesProcesses(`${guardia}\n${ende}`).length, 2);
  check("同一页贴两次 → 1 个", parseSicoesProcesses(`${ende}\n${ende}`).length, 1);

  console.log("导入（预览与写入）");
  const preview = await importBoliviaPaste(null, `${guardia}\n${ende}`, { write: false, now: NOW });
  check("预览结果", preview.rows.map((row) => [row.cuce, row.outcome]), [["26-1704-00-1694954-1-1", "excluded"], ["26-0514-00-1695257-1-1", "write"]]);
  check("美元折算显示", Math.round(preview.rows[1].budgetUsd ?? 0), 2673379);
  check("预览标出世行编号", preview.rows[1].lenderReference, "BO-ENDE-568419-CW-RFB");
  const db = recordingSupabase();
  const written = await importBoliviaPaste(db.client, `${guardia}\n${ende}`, { write: true, now: NOW, keep: { "26-1704-00-1694954-1-1": "standard" } });
  check("手动保留 + 规则保留 → 写入 2 条", written.written, 2);
  check("写入的国家", db.tenders.map((row) => row.country), ["Bolivia", "Bolivia"]);
  // Opened to visitors 2026-10-10 (user: 前台+后台+全站文字都开通Bolivia).
  check("玻利维亚已公开", isStagedCountry("Bolivia"), false);
  let message = "";
  try {
    await importBoliviaPaste(null, "Se han encontrado 64980 registros", { write: false });
  } catch (err) {
    message = err instanceof PasteInputError ? "PasteInputError" : String(err);
  }
  check("贴错内容 → 表单提示", message, "PasteInputError");

  console.log("第一层：列表初筛（贴了两页，含重复行）");
  const listed = parseBoliviaListPaste(fixture("sicoes-list-2026-10-09.txt"));
  check("两页合并去重 → 7 个", listed.length, 7);
  const verdicts = Object.fromEntries(listed.map((row) => [row.cuce, screenBoliviaListRow(row, NOW).verdict]));
  check("公开招标 → 值得打开", verdicts["26-1704-00-1694954-1-1"], "open");
  check("其他方式（世行出资）→ 值得打开", verdicts["26-0514-00-1695257-1-1"], "open");
  check("ANPE 小额 → 不用打开", verdicts["26-0517-02-1665865-1-2"], "small_or_direct");
  check("已签约 → 不在招标中", verdicts["26-0514-00-1695579-0-E"], "not_current");
  check("去掉标题引号", listed.find((row) => row.cuce === "26-0514-00-1695257-1-1")?.object, "Const. Electrificación Rural De La Provincia Mendez (Tarija)");
  const cleaning = { ...listed[0], object: "Servicio De Limpieza Y Transporte De Residuos Solidos Urbanos", contractType: "Servicios Generales" };
  check("清洁服务 → 按平台规则排除", screenBoliviaListRow(cleaning, NOW).verdict, "excluded");
  check("截止已过 → 已截止", screenBoliviaListRow(listed[0], new Date("2026-11-05T00:00:00Z")).verdict, "closed");

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  if (failures > 0) process.exit(1);
}

main();
