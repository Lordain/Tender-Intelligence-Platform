/**
 * Creates ONE Stripe Checkout Session for a live payment test, at a cheap
 * price, without touching production configuration.
 *
 * Why this exists rather than "swap the price ID in Vercel and buy normally":
 * app/api/stripe/checkout/route.ts deliberately refuses to open a session when
 * the Stripe Price disagrees with PLAN_PRICES_USD — a guard so a stale price
 * can never charge the old amount. Pointing the env var at a $1 price without
 * also editing the catalogue therefore 503s, and editing the catalogue puts
 * "$1" on the public pricing page for every visitor. Neither is a good trade
 * for one test.
 *
 * So this bypasses the checkout ROUTE and speaks to Stripe directly, carrying
 * the metadata the webhook needs. The webhook's own price lookup will not
 * recognise a throwaway price, so it falls back to subscription.metadata.plan
 * and logs `legacy price` — a documented path, not an accident (see
 * app/api/stripe/webhook/route.ts). What this proves is the half that code
 * review cannot: real card → webhook → database row → entitlement.
 *
 * What it does NOT cover, and nothing here pretends otherwise: /subscribe,
 * the checkout route's own price guard, and the MXN bank-transfer quote.
 *
 * Refuses a price above --max-amount (default 5) so a slip cannot charge $399,
 * and says so loudly if the price is one of the three configured production
 * prices. The cap is read in the PRICE'S OWN currency, not converted: a test
 * price is not always USD (a card that only does domestic MXN declines a USD
 * charge with currency_not_supported), and this script has no FX source, so
 * pretending to convert would be a guessed number. Nothing downstream cares
 * about currency — the webhook resolves the plan from metadata.
 *
 * Requires STRIPE_SECRET_KEY. Creates a real, payable session in whichever
 * mode that key belongs to.
 *
 * Usage:
 *   npm run create:test-checkout -- --user <uuid> --price price_XXX
 *   npm run create:test-checkout -- --user <uuid> --price price_XXX --plan professional
 *   npm run create:test-checkout -- --user <uuid> --price price_XXX --max-amount 25
 */
import Stripe from "stripe";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const PLANS = ["basic", "professional", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

async function main() {
  const userId = argValue("--user");
  const priceId = argValue("--price");
  const plan = (argValue("--plan") ?? "basic") as Plan;
  const maxAmount = Number(argValue("--max-amount") ?? argValue("--max-usd") ?? 5);
  const site = (argValue("--site") ?? "https://latintender.com").replace(/\/$/, "");

  if (!userId || !priceId) {
    console.error("用法：npm run create:test-checkout -- --user <uuid> --price price_XXX [--plan basic]");
    process.exit(1);
  }
  if (!PLANS.includes(plan)) {
    console.error(`--plan 只能是 ${PLANS.join(" / ")}，收到 "${plan}"`);
    process.exit(1);
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY 未配置。见 .env.example。什么都没有创建。");
    process.exit(1);
  }
  const stripe = new Stripe(secret);
  const mode = secret.startsWith("sk_live") ? "正式模式（会真的扣钱）" : "测试模式";

  const price = await stripe.prices.retrieve(priceId);
  const amount = (price.unit_amount ?? 0) / 100;

  // Every refusal below happens BEFORE a payable link exists.
  if (!price.active) { console.error(`${priceId} 不是 active 的。`); process.exit(1); }
  if (price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
    console.error(`${priceId} 不是「每月一次」的循环价格（拿到 ${price.recurring?.interval_count ?? "?"} × ${price.recurring?.interval ?? "one-time"}）。订阅测试需要月度循环价。`);
    process.exit(1);
  }
  if (amount > maxAmount) {
    console.error(`${priceId} 是 ${amount} ${price.currency.toUpperCase()}，超过上限 ${maxAmount}（上限按该价格自己的币种读，不换算）。\n这是防手滑的闸：测试要的是 1 块钱的价格，不是正价那三个。确要如此就加 --max-amount。`);
    process.exit(1);
  }
  const configured = [process.env.STRIPE_PRICE_BASIC_MONTHLY, process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY, process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY];
  if (configured.some((id) => id?.trim() === priceId)) {
    console.error(`${priceId} 正是当前配置里的生产价格之一。用它测等于按正价付款，而且 webhook 会走价格识别、走不到要验的 metadata 兜底那条路。换一个临时价。`);
    process.exit(1);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // The webhook reads user_id from the SUBSCRIPTION's metadata, and falls
    // back to the session's client_reference_id. Both are set: one field
    // silently missing is the difference between an opened account and a
    // charge nobody can attribute.
    client_reference_id: userId,
    subscription_data: {
      metadata: { user_id: userId, plan, billing_interval: "monthly" },
    },
    success_url: `${site}/account?test_checkout=done`,
    cancel_url: `${site}/pricing`,
  });

  console.log(`
────────────────────────────────────────────────────────
  Stripe    ${mode}
  价格      ${priceId} —— ${amount} ${price.currency.toUpperCase()} / 月
  计划      ${plan}（写进 subscription metadata）
  账号      ${userId}
  会话      ${session.id}
────────────────────────────────────────────────────────

用浏览器打开这个链接付款：

${session.url}

付完立刻做两件事：
  1. Stripe → Developers → Webhooks，确认 checkout.session.completed 返回 2xx
  2. npm run check:subscription-state -- --user ${userId}
     期望：订阅 1 行 ★ 生效、basic/active、role=subscriber

webhook 日志里会有一条 \`legacy price\` 警告 —— 那是对的，说明它认出这是临时价并回退读了 metadata。
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
