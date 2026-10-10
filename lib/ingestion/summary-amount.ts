/**
 * The budget a tender's 一句话总结 states, read back as a number.
 *
 * User, 2026-10-10: 一句话总结里面提到的项目预算金额 vs 我自己手动填写的预算
 * 金额，如果有差异，把我的替换成一句话总结的金额. The summary is written by
 * document analysis from the bid documents themselves, so where it names a
 * budget it is the better source than an amount typed in by hand.
 *
 * Deliberately conservative — a wrong amount is worse than none:
 *   - an amount counts only with a currency attached (R$ 3,2 milhões,
 *     2,660万雷亚尔, US$5.2M); "120台", "23公里" never qualify;
 *   - amounts right after 保证金 / 罚款 / 注册资本 / 营业额 / 业绩 … are
 *     requirements on the bidder, not the budget, and are skipped;
 *   - a summary naming two or more different budgets ("两个标段分别为…") is
 *     reported as ambiguous and never used — including when only the last
 *     figure carries the currency ("1,200万和800万美元").
 */

export type SummaryAmount = { value: number; currency: string; text: string };
export type SummaryAmountResult = { kind: "none" } | { kind: "one"; amount: SummaryAmount } | { kind: "ambiguous"; amounts: SummaryAmount[] };

/** The peso a bare "比索" / "$" means in each country. */
const PESO_BY_COUNTRY: Record<string, string> = {
  Mexico: "MXN",
  Colombia: "COP",
  Chile: "CLP",
  Argentina: "ARS",
  "Dominican Republic": "DOP",
};

const SUFFIX_CURRENCIES: [RegExp, string | "peso"][] = [
  [/^(?:巴西)?雷亚尔/, "BRL"],
  [/^(?:美元|美金)/, "USD"],
  [/^墨西哥比索/, "MXN"],
  [/^哥伦比亚比索/, "COP"],
  [/^智利比索/, "CLP"],
  [/^阿根廷比索/, "ARS"],
  [/^多米尼加比索/, "DOP"],
  [/^比索/, "peso"],
  [/^(?:新)?索尔/, "PEN"],
  [/^玻利维亚诺/, "BOB"],
  [/^欧元/, "EUR"],
  [/^(?:USD|US\$|dólares|dolares)/i, "USD"],
  [/^(?:BRL|reais)/i, "BRL"],
  [/^MXN/i, "MXN"],
  [/^COP/i, "COP"],
  [/^CLP/i, "CLP"],
  [/^ARS/i, "ARS"],
  [/^DOP/i, "DOP"],
  [/^PEN/i, "PEN"],
  [/^BOB/i, "BOB"],
  [/^EUR/i, "EUR"],
];

const PREFIX_CURRENCIES: [RegExp, string | "peso"][] = [
  [/(?:US\$|USD|U\$S)\s*$/i, "USD"],
  [/(?:R\$|BRL)\s*$/i, "BRL"],
  [/(?:MXN|MX\$)\s*$/i, "MXN"],
  [/(?:COP|COL\$)\s*$/i, "COP"],
  [/CLP\s*$/i, "CLP"],
  [/ARS\s*$/i, "ARS"],
  [/(?:DOP|RD\$)\s*$/i, "DOP"],
  [/(?:PEN|S\/\.?)\s*$/i, "PEN"],
  [/(?:BOB|Bs\.?)\s*$/i, "BOB"],
  [/(?:EUR|€)\s*$/i, "EUR"],
  [/\$\s*$/, "peso"],
];

/** Words that make the amount a requirement on the bidder, not the budget, when they sit just before it. */
const NOT_BUDGET = /(保证金|担保|履约|投标保函|罚款|罚金|违约金|注册资本|资本金|净资产|营业额|营收|业绩|经验|类似项目|单项合同|保险金额)[^，。；,;]{0,8}$/;

const UNITS: [RegExp, number][] = [
  [/^\s*十亿/, 1e9],
  [/^\s*亿/, 1e8],
  [/^\s*千万/, 1e7],
  [/^\s*百万/, 1e6],
  [/^\s*万/, 1e4],
  [/^\s*(?:bilh(?:ões|oes|ão|ao)|billion|bn)\b/i, 1e9],
  [/^\s*(?:milh(?:ões|oes|ão|ao)|millones|mill[oó]n|million|mm|m)\b/i, 1e6],
  [/^\s*(?:mil)\b/i, 1e3],
];

/** "26.601.440,65", "26,601,440.65", "3,2", "1.04" → number. */
function parseNumber(raw: string): number | null {
  const text = raw.replace(/[，]/g, ",").replace(/\s/g, "");
  if (!/\d/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both: whichever comes last is the decimal mark.
    normalized = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Only commas: thousands when every group after one is three digits.
    normalized = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3}){2,}$/.test(text) ? text.replace(/\./g, "") : text;
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const NUMBER = /\d[\d.,，]*\d|\d/g;

export function amountsInSummary(summary: string | null | undefined, country: string): SummaryAmountResult {
  const text = (summary ?? "").normalize("NFKC");
  const found: SummaryAmount[] = [];
  // A figure with a money-sized unit but no currency of its own — usually
  // the first of "1,200万和800万美元". Its presence makes the summary
  // ambiguous rather than letting the second figure stand alone.
  let unpricedFigures = 0;
  for (const match of text.matchAll(NUMBER)) {
    const start = match.index!;
    const end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 12), start);
    // A digit glued to letters is a code or a model number (BR381, 22.9kV), not money.
    if (/[A-Za-z]$/.test(before) && !/(?:\$|R\$|US\$|S\/|Bs)\s*$/i.test(before)) continue;
    let rest = text.slice(end);
    let multiplier = 1;
    for (const [pattern, factor] of UNITS) {
      const unit = pattern.exec(rest);
      if (unit) {
        multiplier = factor;
        rest = rest.slice(unit[0].length);
        break;
      }
    }
    let currency: string | "peso" | null = null;
    const suffix = rest.replace(/^\s+/, "");
    for (const [pattern, code] of SUFFIX_CURRENCIES) {
      if (pattern.test(suffix)) {
        currency = code;
        break;
      }
    }
    if (!currency) {
      for (const [pattern, code] of PREFIX_CURRENCIES) {
        if (pattern.test(before)) {
          currency = code;
          break;
        }
      }
    }
    if (!currency) {
      if (multiplier >= 1e4 && !NOT_BUDGET.test(text.slice(Math.max(0, start - 20), start))) unpricedFigures += 1;
      continue;
    }
    if (currency === "peso") currency = PESO_BY_COUNTRY[country] ?? null;
    if (!currency) continue;
    if (NOT_BUDGET.test(text.slice(Math.max(0, start - 20), start))) continue;
    const number = parseNumber(match[0]);
    if (number === null) continue;
    found.push({ value: Math.round(number * multiplier * 100) / 100, currency, text: text.slice(Math.max(0, start - 4), Math.min(text.length, end + 8)).trim() });
  }
  if (found.length === 0) return { kind: "none" };
  // The same figure twice (总价 X，即 X) is still one budget.
  const distinct = found.filter((amount, index) => found.findIndex((other) => other.currency === amount.currency && Math.abs(other.value - amount.value) <= amount.value * 0.005) === index);
  return distinct.length === 1 && unpricedFigures === 0 ? { kind: "one", amount: distinct[0] } : { kind: "ambiguous", amounts: distinct };
}
