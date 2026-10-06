/**
 * An Ecuador procedure page pasted from SOCE (lib/ingestion/ecuador-soce-paste.ts),
 * against the page text the user pasted on 2026-10-06
 * (lib/ingestion/__fixtures__/ecuador-soce-2026-10-06.txt; the official's
 * e-mail in it replaced with a placeholder).
 *
 * Usage: npm run test:ecuador-paste
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ecuadorAmount, ecuadorGovernmentLevel, ecuadorStatus, ecuadorTime, mapSoceToTender, parseSoceProcedures } from "@/lib/ingestion/ecuador-soce-paste";
import { importEcuadorPaste } from "@/lib/ingestion/import-ecuador-paste";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const text = readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/ecuador-soce-2026-10-06.txt"), "utf8");
const NOW = new Date("2026-10-06T15:00:00Z");

/** A standard-tier works tender (US$1M–5M), written like the real page, value on the next line for one label. */
const WORKS_PAGE = [
  "Descripción del Proceso de Contratación",
  "Entidad:\tGOBIERNO AUTONOMO DESCENTRALIZADO MUNICIPAL DEL CANTON EJEMPLO",
  "Objeto de Proceso:\tCONSTRUCCIÓN DEL HOSPITAL BÁSICO Y CENTRO DE SALUD TIPO C",
  "Código:\tLICO-GADMCE-2026-001",
  "Tipo Compra:\tObra",
  "Presupuesto Referencial Total (Sin Iva):",
  "USD 1,450,000.00",
  "Tipo de Contratación:\tLicitación de Obras -",
  "Funcionario encargado del proceso:\tnombre.apellido@ejemplo.gob.ec",
  "Estado del Proceso:\tPreguntas, Respuestas y Aclaraciones",
  "",
  "Fechas de Control del Proceso",
  "LICO-GADMCE-2026-001",
  "Fecha de Publicación\t2026-10-01 10:00:00\tIndicar la fecha real.",
  "Fecha Límite entrega Ofertas\t2026-10-09 10:00:00\tFecha máxima de entrega Ofertas.",
].join("\n");

/** The user's second paste (2026-10-06): a works licitación whose deadline is 「Fecha Límite de Propuestas」, columns copied as spaces. */
const EPUNEMI_PAGE = [
  "Descripción del Proceso de Contratación",
  "Entidad:\tEMPRESA DE PRODUCCION Y DESARROLLO ESTRATEGICO DE LA UNIVERSIDAD ESTATAL DE MILAGRO",
  "Objeto de Proceso:\tREPOTENCIACIÓN INTEGRAL DE LA INFRAESTRUCTURA DEPORTIVA Y CULTURAL DE LOS SECTORES DEL POLIDEPORTIVO Y DEL PASEO CULTURAL DE LA UNIVERSIDAD ESTATAL DE MILAGRO",
  "Código:\tLICO-EPUNEMI-2026-007",
  "Tipo Compra:\tObra",
  "Presupuesto Referencial Total (Sin Iva):\tUSD 3,222,455.94",
  "Estado del Proceso:\tPreguntas, Respuestas y Aclaraciones",
  "Fechas de Control del Proceso",
  "LICO-EPUNEMI-2026-007",
  "Fecha de Publicación    2026-10-02 18:30:00 Indicar la fecha real en la cual desea publicar el Proceso.",
  "Fecha Límite de Preguntas   2026-10-14 09:00:00 Fecha máxima para solicitar aclaraciones respecto al Proceso de",
  "Contratación.",
  "Fecha Límite de Respuestas  2026-10-19 10:00:00 Fecha máxima para solventar cualquier inquietud relacionada al Proceso",
  "Fecha Límite de Propuestas  2026-11-04 10:00:00 Fecha máxima para la entrega de propuestas.",
  "Fecha Apertura de Ofertas   2026-11-04 11:00:00 Fecha para la apertura de los sobres de las ofertas.",
  "Fecha Estimada de Adjudicación  2026-11-09 16:00:00 Fecha estimada para la Adjudicación de la compra.",
].join("\n");
const LINK = "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=T_ERtPw7b2R2f99hR-IiHBgO-BpIiEajoU-4m06mf3k";
const LINK_2 = "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=EJEMPLO2";

