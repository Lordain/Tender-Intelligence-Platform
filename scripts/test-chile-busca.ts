/**
 * The Chile public-search reader, parser and mapper, against bytes really
 * served by Mercado Público on 2026-09-24.
 *
 * Every fixture here was captured by `npm run capture:chile-busca` and edited
 * by nobody. That matters more for this door than for any other source in this
 * repo, for two reasons.
 *
 * First, we are parsing someone's UI for a living now. A selector that was
 * reasoned about rather than measured is exactly the failure round 2
 * documented: `DetailsAcquisition.aspx?qs=<code>` returns 200, 121KB of real
 * HTML, with the tender code in the body — and every field empty. A check of
 * the form "did the page come back, does it mention this tender" passes it.
 *
 * Second, four of this door's responses carry a status code that does not mean
 * what it says, and all four are HTTP 200:
 *
 *   busca-generar-refused.json   200 {"estado":false} — and it still hands back a FileGuid
 *   busca-descargar-empty.bin    200 and ZERO BYTES — a download without the session cookies
 *   busca-export-empty.csv       200, header row only — the honest "past the end"
 *   busca-export-unpriced.csv    200, and MontoLicitacion is a PHRASE, not a number
 *
 * Usage: npm run test:chile-busca
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHILE_BUSCA_AMOUNT_VISIBILITY,
  CHILE_BUSCA_DATE_BUCKETS,
  CHILE_BUSCA_ESTADOS,
  CHILE_BUSCA_SCRIPT_VERSION,
  ChileBuscaError,
  ChileBuscaRefusedError,
  assertCsvBody,
  assertGenerated,
  chileBuscaPayload,
  chileBuscaPublicUrl,
} from "@/lib/ingestion/connectors/chile-busca-live";
import {
  ChileBuscaParseError,
  chileBuscaDeclaredTotals,
  decodeChileBuscaText,
  parseChileBuscaAmount,
  parseChileBuscaCsv,
  parseChileBuscaDate,
  parseChileBuscaSearchHtml,
  splitChileBuscaCards,
} from "@/lib/ingestion/chile-busca-parser";
import {
  chileBuscaProcedureType,
  chileBuscaStatus,
  mapChileBuscaRowToTender,
} from "@/lib/ingestion/chile-busca-mapper";
import { describeBuscaStaleness } from "@/lib/ingestion/ingest-chile";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`}`);
}
function truthy(name: string, actual: unknown) {
  const ok = Boolean(actual);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      实际 ${JSON.stringify(actual)}`}`);
}
function throws(name: string, fn: () => unknown, matcher: (err: unknown) => boolean) {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  const ok = caught !== undefined && matcher(caught);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      实际抛出 ${String(caught)}`}`);
}

const FIXTURES = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");
const read = (file: string) => readFileSync(path.join(FIXTURES, file), "utf-8");
const readBuffer = (file: string) => readFileSync(path.join(FIXTURES, file));

/** Fixed so a deadline assertion does not change meaning with the calendar. */
const NOW = new Date("2026-09-24T12:00:00Z");

// ── 1. The payload, and the two sentinels that do not mean "all" ──────────
console.log("请求参数（两个 -1，两种完全不同的含义）");

check(
  "payload 带齐 busqueda.js 发的全部 16 个字段，一个不少",
  Object.keys(chileBuscaPayload({ idTipoFecha: "1", esPublicoMontoEstimado: "1" })).sort(),
  [
    "compradores", "codigoRegion", "esPublicoMontoEstimado", "fechaFin", "fechaInicio", "garantias",
    "idEstado", "idOrden", "idTipoFecha", "idTipoLicitacion", "montoEstimadoTipo", "pagina",
    "proveedores", "registrosPorPagina", "rubros", "textoBusqueda",
  ].sort(),
);
check("默认按「最新发布」排序（idOrden=3），不是站点默认的「最相关」", chileBuscaPayload({ idTipoFecha: "1", esPublicoMontoEstimado: "1" }).idOrden, "3");
check("默认只问在招的（idEstado=5）", chileBuscaPayload({ idTipoFecha: "1", esPublicoMontoEstimado: "1" }).idEstado, "5");

