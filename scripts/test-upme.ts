/**
 * UPME transmission calls: the post parser, the stage read from the minutes,
 * and which calls are imported, against the 16 real posts UPME tagged
 * "Abierta oficialmente" or "Prepublicación" on 2026-09-25
 * (lib/ingestion/__fixtures__/upme-convocatorias-2026-09-25.json, page-builder
 * markup stripped).
 *
 * Usage: npm run test:upme
 */
import { ingestUpme } from "@/lib/ingestion/ingest-upme";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUpmePost, upmeCallNumber, upmeCallStage, type UpmePost } from "@/lib/ingestion/connectors/upme-live";
import { mapUpmeCallToTender, upmeDocumentLinks, upmeSkipReason } from "@/lib/ingestion/upme-mapper";
import { platformDay } from "@/lib/tender-status";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const posts = JSON.parse(readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/upme-convocatorias-2026-09-25.json"), "utf8")) as UpmePost[];
const now = new Date("2026-09-25T12:00:00Z");
const calls = posts.map(parseUpmePost);
const byNumber = new Map(calls.filter((c) => c !== null).map((c) => [c!.number, c!]));

console.log("upme\n");
console.log("项目编号");
check("UPME 08-2026", upmeCallNumber("UPME 08-2026 Tercer Transformador Heliconia 500/230 kV"), "UPME 08-2026");
check("区域电网 STR", upmeCallNumber("UPME STR 05-2026 Subestaciones Nueva Galapa 110 kV"), "UPME STR 05-2026");
check("「Convocatoria UPME 02 2026」没有连字符", upmeCallNumber("Convocatoria UPME 02 2026 Nueva Subestación Corzo 500 kV"), "UPME 02-2026");
check("16 条全部解析", byNumber.size, 16);

console.log("\n阶段（标签说「开放」，会议纪要说了算）");
const STAGES: [string, string][] = [
  ["UPME 08-2026", "open"],
  ["UPME STR 05-2026", "open"],
  ["UPME 01-2026", "open"],
  ["UPME STR 11-2021", "open"],
  ["UPME STR 02-2026", "proposals_received"],
  ["UPME 02-2026", "proposals_received"],
  ["UPME 02-2025", "awarded"],
  ["UPME 04-2024", "awarded"],
  ["UPME 10-2021", "void"],
];
for (const [number, stage] of STAGES) check(`${number} → ${stage}`, byNumber.get(number)?.stage, stage);
check("监理（interventor）的开标不算投资人开标", upmeCallStage("Evaluación interventoría | Acta de recepción ofertas Interventoría"), "open");
check("投资人开标会纪要 → 已收标", upmeCallStage("Evaluación inversionista | Acta de Apertura – Audiencia Presentación Propuestas"), "proposals_received");

console.log("\n导入哪些");
const imported = [...byNumber.values()].filter((call) => upmeSkipReason(call, now) === null).map((call) => call.number).sort();
check("只导入仍可投标的 4 条", imported, ["UPME 01-2026", "UPME 08-2026", "UPME STR 05-2026", "UPME STR 11-2021"].sort());
check("2019 年的预公告被跳过", upmeSkipReason(byNumber.get("UPME STR 07-2019")!, now)?.startsWith("预公告已"), true);

console.log("\n字段与档位");
const heliconia = mapUpmeCallToTender(byNumber.get("UPME 08-2026")!, now)!;
check("slug", heliconia.slug, "upme-08-2026");
check("区域电网 slug", mapUpmeCallToTender(byNumber.get("UPME STR 05-2026")!, now)!.slug, "upme-str-05-2026");
check("大型项目（与 ANEEL 输电拍卖同一条规则）", heliconia.relevance.tier, "flagship");
check("区域电网的也是大型", mapUpmeCallToTender(byNumber.get("UPME STR 05-2026")!, now)!.relevance.tier, "flagship");
check("行业含电力", heliconia.industries.includes("power"), true);
check("摘要取「Objeto」", heliconia.summary.es.startsWith("Selección de un inversionista y un interventor"), true);
check("发布日期取正式公告日（波哥大时间）", heliconia.publicationDate, "2026-07-10T17:00:00.000Z");
check("网站按墨西哥城时间显示为同一天", platformDay(heliconia.publicationDate), "2026-07-10");
check("没有截止日（在 DSI 的时间表里，会被补充文件改动）", heliconia.submissionDeadline, undefined);
const links = upmeDocumentLinks(byNumber.get("UPME 08-2026")!, heliconia.publicationDate);
check("DSI 等文件都存成链接", links.length, byNumber.get("UPME 08-2026")!.documents.length);
check("文件都在 docs.upme.gov.co", links.every((l) => l.sourceUrl.startsWith("https://docs.upme.gov.co/")), true);

void (async () => {
  console.log("\n近 3 天发布");
  const windowed = await ingestUpme(null, { write: false, posts, now });
  check("仍可投标 4 条", windowed.biddableCount, 4);
  check("默认 3 天窗口：今天没有近 3 天发布的", windowed.kept.length, 0);
  check("跳过原因写明「发布超过 3 天」", windowed.calls.filter((c) => c.skipReason === "发布超过 3 天").length, 4);
  const all = await ingestUpme(null, { write: false, days: 0, posts, now });
  check("--days 0 不限：4 条", all.kept.length, 4);
  const opened = await ingestUpme(null, { write: false, posts, now: new Date("2026-07-12T12:00:00Z") });
  check("08-2026 正式发布（7-10）后两天内在窗口里", opened.kept.map((t) => t.tenderNumber).includes("UPME 08-2026"), true);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
})();
