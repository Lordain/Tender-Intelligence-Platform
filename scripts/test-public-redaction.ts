import { estimatedValueBand, toMonthPrecision, toMonthPrecisionOptional } from "../lib/public-redaction";
import { formatDate } from "../lib/format";

let ran = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  ran += 1;
  if (actual !== expected) failures.push(`${name}：期望 ${String(expected)}，实际 ${String(actual)}`);
}

// --- Value bands -----------------------------------------------------------
// Boundaries are checked on both sides, because an off-by-one at a band edge
// is the one bug here that no reviewer would notice: the page still renders a
// plausible range, just the wrong one.
check("刚好低于 1M", estimatedValueBand(999_999, "USD"), "低于 $1M USD");
check("正好 1M 进入下一档", estimatedValueBand(1_000_000, "USD"), "$1M – $5M USD");
check("4,999,999 仍在 1–5M", estimatedValueBand(4_999_999, "USD"), "$1M – $5M USD");
check("正好 5M", estimatedValueBand(5_000_000, "USD"), "$5M – $10M USD");
check("正好 10M", estimatedValueBand(10_000_000, "USD"), "$10M – $50M USD");
check("正好 50M", estimatedValueBand(50_000_000, "USD"), "$50M – $100M USD");
check("正好 100M", estimatedValueBand(100_000_000, "USD"), "$100M – $500M USD");
check("499,999,999 仍在 100–500M", estimatedValueBand(499_999_999, "USD"), "$100M – $500M USD");
check("正好 500M 进入顶档", estimatedValueBand(500_000_000, "USD"), "$500M USD 以上");
check("远超顶档", estimatedValueBand(9_000_000_000, "USD"), "$500M USD 以上");
check("零金额", estimatedValueBand(0, "USD"), "低于 $1M USD");

// A non-USD amount is banded on its CONVERTED value, not its face value —
// 200,000,000 MXN is ~$11.8M, so it must not land in the $100M–$500M band.
check("MXN 按折算后金额分档", estimatedValueBand(200_000_000, "MXN"), "$10M – $50M USD");

// Both "no amount" cases must read as 未公开 rather than as a band: a band
// implies we know the figure, and for an unconvertible currency we do not.
check("没有金额", estimatedValueBand(undefined, "USD"), null);
check("没有汇率的币种", estimatedValueBand(1_000_000, "XYZ"), null);
check("缺少币种", estimatedValueBand(1_000_000, undefined), null);

// --- Date precision --------------------------------------------------------
check("纯日期截断", toMonthPrecision("2026-09-18"), "2026-09");
check("带时间戳的日期截断", toMonthPrecision("2026-09-18T00:00:00.000Z"), "2026-09");
check("一月份补零保留", toMonthPrecision("2026-01-01"), "2026-01");
// A UTC-midnight value on the 1st is the case that breaks if anyone
// reimplements this via Date in a runtime behind UTC — it would roll back
// into the previous month. See the comment in lib/public-redaction.ts.
check("月初不回退到上个月", toMonthPrecision("2026-03-01T00:00:00.000Z"), "2026-03");
check("无法识别的值原样返回", toMonthPrecision("未提供"), "未提供");
check("可选字段的 undefined", toMonthPrecisionOptional(undefined), undefined);
check("可选字段的日期", toMonthPrecisionOptional("2026-12-31"), "2026-12");

// --- The formatter must not invent a day back -----------------------------
// The whole point of truncating server-side is lost if the view then renders
// "2026年9月1日" — a day we deliberately removed, and the wrong one.
ran += 1;
if (formatDate("2026-09", "zh").includes("日")) {
  failures.push(`年月日期不应显示"日"：${formatDate("2026-09", "zh")}`);
}
ran += 1;
if (!formatDate("2026-09-18", "zh").includes("18")) {
  failures.push(`完整日期应保留日：${formatDate("2026-09-18", "zh")}`);
}
ran += 1;
if (formatDate("2026-09", "en").includes("1,")) {
  failures.push(`英文年月日期不应显示"1"：${formatDate("2026-09", "en")}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  访客字段脱敏（金额分档、日期截到年月），全部 ${ran} 项通过`);
