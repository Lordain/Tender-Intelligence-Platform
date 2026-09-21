/**
 * lib/ingestion/dou-detail.ts against all 13 captured pages. No network.
 *
 * Every expected value below was read out of the committed HTML, not recalled.
 * The point of the suite is that the four mappable notices are mapped exactly
 * and the nine unmappable ones are refused LOUDLY — a prose notice silently
 * producing a half-filled Tender is the failure this module exists to prevent.
 *
 *   npm run test:dou-detail
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseDouDetail, canBecomeTender, tenderNumbersIn, decodeComprasnetId } from "@/lib/ingestion/dou-detail";

const DIR = "lib/ingestion/__fixtures__/dou/detail";
const load = (file: string) => parseDouDetail(readFileSync(`${DIR}/${file}`, "utf8"));

let ran = 0;
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  ran += 1;
  const okay = JSON.stringify(actual) === JSON.stringify(expected);
  if (!okay) failures += 1;
  console.log(`${okay ? "✓" : "✗"} ${name}${okay ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}
function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

console.log("── 两种形状，按 18 份真实页面点名 ──");
const shapes = readdirSync(DIR)
  .filter((f) => f.endsWith(".html"))
  .sort()
  .map((f) => [f, load(f).shape] as const);
check("18 份页面全部读到", shapes.length, 18);
check("其中 5 份是 Comprasnet 标签式", shapes.filter(([, s]) => s === "comprasnet").length, 5);
check("其余 13 份是散文式", shapes.filter(([, s]) => s === "prose").length, 13);

console.log("\n── DNIT 塞阿拉 BR-116 公路复线（Concorrência 51/2026，第 1 次勘误）──");
{
  const d = load("01-aviso-de-alteracao-de-edital-732539652.html");
  check("形状", d.shape, "comprasnet");
  check("标题", d.heading, "AVISO DE ALTERAÇÃO DE EDITAL");
  check("采购方式", d.instrument, "Concorrência");
  check("标号", d.number, "51/2026");
  check("流程号", d.processNumber, "50603.001604/2026-08");
  // The object is the one field the 403-character snippet always cut. Here it
  // arrives whole, including the note that the big technical annexes live on
  // DNIT's own portal because Compras.gov.br cannot hold them.
  ok("标的读全了（含 BR-116/CE 的起止里程）", d.object?.includes("km 75,50 ao km 114,10") === true);
  ok("标的里带着「大附件在 DNIT 门户」那句", d.object?.includes("portal eletrônico do DNIT") === true);
  // The two dates are different things and must never be swapped: proposals
  // open in September, the session is in December.
  // The errata reads "Nova data de início de recebimento de propostas: de
  // 16/09/2026 para 18/09/2026". The first version of the parser returned
  // 09-16 — the date being CANCELLED — because the plain label is a substring
  // of the errata's label and the first date in the value is the old one.
  check("投标开始日取的是改之后的", d.proposalsOpenOn, "2026-09-18");
  check("改之前那个日期留着，没被悄悄抹掉", d.proposalsMovedFrom, "2026-09-16");
  check("开标日（Data de Abertura）", d.openingOn, "2026-12-17");
  ok("标书地址是 Comprasnet 深链，带 compra 号", d.editalUrl?.includes("compra=39302403000512026") === true);
  ok("可以变成项目", canBecomeTender(d));
  check("整条只有一个标", d.tenderNumbers, ["51/26"]);
}

console.log("\n── DNIT 总部 Eirunepé 港口 IP4 工程（Concorrência 307/2026）──");
{
  const d = load("02-aviso-de-licitacao-732643349.html");
  check("标号", d.number, "307/2026");
  check("流程号", d.processNumber, "50600.011635/2025-16");
  ok("标的点名了亚马逊州 Eirunepé", d.object?.includes("Eirunepé no estado do Amazonas") === true);
  check("开标日", d.openingOn, "2026-12-17");
  ok("可以变成项目", canBecomeTender(d));
}

console.log("\n── 海军圣佩德罗防雷工程（Concorrência 133/2026）──");
{
  const d = load("03-aviso-de-licitacao-732474171.html");
  check("标号", d.number, "133/2026");
  check("投标开始日", d.proposalsOpenOn, "2026-09-21");
  check("开标日", d.openingOn, "2026-10-05");
  ok("可以变成项目", canBecomeTender(d));
}

console.log("\n── 海军 IEAPM 法罗尔岛码头改造（Concorrência 151/2025）──");
{
  const d = load("04-aviso-de-licitacao-732503010.html");
  // The number's year is 2025 while the notice ran in 2026. Real, and a
  // reminder that a tender's number does not date its publication.
  check("标号是 2025 年的，公告是 2026 年发的", d.number, "151/2025");
  ok("标的点名了阿拉亚尔杜卡布的码头", d.object?.includes("cais do Instituto de Estudos do Mar") === true);
  check("开标日", d.openingOn, "2026-10-26");
  ok("可以变成项目", canBecomeTender(d));
}

console.log("\n── 林业局 Bom Futuro 森林特许（Concorrência 03/2026）—— 散文，拒绝映射 ──");
{
  const d = load("05-aviso-de-retificacao-732542248.html");
  // This is the row that matters most strategically — a concession, the thing
  // PNCP structurally cannot carry — and it does NOT arrive machine-readable.
  check("形状", d.shape, "prose");
  ok("拒绝映射，并写明了原因", (d.whyNotMappable?.length ?? 0) > 0);
  ok("不能变成项目", !canBecomeTender(d));
  ok("正文还是完整留着的", d.paragraphs.join("").includes("Floresta Nacional do Bom Futuro"));
  ok("标号在句子里，能认出来", d.tenderNumbers.includes("3/26"));
  check("没有编出开标日", d.openingOn, undefined);
}

console.log("\n── 瓜鲁柳斯那条：一条公告七个标 ──");
{
  const d = load("02-avisos-de-licitacao-732452192.html");
  check("形状", d.shape, "prose");
  ok("数出不止一个标", d.tenderNumbers.length > 1);
  check("数出七个", d.tenderNumbers.length, 7);
  ok("不能变成项目", !canBecomeTender(d));
}

console.log("\n── 拆标号这件事本身 ──");
check("同一个标写成 2026 和 26 只算一个", tenderNumbersIn("Concorrência 51/2026 e CP 51/26"), ["51/26"]);
check("前导零不算另一个标", tenderNumbersIn("PE 090159/26 e PE 90159/26"), ["90159/26"]);
check("没有标号就是空的，不是瞎猜一个", tenderNumbersIn("Aviso de suspensão sem número"), []);

console.log("\n── Comprasnet 编号拆解（4 份标签式全部对过）──");
// The only structured identity a DOU notice carries. Whether it can be matched
// to a PNCP row decides whether the two sources can be deduplicated at all.
check("51/2026 的 UASG 和标号", decodeComprasnetId("x?compra=39302403000512026"), { uasg: "393024", modalidade: "03", numero: "51", ano: "2026" });
check("307/2026", decodeComprasnetId("x?compra=39300303003072026"), { uasg: "393003", modalidade: "03", numero: "307", ano: "2026" });
check("133/2026", decodeComprasnetId("x?compra=79118103001332026"), { uasg: "791181", modalidade: "03", numero: "133", ano: "2026" });
check("151/2025（标号年份和公告年份不同）", decodeComprasnetId("x?compra=75300003001512025"), { uasg: "753000", modalidade: "03", numero: "151", ano: "2025" });
check("位数不对就整个不认，不半解析", decodeComprasnetId("x?compra=3930240300051"), undefined);
check("没有 compra 参数就是 undefined", decodeComprasnetId("https://example.test/"), undefined);
for (const file of ["01-aviso-de-alteracao-de-edital-732539652.html", "02-aviso-de-licitacao-732643349.html", "03-aviso-de-licitacao-732474171.html", "04-aviso-de-licitacao-732503010.html"]) {
  const d = load(file);
  const decoded = decodeComprasnetId(d.editalUrl);
  ok(`${file.slice(0, 34)} 的标书链接里解得出 UASG`, decoded !== undefined);
  // The number in the Comprasnet id and the number on the Modalidade line are
  // the same tender, stated twice. If they ever disagree, one of the two is
  // being read wrong.
  check(`${file.slice(0, 34)} 两处标号一致`, decoded?.numero, d.number?.split("/")[0]);
}

console.log("\n── 散文式一律不产出日期 ──");
for (const [file, shape] of shapes) {
  if (shape !== "prose") continue;
  const d = load(file);
  ok(`${file.slice(0, 40)} 没有编造开标日`, d.openingOn === undefined);
}


// ── 五份特许通告，run #18 抓回来的 ────────────────────────────────────────
//
// 这五份是用来回答「PNCP 装不下的那一类能不能解析」的。答案是「基本不能，而且
// 危险」，下面逐条钉住，免得以后谁凭印象以为能。
console.log("\n── 特许类（run #18，9 个工作日、19,707 条里筛出来的 5 条）──");
{
  // Infraero 五个机场的保税物流仓特许 —— 走 licitacoes-e.com.br（巴西银行的
  // 平台），不是 Comprasnet，PNCP 里不会有。正是「结构上装不下」的那一类。
  const infraero = load("2026-09-16-01-aviso-de-licitacao-731959235.html");
  check("Infraero 机场物流仓特许是散文式", infraero.shape, "prose");
  ok("解析器没编出标号", infraero.number === undefined);
  ok("也没编出开标日", infraero.openingOn === undefined);
  ok("正文里其实有 8/10/2026，只是没写在标签里", /8\/10\/2026/.test(infraero.paragraphs.join("\n")));

  // 巴西林业局 Flona do Bom Futuro 第 2 标段 —— 找的就是这个：原始
  // AVISO DE LICITAÇÃO，不是之前那份勘误。碳信用 + 原生林木材。
  const flona = load("2026-09-10-03-aviso-de-licitacao-730839082.html");
  check("Flona Bom Futuro 第 2 标段（原始通告）是散文式", flona.shape, "prose");
  ok("解析器一个字段都没给出来", flona.number === undefined && flona.openingOn === undefined && flona.object === undefined);
  ok("日期写在叙述里：04 de novembro de 2026", /04 de novembro de 2026/.test(flona.paragraphs.join("\n")));
  ok("标书在林业局自己的门户，不是 Comprasnet", /gov\.br\/florestal/.test(flona.paragraphs.join("\n")));

  // ICMBio 卡拉雅斯的露营与便利服务特许。这一份是这批里最该记住的。
  const icmbio = load("2026-09-08-05-aviso-de-licitacao-730459931.html");
  check("ICMBio 卡拉雅斯特许是散文式", icmbio.shape, "prose");
  const icmbioBody = icmbio.paragraphs.join("\n");
  // 正文里四个葡文长日期，只有最后一个是开标日，前三个是「Lei nº X, de <日期>」
  // 里的法条颁布日。一个「取第一个长日期」的解析器会把截标日写成 2021-04-01
  // —— 格式没错、日期真实、完全错误，而且错得看不出来。
  const longDates = [...icmbioBody.matchAll(/\d{1,2} de [a-zç]+ de \d{4}/gi)].map((m) => m[0]);
  check("正文里有 4 个葡文长日期", longDates.length, 4);
  check("头一个是法条颁布日，不是开标日", longDates[0], "1 de abril de 2021");
  check("真正的开标日排在最后", longDates[3], "20 de outubro de 2026");
  ok("解析器现在不给开标日 —— 宁可没有，也不要那个 2021", icmbio.openingOn === undefined);

  // 唯一一条走 Comprasnet 的「特许」，解析器反倒全读得出来 —— 但按 run #17
  // 定下的规矩，带 Comprasnet 链接的就是 PNCP 的活，不该从 DOU 进。
  const arrend = load("2026-09-14-02-aviso-de-licitacao-731541687.html");
  check("那条土地租赁是标签式", arrend.shape, "comprasnet");
  check("标号读得出来", arrend.number, "41/2026");
  check("开标日读得出来", arrend.openingOn, "2026-10-20");
  ok("但它带 Comprasnet 链接，按规矩归 PNCP", decodeComprasnetId(arrend.editalUrl) !== undefined);

  // 第五条是听证会公告，不是招标 —— 对「线索雷达」有用，对「入库」没用。
  const hearing = load("2026-09-09-04-aviso-de-audiencia-publica-730636742.html");
  check("阿尔塔米拉那条是听证会公告", hearing.shape, "prose");
  ok("标的还没定，自然也没有标号", hearing.number === undefined);
}

console.log(`\n全部 ${ran} 项${failures === 0 ? "通过" : `，失败 ${failures} 项`}`);
if (failures > 0) process.exit(1);
