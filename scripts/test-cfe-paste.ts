/**
 * A CFE procedure pasted from CFE's micrositio (lib/ingestion/cfe-micrositio-paste.ts),
 * against the page text the user pasted on 2026-10-06
 * (lib/ingestion/__fixtures__/cfe-micrositio-2026-10-06.txt).
 *
 * Usage: npm run test:cfe-paste
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cfeDates, cfeParticipationScope, cfeScopeType, mapCfeMicrositioProcedure, parseCfeMicrositioPaste } from "@/lib/ingestion/cfe-micrositio-paste";
import { CFE_BUYER_PATTERN } from "@/lib/ingestion/heuristics";
import { isCfeCall } from "@/lib/relevance-cfe";
import { hasShortBidWindow } from "@/lib/ingestion/recency";
import { importCfePaste } from "@/lib/ingestion/import-cfe-paste";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const text = readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/cfe-micrositio-2026-10-06.txt"), "utf8");
const NOW = new Date("2026-10-06T18:00:00Z");

console.log("cfe paste\n\n时间（墨西哥城 UTC-6）");
check("hrs", cfeDates("05/10/2026 17:54 hrs"), ["2026-10-05T23:54:00.000Z"]);
check("p. m.", cfeDates("05/10/2026 06:00:00 p. m."), ["2026-10-06T00:00:00.000Z"]);
check("a. m.", cfeDates("06/10/2026 09:00:00 a. m."), ["2026-10-06T15:00:00.000Z"]);
check("中午 12 点", cfeDates("06/10/2026 12:30:00 p. m."), ["2026-10-06T18:30:00.000Z"]);
check("一行多个", cfeDates("06/10/2026 11:00 hrs\t12/10/2026 08:30 hrs\tNo").length, 2);
check("年份不合理不要", cfeDates("09/11/0202 12:00 hrs"), []);

console.log("\n编号");
check("工程", cfeScopeType("Contratación de Obras"), "works");
check("货物", cfeScopeType("Adquisiciones"), "equipment");
check("服务", cfeScopeType("Contratación de Servicios"), "services");
check("国内", cfeParticipationScope("CFE-0115-CACON-0057-2026"), "national");
check("国际（自贸协定）", cfeParticipationScope("CFE-0001-CAAAT-0163-2026"), "international_treaty");
check("简化招标也识别", isCfeCall({ tenderNumber: "CFE-0025-CSCON-0003-2026" }), true);
check("下属单位名识别为 CFE", CFE_BUYER_PATTERN.test("CFE DISTRIBUCION GOLFO NORTE"), true);
check("名字中间带 CFE 的不算", CFE_BUYER_PATTERN.test("PROVEEDORES DE CFE Y PEMEX"), false);

console.log("\n解析");
const [procedure, ...rest] = parseCfeMicrositioPaste(text);
check("一条", rest.length, 0);
check("编号", procedure.number, "CFE-0115-CACON-0057-2026");
check("描述换行也读到", procedure.general["descripcion detallada"]?.startsWith("CONSTRUCCIÓN DE OBRA"), true);
check("文件 11 个", procedure.files.length, 11);
check("答疑会", procedure.clarifications, ["2026-10-06T15:00:00.000Z"]);
check("交标截止", procedure.submissionEnd, "2026-10-12T14:30:00.000Z");
check("技术标开标", procedure.technicalOpening, "2026-10-12T15:00:00.000Z");
check("商务标开标", procedure.economicOpening, "2026-10-13T15:00:00.000Z");
check("两条一起贴", parseCfeMicrositioPaste(`${text}\n${text.replace("CFE-0115-CACON-0057-2026", "CFE-0025-CSCON-0003-2026")}`).map((p) => p.number), [
  "CFE-0115-CACON-0057-2026",
  "CFE-0025-CSCON-0003-2026",
]);

console.log("\n映射");
const tender = mapCfeMicrositioProcedure(procedure, NOW);
check("slug", tender.slug, "cfe-0115-cacon-0057-2026");
check("采购单位", tender.buyer, "Comisión Federal de Electricidad — CFE Distribución, Distribución Golfo Norte");
check("州", tender.location, "Ciudad de México");
check("类型", [tender.scopeType, tender.procedureType, tender.participationScope], ["works", "Concurso abierto", "national"]);
check("发布时间是真的", [tender.publicationDate, tender.publicationDateIsEstimated], ["2026-10-05T23:54:00.000Z", undefined]);
check("状态", tender.status, "open");
check("关键日期", tender.keyDates.map((d) => d.type), ["publication", "clarification", "submission", "opening", "opening"]);
check("走 CFE 规则：国内工程 · 配电网建设 → 常规", tender.relevance.tier, "standard");
check("行业", tender.industries.includes("power"), true);
check("没有金额", tender.estimatedValue, undefined);
// 常规、没有金额、发布到交标 7 天: the DOF or any automated source would skip
// it; a paste is written anyway (user, 2026-10-06: 手动粘贴的项目不受 12 天限制).
check("发布到交标只有 7 天：自动导入会跳过", hasShortBidWindow(tender), true);
check("截止后", mapCfeMicrositioProcedure(procedure, new Date("2026-10-13T00:00:00Z")).status, "submission_closed");

const opgw = mapCfeMicrositioProcedure(
  {
    ...procedure,
    number: "CFE-0025-CSCON-0003-2026",
    general: {
      ...procedure.general,
      "descripcion del bien": "Tendido de cable de guarda con 48 Fibras Ópticas Tipo OPGW para las L.T.S. MSP-93010-JUD, ubicadas en la Zona de Transmisión Istmo",
      "descripcion detallada": undefined,
      "tipo de procedimiento": "Concurso simplificado",
    },
  },
  NOW,
);
check("OPGW 线路工程 → 常规", opgw.relevance.tier, "standard");
const maintenance = mapCfeMicrositioProcedure(
  { ...procedure, general: { ...procedure.general, "descripcion del bien": "SERVICIO DE MANTENIMIENTO A EDIFICIOS", "descripcion detallada": undefined } },
  NOW,
);
check("国内小工程/维护 → 排除", maintenance.relevance.tier, "excluded");

async function pasteChecks() {
  console.log("\n粘贴导入（不连数据库，只预览）");
  const preview = await importCfePaste(null, text, { write: false, now: NOW });
  check("7 天窗口照样写入，并注明", [preview.rows[0].outcome, preview.rows[0].outcomeZh.startsWith("会写入")], ["short_window", true]);
  const expired = await importCfePaste(null, text.replace(/12\/10\/2026 08:30 hrs/, "01/10/2026 08:30 hrs").replace("12/10/2026 09:00 hrs", "01/10/2026 09:00 hrs"), { write: false, now: NOW });
  check("截止日已过仍不写入", expired.rows[0].outcome, "closed");
  const routine = await importCfePaste(null, text.replace(/CONSTRUCCIÓN DE OBRA POR TERCEROS[^\t\n]*/g, "SERVICIO DE MANTENIMIENTO A EDIFICIOS"), { write: false, now: NOW });
  check("按 CFE 规则排除的仍不写入", routine.rows[0].outcome, "excluded");

  console.log(failures ? `\n${failures} 项失败` : "\n全部通过");
  if (failures) process.exit(1);
}

void pasteChecks();
