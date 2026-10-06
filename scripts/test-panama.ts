/**
 * Panama (PanamaCompra V3), against a real procedure captured 2026-10-06
 * (lib/ingestion/__fixtures__/panamacompra-2026-10-06.json).
 *
 * Usage: npm run test:panama
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PANAMA_TENDER_TYPES, parsePanamaDetalle, type PanamaProceso } from "@/lib/ingestion/connectors/panama-panamacompra-live";
import { mapPanamaProcesoToTender, panamaAmount, panamaGovernmentLevel, panamaPublicUrl, panamaStatus, panamaTime } from "@/lib/ingestion/panama-mapper";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const fixture = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/panamacompra-2026-10-06.json"), "utf8")) as {
  proceso: PanamaProceso;
  detalle: { pageComponentes: { tipo?: string; value?: unknown }[] };
};
const NOW = new Date("2026-10-06T14:00:00Z");

console.log("panama\n\n采购方式");
check("公开招标收", PANAMA_TENDER_TYPES[7], "Licitación pública");
check("小额采购不收", PANAMA_TENDER_TYPES[9], undefined);
check("网上询价不收", PANAMA_TENDER_TYPES[2], undefined);
check("例外程序不收", PANAMA_TENDER_TYPES[3], undefined);

console.log("\n时间和金额（巴拿马 UTC-5）");
check("发布时间", panamaTime("15-09-2026 - 10:09 AM"), "2026-09-15T15:09:00.000Z");
check("交标截止（hasta）", panamaTime("28-10-2026 hasta 09:01 AM"), "2026-10-28T14:01:00.000Z");
check("下午", panamaTime("05-10-2026 - 06:03 PM"), "2026-10-05T23:03:00.000Z");
check("中午 12 点", panamaTime("05-10-2026 - 12:15 PM"), "2026-10-05T17:15:00.000Z");
check("看不懂就不写", panamaTime("por definir"), undefined);
check("参考价", panamaAmount("B/. 235,506.66"), 235506.66);
check("零元不算金额", panamaAmount("B/. 0.00"), undefined);

console.log("\n状态");
check("招标中", panamaStatus("Vigente", "2026-10-28T14:01:00.000Z", NOW), "open");
check("截止已过", panamaStatus("Vigente", "2026-10-01T14:00:00.000Z", NOW), "submission_closed");
check("待授标", panamaStatus("Por adjudicar", undefined, NOW), "submission_closed");
check("已授标", panamaStatus("Adjudicado", undefined, NOW), "awarded");
check("流标", panamaStatus("Desierto", undefined, NOW), "deserted");
check("暂停", panamaStatus("Suspendido", undefined, NOW), "suspended");
check("取消", panamaStatus("Cancelado", undefined, NOW), "cancelled");

console.log("\n采购单位层级");
check("部委", panamaGovernmentLevel("Ministerio de Cultura"), "federal");
check("地铁公司", panamaGovernmentLevel("Metro de Panamá, S.A."), "public_company");
check("市政府", panamaGovernmentLevel("Municipio de Panamá"), "municipal");

console.log("\n详情解析");
const withContact = {
  pageComponentes: [
    { tipo: "componentInfoUsuario", value: [{ nombre: "Correo electrónico", value: "persona@example.gob.pa" }, { nombre: "Nombre", value: "Persona" }] },
    ...fixture.detalle.pageComponentes,
  ],
};
const detalle = parsePanamaDetalle(withContact);
check("经办人邮箱不读", detalle.fields["Correo electrónico"], undefined);
check("经办人姓名不读", detalle.fields["Nombre"], undefined);
check("参考价字段", detalle.fields["Precio de referencia"], "B/. 235,506.66");
check("交标截止字段", detalle.fields["Fecha y hora presentación de propuestas"], "28-10-2026 hasta 09:01 AM");
check("有投标文件清单", detalle.documentosPropuesta.length > 5, true);
check("有招标文件", detalle.archivos.some((file) => file.tipoArchivo === "Pliego de Cargos"), true);

console.log("\n映射");
const tender = mapPanamaProcesoToTender(fixture.proceso, detalle, NOW);
check("slug", tender.slug, "panama-2026-0-28-01-08-lp-000040");
check("国家", tender.country, "Panama");
check("金额按美元", [tender.estimatedValue, tender.currency], [235506.66, "USD"]);
check("发布时间取详情页", tender.publicationDate, "2026-09-15T15:09:00.000Z");
check("交标截止", tender.submissionDeadline, "2026-10-28T14:01:00.000Z");
check("状态", tender.status, "open");
check("类型", tender.scopeType, "services");
check("官方入口", tender.sourceUrl, panamaPublicUrl("2026-0-28-01-08-LP-000040"));
check("摘要不含经办人", /persona@|Adriana/i.test(tender.summary.es), false);
check("没有详情也能映射", mapPanamaProcesoToTender(fixture.proceso, undefined, NOW).estimatedValue, undefined);

console.log(failures ? `\n${failures} 项失败` : "\n全部通过");
if (failures) process.exit(1);
