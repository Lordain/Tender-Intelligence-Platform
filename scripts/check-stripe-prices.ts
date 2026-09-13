/**
 * Does every STRIPE_PRICE_* variable point at a Stripe Price that charges
 * what this codebase says it charges?
 *
 * This exists because the card path has no safety net. Checkout hands
 * `line_items: [{ price: <the env var> }]` straight to Stripe, so a variable
 * pointing at the wrong Price bills the wrong amount with nothing failing and
 * nothing logged — the customer is simply charged something other than the
 * page's number. The bank-transfer path already reconciles its quote against
 * the Price and refuses on a mismatch (app/api/stripe/checkout/route.ts); the
 * card path cannot, because there is no second amount to compare.
 *
 * Six variables across two plans and three intervals is exactly the shape
 * where a copy-paste puts the semiannual id under `annual`. Both prices are
 * real, both Prices exist, Stripe is perfectly happy, and the customer pays
 * the six-month rate for a year of access. That is the failure this catches,
 * and it is silent every other way.
 *
 * Run it after changing any price — a promotion starting, a promotion ending,
 * a plan repriced. Read-only: retrieves prices, writes nothing.
 *
 * Usage: npm run check:stripe-prices
 *
 * A sandbox and the live account each hold their own six Prices under their
 * own ids, and a key only ever sees its own account's — so a green run is only
 * meaningful next to the account it was green for. Both the key's mode and the
 * account are printed on every run for that reason: point STRIPE_SECRET_KEY at
 * the account whose prices you mean to check, and read the header to confirm
 * you checked the one you meant.
 */
import Stripe from "stripe";
import { BILLING_MONTHS, PLAN_LIST_PRICES_USD, PLAN_PRICES_USD, PROMOTION, type PaidPlan } from "../lib/billing-catalog";
import type { BillingInterval } from "../lib/access-control";

// The env vars are read here rather than imported from lib/stripe.ts, which
// starts with `import "server-only"` and throws outside a Next runtime. The
// names are duplicated; a typo shows up as "变量没有设置", which is the loud
// direction to be wrong in.
const ENV_NAMES: Record<PaidPlan, Record<BillingInterval, string>> = {
  professional: {
    monthly: "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
    semiannual: "STRIPE_PRICE_PROFESSIONAL_SEMIANNUAL",
    annual: "STRIPE_PRICE_PROFESSIONAL_ANNUAL",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    semiannual: "STRIPE_PRICE_ENTERPRISE_SEMIANNUAL",
    annual: "STRIPE_PRICE_ENTERPRISE_ANNUAL",
  },
};

const PLAN_LABELS: Record<PaidPlan, string> = { professional: "个人版", enterprise: "企业版" };
const INTERVAL_LABELS: Record<BillingInterval, string> = { monthly: "月付", semiannual: "半年", annual: "年付" };

/** Stripe expresses a six-month plan as month×6 and a year as year×1 or month×12; compare in months either way. */
function recurringMonths(price: Stripe.Price): number | null {
  const r = price.recurring;
  if (!r) return null;
  const count = r.interval_count ?? 1;
  if (r.interval === "month") return count;
  if (r.interval === "year") return count * 12;
  if (r.interval === "week") return count / 4.345;
  if (r.interval === "day") return count / 30.44;
  return null;
}

/**
 * Stripe secret keys are scoped to one mode; Price ids are not. A live-mode id
 * is shaped exactly like a test-mode one, and retrieving it with the other
 * mode's key returns "No such price" — byte for byte the error a typo gives.
 * The key's prefix is the only thing on hand that separates those two, so say
 * it out loud before the first retrieve rather than leaving the reader to
 * guess which of the two failures they are looking at.
 */
function describeKeyMode(secretKey: string): { mode: "test" | "live" | "unknown"; label: string } {
  if (/^(sk|rk)_test_/.test(secretKey)) return { mode: "test", label: "测试模式（sk_test / rk_test）" };
  if (/^(sk|rk)_live_/.test(secretKey)) return { mode: "live", label: "生产模式（sk_live / rk_live）" };
  return { mode: "unknown", label: "前缀不认识，无法判断模式" };
}

