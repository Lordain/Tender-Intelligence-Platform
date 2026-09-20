/**
 * The 中文（Latin）region-mismatch detector. Tested offline because the script
 * that uses it needs production data, and because the rule it encodes is easy
 * to make too eager — a false positive here sends someone to "correct" a
 * translation that was right.
 */
import { findRegionNameMismatches, REGION_NAMES } from "../lib/region-names";

let ran = 0;
const failures: string[] = [];

function flags(text: string, expectLatin: string, expectActualZh: string): void {
  ran += 1;
  const [first] = findRegionNameMismatches(text);
  if (first === undefined) {
    failures.push(`应当报出地名不一致却没有报：「${text}」`);
    return;
  }
  if (first.latin !== expectLatin || first.actualZh !== expectActualZh) {
    failures.push(`地名不一致报错内容不对：「${text}」——得到 ${first.actualZh}/${first.latin}`);
  }
}

function clean(text: string): void {
  ran += 1;
  const found = findRegionNameMismatches(text);
  if (found.length > 0) {
    failures.push(`不应报错却报了：「${text}」——${found.map((m) => m.found).join("、")}`);
  }
}

// The row that started this (2026-09-20). Arequipa and Áncash are different
// Peruvian departments; the project is in Huari, which is a province OF Áncash.
flags("阿雷基帕省（Ancash）瓦里省供水系统改善工程", "Áncash", "阿雷基帕");
// Accents must not hide it, in either direction.
flags("阿雷基帕省（Áncash）瓦里省供水系统改善工程", "Áncash", "阿雷基帕");
// Half-width parentheses are used by some rows too.
flags("瓜纳华托州(Jalisco)公路养护工程", "Jalisco", "瓜纳华托");
// Other countries, same shape.
flags("米纳斯吉拉斯州（Bahia）学校建设工程", "Bahia", "米纳斯吉拉斯");
flags("安蒂奥基亚省（Santander）道路改善工程", "Santander", "安蒂奥基亚");

// --- What must NOT be flagged --------------------------------------------
// The correct and overwhelmingly common pattern: a province or municipality
// annotated with the Latin spelling of ITS OWN name.
clean("卡哈马卡区（Cajamarca）卫生站医疗设备采购");
clean("瓜纳华托州莱昂市（León）变电站扩建工程");
clean("马托格罗索州卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复");
// A province annotated with the DEPARTMENT it belongs to. The Chinese half is
// not a first-level region at all, so there is nothing to compare and nothing
// to report — this is the case that makes the rule safe.
clean("瓦里省（Áncash）供水系统改善工程");
clean("华曼加区（Ayacucho）早期教育设施建设");
// A facility or project name, not a region.
clean("马塔德罗（Matadero）泵站改造工程");
clean("查维莫奇克（Chavimochic）灌溉系统水利机电组件工程");
// No parenthetical at all.
clean("秘鲁 变电站扩建工程（输配电）");
clean("");

// Longest-match discipline: a state whose Chinese name CONTAINS another's must
// not read as that other one.
clean("南马托格罗索州（Mato Grosso do Sul）公路养护");
clean("南下加利福尼亚州（Baja California Sur）港口工程");
// …but the genuinely crossed version of the same pair still reports.
flags("南马托格罗索州（Mato Grosso）公路养护", "Mato Grosso", "南马托格罗索");

// --- The table itself ------------------------------------------------------
ran += 1;
const duplicateLatin = REGION_NAMES.map((r) => r.latin.toLowerCase()).filter((v, i, all) => all.indexOf(v) !== i);
if (duplicateLatin.length > 0) failures.push(`地名表里有重复的原文名：${duplicateLatin.join("、")}`);
ran += 1;
if (REGION_NAMES.some((r) => r.zh.trim() === "" || r.latin.trim() === "")) {
  failures.push("地名表里有空值");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  中文/原文大区名一致性检查，全部 ${ran} 项通过`);
