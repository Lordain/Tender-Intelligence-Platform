/**
 * How long the contract a tender's 一句话总结 describes runs, in months.
 *
 * User, 2026-10-10: 一句话总结里面如果识别到超长期项目（2年），就归为最少中型
 * 项目，3年调整成大项目. Read by applySummaryDurationFloor (lib/relevance.ts).
 *
 * A figure counts only when the summary says it is the contract's own term —
 * 工期 / 为期 / 合同期 / 服务期 / 运营期 / 租赁期 / 特许经营 … right before it, or
 * "期" / "特许经营" / "运营" … right after ("3年期", "30年特许经营"). Never:
 *   - 质保 / 保修 / 担保 periods, which are a warranty, not the job;
 *   - 近3年 / 过去5年 / 经验 / 业绩 — the bidder's track record;
 *   - 投标有效期 / 报价有效期 — how long an offer stays open;
 *   - a calendar year (2026年) or a month name (3月).
 * Several figures: the longest wins ("建设期2年、运营期25年" → 25 years).
 */

const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function chineseNumber(text: string): number | null {
  if (text === "十") return 10;
  const tens = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(text);
  if (tens) return (tens[1] ? CHINESE_DIGITS[tens[1]] : 1) * 10 + (tens[2] ? CHINESE_DIGITS[tens[2]] : 0);
  return text.length === 1 && CHINESE_DIGITS[text] !== undefined ? CHINESE_DIGITS[text] : null;
}

const FIGURE = /(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})\s*(年|个月)/g;
const TERM_BEFORE = /(工期|为期|期限|合同期|服务期|运营期|运维期|维护期|维保期|租期|租赁期|特许经营|经营期|执行期|实施期|建设期|履约期|周期|持续)[^，。；,;]{0,6}$/;
const TERM_AFTER = /^(期|的?(特许经营|运营|运维|维护|维保|租赁|服务|合同|工期|框架合同))/;
const NOT_TERM = /(质保|保修|保固|质量保证|担保|保函|经验|业绩|近|过去|最近|成立|注册|满|投标有效|报价有效|有效期)[^，。；,;]{0,6}$/;

export function contractMonthsInSummary(summary: string | null | undefined): number | null {
  const text = (summary ?? "").normalize("NFKC");
  let longest: number | null = null;
  for (const match of text.matchAll(FIGURE)) {
    const start = match.index!;
    const before = text.slice(Math.max(0, start - 10), start);
    const after = text.slice(start + match[0].length);
    // 2026年 is a date, not a term; so is the year in "2026年3月".
    if (/\d$/.test(before)) continue;
    const amount = /^\d/.test(match[1]) ? Number(match[1]) : chineseNumber(match[1]);
    if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount >= 100) continue;
    if (NOT_TERM.test(before)) continue;
    if (!TERM_BEFORE.test(before) && !TERM_AFTER.test(after)) continue;
    const months = match[2] === "年" ? amount * 12 : amount;
    if (longest === null || months > longest) longest = months;
  }
  return longest;
}