/**
 * All six missing at once is not six mistakes. Either the key is in the other
 * mode from the Prices, or it belongs to another account — and both look the
 * same from a single failed retrieve. Listing what this key *can* see settles
 * it: the ids that come back are the ones the key's mode and account actually
 * hold, so either the six are in there (and the env vars are wrong) or they
 * are not (and the key is).
 */
async function explainAllMissing(stripe: Stripe, keyLabel: string): Promise<void> {
  console.log("六个全部查不到——这不是六个 id 都打错了，是这把 key 看不到它们。\n");
  console.log(`当前 key：${keyLabel}`);

  try {
    const list = await stripe.prices.list({ limit: 20 });
    if (list.data.length === 0) {
      console.log("\n这把 key 底下一个 Price 都没有——价格建在了另一个模式，或者另一个账户。");
    } else {
      console.log(`\n这把 key 能看到的 Price（最多 20 条）：`);
      for (const price of list.data) {
        const months = recurringMonths(price);
        const cycle = months === null ? "一次性" : `${months} 个月`;
        const mode = price.livemode ? "生产" : "测试";
        const archived = price.active ? "" : "  [已归档]";
        console.log(`  ${price.id}  $${((price.unit_amount ?? 0) / 100).toLocaleString("en-US")} / ${cycle}  ${mode}${archived}`);
      }
      console.log("\n上面有 .env 里那六个 id 吗？");
      console.log("  有 → 那是别的问题，把这一段贴出来。");
      console.log("  没有 → 价格建在了另一个模式或另一个账户，按下面修。");
      // A Stripe object id carries its account's own suffix, so two ids from
      // the same account share a tail that ids from another account do not.
      // That distinguishes "wrong mode, same account" from "wrong account"
      // without a second key to try.
      const visibleTail = list.data[0]?.id.slice(-16, -6);
      if (visibleTail) {
        console.log(`\n提示：这把 key 下的 id 都带 "${visibleTail}" 这一段（账户自己的标识）。`);
        console.log("  .env 里那六个也带这一段 → 同一个账户，只是模式不对。");
        console.log("  带的是别的 → 是另一个账户的价格，换 key 换不出来。");
      }
    }
  } catch (error) {
    console.log(`\n连列 Price 都失败了：${error instanceof Error ? error.message : String(error)}`);
    console.log("这把 key 大概率是无效的、被吊销了，或者权限不够。");
  }

  console.log("\n怎么修：");
  console.log("  1. 打开 Stripe 后台，先看右上角「测试模式 / Test mode」开关现在是开还是关");
  console.log("  2. 切到和上面这把 key 相同的模式，进 Products，找那六个价格");
  console.log("  3. 找不到 = 价格建在了另一个模式。二选一：");
  console.log("     a. 本地自测：把本地 .env.local 的 STRIPE_SECRET_KEY 换成价格所在模式的 key");
  console.log("     b. 准备上线：在生产模式（sk_live）下重建这六个 Price，再更新环境变量");
  console.log("\n注意：Vercel 生产环境用的是 sk_live，所以最终这六个 Price 必须存在于生产模式。");
  console.log("测试模式建的价格，生产环境一律查不到。");
}

/**
 * Which Stripe account did this run actually check? A sandbox and the live
 * account hold separate Prices under separate ids, so "6 个价格全部与代码一致"
 * is only meaningful next to the account it was true of.
 */
