/**
 * The pt/es split, pinned.
 *
 * Two things here are unreviewable once they go wrong, which is why they get
 * a test rather than a careful reading:
 *
 *  - A Brazilian row translated by the Spanish prompt comes back as fluent,
 *    plausible Chinese. There is nothing in the output to notice.
 *  - A batch is one prompt. A single Portuguese row riding along in a
 *    Spanish batch is invisible in every count this pipeline reports.
 *
 * So the assertions are mostly about what must NOT happen: no mixed batch,
 * no silent switch of language for an unknown country.
 */
import { sourceLanguageFor } from "@/lib/ingestion/source-language";
import { chunkByLanguage, type TranslatableRow } from "@/lib/ingestion/translate-all-tenders";
import {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_PT,
  JSON_SHAPE_INSTRUCTIONS,
  JSON_SHAPE_INSTRUCTIONS_PT,
  systemPromptFor,
  jsonShapeInstructionsFor,
} from "@/lib/ingestion/extract-requirements";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

function row(slug: string, country: string | null): TranslatableRow {
  const text = { es: slug, en: slug, zh: slug };
  return { slug, title: text, summary: text, manual_field_overrides: null, country };
}

console.log("按国家判语种");
check("巴西 → 葡语", sourceLanguageFor("Brazil"), "pt");
check("秘鲁 → 西语", sourceLanguageFor("Peru"), "es");
check("墨西哥 → 西语", sourceLanguageFor("Mexico"), "es");
check("哥伦比亚 → 西语", sourceLanguageFor("Colombia"), "es");
// Not "unknown" and not a throw: an unexpected value keeps the behaviour
// every row had before this function existed, rather than quietly changing
// which prompt a live row goes through.
check("没有国家 → 按西语（保持原有行为）", sourceLanguageFor(null), "es");
check("认不出来的国家 → 按西语", sourceLanguageFor("Portugal"), "es");
// Guards against a careless `country.includes("Brazil")` rewrite later.
check("不是子串匹配", sourceLanguageFor("Brazilia"), "es");

console.log("\n分批：一批只能有一种语言");
const mixed = [
  row("pe-1", "Peru"),
  row("br-1", "Brazil"),
  row("mx-1", "Mexico"),
  row("br-2", "Brazil"),
  row("co-1", "Colombia"),
];
const batches = chunkByLanguage(mixed, 8);
check(
  "混合清单被拆成两批，没有一批跨语言",
  batches.map((batch) => [...new Set(batch.map((r) => sourceLanguageFor(r.country)))]),
  [["es"], ["pt"]],
);
check("一条都没丢", batches.flat().length, mixed.length);
check(
  "同语言内仍按 size 切分",
  chunkByLanguage([row("a", "Peru"), row("b", "Peru"), row("c", "Peru")], 2).map((b) => b.length),
  [2, 1],
);
// The failure mode a plain chunk() would give: with size 1 every row is its
// own batch and the bug hides. Size 8 over 5 mixed rows is the realistic
// shape — one batch, two languages — so this is the case that must split.
check("批量大于总数时也要按语言拆开", chunkByLanguage(mixed, 100).length, 2);

console.log("\n标书分析：提示词按语种选");
check("葡语选巴西提示词", systemPromptFor("pt") === SYSTEM_PROMPT_PT, true);
check("西语选原提示词", systemPromptFor("es") === SYSTEM_PROMPT, true);
check("没给语种时默认西语", systemPromptFor(undefined) === SYSTEM_PROMPT, true);
check("JSON 约定同样分流", jsonShapeInstructionsFor("pt") === JSON_SHAPE_INSTRUCTIONS_PT, true);
check("JSON 约定默认西语", jsonShapeInstructionsFor(undefined) === JSON_SHAPE_INSTRUCTIONS, true);

console.log("\n提示词内容：两边不能互相串台");
// The Mexican-specific strings are the ones that would actively mislead a
// reader of a Brazilian Edital — it has no Convocatoria and no Anexo Técnico.
check("巴西提示词里没有 Convocatoria", /convocatoria/i.test(SYSTEM_PROMPT_PT), false);
check("巴西提示词里没有 Anexo Técnico", /anexo t[ée]cnico/i.test(SYSTEM_PROMPT_PT), false);
check("巴西提示词说明文件是葡语", /Brazilian Portuguese/.test(SYSTEM_PROMPT_PT), true);
check("巴西提示词写到 habilitação", /habilita[çc][ãa]o/i.test(SYSTEM_PROMPT_PT), true);
check("巴西提示词写到 CAT/CREA", /CREA/.test(SYSTEM_PROMPT_PT), true);
// The JSON contract's last line is a repeated, deliberate reminder; the pt
// copy is produced by string replacement, so a wording change upstream would
// silently leave it saying "Spanish".
check("葡语 JSON 约定没有再说原文是西语", /source document is in Spanish/.test(JSON_SHAPE_INSTRUCTIONS_PT), false);
check("葡语 JSON 约定说原文是葡语", /source document is in Portuguese/.test(JSON_SHAPE_INSTRUCTIONS_PT), true);
check("西语 JSON 约定没被改动", /source document is in Spanish/.test(JSON_SHAPE_INSTRUCTIONS), true);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
