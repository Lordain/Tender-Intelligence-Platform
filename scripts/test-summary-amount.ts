/**
 * lib/ingestion/summary-amount.ts — the budget a 一句话总结 states.
 *
 *   npm run test:summary-amount
 */
import { amountsInSummary } from "../lib/ingestion/summary-amount";

let passed = 0;
let failed = 0;
function expect(name: string, summary: string, country: string, want: null | "ambiguous" | [number, string]) {
  const result = amountsInSummary(summary, country);
  const got = result.kind === "none" ? null : result.kind === "ambiguous" ? "ambiguous" : [result.amount.value, result.amount.currency];
  if (JSON.stringify(got) === JSON.stringify(want)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}: 「${summary}」 → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

expect("万 + 雷亚尔", "Codevasf以价格登记方式采购平地机，预算约5,225万雷亚尔", "Brazil", [52_250_000, "BRL"]);
expect("亿 + 雷亚尔", "新建TO-428公路23.38公里，预算约1.04亿雷亚尔", "Brazil", [104_000_000, "BRL"]);
expect("R$ Brazilian format", "灾害管理中心设计施工总承包，预算R$ 26.601.440,65", "Brazil", [26_601_440.65, "BRL"]);
expect("R$ + milhões", "采购挖掘装载机，估算R$ 79,7 milhões", "Brazil", [79_700_000, "BRL"]);
expect("US$ + M", "AMBA I输电扩建特许经营，投资约US$1,140M", "Argentina", [1_140_000_000, "USD"]);
expect("美元 with western separators", "合同金额约26,110,944.33美元", "Peru", [26_110_944.33, "USD"]);
expect("比索 → country peso (Mexico)", "新建校区高中，预算约1,950万比索", "Mexico", [19_500_000, "MXN"]);
expect("比索 → country peso (Colombia)", "BRT车站自动门，预算约520亿比索", "Colombia", [52_000_000_000, "COP"]);
expect("named peso", "预算约3.5亿哥伦比亚比索", "Colombia", [350_000_000, "COP"]);
expect("索尔", "学校改扩建工程，预算约1,200万索尔", "Peru", [12_000_000, "PEN"]);
expect("no currency → nothing", "为地铁3号线采购120台安检机，全长23公里", "Mexico", null);
expect("model numbers are not money", "BR381公路排水工程，22.9kV配电线路", "Brazil", null);
expect("guarantee is not the budget", "道路工程，投标保证金R$ 260.000,00", "Brazil", null);
expect("experience is not the budget", "要求类似项目业绩不低于500万美元", "Peru", null);
expect("budget plus guarantee → the budget", "预算约2,660万雷亚尔，投标保证金26.6万雷亚尔", "Brazil", [26_600_000, "BRL"]);
expect("two lots → ambiguous", "分两个标段，分别为1,200万和800万美元", "Peru", "ambiguous");
expect("same figure twice → one", "总价5,000万美元（约5000万美元）", "Panama", [50_000_000, "USD"]);
expect("bare $ in Brazil is not a peso", "预算$ 5.000.000", "Brazil", null);
expect("empty", "", "Brazil", null);
// From the first live preview, 2026-10-10.
expect("total assets are a requirement", "特许经营期30年，要求投标方具备至少1.5亿美元总资产及200公里线路经验", "Peru", null);
expect("Chinese long form 万+digits", "总投资4090万6130.40索尔，包括项目执行", "Peru", [40_906_130.4, "PEN"]);
expect("Chinese long form, separators in the tail", "总投资6,441万7,033.47索尔", "Peru", [64_417_033.47, "PEN"]);
expect("Chinese long form, 亿+万", "总投资1亿2,000万美元", "Panama", [120_000_000, "USD"]);
expect("floor area is not money", "约3.36万平方米州立医院，合同估值约3.02亿雷亚尔", "Brazil", [302_000_000, "BRL"]);
expect("two lots, Chinese", "分为两个标段，预算分别约为37亿和58亿比索", "Colombia", "ambiguous");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