async function describeAccount(stripe: Stripe): Promise<string> {
  try {
    // retrieveCurrent, not retrieve: retrieve() takes the id of some OTHER
    // account and has no zero-argument overload. This one is GET /v1/account —
    // the account the key itself belongs to, which is the only one being asked
    // about here.
    const account = await stripe.accounts.retrieveCurrent();
    const name = account.settings?.dashboard?.display_name;
    return `${account.id}${name ? `（${name}）` : ""}`;
  } catch {
    return "这把 key 读不到账户信息（受限 key 很正常，不影响校验）";
  }
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY 没有设置。见 .env.example。");
    process.exit(1);
  }
  const stripe = new Stripe(secretKey);
  const keyMode = describeKeyMode(secretKey);

  console.log(`Stripe key：${keyMode.label}`);
  console.log(`Stripe 账户：${await describeAccount(stripe)}`);
  console.log(
    PROMOTION.active
      ? `当前为「${PROMOTION.label}」价格，下面校验的是优惠价。\n`
      : `当前为常规价格。\n`,
  );

  const plans: PaidPlan[] = ["professional", "enterprise"];
  const intervals: BillingInterval[] = ["monthly", "semiannual", "annual"];
  const seen = new Map<string, string>();
  let problems = 0;
  let missing = 0;
  let checked = 0;

  for (const plan of plans) {
    for (const interval of intervals) {
      const label = `${PLAN_LABELS[plan]} ${INTERVAL_LABELS[interval]}`;
      const envName = ENV_NAMES[plan][interval];
      const priceId = process.env[envName]?.trim();
      checked += 1;
      const expectedUsd = PLAN_PRICES_USD[plan][interval];
      const listUsd = PLAN_LIST_PRICES_USD[plan][interval];

      if (!priceId) {
        problems += 1;
        console.log(`❌ ${label.padEnd(12)} ${envName} 没有设置`);
        continue;
      }

      // The same id under two variables is the copy-paste this check exists for.
      const alreadyUsedBy = seen.get(priceId);
      if (alreadyUsedBy) {
        problems += 1;
        console.log(`❌ ${label.padEnd(12)} ${priceId}\n     和「${alreadyUsedBy}」用了同一个 Price——两档收同样的钱`);
        continue;
      }
      seen.set(priceId, label);

      let price: Stripe.Price;
      try {
        price = await stripe.prices.retrieve(priceId);
      } catch (error) {
        problems += 1;
        // Read `code` off the error object rather than narrowing on
        // Stripe.errors.StripeInvalidRequestError: the class name is a moving
        // target across stripe-node majors, and this survives either way.
        const stripeCode =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : "";
        const isMissing = stripeCode === "resource_missing";
        if (isMissing) missing += 1;
        console.log(`❌ ${label.padEnd(12)} ${priceId}`);
        console.log(`     Stripe 查不到：${error instanceof Error ? error.message : String(error)}`);
        if (isMissing) console.log(`     这把 key 是${keyMode.label}——Price 可能建在另一个模式里`);
        continue;
      }

      const actualUsd = (price.unit_amount ?? 0) / 100;
      const months = recurringMonths(price);
      const issues: string[] = [];

      if (price.currency !== "usd") issues.push(`币种是 ${price.currency.toUpperCase()}，不是 USD`);
      if (actualUsd !== expectedUsd) {
        issues.push(
          `金额是 $${actualUsd.toLocaleString("en-US")}，代码里写的是 $${expectedUsd.toLocaleString("en-US")}` +
            (actualUsd === listUsd ? `（这是原价——环境变量可能还指着旧的 Price）` : ""),
        );
      }
      if (months !== BILLING_MONTHS[interval]) {
        issues.push(`计费周期是 ${months ?? "非订阅"} 个月，应该是 ${BILLING_MONTHS[interval]} 个月`);
      }
      if (!price.active) issues.push("这个 Price 在 Stripe 里已归档");

      if (issues.length === 0) {
        console.log(`✅ ${label.padEnd(12)} $${actualUsd.toLocaleString("en-US")} / ${BILLING_MONTHS[interval]} 个月   ${priceId}`);
      } else {
        problems += 1;
        console.log(`❌ ${label.padEnd(12)} ${priceId}`);
        for (const issue of issues) console.log(`     ${issue}`);
      }
    }
  }

  console.log();
  if (missing > 0 && missing === checked) {
    await explainAllMissing(stripe, keyMode.label);
    console.log();
  }
  if (problems > 0) {
    console.error(`${problems} 项不符——先修好再上线，卡支付不会因此报错，只会按 Stripe 上的金额扣款。`);
    process.exit(1);
  }
  console.log("6 个价格全部与代码一致。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