// The measurement this door turns on. `-1` is "todos" for idEstado and is NOT
// for esPublicoMontoEstimado (it is an alias for "1", hiding 770 rows) and is
// NOT for idTipoFecha (it silently returns zero rows).
check("金额是否公开必须两边都问 —— 「-1」实测等同于「1」，会漏掉 770 条", [...CHILE_BUSCA_AMOUNT_VISIBILITY], ["1", "0"]);
check("关闭月份必须三个桶都问 —— 没有「全部」这个取值", [...CHILE_BUSCA_DATE_BUCKETS], ["1", "2", "3"]);
check("estado 码表（和站点 busqueda.filtros.js 一致，且每个码都实发过一次对过文案）", CHILE_BUSCA_ESTADOS, {
  todos: "-1", publicadas: "5", cerradas: "6", desiertas: "7", adjudicadas: "8", revocadas: "15",
});
check("记下解析器写作时的脚本版本号，它一变解析器就该被怀疑", CHILE_BUSCA_SCRIPT_VERSION, "202502171638");

// Round 2's trap, re-asserted from this side: the ficha link is `idlicitacion`,
// never a plain `qs`. The search page's own verFicha() links agree (120/120).
check(
  "公开链接用 idlicitacion，不是那个回 200 空壳页的 qs",
  chileBuscaPublicUrl("2446-256-B226"),
  "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=2446-256-B226",
);

// ── 2. The refusal that wears a success code ──────────────────────────────
console.log("\nGenerarArchivo：HTTP 200 底下的拒绝");

const generated = JSON.parse(read("busca-generar-archivo.json"));
check("正常应答 estado=true，并给出文件名", generated.nombreArchivo, "ListaLicitaciones.csv");
truthy("正常应答通过校验", (() => { assertGenerated(generated); return true; })());

const refused = JSON.parse(read("busca-generar-refused.json"));
// The load-bearing assertion: the refusal STILL carries a FileGuid. A check of
// the form "did we get a GUID back" passes it, and the download that follows
// then returns nothing.
truthy("被拒的应答里 FileGuid 照样是有的（所以不能靠「有没有 GUID」判断）", typeof refused.FileGuid === "string" && refused.FileGuid.length > 0);
check("被拒的应答 estado=false，文件名退化成「.csv」", [refused.estado, refused.nombreArchivo], [false, ".csv"]);
throws("estado=false 必须抛 ChileBuscaRefusedError，不能当成功", () => assertGenerated(refused), (err) => err instanceof ChileBuscaRefusedError);
throws(
  "拒绝信息要点名 idTipoFecha —— 实测这是最常见的原因",
  () => assertGenerated(refused),
  (err) => err instanceof Error && err.message.includes("idTipoFecha"),
);

// ── 3. The zero-byte download, which is not "no results" ──────────────────
console.log("\nDescargar：0 字节的 HTTP 200，和只有表头的 HTTP 200，是两回事");

const emptyDownload = readBuffer("busca-descargar-empty.bin");
check("不带会话 cookie 的下载实测就是 0 字节", emptyDownload.length, 0);
throws("0 字节必须抛错，绝不能当成「这一页没有结果」", () => assertCsvBody(emptyDownload, "guid", "ListaLicitaciones.csv"), (err) => err instanceof ChileBuscaError);
throws(
  "错误信息要说清是 cookie/会话的问题，而不是「智利没数据」",
  () => assertCsvBody(emptyDownload, "guid", "ListaLicitaciones.csv"),
  (err) => err instanceof Error && err.message.includes("cookie"),
);

const emptyCsv = read("busca-export-empty.csv");
truthy("「翻过头了」的应答是一行表头，约 131 字节 —— 有正文，不是 0 字节", emptyCsv.length > 100 && emptyCsv.length < 200);
truthy("这一份能通过 assertCsvBody（它是合法应答）", assertCsvBody(Buffer.from(emptyCsv, "utf-8"), "g", "f").length > 0);
check("解析出来就是 0 行，且不报错", parseChileBuscaCsv(emptyCsv).rows.length, 0);

// A body that is neither: something that is not this CSV at all.
throws(
  "正文不是 CSV 表头开头的（登录页、错误页）也要抛错",
  () => assertCsvBody(Buffer.from("<html><body>Error;500;x</body></html>", "utf-8"), "g", "f"),
  (err) => err instanceof ChileBuscaError,
);

