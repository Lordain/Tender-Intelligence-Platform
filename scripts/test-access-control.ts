/**
 * Regression suite for the three billing rules that decide whether an account
 * can see anything: which Stripe statuses this database stores, whether a row
 * still grants access, and which row wins when an account has more than one.
 *
 * All three are pure functions in lib/access-control.ts, so this runs anywhere
 * — no Supabase, no Stripe SDK, no network.
 *
 * Usage:
 *   npm run test:access-control
 *
 * Every case here is a bug that reached the branch at least once. Add the next
 * one before fixing it.
 */
import {
  isSubscriptionEntitled,
  selectPreferredSubscription,
  subscriptionStatusFromStripe,
  PAYMENT_GRACE_DAYS,
} from "../lib/access-control";

const NOW = Date.parse("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// Stripe status mapping. The permissive fallback this replaced ("anything not
// active/trialing/canceled is past_due") granted the three-day grace window to
// subscriptions that had never taken a payment at all.
// ---------------------------------------------------------------------------
check("active stays active", subscriptionStatusFromStripe("active"), "active");
check("trialing stays trialing", subscriptionStatusFromStripe("trialing"), "trialing");
check("past_due stays past_due", subscriptionStatusFromStripe("past_due"), "past_due");
check("canceled becomes cancelled", subscriptionStatusFromStripe("canceled"), "cancelled");
// The four that used to fall through to past_due:
check("incomplete grants nothing", subscriptionStatusFromStripe("incomplete"), "cancelled");
check("incomplete_expired grants nothing", subscriptionStatusFromStripe("incomplete_expired"), "cancelled");
check("unpaid grants nothing", subscriptionStatusFromStripe("unpaid"), "cancelled");
check("paused grants nothing", subscriptionStatusFromStripe("paused"), "cancelled");
check("an unknown future status grants nothing", subscriptionStatusFromStripe("something_new"), "cancelled");

// ---------------------------------------------------------------------------
// Entitlement.
// ---------------------------------------------------------------------------
check("active inside its period", isSubscriptionEntitled("active", iso(-10), iso(20), NOW), true);
check("active past its period", isSubscriptionEntitled("active", iso(-40), iso(-1), NOW), false);
check("active with no period end", isSubscriptionEntitled("active", iso(-10), null, NOW), true);
check("trialing inside its period", isSubscriptionEntitled("trialing", iso(-2), iso(5), NOW), true);
check("cancelled never counts", isSubscriptionEntitled("cancelled", iso(-1), iso(30), NOW), false);

check(
  `past_due on day ${PAYMENT_GRACE_DAYS - 1} of grace`,
  isSubscriptionEntitled("past_due", iso(-(PAYMENT_GRACE_DAYS - 1)), iso(27), NOW),
  true,
);
check(
  `past_due once grace has run out`,
  isSubscriptionEntitled("past_due", iso(-(PAYMENT_GRACE_DAYS + 1)), iso(27), NOW),
  false,
);
// Legacy rows predate current_period_start, so they cannot prove when the
// failed cycle began. Fail closed rather than granting an open-ended grace.
check("past_due with no period start", isSubscriptionEntitled("past_due", null, iso(27), NOW), false);
check("past_due with an unparseable start", isSubscriptionEntitled("past_due", "not a date", iso(27), NOW), false);
// The reason grace is anchored on the START, not the end: a failed renewal
// leaves current_period_end a whole billing cycle in the future.
check(
  "past_due is not rescued by a far-future period end",
  isSubscriptionEntitled("past_due", iso(-10), iso(20), NOW),
  false,
);

// ---------------------------------------------------------------------------
// Which row wins. The unique index in migration 0027 only covers
// active/trialing, so a past_due row can sit beside a live one and an
// unordered .find() would pick either.
// ---------------------------------------------------------------------------
const livePaid = { status: "active", current_period_start: iso(-5), current_period_end: iso(25), created_at: iso(-5) };
const gracePastDue = { status: "past_due", current_period_start: iso(-1), current_period_end: iso(29), created_at: iso(-1) };
const olderPaid = { status: "active", current_period_start: iso(-40), current_period_end: iso(25), created_at: iso(-40) };
const lapsed = { status: "active", current_period_start: iso(-60), current_period_end: iso(-30), created_at: iso(-60) };

check("nothing to choose from", selectPreferredSubscription([], NOW), undefined);
check("only expired rows", selectPreferredSubscription([lapsed], NOW), undefined);
check(
  "a paid row outranks a past_due one even when the past_due row is newer",
  selectPreferredSubscription([gracePastDue, livePaid], NOW),
  livePaid,
);
check(
  "order of the input does not matter",
  selectPreferredSubscription([livePaid, gracePastDue], NOW),
  livePaid,
);
check(
  "among equals the newest row wins",
  selectPreferredSubscription([olderPaid, livePaid], NOW),
  livePaid,
);
check(
  "an expired paid row does not outrank a past_due row still in grace",
  selectPreferredSubscription([lapsed, gracePastDue], NOW),
  gracePastDue,
);
check(
  "a row with no created_at sorts last rather than throwing",
  selectPreferredSubscription([{ ...livePaid, created_at: null }, olderPaid], NOW),
  olderPaid,
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) {
  console.log(`${failed} FAILURE(S) — see above.`);
  process.exit(1);
}
