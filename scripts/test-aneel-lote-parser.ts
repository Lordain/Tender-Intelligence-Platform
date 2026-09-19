/**
 * The ten real lots, pinned.
 *
 * Input is __fixtures__/aneel-lotes-transmissao.txt — the object text of a
 * live ANEEL transmission auction, copied out of the www2 Liferay application
 * on 2026-09-18. Every assertion below is a fact about that capture, not a
 * shape I invented, which is the point: this parser exists because the page
 * cannot be fetched by a script, so the fixture IS the source of truth and it
 * must keep parsing the same way.
 *
 * Two of these checks are the traps the parser was written for:
 *
 *   - **Lot 2** keeps its only installation on the header line, after the
 *     colon. A header-then-bullets parser returns zero installations for it,
 *     and zero reads like missing data rather than a parsing bug.
 *   - **Lot 10** says "nos Estado do Mato Grosso" — plural preposition,
 *     singular noun, a typo in the source. A state pattern anchored on
 *     "no Estado de"/"nos Estados de" drops that lot's states entirely.
 */
import { readFileSync } from "node:fs";
import { parseAneelLotes } from "@/lib/ingestion/aneel-lote-parser";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

const text = readFileSync("lib/ingestion/__fixtures__/aneel-lotes-transmissao.txt", "utf8");
const lotes = parseAneelLotes(text);
const byNumber = new Map(lotes.map((lote) => [lote.number, lote]));

console.log("切分");
check("十个标段，一个不多一个不少", lotes.length, 10);
check("编号连续 1–10", lotes.map((lote) => lote.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

console.log("\n州名和 UF");
check("标段 1 三个州", byNumber.get(1)?.states, ["Rio de Janeiro", "São Paulo", "Minas Gerais"]);
check("标段 1 的 UF", byNumber.get(1)?.ufs, ["RJ", "SP", "MG"]);
check("标段 6 单个州", byNumber.get(6)?.ufs, ["SP"]);
// "Mato Grosso do Sul" must not be read as "Mato Grosso" — different UF,
// 1,500 km apart, and the longer name contains the shorter one.
check("标段 8 是南马托格罗索（MS），不是马托格罗索（MT）", byNumber.get(8)?.ufs, ["MS"]);
check("标段 5 是 MT + PA", byNumber.get(5)?.ufs, ["MT", "PA"]);
// The typo trap.
check("标段 10「nos Estado do」（原文笔误）照样读出 MT", byNumber.get(10)?.ufs, ["MT"]);

console.log("\n设施清单");
// The same-line trap.
check("标段 2 的设施在标题行上，不是零条", byNumber.get(2)?.installations.length, 1);
check("标段 2 读到的就是那条线路", byNumber.get(2)?.installations[0], "LT 230 kV Ponta Grossa - Canoinhas C1, CS");
check("标段 1 六条设施", byNumber.get(1)?.installations.length, 6);
check("标段 7 三条", byNumber.get(7)?.installations.length, 3);
// The sub-headings and the sublote labels are structure, not assets.
check("「Novas instalações de transmissão:」不算一条设施", byNumber.get(1)?.installations.some((line) => /^Novas/i.test(line)), false);
check("「Sublote 3A:」不算一条设施", byNumber.get(3)?.installations.some((line) => /^Sublote/i.test(line)), false);

console.log("\n子标段");
check("标段 3 有 3A–3D", byNumber.get(3)?.sublotes, ["3A", "3B", "3C", "3D"]);
check("标段 1 没有子标段", byNumber.get(1)?.sublotes, []);

console.log("\n新建 vs 续期 —— 决定这单对中资 EPC 有没有意义");
check("标段 1 两者都有", [byNumber.get(1)?.hasNewInstallations, byNumber.get(1)?.hasContinuity], [true, true]);
// Lot 6 is two underground 345 kV circuits: all construction, no expiring
// concession. This is the flavour an EPC wants and the flag has to separate it.
check("标段 6 没有「续期」字样", byNumber.get(6)?.hasContinuity, false);
check("标段 3 也没有", byNumber.get(3)?.hasContinuity, false);

console.log("\n电压等级（规模的代理指标）");
// "SE 500/230/138 kV" is three voltages behind one unit; reading only the
// number next to kV would call a 500 kV lot a 138 kV one.
check("标段 5「500/230/138 kV」取到 500", byNumber.get(5)?.maxVoltageKv, 500);
check("标段 2 是 230", byNumber.get(2)?.maxVoltageKv, 230);
check("标段 7 是 345", byNumber.get(7)?.maxVoltageKv, 345);
check("标段 3 是 500", byNumber.get(3)?.maxVoltageKv, 500);

console.log("\n原文保留");
check("每个标段都带着自己的原文", lotes.every((lote) => lote.text.includes(`LOTE ${lote.number}`)), true);
check("标段 1 的原文里有那句续期说明", /fim de Concess[ãa]o da Light-T/.test(byNumber.get(1)?.text ?? ""), true);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