// ── 4. The CSV itself ─────────────────────────────────────────────────────
console.log("\n导出 CSV（4,055 行实测：0 个引号、0 个裸 LF、每行正好 11 个字段）");

const small = parseChileBuscaCsv(read("busca-export-small.csv"));
check("小样本解析出 9 行，0 行畸形", [small.rows.length, small.malformed.length], [9, 0]);
const first = small.rows[0];
check("id", first.id, "1017312-18-LP26");
check("Tipo 就是 id 倒数第 3、4 位", first.tipo, first.id.slice(-4, -2));
check("标题两端的空格被 trim 掉（原文结尾有一个空格）", first.title.endsWith("AYSEN"), true);
check("estado", first.estado, "Publicada y disponible para ofertar");
check("发布时间原样保留 dd/mm/yyyy HH:MM:SS", first.fechaPublicacion, "24/09/2026 12:34:46");
check("金额、币种、预算类型分别读到各自的列", [first.montoLicitacion, first.moneda, first.tipoPresupuesto], ["140.000.000", "CLP", "PUBLICADO"]);
check("采购方名字干净 —— 没有 OCDS 那个 \" | \"", first.organismo.includes(" | "), false);

// The header is checked by NAME. A reordered or renamed column is a sentence a
// reader can act on, not eleven silently mismatched fields.
throws(
  "表头对不上就抛错（对方换了列，不能再按位置读）",
  () => parseChileBuscaCsv("IDLicitacion;Nombre;Tipo\r\na;b;c\r\n"),
  (err) => err instanceof ChileBuscaParseError,
);
// A row with an embedded delimiter is reported, never realigned by guesswork.
const ragged = parseChileBuscaCsv(read("busca-export-empty.csv").trimEnd() + "\r\n" + "a;b;c\r\n");
check("字段数不是 11 的行进 malformed，不进 rows", [ragged.rows.length, ragged.malformed.length, ragged.malformed[0]?.fields], [0, 1, 3]);

// ── 5. MontoLicitacion is two different things in one column ──────────────
console.log("\n金额列是多态的 —— TipoPresupuesto 决定它到底是数字还是一句话");

const unpriced = parseChileBuscaCsv(read("busca-export-unpriced.csv"));
check("未公布金额那一半也是 21 行、0 行畸形", [unpriced.rows.length, unpriced.malformed.length], [21, 0]);

check("PUBLICADO：es-CL 千分点，解析成数字", parseChileBuscaAmount("140.000.000", "PUBLICADO"), { kind: "number", amount: 140000000 });
check("PUBLICADO：逗号是小数点（USD 那些）", parseChileBuscaAmount("70.063,00", "PUBLICADO"), { kind: "number", amount: 70063 });
// The one that matters. A digit-scraping parser turns this into 5000 and then
// classifies a large public works tender as a trivial one.
check("NO PUBLICADO：「Igual o superior a 5.000 UTM」是档位，绝不能变成数字 5000", parseChileBuscaAmount("Igual o superior a 5.000 UTM", "NO PUBLICADO"), { kind: "band", band: "Igual o superior a 5.000 UTM" });
check("NO PUBLICADO：「No público」也是档位文字", parseChileBuscaAmount("No público", "NO PUBLICADO"), { kind: "band", band: "No público" });
check("空值就是 none", parseChileBuscaAmount("", "PUBLICADO"), { kind: "none" });
// Decided by the declared type, not by "does this look numeric" — so a phrase
// that happened to be all digits still cannot become money.
check("哪怕内容像数字，只要声明是 NO PUBLICADO 就当档位", parseChileBuscaAmount("5000", "NO PUBLICADO"), { kind: "band", band: "5000" });

const bandRow = unpriced.rows.find((row) => row.montoLicitacion.includes("UTM"));
truthy("实测样本里确实有 UTM 档位这种行", bandRow !== undefined);
check("这一行经 parseChileBuscaAmount 得到的是 band", parseChileBuscaAmount(bandRow!.montoLicitacion, bandRow!.tipoPresupuesto).kind, "band");

// ── 6. Dates ──────────────────────────────────────────────────────────────
console.log("\n日期：dd/mm/yyyy 不是 mm/dd/yyyy，而且没有时区就不编一个");

