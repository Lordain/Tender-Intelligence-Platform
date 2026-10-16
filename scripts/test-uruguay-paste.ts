/**
 * Offline checks for the 乌拉圭 tab's 「ARCE 列表粘贴导入」 (user, 2026-10-15),
 * against the 「Llamados vigentes」 list the owner copied from ARCE that day
 * (lib/ingestion/__fixtures__/uruguay/llamados-vigentes-2026-10-15.txt).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arceDetailToRelease, arceListCallToRelease, attachArcePurchaseIds, isArceSaleOrLease, parseArceDetailPages, parseArceList } from "@/lib/ingestion/uruguay-arce-paste";
import { importUruguayDetails, importUruguayPaste, screenUruguayList } from "@/lib/ingestion/import-uruguay-paste";
import { arceCallUrl, arceIdFromInput, extractArceDocuments, extractArceLinks, knownArceId, readMarkdownLinks, screenedLabel } from "@/lib/ingestion/uruguay-paste-result";
import { isIngestedArceTender } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { mapArceReleaseToTender, uruguayGovernmentLevel } from "@/lib/ingestion/uruguay-mapper";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { readManualTasks } from "@/lib/ops/manual-tasks";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  check("没 ID → 一条也不写入", noIds.rows.some((row) => ["write", "short_window", "manual_keep"].includes(row.outcome)), false);
  check("没 ID 但值得的 → 标出来（初筛照样能判断）", noIds.rows.find((row) => row.procedureNumber.endsWith("27250/2026"))?.outcome, "no_id");

  const kept = await importUruguayPaste(null, text, { write: false, links: allLinks, now: NOW, keep: { [String(1300000 + 2)]: "standard" } });
  check("手动保留 → 写入", kept.rows.find((row) => row.purchaseId === String(1300000 + 2))?.outcome, "manual_keep");

  const doubled = await importUruguayPaste(null, `${text}\n${text}`, { write: false, links: [...allLinks, ...allLinks], now: NOW });
  check("同一页贴两次 → 不重复", doubled.rows.length, 24);

  const empty = await importUruguayPaste(null, "hola", { write: false, now: NOW }).catch((error) => error);
  check("贴错内容 → 提示", empty instanceof PasteInputError, true);
}

async function twoStepChecks() {
  console.log("第一步：列表初筛（只判断，不写入）");
  // The owner's own paste of the list on 2026-10-15 came through with its links as Markdown.
  const markdown = `Se encontraron 760 resultados.
[Licitación Pública 1/2025  Ministerio de Economía y Finanzas | Dirección Nacional de Aduanas](https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1302291)
Ministerio de Economía y Finanzas | Dirección Nacional de Aduanas
PERMISOS DE EXPLOTACION DE UN DEPÓSITO FISCAL ÚNICO POR CIUDAD EN RIVERA, CHUY Y RIO BRANCO DEL DEPARTAMENTO DE RIVERA, ROCHA Y CERRO LARGO.
 Recepción de ofertas hasta: 29/10/2026 10:00hs
Publicado: 11/12/2025 11:15hs | Última Modificación: 23/09/2026 10:57hs
[Ver detalles de la compra Licitación Pública 1/2025 | Ministerio de Economía y Finanzas | Dirección Nacional de Aduanas](https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1302291)
[PFI - Licitación pública internacional 27250/2026  Administración de las Obras Sanitarias del Estado | Administración de las Obras Sanitarias del Estado](https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1352194)
Administración de las Obras Sanitarias del Estado | Administración de las Obras Sanitarias del Estado
CONSTRUCCION DE UNA PRESA SOBRE EL ARROYO CASUPA Y OBRAS ANEXAS
 Recepción de ofertas hasta: 23/11/2026 14:00hs
Publicado: 29/06/2026 15:10hs | Última Modificación: 15/10/2026 12:18hs
[Ver detalles de la compra PFI - Licitación pública internacional 27250/2026 | Administración de las Obras Sanitarias del Estado | Administración de las Obras Sanitarias del Estado](https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1352194)`;
  check("Markdown 链接 → 读出 ID", readMarkdownLinks(markdown).links.map((link) => link.purchaseId), ["1302291", "1302291", "1352194", "1352194"]);
  const screened = await screenUruguayList(null, markdown, [], NOW);
  check("Markdown 格式的列表也能初筛", screened.rows.map((row) => [row.procedureNumber, row.purchaseId]), [
    ["Licitación Pública 1/2025", "1302291"],
    ["PFI - Licitación pública internacional 27250/2026", "1352194"],
  ]);
  check("Casupá 水坝值得打开", screened.rows[1].outcome, "write");
  check("初筛给出详情页链接", screened.rows[1].url, "https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1352194");

  console.log("第二步：详情页");
  const dam = readFileSync(join(process.cwd(), "lib/ingestion/__fixtures__/uruguay/detalle-27250-2026-ose.txt"), "utf8");
  const customs = readFileSync(join(process.cwd(), "lib/ingestion/__fixtures__/uruguay/detalle-2-2025-aduanas.txt"), "utf8");
  const [page] = parseArceDetailPages(dam);
  check("编号", page.procedureNumber, "PFI - Licitación pública internacional 27250/2026");
  check("采购单位", page.buyer, "Administración de las Obras Sanitarias del Estado | Administración de las Obras Sanitarias del Estado");
  check("描述", page.description, "CONSTRUCCION DE UNA PRESA SOBRE EL ARROYO CASUPA Y OBRAS ANEXAS");
  check("交标", page.deadline, "2026-11-23T14:00:00");
  check("发布", page.published, "2026-06-29T15:10:00");
  check("开标", page.opening, "2026-11-23T14:00:00");
  check("提问截止（只有日期）", page.questionsUntil, "2026-10-23T23:59:00");
  check("物品清单", page.items, [{ description: "CONSTRUCCION DE REPRESA PARA ABASTECIMIENTO DE AGUA POTABLE", code: "122722", quantity: 1, unit: "UNIDAD" }]);
  check("两页连贴 → 2 个", parseArceDetailPages(`${customs}\n${dam}`).map((p) => p.procedureNumber), ["Licitación Pública 2/2025", "PFI - Licitación pública internacional 27250/2026"]);
  check("海关页的数量 180", parseArceDetailPages(customs)[0].items[0].quantity, 180);

  const detailHtml = `<nav><a href="/consultas/detalle/mostrar-llamado/1/id/1352194">PFI - Licitación pública internacional 27250/2026</a></nav>
<a href="/Pliegos/pliego_27250.pdf">Archivo adjunto archivo adjunto/pliego (.pdf 2 Mb)</a>
<a href="https://www.comprasestatales.gub.uy/Aclaraciones/aclar_llamado_27250_26.doc">Archivo adjunto de la aclaración Nº 45 (.doc 258 Kb)</a>
<a href="mailto:licitacionesobras@ose.com.uy">licitacionesobras@ose.com.uy</a>
<a href="https://www.gub.uy/agencia-reguladora-compras-estatales/institucional/contacto">Contacto</a>`;
  const docs = extractArceDocuments(detailHtml);
  check("只取标书和澄清文件，邮箱和菜单不取", docs.map((doc) => doc.url), [
    "https://www.comprasestatales.gub.uy/Pliegos/pliego_27250.pdf",
    "https://www.comprasestatales.gub.uy/Aclaraciones/aclar_llamado_27250_26.doc",
  ]);
  const release = arceDetailToRelease({ ...page, purchaseId: "1352194" }, docs);
  check("标书文件类型", release.tender?.documents?.map((doc) => doc.documentType), ["biddingDocuments", "clarifications"]);

  const preview = await importUruguayDetails(null, [{ text: dam, links: extractArceLinks(detailHtml), documents: docs }], { write: false, now: NOW });
  const row = preview.rows[0];
  check("ID 来自页面链接", row.purchaseId, "1352194");
  check("会写入", row.outcome, "write");
  check("物品 1 项、文件 2 个", [row.items, row.documents], [1, 2]);
  check("关键日期：发布、交标、开标、提问截止", row.keyDates, 4);
  const noLink = await importUruguayDetails(null, [{ text: dam, links: [], documents: [] }], { write: false, now: NOW });
  check("没链接 → 不写入", noLink.rows[0].outcome, "no_id");
  const twoPastes = await importUruguayDetails(
    null,
    [
      { text: customs, links: [{ label: "", purchaseId: "1302292" }], documents: [] },
      { text: dam, links: [{ label: "", purchaseId: "1352194" }], documents: [] },
    ],
    { write: false, now: NOW },
  );
  check("两次粘贴各自配 ID", twoPastes.rows.map((r) => r.purchaseId), ["1302292", "1352194"]);
  check("海关仓储许可 → 按规则排除", twoPastes.rows[0].outcome, "excluded");
  const wrong = await importUruguayDetails(null, [{ text: "hola", links: [], documents: [] }], { write: false, now: NOW }).catch((error) => error);
  check("贴错内容 → 提示", wrong instanceof PasteInputError, true);
}

async function noSelfLinkChecks() {
  // UTE's Licitación Abreviada 103864/2026, pasted 2026-10-16 as Markdown: the
  // page links only its pliego and the footer, never itself, so the id has to
  // come from the list screening or from the page's address pasted with it.
  console.log("详情页本身不带项目链接（UTE 103864/2026）");
  const text = readFileSync(join(process.cwd(), "lib/ingestion/__fixtures__/uruguay/detalle-103864-2026-ute-sin-enlace.txt"), "utf8");
  const header = parseArceDetailPages(readMarkdownLinks(text).text)[0];
  check("Markdown 的编号导航「3.」不当成标题", header.procedureNumber, "Licitación Abreviada 103864/2026");
  check("「* Acto de Apertura:」后一行的时间读到", header.opening, "2026-11-05T13:00:00");
  check("「* Cantidad:」后一行的数量读到", header.items.map((item) => item.quantity), [3, 1, 2, 2]);
  const alone = await importUruguayDetails(null, [{ text, links: [], documents: [] }], { write: false, now: NOW });
  check("什么都不给 → 没有 ID，不写入", alone.rows[0].outcome, "no_id");
  const known = [
    { label: screenedLabel("Licitación Abreviada 103864/2026", "Administración Nacional de Usinas y Trasmisiones Eléctricas | Administración Nacional de Usinas y Trasmisiones Eléctricas"), purchaseId: "1380261" },
    { label: screenedLabel("Licitación Abreviada 103865/2026", "Administración Nacional de Usinas y Trasmisiones Eléctricas"), purchaseId: "1380999" },
  ];
  const screened = await importUruguayDetails(null, [{ text, links: [], documents: [] }], { write: false, now: NOW, known });
  check("第一步初筛读到的 ID 接过来 → 写入", [screened.rows[0].purchaseId, screened.rows[0].outcome], ["1380261", "write"]);
  const address = await importUruguayDetails(
    null,
    [{ text: `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1380261\n${text}`, links: [], documents: [] }],
    { write: false, now: NOW },
  );
  check("网址和页面一起贴 → 从网址读 ID → 写入", [address.rows[0].purchaseId, address.rows[0].outcome], ["1380261", "write"]);
  // The address and the page as two pastes, as the owner did (2026-10-16: 已贴 2 页).
  const url = "https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1380261";
  const before = await importUruguayDetails(null, [{ text: url, links: [], documents: [] }, { text, links: [], documents: [] }], { write: false, now: NOW });
  check("网址单独先贴、再贴页面 → 读到 ID → 写入", [before.rows.length, before.rows[0].purchaseId, before.rows[0].outcome], [1, "1380261", "write"]);
  const after = await importUruguayDetails(null, [{ text, links: [], documents: [] }, { text: `${url}\n`, links: [], documents: [] }], { write: false, now: NOW });
  check("先贴页面、网址单独后贴 → 也读到", after.rows[0].purchaseId, "1380261");
  const other = readFileSync(join(process.cwd(), "lib/ingestion/__fixtures__/uruguay/detalle-27250-2026-ose.txt"), "utf8");
  const twoPages = await importUruguayDetails(
    null,
    [{ text: other, links: [{ label: "", purchaseId: "1365001" }], documents: [] }, { text: url, links: [], documents: [] }, { text, links: [], documents: [] }],
    { write: false, now: NOW },
  );
  check("网址不会配给已有 ID 的页面", twoPages.rows.map((row) => row.purchaseId), ["1365001", "1380261"]);
  check("每行带上它是第几页", twoPages.rows.map((row) => row.page), [0, 1]);
  const typed = await importUruguayDetails(null, [{ text, links: [], documents: [] }], { write: false, now: NOW, ids: { 0: "1380261" } });
  check("预览后在那一行填编号 → 写入", [typed.rows[0].purchaseId, typed.rows[0].outcome, typed.rows[0].url], ["1380261", "write", url]);
  check("填编号：数字", arceIdFromInput(" 1380261 "), "1380261");
  check("填编号：整个网址", arceIdFromInput(url), "1380261");
  check("填编号：没有 https 的网址", arceIdFromInput("comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1380261"), "1380261");
  check("填编号：采购编号不算（103864/2026）", arceIdFromInput("103864/2026"), undefined);
  check("填编号：乱填不算", arceIdFromInput("abc"), undefined);
  check("同一编号两个机构 → 按机构区分", knownArceId("Licitación Pública 2/2026", "Ministerio B", [
    { label: screenedLabel("Licitación Pública 2/2026", "Ministerio A"), purchaseId: "1" },
    { label: screenedLabel("Licitación Pública 2/2026", "Ministerio B"), purchaseId: "2" },
  ]), "2");
}

async function reminderChecks() {
  console.log("每日手动任务提醒（乌拉圭只在自动导入没在正常跑时出现）");
  const heartbeat = (status: string, hoursAgo: number) =>
    ({ from: () => ({ select: () => ({ in: async () => ({ data: [{ job: "import-uruguay", status, detail: null, last_run_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString() }] }) }) }) }) as unknown as SupabaseClient;
  const shown = async (supabase: SupabaseClient) => (await readManualTasks(supabase, NOW)).some((task) => task.id === "uruguay-arce");
  check("上次成功但已超时（ARCE 拒绝后崩掉、没写状态）→ 显示", await shown(heartbeat("ok", 31)), true);
  check("暂停 → 显示", await shown(heartbeat("skipped", 2)), true);
  check("失败 → 显示", await shown(heartbeat("failed", 2)), true);
  check("正常运行 → 不显示", await shown(heartbeat("ok", 2)), false);
  const empty = { from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) } as unknown as SupabaseClient;
  check("没有记录 → 不显示", await shown(empty), false);
}

void importChecks().then(twoStepChecks).then(noSelfLinkChecks).then(reminderChecks).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
