/**
 * Offline checks for the 乌拉圭 tab's 「ARCE 列表粘贴导入」 (user, 2026-10-15),
 * against the 「Llamados vigentes」 list the owner copied from ARCE that day
 * (lib/ingestion/__fixtures__/uruguay/llamados-vigentes-2026-10-15.txt).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arceListCallToRelease, attachArcePurchaseIds, isArceSaleOrLease, parseArceList } from "@/lib/ingestion/uruguay-arce-paste";
import { importUruguayPaste } from "@/lib/ingestion/import-uruguay-paste";
import { arceCallUrl, extractArceLinks } from "@/lib/ingestion/uruguay-paste-result";
import { isIngestedArceTender } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { mapArceReleaseToTender, uruguayGovernmentLevel } from "@/lib/ingestion/uruguay-mapper";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const NOW = new Date("2026-10-15T18:00:00Z");
const text = readFileSync(join(process.cwd(), "lib/ingestion/__fixtures__/uruguay/llamados-vigentes-2026-10-15.txt"), "utf8");
const calls = parseArceList(text);
const find = (number: string, buyer = "") => calls.find((call) => call.procedureNumber === number && call.buyer.includes(buyer))!;

console.log("列表解析");
check("35 个项目（每个「Ver detalles」一个）", calls.length, 35);
check("编号", calls[0].procedureNumber, "Licitación Pública 1/2025");
check("采购方式", calls[0].procedure, "Licitación Pública");
check("采购单位", calls[0].buyer, "Ministerio de Economía y Finanzas | Dirección Nacional de Aduanas");
check("描述", calls[0].description.startsWith("PERMISOS DE EXPLOTACION DE UN DEPÓSITO FISCAL"), true);
check("交标（蒙得维的亚时间）", calls[0].deadline, "2026-10-29T10:00:00");
check("发布", calls[0].published, "2025-12-11T11:15:00");
check("没有「Última Modificación」也能读发布时间", find("Licitación Abreviada 36/2026").published, "2026-09-04T17:55:00");
check("同号不同单位分开", calls.filter((call) => call.procedureNumber === "Licitación Pública 8/2026").map((call) => call.buyer.split(" |")[0]), ["Intendencia de Rocha", "Intendencia de Florida"]);
check("描述去掉引号", find("Licitación Pública 18/2026").description.startsWith("MANTENIMIENTO POR NIVELES"), true);
check("PFI 国际招标的采购方式", find("PFI - Licitación pública internacional 27250/2026").procedure, "PFI - Licitación pública internacional");
check("纯文本里没有 ID", calls.every((call) => call.purchaseId === undefined), true);

console.log("链接里的 ID");
const html = `<div class="row"><a href="/consultas/detalle/mostrar-llamado/1/id/1302292" title="Ver detalles de la compra Licitación Pública 2/2025 | Ministerio de Econom&iacute;a y Finanzas | Direcci&oacute;n Nacional de Aduanas"><span class="sr-only">Ver detalles de la compra Licitaci&oacute;n P&uacute;blica 2/2025 | Ministerio de Econom&iacute;a y Finanzas | Direcci&oacute;n Nacional de Aduanas</span></a>
<a href="https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1365001">Ver detalles de la compra PFI - Licitación pública internacional 27250/2026 | Administración de las Obras Sanitarias del Estado | Administración de las Obras Sanitarias del Estado</a>
<a href="/consultas/">Consulta de Publicaciones</a></div>`;
const links = extractArceLinks(html);
check("只取详情链接", links.map((link) => link.purchaseId), ["1302292", "1365001"]);
const withIds = attachArcePurchaseIds(calls, links);
check("按链接文字配上 ID", find("Licitación Pública 2/2025").purchaseId, undefined);
check("配上 2/2025", withIds.find((call) => call.procedureNumber === "Licitación Pública 2/2025")?.purchaseId, "1302292");
check("配上 Casupá 水坝", withIds.find((call) => call.procedureNumber.endsWith("27250/2026"))?.purchaseId, "1365001");
check("没链接的仍然没有 ID", withIds.find((call) => call.procedureNumber === "Licitación Pública 1/2025")?.purchaseId, undefined);
const byPosition = attachArcePurchaseIds(calls.slice(0, 2), [
  { label: "", purchaseId: "11" },
  { label: "", purchaseId: "12" },
]);
check("链接没有文字、数量一致时按顺序", byPosition.map((call) => call.purchaseId), ["11", "12"]);
check("数量不一致时不按顺序猜", attachArcePurchaseIds(calls.slice(0, 3), [{ label: "", purchaseId: "11" }]).map((call) => call.purchaseId ?? null), [null, null, null]);
check("文字里贴了详情网址也认", parseArceList(`Licitación Pública 5/2026  UTE\nUTE\nObra\nhttps://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/777\nVer detalles de la compra Licitación Pública 5/2026 | UTE`)[0].purchaseId, "777");
check("原文链接", arceCallUrl("1302292"), "https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1302292");

console.log("读取范围（和每日自动导入相同）");
const reads = (number: string, buyer = "") => isIngestedArceTender(arceListCallToRelease(find(number, buyer)));
check("公开招标 → 读", reads("Licitación Pública 76/2026"), true);
check("PFI 国际招标 → 读", reads("PFI - Licitación pública internacional 27250/2026"), true);
check("UTE 简易招标 → 读（按单位全称）", reads("Licitación Abreviada 104056/2026"), true);
check("ANCAP 简易招标 → 读", reads("Licitación Abreviada 152095/2026"), true);
check("OSE 简易招标 → 读", reads("Licitación Abreviada 27180/2026"), true);
check("交通部简易招标 → 读", reads("Licitación Abreviada 45/2026"), true);
check("ASSE 简易招标 → 不读", reads("Licitación Abreviada 6/2026"), false);
check("蒙得维的亚市政府简易招标 → 不读", reads("Licitación Abreviada A195270/2026"), false);
check("比价采购 → 不读", reads("Concurso de Precios 83/2026"), false);
check("资产出售/出租 → 不是采购", isArceSaleOrLease(find("Venta/Arrendamiento Licitación Pública 2191/2026")), true);
check("UTE 是国企", uruguayGovernmentLevel(undefined, "Administración Nacional de Usinas y Trasmisiones Eléctricas | Administración Nacional de Usinas y Trasmisiones Eléctricas"), "public_company");
check("省政府是地方", uruguayGovernmentLevel(undefined, "Intendencia de Rocha | Intendencia de Rocha"), "municipal");
check("部委是中央", uruguayGovernmentLevel(undefined, "Ministerio del Interior | Secretaría del Ministerio del Interior"), "federal");

console.log("映射");
const dam = mapArceReleaseToTender(arceListCallToRelease({ ...find("PFI - Licitación pública internacional 27250/2026"), purchaseId: "1365001" }), NOW);
check("slug 和每日导入一致", dam.slug, "uruguay-1365001");
check("编号", dam.tenderNumber, "PFI - Licitación pública internacional 27250/2026 (ID 1365001)");
check("标题是描述", dam.title.es, "CONSTRUCCION DE UNA PRESA SOBRE EL ARROYO CASUPA Y OBRAS ANEXAS");
check("交标转成 UTC", dam.submissionDeadline, "2026-11-23T17:00:00.000Z");
check("仍在投标", dam.status, "open");
check("原文链接", dam.sourceUrl, "https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1365001");

async function importChecks() {
  console.log("导入（预览）");
  const allLinks = calls.map((call, index) => ({ label: "", purchaseId: String(1300000 + index) }));
  const preview = await importUruguayPaste(null, text, { write: false, links: allLinks, now: NOW });
  check("读取范围 24 个", preview.rows.length, 24);
  check("资产出售/出租 4 个", preview.notProcurement, 4);
  check("不读的按方式统计", preview.notRead, [
    { procedure: "Licitación Abreviada", count: 5 },
    { procedure: "Concurso de Precios", count: 2 },
  ]);
  const outcome = (number: string, buyer = "") => preview.rows.find((row) => row.procedureNumber === number && row.buyer.includes(buyer))?.outcome;
  check("Casupá 水坝 → 写入", outcome("PFI - Licitación pública internacional 27250/2026"), "write");
  check("医院清洁 → 按规则排除", outcome("Licitación Pública 10004/2026"), "excluded");
  check("预览带原文链接", preview.rows.find((row) => row.purchaseId)?.url?.startsWith("https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/"), true);

  const later = await importUruguayPaste(null, text, { write: false, links: allLinks, now: new Date("2026-10-24T12:00:00Z") });
  check("交标已过（10月23日截标）→ 不写入", later.rows.find((row) => row.procedureNumber === "Licitación Pública 103682/2026")?.outcome, "closed");

  const noIds = await importUruguayPaste(null, text, { write: false, now: NOW });
  check("没 ID → 全部不写入", noIds.rows.every((row) => row.outcome === "no_id"), true);

  const kept = await importUruguayPaste(null, text, { write: false, links: allLinks, now: NOW, keep: { [String(1300000 + 2)]: "standard" } });
  check("手动保留 → 写入", kept.rows.find((row) => row.purchaseId === String(1300000 + 2))?.outcome, "manual_keep");

  const doubled = await importUruguayPaste(null, `${text}\n${text}`, { write: false, links: [...allLinks, ...allLinks], now: NOW });
  check("同一页贴两次 → 不重复", doubled.rows.length, 24);

  const empty = await importUruguayPaste(null, "hola", { write: false, now: NOW }).catch((error) => error);
  check("贴错内容 → 提示", empty instanceof PasteInputError, true);
}

void importChecks().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