async function main() {
  console.log("ecuador paste\n\n时间（厄瓜多尔 UTC-5）和金额");
  check("晚上 8 点", ecuadorTime("2026-10-05 20:00:00"), "2026-10-06T01:00:00.000Z");
  check("没有秒", ecuadorTime("2026-10-22 09:00"), "2026-10-22T14:00:00.000Z");
  check("USD", ecuadorAmount("USD 363,482.92"), 363482.92);
  check("$", ecuadorAmount("$35,000.00"), 35000);

  console.log("\n状态和采购单位层级");
  check("答疑阶段 = 在招", ecuadorStatus("Preguntas, Respuestas y Aclaraciones", undefined, NOW), "open");
  check("资格审查 = 已截标", ecuadorStatus("Calificación de Participantes", undefined, NOW), "submission_closed");
  check("已授标", ecuadorStatus("Adjudicada - Registro de Contratos", undefined, NOW), "awarded");
  check("流标", ecuadorStatus("Desierta", undefined, NOW), "deserted");
  check("市政 GAD", ecuadorGovernmentLevel("GOBIERNO AUTÓNOMO DESCENTRALIZADO MUNICIPAL DEL CANTON SHUSHUFINDI"), "municipal");
  check("省 GAD", ecuadorGovernmentLevel("GOBIERNO AUTONOMO DESCENTRALIZADO PROVINCIAL DE PICHINCHA"), "state");
  check("国有企业", ecuadorGovernmentLevel("EMPRESA PUBLICA MUNICIPAL REGISTRO DE LA PROPIEDAD DE GUAYAQUIL"), "public_company");
  check("中央机构", ecuadorGovernmentLevel("HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN"), "federal");

  console.log("\n用户贴的 SIE-HCAM-2026-228");
  const procedures = parseSoceProcedures(text);
  check("一个项目", procedures.map((p) => p.code), ["SIE-HCAM-2026-228"]);
  check("同一页贴两次只算一个", parseSoceProcedures(`${text}\n${text}`).length, 1);
  check("不保留经办人邮箱", JSON.stringify(procedures).includes("@"), false);
  const tender = mapSoceToTender(procedures[0], NOW);
  check("不保留经办人邮箱（入库内容）", JSON.stringify(tender).includes("@"), false);
  check("货物", tender.scopeType, "equipment");
  check("采购方式", tender.procedureType, "Subasta Inversa Electrónica");
  check("预算", [tender.estimatedValue, tender.currency], [363482.92, "USD"]);
  check("发布", tender.publicationDate, "2026-10-06T01:00:00.000Z");
  check("交标截止", tender.submissionDeadline, "2026-10-22T14:00:00.000Z");
  check("关键日期", tender.keyDates.map((k) => k.type), ["publication", "questions_deadline", "clarification", "submission", "opening", "award"]);
  check("在招", tender.status, "open");
  check("电子反拍 + 不足 100 万美元：排除", tender.relevance.tier, "excluded");

  console.log("\n导入结果");
  const dry = await importEcuadorPaste(null, `${text}\n${WORKS_PAGE}`, { write: false, now: NOW });
  check("两个项目", dry.rows.map((row) => row.code), ["SIE-HCAM-2026-228", "LICO-GADMCE-2026-001"]);
  check("小额反拍不写入", dry.rows[0].outcome, "excluded");
  const works = dry.rows[1];
  check("下一行的金额也读到", works.budget, 1450000);
  check("常规（100–500 万美元）", works.tier, "standard");
  check("工程", works.scopeType, "works");
  check("在招、常规、发布到截标 8 天：写入（12 天规则只管没写金额的项目）", works.outcome, "write");
  check("不保留经办人邮箱（结果）", JSON.stringify(dry).includes("@"), false);
  const late = await importEcuadorPaste(null, WORKS_PAGE, { write: false, now: new Date("2026-10-12T15:00:00Z") });
  check("截止日已过不写入", late.rows[0].outcome, "closed");
  await importEcuadorPaste(null, "随便一段文字", { write: false, now: NOW }).then(
    () => check("没有项目时报错", "没有报错", "报错"),
    () => check("没有项目时报错", "报错", "报错"),
  );

  console.log("\n「Fecha Límite de Propuestas」、空格分隔");
  const epunemi = mapSoceToTender(parseSoceProcedures(EPUNEMI_PAGE)[0], NOW);
  check("交标截止（Propuestas）", epunemi.submissionDeadline, "2026-11-04T15:00:00.000Z");
  check("发布", epunemi.publicationDate, "2026-10-02T23:30:00.000Z");
  check("开标", epunemi.keyDates.find((k) => k.type === "opening")?.date, "2026-11-04T16:00:00.000Z");
  check("体育设施工程不足 600 万美元：按现有规则排除", epunemi.relevance.tier, "excluded");

  console.log("\n手动保留（规则不变）");
  const kept = await importEcuadorPaste(null, EPUNEMI_PAGE, { write: false, now: NOW, keep: { "LICO-EPUNEMI-2026-007": "standard" } });
  check("选了档位：手动保留、会写入", [kept.rows[0].outcome, kept.rows[0].tier, kept.rows[0].ruleTier], ["manual_keep", "standard", "excluded"]);
  check("原因写成手动设置", kept.rows[0].reasonZh, "管理员在后台手动设置");
  const notKept = await importEcuadorPaste(null, EPUNEMI_PAGE, { write: false, now: NOW });
  check("没选：照规则排除", notKept.rows[0].outcome, "excluded");
  const closedKeep = await importEcuadorPaste(null, EPUNEMI_PAGE, { write: false, now: new Date("2026-11-05T15:00:00Z"), keep: { "LICO-EPUNEMI-2026-007": "flagship" } });
  check("截止日已过：选了也不写入", closedKeep.rows[0].outcome, "closed");
  const badTier = await importEcuadorPaste(null, EPUNEMI_PAGE, { write: false, now: NOW, keep: { "LICO-EPUNEMI-2026-007": "excluded" as never } });
  check("不认识的档位：不算保留", badTier.rows[0].outcome, "excluded");

  console.log("\n官方链接");
  check("链接在上方", parseSoceProcedures(`${LINK},\n${EPUNEMI_PAGE}`)[0].url, LINK);
  check("链接在下方", parseSoceProcedures(`${EPUNEMI_PAGE}\n${LINK}`)[0].url, LINK);
  const before = parseSoceProcedures(`${LINK}\n${text}\n${LINK_2}\n${EPUNEMI_PAGE}`);
  check("两个项目，链接都在上方", before.map((p) => [p.code, p.url]), [["SIE-HCAM-2026-228", LINK], ["LICO-EPUNEMI-2026-007", LINK_2]]);
  const after = parseSoceProcedures(`${text}\n${LINK}\n${EPUNEMI_PAGE}\n${LINK_2}`);
  check("两个项目，链接都在下方", after.map((p) => [p.code, p.url]), [["SIE-HCAM-2026-228", LINK], ["LICO-EPUNEMI-2026-007", LINK_2]]);
  check("没贴链接", parseSoceProcedures(text)[0].url, undefined);
  check("链接成为来源链接", mapSoceToTender(parseSoceProcedures(`${LINK}\n${EPUNEMI_PAGE}`)[0], NOW).sourceUrl, LINK);
  check("链接不当成字段", Object.keys(parseSoceProcedures(`${LINK}\n${EPUNEMI_PAGE}`)[0].fields).some((k) => k.startsWith("http")), false);
  const linked = await importEcuadorPaste(null, `${LINK}\n${WORKS_PAGE}`, { write: false, now: NOW });
  check("结果里显示官方链接", linked.rows[0].officialUrl, LINK);
  await importEcuadorPaste(null, LINK, { write: false, now: NOW }).then(
    () => check("只贴链接时说明要贴内容", "没有报错", "报错"),
    (error: Error) => check("只贴链接时说明要贴内容", error.message.startsWith("只贴了链接"), true),
  );

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  if (failures > 0) process.exit(1);
}

main();
