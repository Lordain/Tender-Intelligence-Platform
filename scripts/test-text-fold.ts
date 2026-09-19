/**
 * The accent fold, and the invariant that keeps it safe.
 *
 * Folding works only because every keyword pattern in the three classifier
 * files is written with the unaccented spelling beside the accented one —
 * `[áa]`, `[çc]`, `[ñn]`. That is true today for all 399 of them. The day
 * someone writes a bare `é`, folding silently stops matching that pattern's
 * own rows, and nothing else in this repo would notice. Hence the scan below,
 * which is the real test here; the rest is the regression it was found on.
 */
import { readFileSync } from "node:fs";
import { foldAccents } from "@/lib/text-fold";
import { classifyIndustries } from "@/lib/industry";
import { classifyPortugueseIndustries } from "@/lib/relevance-pt";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

console.log("折叠本身");
check("葡语重音", foldAccents("Território Elói Mendes"), "Territorio Eloi Mendes");
check("ç 和 ã", foldAccents("Contratação de serviços"), "Contratacao de servicos");
check("西语 ñ 和重音", foldAccents("DISEÑO Y CONSTRUCCIÓN"), "DISENO Y CONSTRUCCION");
check("幂等", foldAccents(foldAccents("Território")), "Territorio");
check("中文不动", foldAccents("巴西公开招标"), "巴西公开招标");
check("空字符串", foldAccents(""), "");

console.log("\n真实回归：EMBRATUR 公关服务不再是水工程");
const EMBRATUR =
  "Contratação de empresa prestadora de serviços de Comunicação Corporativa e Relações Públicas em Território Nacional para a Agência Brasileira de Promoção Internacional do Turismo - EMBRATUR";
check("西语分类器不再返回 water", classifyIndustries(EMBRATUR, EMBRATUR).includes("water"), false);
check("葡语分类器也没有 water", classifyPortugueseIndustries(EMBRATUR).includes("water"), false);

// The mechanism itself, stated so the next reader does not have to rediscover
// why an unrelated word was a river. `\b` is ASCII-only: "ó" is not a word
// character, so it reads as a boundary and the pattern fires mid-word.
console.log("\n机制：\\b 只认 ASCII");
const RIO = /\br[íi]o\b/i;
check("折叠前 Território 被当成 río", RIO.test("Território"), true);
check("折叠后就不是了", RIO.test(foldAccents("Território")), false);
check("真的 Rio 仍然匹配", RIO.test(foldAccents("Rio Iguaçu")), true);
check("西语 río 仍然匹配", RIO.test(foldAccents("margen del río Mezcalapa")), true);
// -ário shares the ending, and is far commoner than -ório in tender prose.
check("relatório / mobiliário 同理", ["relatório", "mobiliário", "horário"].every((w) => RIO.test(foldAccents(w))), false);

console.log("\n不变量：分类正则里不能出现没有无重音写法的重音字符");

/** Blanks out //-comments, /*-comments and every string literal, so only real regex literals survive to be scanned. */
function codeOnly(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (two === "/*") {
      const end = source.indexOf("*/", i);
      const stop = end === -1 ? source.length : end + 2;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length && source[j] !== quote) j += source[j] === "\\" ? 2 : 1;
      const stop = Math.min(j + 1, source.length);
      out += " ".repeat(stop - i);
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

const LITERAL = /(?<![\w)\]])\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+)\/([gimsuy]*)/g;
const ACCENTED = /[À-ɏ]/g;

const FILES = ["lib/relevance.ts", "lib/industry.ts", "lib/relevance-pt.ts"];
let literals = 0;
const offenders: string[] = [];

for (const file of FILES) {
  const source = codeOnly(readFileSync(file, "utf8"));
  for (const match of source.matchAll(LITERAL)) {
    const body = match[1];
    literals += 1;
    const line = source.slice(0, match.index).split("\n").length;
    for (const accent of body.matchAll(ACCENTED)) {
      const at = accent.index!;
      const open = body.lastIndexOf("[", at);
      const close = body.indexOf("]", at);
      const insideClass = open !== -1 && close !== -1 && open < at && at < close && !body.slice(open + 1, at).includes("[");
      // Inside a character class that also offers the folded spelling is the
      // correct way to write these, e.g. [óo]. Anything else would stop
      // matching once the haystack is folded.
      if (insideClass && body.slice(open, close + 1).toLowerCase().includes(foldAccents(accent[0]).toLowerCase())) continue;
      offenders.push(`${file}:${line}  «${accent[0]}»  /${body.slice(0, 90)}/`);
    }
  }
}

check(`扫到的正则字面量数量（少于 300 说明扫描器坏了，不是代码变干净了）`, literals > 300, true);
check("没有裸重音字符", offenders, []);
if (offenders.length > 0) {
  console.log("\n  以下正则在折叠后会匹配不到自己的目标行——请改写成 [óo] 这种形式：");
  for (const line of offenders) console.log(`    ${line}`);
}
console.log(`  （共扫描 ${literals} 条正则字面量）`);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
