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

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY 没有设置。见 .env.example。");
    process.exit(1);
  }
  const stripe = new Stripe(secretKey);

  console.log(
    PROMOTION.active
      ? `当前为「${PROMOTION.label}」价格，下面校验的是优惠价。\n`
      : `当前为常规价格。\n`,
  );

  const plans: PaidPlan[] = ["professional", "enterprise"];
  const intervals: BillingInterval[] = ["monthly", "semiannual", "annual"];
  const seen = new Map<string, string>();
  let problems = 0;

  for (const plan of plans) {
    for (const interval of intervals) {
      const label = `${PLAN_LABELS[plan]} ${INTERVAL_LABELS[interval]}`;
      const envName = ENV_NAMES[plan][interval];
      const priceId = process.env[envName]?.trim();
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
        console.log(`❌ ${label.padEnd(12)} ${priceId}\n     Stripe 查不到：${error instanceof Error ? error.message : String(error)}`);
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
