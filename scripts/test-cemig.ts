/**
 * Cemig e-Compras: the mapper, the source's own relevance rules and the
 * publication window, against all 22 processes published on 2026-09-25
 * (lib/ingestion/__fixtures__/cemig-published-2026-09-25.json — the list row
 * and the detail of each, trimmed to the fields the code reads).
 *
 * The tier list is the regression net for lib/relevance-cemig.ts: the reason
 * this source has its own rules is that a pregão for grid equipment is kept
 * here and excluded everywhere else.
 *
 * Usage: npm run test:cemig
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CemigProcess } from "@/lib/ingestion/connectors/cemig-live";
import { cemigDocumentLinks, mapCemigProcessToTender, CEMIG_SOURCE_NAME } from "@/lib/ingestion/cemig-mapper";
import { describeCemigStaleness, ingestCemig } from "@/lib/ingestion/ingest-cemig";
import { windowDaysFromArgv } from "@/lib/ingestion/publication-window";
import { classifyStoredTender } from "@/lib/relevance";
import { platformDay } from "@/lib/tender-status";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const processes = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/cemig-published-2026-09-25.json"), "utf8")) as CemigProcess[];
const now = new Date("2026-09-25T15:00:00Z");
const byNumber = new Map(processes.map((p) => [p.detail.processNumber, mapCemigProcessToTender(p, now)]));

async function main() {
  console.log("cemig\n");

  console.log("映射");
  check("22 个流程全部映射", [...byNumber.values()].filter(Boolean).length, 22);
  check("0 条时给出警告", describeCemigStaleness(0, 0) !== null, true);
  check("有数据但映射不出来时给出警告", describeCemigStaleness(22, 0) !== null, true);
  check("正常情况不警告", describeCemigStaleness(22, 22), null);
  const cancelled = mapCemigProcessToTender({ ...processes[0], detail: { ...processes[0].detail, isCanceled: true } }, now);
  check("已取消的流程不映射", cancelled, null);

  const EXPECTED: [string, string, "flagship" | "significant" | "standard" | "excluded"][] = [
    // 输电等级 → 中型
    ["500-G21952", "输电铁塔（至 550 kV，电子竞价）", "significant"],
    ["510-G21934", "345/500 kV 支柱绝缘子（电子竞价）", "significant"],
    ["500-TK21935", "输电加强改造整体解决方案（≥230 kV）", "significant"],
    // 电网设备和材料 → 常规（电子竞价也保留）
    ["807-G21958", "升压变压器", "standard"],
    ["530-G21900", "干式变压器", "standard"],
    ["530-G21984", "端子和母排", "standard"],
    ["530-G21978", "穿刺线夹", "standard"],
    ["530-G21959", "电压互感器监测/励磁装置", "standard"],
    // 排除
    ["530-G21976", "空调", "excluded"],
    ["530-G21944", "便携式红外热像仪", "excluded"],
    ["510-G21945", "调度中心 IT 基础设施", "excluded"],
    ["530-G21943", "剪线钳和绝缘工具", "excluded"],
    ["500-H21979", "国土与环境管理系统（服务类电子竞价）", "excluded"],
    ["500-H21960", "打印服务", "excluded"],
    ["500-H21919", "董监高责任险", "excluded"],
    ["500-H21970", "实习生中介", "excluded"],
    ["860-LS21950", "电站内部道路沥青铺设（服务）", "excluded"],
    ["500-F21974", "创新方案征集（资格登记）", "excluded"],
    ["530-F21907", "蜂窝通信资格登记", "excluded"],
    ["530-F21870", "电机销售资格登记", "excluded"],
    ["500-Z21228", "法律服务预审", "excluded"],
    ["530-F21221", "银行代收资格登记", "excluded"],
  ];

  console.log("\n档位");
  for (const [number, name, tier] of EXPECTED) check(`${name} → ${tier}`, byNumber.get(number)?.relevance.tier, tier);
  check("样本里每一条都有预期档位", EXPECTED.length, processes.length);

  console.log("\n字段");
  const towers = byNumber.get("500-G21952")!;
  check("slug", towers.slug, "cemig-500-g21952");
  check("截止 = 竞价会开始时间", towers.submissionDeadline, "2026-10-01T12:30:00.000Z");
  check("网站显示的截止日", platformDay(towers.submissionDeadline!), "2026-10-01");
  check("发布日期", platformDay(towers.publicationDate), "2026-09-04");
  check("采购方：控股公司写全称", towers.buyer, "Companhia Energética de Minas Gerais (Cemig)");
  check("采购方：子公司照原样", byNumber.get("530-G21900")!.buyer, "Cemig Distribuição S/A");
  check("程序类型带规则原文", towers.procedureType, "Pregão Eletrônico - Material · Cemig (Lei 13.303/2016)");
  check("摘要带供应品类（分档要读）", towers.summary.es.includes("ESTRUTURA METÁLICA P/LINHA TRANSMISSÃO ATÉ 550kV"), true);
  check("项目页链接", towers.sourceUrl, "https://app2-compras.cemig.com.br/processos/21952");
  check("行业含能源矿业", towers.industries.includes("energy_mining"), true);
  check("没有金额", towers.estimatedValue, undefined);
  check("来源名", towers.sourceName, CEMIG_SOURCE_NAME);
  const links = cemigDocumentLinks(processes.find((p) => p.row.id === 21952)!, towers.publicationDate);
  check("招标文件 zip 链接", links[0]?.sourceUrl.startsWith("https://arquivos-compras.cemig.com.br/21952_"), true);

  console.log("\n近 3 天发布");
  const dry = await ingestCemig(null, { write: false, processes, now });
  check("默认窗口 3 天", dry.days, 3);
  // 2026-09-22 15:00Z 之后发布的：21984（9-24）
  check("窗口内只有 9-24 发布的一条", dry.kept.map((t) => t.tenderNumber), ["530-G21984"]);
  const wide = await ingestCemig(null, { write: false, days: 0, processes, now });
  check("--days 0 不限发布时间", wide.recentCount, 22);
  check("--days 解析", windowDaysFromArgv(["node", "x", "--days", "30"]), 30);
  check("没给 --days 用默认值", windowDaysFromArgv(["node", "x"]), 3);
  let threw = false;
  try {
    windowDaysFromArgv(["node", "x", "--days", "abc"]);
  } catch {
    threw = true;
  }
  check("--days 不是数字时报错", threw, true);

  console.log("\n只作用于 Cemig");
  const elsewhere = classifyStoredTender({
    title: "Isoladores Pedestais para Sistemas de 345 e 500kV",
    summary: "Isoladores Pedestais para Sistemas de 345 e 500kV",
    buyer: "MUNICIPIO DE EXEMPLO",
    country: "Brazil",
    governmentLevel: "municipal",
    scopeType: "equipment",
    procedureType: "Pregão - Eletrônico",
    tenderNumber: "1/2026",
    sourceName: "PNCP",
  });
  check("同一标题来自 PNCP 的电子竞价时仍走通用规则（不会因为 Cemig 规则变成中型）", elsewhere.relevance.tier !== "significant", true);

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
