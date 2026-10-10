/**
 * lib/summary-duration.ts and applySummaryDurationFloor (lib/relevance.ts):
 * a contract term in the 一句话总结 — 2 years → at least 中型, 3 → 大型.
 *
 *   npm run test:summary-duration
 */
import { contractMonthsInSummary } from "../lib/summary-duration";
import { applySummaryDurationFloor } from "../lib/relevance";
import type { TenderRelevance } from "../types/tender";

let passed = 0;
let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
const months = (summary: string, want: number | null) => check(summary, contractMonthsInSummary(summary), want);

months("新建污水处理厂二期工程，工期24个月", 24);
months("提供为期三年的设备运维服务", 36);
months("城市照明维护服务，合同期两年", 24);
months("收费公路30年特许经营", 360);
months("建设期2年、运营期25年的PPP项目", 300);
months("医疗设备租赁，租赁期十八个月", 18);
months("提供3年期安保系统维护", 36);
months("工期18个月的桥梁加固", 18);
// Not the contract's term:
months("采购挖掘装载机，质保期3年", null);
months("要求近5年类似项目业绩", null);
months("投标有效期2年", null);
months("2026年3月开工的道路工程", null);
months("公司须成立满3年", null);
months("采购120台安检机", null);

const tier = (t: TenderRelevance["tier"]): TenderRelevance => ({ tier: t, label: { zh: t, en: t, es: t }, reason: { zh: "", en: "", es: "" } });
const floorOf = (t: TenderRelevance["tier"], summary: string) => applySummaryDurationFloor(tier(t), summary).tier;
check("2 years lifts 常规 to 中型", floorOf("standard", "合同期两年的维护服务"), "significant");
check("3 years lifts 常规 to 大型", floorOf("standard", "为期三年的运维服务"), "flagship");
check("3 years lifts 中型 to 大型", floorOf("significant", "工期36个月"), "flagship");
check("2 years leaves 大型 alone", floorOf("flagship", "工期24个月"), "flagship");
check("never lifts 已过滤", floorOf("excluded", "为期三年的保洁服务"), "excluded");
check("18 months: no floor", floorOf("standard", "工期18个月"), "standard");
check("no summary: unchanged", floorOf("standard", ""), "standard");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