check("dd/mm/yyyy HH:MM:SS → 裸日历日（不是 UTC 零点的时刻，见函数注释）", parseChileBuscaDate("24/09/2026 12:34:46"), "2026-09-24");
// The one that proves the order. 01/12 is 1 December, not 12 January.
check("01/12/2026 是 12 月 1 日，不是 1 月 12 日", parseChileBuscaDate("01/12/2026"), "2026-12-01");
check("不合法的日期返回 undefined，不返回 Invalid Date", parseChileBuscaDate("31/02/2026"), undefined);
check("空串返回 undefined", parseChileBuscaDate(""), undefined);

// ── 7. The HTML fragment — the only source of the closing date ────────────
console.log("\nHTML 结果片段（CSV 里没有交标截止日，只有这里有）");

const html = read("busca-search-page.html");
check("一页 10 张卡片 —— registrosPorPagina 实测被忽略", splitChileBuscaCards(html).length, 10);
const cards = parseChileBuscaSearchHtml(html);
check("10 张卡全部解析出来", cards.length, 10);
check("每张卡都有交标截止日", cards.filter((card) => card.fechaCierre).length, 10);
check("每张卡都有两个采购方信誉计数", [cards.filter((c) => c.comprasEfectuadas !== undefined).length, cards.filter((c) => c.reclamosPagoNoOportuno !== undefined).length], [10, 10]);
check("截止日是 dd/mm/yyyy", cards.every((card) => /^\d{2}\/\d{2}\/\d{4}$/.test(card.fechaCierre ?? "")), true);
truthy("站点自己那句「En N días」也原样带出来", cards[0].cierreTexto);
check("id 和 CSV 是同一种编号格式", cards.every((card) => /^\d+-\d+-[A-Z][A-Z0-9]\d{2}$/.test(card.id)), true);

// The entity decoding. The fragment is served with numeric entities for every
// accented character, and a buyer name full of `&#243;` is a broken row.
check("数字实体解码（Regi&#243;n → Región）", decodeChileBuscaText("Regi&#243;n del Biob&#237;o"), "Región del Biobío");
check("命名实体也解（&amp; → &）", decodeChileBuscaText("A &amp; B"), "A & B");
check("解析出来的买方单位里不该再有 &#", cards.every((card) => !(card.unidad ?? "").includes("&#")), true);

// The hidden totals: real, and deliberately NOT used as a paging bound —
// they drifted 1047 → 1041 within twenty minutes of measuring.
const totals = chileBuscaDeclaredTotals(html);
truthy("页面自报的两个总数能读出来", typeof totals.publico === "number" && typeof totals.privado === "number");

// A fragment whose cards exist but no longer parse must SHOUT, because from
// the importer's side that looks exactly like a quiet day.
throws(
  "有结果块却一条都没解析出来 → 抛错，不返回空数组",
  () => parseChileBuscaSearchHtml('<div class="lic-bloq-wrap x">完全变了的标记</div>'),
  (err) => err instanceof ChileBuscaParseError,
);
check("真正没有结果块的片段返回空数组，不抛错", parseChileBuscaSearchHtml("<div>没有结果</div>").length, 0);

// ── 8. Status, which this door can actually be trusted on ─────────────────
console.log("\n状态：这个门的 estado 是活的，OCDS 的不是");

check("Publicada 且截止日在将来 → open", chileBuscaStatus("Publicada y disponible para ofertar", "2026-09-29", NOW), "open");
// The site's estado updates on its own schedule; the deadline is what a bidder
// actually lives by.
check("Publicada 但截止日已过 → submission_closed（不信 estado，信截止日）", chileBuscaStatus("Publicada y disponible para ofertar", "2026-09-20", NOW), "submission_closed");
check("当天截止仍算 open", chileBuscaStatus("Publicada y disponible para ofertar", "2026-09-24", NOW), "open");
check("没有截止日就只按 estado", chileBuscaStatus("Publicada y disponible para ofertar", undefined, NOW), "open");
check("Cerrada a recibir más ofertas", chileBuscaStatus("Cerrada a recibir más ofertas", undefined, NOW), "submission_closed");
check("Adjudicada → awarded", chileBuscaStatus("Adjudicada a uno o varios proveedores", undefined, NOW), "awarded");
check("Cancelada por el organismo → cancelled", chileBuscaStatus("Cancelada por el organismo", undefined, NOW), "cancelled");
check("Sin ofertas recibidas（流标）→ cancelled", chileBuscaStatus("Sin ofertas recibidas", undefined, NOW), "cancelled");
// Never defaulted. A state nobody has measured must not surface as biddable.
check("没见过的 estado 文案 → undefined，绝不默认成 open", chileBuscaStatus("Algo Nuevo", undefined, NOW), undefined);

