/**
 * The saved ANEEL auction page, pinned against the real capture.
 *
 * __fixtures__/aneel-edital-transmissao-2026.html is the page for Leilão
 * 001/2026 as the user's browser saved it on 2026-09-18 — the page a script
 * cannot fetch, which is exactly why the file is the source of truth and has
 * to keep reading the same way.
 *
 * The assertion that matters most is the boring one: **the encoding**. The
 * file is Windows-1252 ColdFusion output with no charset declaration. A
 * lenient UTF-8 decode does not throw — it quietly turns every accent into
 * U+FFFD, and "Leilão", "São Paulo" and "Ceará" become strings that still
 * look like text, still pass a truthiness check, and match nothing.
 */
import { readAneelEditalFile } from "@/lib/ingestion/connectors/aneel-editais-file";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

const edital = readAneelEditalFile("lib/ingestion/__fixtures__/aneel-edital-transmissao-2026.html");

console.log("编码 —— 这条错了，后面每一条都还是「有值」，只是值是坏的");
check("重音字符没有变成 U+FFFD", /�/.test(JSON.stringify(edital)), false);
check("标题里的 LEILÃO 是对的", /LEIL[ÃA]O/.test(edital.heading ?? ""), true);
check("Objeto 里读到「Ceará」", /Cear[áa]/.test(edital.objeto ?? ""), true);

console.log("\n这场拍卖是哪一场");
check("标题原样", edital.heading, "LEILÃO DE TRANSMISSÃO ANEEL Nº 001/2026");
// "001/2026" at the top, "nº 1/2026-ANEEL" in the Objeto — same auction, two
// spellings. The padding must not survive into an identifier.
check("场次号去掉前导零", edital.auctionNumber, 1);
check("年份", edital.year, 2026);
check("Objeto 说的是输电特许", /concess[õo]es do servi[çc]o\s*p[úu]blico de transmiss[ãa]o/i.test(edital.objeto ?? ""), true);
check("Objeto 里列了 11 个州", edital.objetoStates.length, 11);
check("第一个和最后一个州", [edital.objetoStates[0], edital.objetoStates.at(-1)], ["Bahia", "São Paulo"]);

console.log("\n标段 —— 从 HTML 里切出来，跟纯文本那份结果要一致");
check("十个标段", edital.lotes.length, 10);
check("编号 1–10", edital.lotes.map((lote) => lote.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
// The same-line trap survives the HTML path too: lot 2's installation sits on
// its own line here, and the parser must still find exactly one.
check("标段 2 一条设施", edital.lotes[1]?.installations.length, 1);
check("标段 3 有 3A–3D", edital.lotes[2]?.sublotes, ["3A", "3B", "3C", "3D"]);
check("标段 1 新建和续期都有", [edital.lotes[0]?.hasNewInstallations, edital.lotes[0]?.hasContinuity], [true, true]);
check("标段 8 是 MS 不是 MT", edital.lotes[7]?.ufs, ["MS"]);
check("标段 10 的笔误照样读出 MT", edital.lotes[9]?.ufs, ["MT"]);
check("标段 5 最高电压 500", edital.lotes[4]?.maxVoltageKv, 500);

console.log("\n钱在哪 —— 这一页上没有 RAP 也没有投资额，只有通往它们的链接");
check("拿到 IdProgramaEdital", edital.links.programaEditalId, "220");
check("edital 文档页链接拼出来了", edital.links.documentosUrl?.endsWith("documentos_editais.cfm?IdProgramaEdital=220"), true);
// R1–R5 are the per-lot technical and economic studies; the investment
// estimate this platform needs for estimatedValue is in them, not here.
check("R1–R5 报告链接", edital.links.relatoriosUrl, "https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/frmcdt.cfm?leilao=1&ano=2026");
check("公开征求意见的链接也留着", edital.links.consultaPublicaUrl?.startsWith("https://antigo.aneel.gov.br/web/guest/consultas-publicas"), true);

console.log("\n历史怎么翻 —— 页面自己的年份下拉就是分页");
check("1999 到 2026 全在", [edital.availableYears[0], edital.availableYears.at(-1)], [2026, 1999]);
check("28 个年份", edital.availableYears.length, 28);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
