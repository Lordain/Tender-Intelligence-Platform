/**
 * The bidding-window gate (2026-09-19).
 *
 * User's rule: 常规项目(没有金额的)，如果有交标日期，而且交标日期减发布日期
 * 小于12个自然日，就自动被排除，也应用于所有国家的项目.
 *
 * Every guard below is load-bearing, and the three "保留" cases are why this
 * file exists rather than a comment: a gate in upsertTendersBatched() drops
 * rows before they are ever stored, so one that fires a category too wide
 * loses real tenders permanently and leaves nothing behind to notice it with.
 *
 * Usage: npm run test:bid-window
 */
import { hasShortBidWindow, SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";

type Row = Parameters<typeof hasShortBidWindow>[0];

const base = {
  publicationDate: "2026-09-01",
  submissionDeadline: "2026-09-20",
  estimatedValue: undefined,
  relevance: { tier: "standard" },
} as unknown as Row;

const row = (patch: Record<string, unknown>): Row => ({ ...base, ...patch }) as unknown as Row;

const CASES: [string, Row, boolean][] = [
  ["19 天窗口 —— 保留", row({ submissionDeadline: "2026-09-20" }), false],
  // The boundary is the user's word 小于, so twelve days exactly stays.
  ["12 天整 —— 保留（规则是「小于」12 天）", row({ submissionDeadline: "2026-09-13" }), false],
  ["11 天 —— 排除", row({ submissionDeadline: "2026-09-12" }), true],
  ["3 天 —— 排除", row({ submissionDeadline: "2026-09-04" }), true],
  ["跨月的 11 天 —— 排除", row({ publicationDate: "2026-12-28", submissionDeadline: "2027-01-07" }), true],
  // Scoped to 常规项目 by the user. A 中型/大型 row with a tight window is a
  // real opportunity someone may still want to see.
  ["11 天但是中型项目 —— 保留", row({ submissionDeadline: "2026-09-12", relevance: { tier: "significant" } }), false],
  ["11 天但是大型项目 —— 保留", row({ submissionDeadline: "2026-09-12", relevance: { tier: "flagship" } }), false],
  // 没有金额的. With a value in hand the row has been sized on something
  // better than a calendar.
  ["11 天但披露了金额 —— 保留", row({ submissionDeadline: "2026-09-12", estimatedValue: 5_000_000 }), false],
  // The guard that protects whole SOURCES: publicationDateIsEstimated means
  // the date is when this platform first saw the row, not when the entity
  // published it. Measuring a window from an ingest timestamp would reject
  // rows for having been imported late.
  ["11 天但发布日期是「估」的 —— 保留", row({ submissionDeadline: "2026-09-12", publicationDateIsEstimated: true }), false],
  ["没有交标日期 —— 保留", row({ submissionDeadline: undefined }), false],
  ["交标日期解析不了 —— 保留", row({ submissionDeadline: "not a date" }), false],
];

let failures = 0;
console.log(`投标窗口闸门（阈值 ${SHORT_BID_WINDOW_DAYS} 个自然日）\n`);
for (const [name, candidate, expected] of CASES) {
  const actual = hasShortBidWindow(candidate);
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `（期望 ${expected}，实际 ${actual}）`}`);
}


// ─────────────────────────────────────────────────────────────────────────
// The manual-edit gate (lib/db/bid-window-gate.ts). Peru's deadlines are
// typed in by hand, so at import there is no window to measure and the rule
// has a second home — on the save that creates one.
//
// The restore direction is the half that needs pinning. A one-way rule makes
// a typo permanent: enter 09-05 for 09-25, the row is excluded, fix the date
// and it stays excluded with nothing to show why.
// ─────────────────────────────────────────────────────────────────────────
import { decideBidWindow } from "@/lib/db/bid-window-gate";
import { SHORT_BID_WINDOW_EXCLUSION_REASON } from "@/lib/relevance";

console.log("\n手动补交标日期时的闸门");

const edit = (patch: Record<string, unknown>) =>
  decideBidWindow({
    currentTier: "standard",
    currentReason: null,
    manuallyOverridden: false,
    estimatedValue: null,
    publicationDate: "2026-09-01",
    publicationDateIsEstimated: false,
    submissionDeadline: "2026-09-20",
    ...patch,
  } as Parameters<typeof decideBidWindow>[0]);

const EDIT_CASES: [string, ReturnType<typeof decideBidWindow>, string | null][] = [
  ["补了 11 天的交标日期 → 自动排除", edit({ submissionDeadline: "2026-09-12" }), "exclude"],
  ["补了 19 天的交标日期 → 不动", edit({ submissionDeadline: "2026-09-20" }), null],
  [
    "打错日期后改回来 → 自动恢复常规",
    edit({ currentTier: "excluded", currentReason: SHORT_BID_WINDOW_EXCLUSION_REASON, submissionDeadline: "2026-09-25" }),
    "restore",
  ],
  [
    "因别的原因被排除的，不会被这条规则放回来",
    edit({ currentTier: "excluded", currentReason: { zh: "该项目属于日常性服务采购…", en: "", es: "" }, submissionDeadline: "2026-09-25" }),
    null,
  ],
  [
    "管理员锁定了相关度 → 一律不动",
    edit({ manuallyOverridden: true, submissionDeadline: "2026-09-12" }),
    null,
  ],
  ["已披露金额 → 不动", edit({ estimatedValue: 5_000_000, submissionDeadline: "2026-09-12" }), null],
  ["中型项目 → 不动", edit({ currentTier: "significant", submissionDeadline: "2026-09-12" }), null],
  ["发布日期是「估」的 → 不动", edit({ publicationDateIsEstimated: true, submissionDeadline: "2026-09-12" }), null],
  ["清掉交标日期后，之前的排除也撤销", edit({ currentTier: "excluded", currentReason: SHORT_BID_WINDOW_EXCLUSION_REASON, submissionDeadline: null }), "restore"],
];

for (const [name, decision, expected] of EDIT_CASES) {
  const actual = decision?.action ?? null;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `（期望 ${expected}，实际 ${actual}）`}`);
}

if (failures > 0) {
  console.log(`\n${failures} 项没过。`);
  process.exit(1);
}
console.log("\n全部通过。");