// ── 9. Procedure type ─────────────────────────────────────────────────────
console.log("\n采购方式：能对上 OCDS 原文的才展开，对不上的原样保留");

check("LE 展开成 OCDS 自己那句话", chileBuscaProcedureType("LE"), "Licitación Pública Entre 100 y 1000 UTM (LE)");
check("LP", chileBuscaProcedureType("LP"), "Licitación Pública Mayor a 1000 UTM (LP)");
// 171 rows of the 4,055. Passed through rather than given an invented meaning.
check("O1 没有实测到的原文，就原样保留代码，不瞎编", chileBuscaProcedureType("O1"), "O1");
check("空值 → Unknown", chileBuscaProcedureType(""), "Unknown");

// ── 10. The mapper, end to end, on real rows ──────────────────────────────
console.log("\n映射：真实行 → Tender");

const mapped = mapChileBuscaRowToTender(first, cards.find((card) => card.id === first.id), undefined, NOW);
truthy("有金额的那一行映射成功", mapped !== null);
check("国家写死 Chile", mapped!.tender.country, "Chile");
check("slug 和 OCDS 那个映射器对同一个编号生成的是同一个 —— 这是两个门去重的依据", mapped!.tender.slug, `chile-${first.id.toLowerCase()}`);
check("tenderNumber 就是招标编号", mapped!.tender.tenderNumber, "1017312-18-LP26");
check("金额和币种一起出现", [mapped!.tender.estimatedValue, mapped!.tender.currency], [140000000, "CLP"]);
check("发布日期", mapped!.tender.publicationDate, "2026-09-24");
check("来源链接是 idlicitacion 形式", mapped!.tender.sourceUrl, chileBuscaPublicUrl("1017312-18-LP26"));
// This door publishes no region field at all. Stated as an absence rather than
// filled with the buying unit's free text, which merely mentions one.
check("没有 location —— 这个门不发地区字段（OCDS 发）", mapped!.tender.location, undefined);

const bandMapped = mapChileBuscaRowToTender(bandRow!, undefined, undefined, NOW);
truthy("未公布金额的行也能映射（不是丢掉）", bandMapped !== null);
check("但它没有 estimatedValue，档位单独带出来", [bandMapped!.tender.estimatedValue, bandMapped!.amountBand !== undefined], [undefined, true]);
// The pairing rule: a currency next to a band would read as a published price.
check("没有数字金额时也不带币种", bandMapped!.tender.currency, undefined);
check("没有 HTML 卡片时就没有截止日 —— 不编一个", bandMapped!.tender.submissionDeadline, undefined);

const enriched = cards.find((card) => card.id === first.id);
if (enriched) {
  check("有卡片时截止日进 keyDates", mapped!.tender.keyDates.some((date) => date.type === "submission"), true);
  check("两个信誉计数带出来了", [typeof mapped!.comprasEfectuadas, typeof mapped!.reclamosPagoNoOportuno], ["number", "number"]);
}

// ── 11. A zero is never allowed to read as "a quiet day" ──────────────────
console.log("\n空结果的解释：跟 OCDS 那条停更警告同一条规矩");

truthy("一行都没有 → 警告，并指出多半是被拒或解析器失配", describeBuscaStaleness(0, 0, undefined, NOW)?.includes("4,055"));
truthy("有行但一条都没映射成功 → 单独一句，说明是字段含义变了", describeBuscaStaleness(100, 0, undefined, NOW)?.includes("字段含义"));
check("有行也映射成功、且数据是新的 → 不报警", describeBuscaStaleness(100, 100, "2026-09-24", NOW), null);
truthy("最新发布日期已经两周以上 → 报警（实测这个门是零延迟的）", describeBuscaStaleness(100, 100, "2026-08-01", NOW)?.includes("零延迟"));

console.log(failures === 0 ? "\n全部通过。" : `\n${failures} 项失败。`);
process.exit(failures === 0 ? 0 : 1);
