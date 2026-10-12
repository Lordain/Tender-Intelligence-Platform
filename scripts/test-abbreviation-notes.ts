/** Offline checks for applyAbbreviationNotes: notes are inserted, the original title is never changed otherwise. */
import { applyAbbreviationNotes } from "../lib/ingestion/abbreviation-notes";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const SUMMARY = "国防部为军队妇女与新生儿专科医院进行改造、扩建并配置医疗设备的工程。";
const TITLE = "H.M.E.M. Y N.改造、扩建与设备配置（第二次招标）";

// The user's example, 2026-10-12.
const hmem = applyAbbreviationNotes(TITLE, SUMMARY, [{ abbr: "H.M.E.M. Y N.", zh: "军队妇女与新生儿专科医院" }]);
check("note inserted after the abbreviation", hmem.title, "H.M.E.M. Y N.（军队妇女与新生儿专科医院）改造、扩建与设备配置（第二次招标）");
check("removing the note gives the original back", hmem.title.replace("（军队妇女与新生儿专科医院）", ""), TITLE);

// Second run: the note is already there.
check("idempotent", applyAbbreviationNotes(hmem.title, SUMMARY, [{ abbr: "H.M.E.M. Y N.", zh: "军队妇女与新生儿专科医院" }]).title, hmem.title);

const refused = (title: string, summary: string, abbr: string, zh: string) =>
  applyAbbreviationNotes(title, summary, [{ abbr, zh }]).refused.map((r) => r.reason);
check("meaning not verbatim in the summary", refused(TITLE, SUMMARY, "H.M.E.M. Y N.", "妇女儿童医院"), ["说明不是一句话总结里的原话"]);
check("abbreviation not in the title", refused(TITLE, SUMMARY, "HMEMYN", "军队妇女与新生儿专科医院"), ["标题里没有这个缩写"]);
check("source spelling inside a parenthesis", refused("莱昂市（León）变电站扩建", "在莱昂市扩建变电站。", "León", "莱昂市"), ["在括号里（原文拼写）"]);
check("already followed by a parenthesis", refused("CESFAM（家庭健康中心）新建", "新建一座家庭健康中心。", "CESFAM", "一座家庭"), ["后面已经有括号"]);
check("Latin in the meaning", refused("CESFAM 新建", "新建 CESFAM 家庭健康中心。", "CESFAM", "CESFAM 家庭健康中心"), ["说明里有拉丁字母"]);
check("not an abbreviation", refused("医院改造", "医院改造。", "医院", "医院改造"), ["不是拉丁字母缩写"]);

// Two notes in one title; a refused one leaves the other in place.
const two = applyAbbreviationNotes("CESFAM 与 SAR 新建", "新建家庭健康中心和高解析度急诊服务站。", [
  { abbr: "CESFAM", zh: "家庭健康中心" },
  { abbr: "SAR", zh: "急诊室" },
]);
check("two notes: one applied, one refused", [two.title, two.refused.length], ["CESFAM（家庭健康中心） 与 SAR 新建", 1]);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
