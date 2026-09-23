/** Read-only verification of the three monthly Stripe Prices. */
import Stripe from "stripe";
import { PLAN_PRICES_USD, type PaidPlan } from "../lib/billing-catalog";

const names: Record<PaidPlan, string> = {
  basic: "STRIPE_PRICE_BASIC_MONTHLY",
  professional: "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
  enterprise: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
};

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY 未配置");
  const stripe = new Stripe(secret);
  let failures = 0;
  for (const plan of Object.keys(names) as PaidPlan[]) {
    const id = process.env[names[plan]];
    if (!id) { console.error(`${names[plan]} 未配置`); failures++; continue; }
    const price = await stripe.prices.retrieve(id);
    const amount = PLAN_PRICES_USD[plan].monthly * 100;
    const valid = price.active && price.currency === "usd" && price.unit_amount === amount && price.recurring?.interval === "month" && price.recurring.interval_count === 1;
    if (!valid) { console.error(`${plan}: Stripe Price 与 $${PLAN_PRICES_USD[plan].monthly}/月不一致`); failures++; }
    else console.log(`${plan}: $${PLAN_PRICES_USD[plan].monthly}/月，已核对`);
  }
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
