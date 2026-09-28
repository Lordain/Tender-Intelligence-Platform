/**
 * Read-only verification of the Stripe Prices: three monthly (required) and
 * three annual (optional — until they are set, annual is sold by
 * international wire only).
 */
import Stripe from "stripe";
import { INTERVAL_UNIT_ZH, PLAN_PRICES_USD, type PaidInterval, type PaidPlan } from "../lib/billing-catalog";

const names: Record<PaidPlan, Record<PaidInterval, string>> = {
  basic: { monthly: "STRIPE_PRICE_BASIC_MONTHLY", annual: "STRIPE_PRICE_BASIC_ANNUAL" },
  professional: { monthly: "STRIPE_PRICE_PROFESSIONAL_MONTHLY", annual: "STRIPE_PRICE_PROFESSIONAL_ANNUAL" },
  enterprise: { monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY", annual: "STRIPE_PRICE_ENTERPRISE_ANNUAL" },
};

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY 未配置");
  const stripe = new Stripe(secret);
  let failures = 0;
  for (const plan of Object.keys(names) as PaidPlan[]) {
    for (const interval of ["monthly", "annual"] as const) {
      const variable = names[plan][interval];
      const label = `${plan} $${PLAN_PRICES_USD[plan][interval]}/${INTERVAL_UNIT_ZH[interval]}`;
      const id = process.env[variable];
      if (!id) {
        if (interval === "monthly") { console.error(`${variable} 未配置`); failures++; }
        else console.log(`${label}：${variable} 未配置（年付暂时只能国际电汇）`);
        continue;
      }
      const price = await stripe.prices.retrieve(id);
      const valid = price.active && price.currency === "usd" && price.unit_amount === PLAN_PRICES_USD[plan][interval] * 100
        && price.recurring?.interval === (interval === "annual" ? "year" : "month") && price.recurring.interval_count === 1;
      if (!valid) { console.error(`${label}：Stripe Price 不一致`); failures++; }
      else console.log(`${label}，已核对`);
    }
  }
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
