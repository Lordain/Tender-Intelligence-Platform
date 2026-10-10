/**
 * lib/ingestion/summary-adjustment.ts — what a 一句话总结 may change.
 *
 *   npm run test:summary-adjustment
 */
import { planSummaryAdjustment, summaryAdjustmentPatch, type SummaryAdjustmentRow } from "../lib/ingestion/summary-adjustment";

let passed = 0;
let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

function row(overrides: Partial<SummaryAdjustmentRow>): SummaryAdjustmentRow {
  return {
    slug: "brazil-test",
    tender_number: "00000000000000-1-000001/2026",
    title: { es: "CONSTRUÇÃO DE PONTE SOBRE O RIO DOCE", zh: "多塞河大桥建设" },
    summary: { es: "CONSTRUÇÃO DE PONTE SOBRE O RIO DOCE", zh: "多塞河大桥建设" },
    one_line_summary: null,
    buyer: "DEPARTAMENTO DE ESTRADAS",
    country: "Brazil",
    procedure_type: "Concorrência - Eletrônica",
    government_level: "state",
    scope_type: "works",
    estimated_value: null,
    currency: null,
    source_name: "Portal Nacional de Contratações Públicas (PNCP) — busca de editais",
    structured_duration_days: null,
    relevance_tier: "standard",
    relevance_manually_overridden: false,
    manual_field_overrides: [],
    ...overrides,
  };
}

// Fill an empty amount and re-tier on it.
{
  const plan = planSummaryAdjustment(row({ one_line_summary: "多塞河大桥建设，预算约2.6亿雷亚尔" }));
  check("empty → fill", plan.amountCase, "fill");
  check("fill writes the amount", plan.newAmount, { value: 260_000_000, currency: "BRL" });
  check("fill re-tiers on it", plan.tierTo, "flagship");
}
check("fill can be held back", planSummaryAdjustment(row({ one_line_summary: "预算约2.6亿雷亚尔" }), { fillEmpty: false }).newAmount, undefined);

// A typed amount the summary corrects.
{
  const plan = planSummaryAdjustment(row({ one_line_summary: "预算约2,619万雷亚尔", estimated_value: 20_000_000, currency: "BRL", manual_field_overrides: ["estimated_value"] }));
  check("typed → replace", plan.amountCase, "replace");
  check("replace writes the summary's amount", plan.newAmount, { value: 26_190_000, currency: "BRL" });
}
check(
  "typed but 5× apart → suspicious, not written",
  planSummaryAdjustment(row({ one_line_summary: "合同金额约 1.055 万雷亚尔", estimated_value: 10_557_230.2, currency: "BRL", manual_field_overrides: ["estimated_value"] })).amountCase,
  "typed-suspicious",
);
check(
  "typed but another currency → suspicious",
  planSummaryAdjustment(row({ country: "Bolivia", one_line_summary: "预算约637万美元", estimated_value: 63_801_078.87, currency: "BOB", manual_field_overrides: ["estimated_value"] })).amountCase,
  "typed-suspicious",
);

// The source's amount is never touched.
{
  const plan = planSummaryAdjustment(row({ one_line_summary: "预估金额约 2256 万雷亚尔", estimated_value: 25_426_666.36, currency: "BRL" }));
  check("source amount → listed only", plan.amountCase, "source-mismatch");
  check("source amount → no write", summaryAdjustmentPatch(plan), null);
}
check("within 5% → same", planSummaryAdjustment(row({ one_line_summary: "预算约60亿比索", country: "Colombia", estimated_value: 5_869_365_005, currency: "COP" })).amountCase, "same");

// Never to 已过滤 (不要基于总结把标书直接屏蔽).
{
  const plan = planSummaryAdjustment(row({ one_line_summary: "多塞河大桥建设，预算约80万雷亚尔" }));
  check("a small filled amount never excludes", plan.tierTo, "standard");
  check("…and says why", plan.tierNote?.includes("不会导致排除"), true);
}

// A locked tier is never moved; the amount still is.
{
  const plan = planSummaryAdjustment(row({ one_line_summary: "预算约2.6亿雷亚尔", relevance_manually_overridden: true }));
  check("locked: amount filled", plan.newAmount?.value, 260_000_000);
  check("locked: tier kept", plan.tierTo, "standard");
}

// Long contract: only without an amount (有金额的以金额为主，没有金额的才用时长评估).
check("no amount, 3-year term → 大型", planSummaryAdjustment(row({ one_line_summary: "大桥建设及为期三年的养护" })).tierTo, "flagship");
check(
  "amount present, 3-year term → amount decides",
  planSummaryAdjustment(row({ one_line_summary: "大桥建设及为期三年的养护，预算约500万雷亚尔", estimated_value: 5_000_000, currency: "BRL" })).tierTo,
  "standard",
);

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
