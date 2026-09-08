# Access control

The site runs in subscription mode. Every newly registered user receives a seven-day, no-card trial. Trial expiry is stored in `profiles.trial_ends_at`.

- `guest`: homepage and pricing are public; the tender list is read-only and all interactions ask the visitor to log in. Homepage-featured tenders remain public in full.
- `trial`: full tender, saved-item, account, and twice-daily notification access until `trial_ends_at`.
- `free`: trial expired and no active subscription. The tender list remains searchable, but detail pages and email delivery require a subscription.
- `subscriber`: full access. An enterprise owner may add two member accounts, producing three accounts total; every account owns its own notification preferences.

## Enterprise seats require the invitee's consent

An owner adding an address in 账户管理 creates an **invitation**, not a seat. It
grants nothing on its own:

1. The row is written with `status = 'pending'`, and an invitation email goes
   out if Resend is configured. The email carries no token and grants nothing;
   losing or forwarding it has no effect.
2. `member_user_id` is bound either immediately (the address already has an
   account) or by the signup trigger (they register later). Binding only makes
   the invitation findable — it is not consent.
3. The invitee sees it in 账户管理 while signed in **as that address**, and
   accepts or declines. Only then does `status` become `'accepted'` and the
   entitlement follow.

`getViewerEntitlement()` grants an enterprise seat solely on an accepted
invitation bound to the current account. It never matches on the email address
alone — that was how a mistyped address used to hand a stranger a paid seat.

A person may hold any number of pending invitations but only one accepted seat
(`enterprise_members_accepted_member_idx`). A declined invitation frees the
owner's seat once they remove the row.

## Migrations

Run `0023_server_only_tender_reads.sql`, `0024_trial_and_enterprise_members.sql`,
`0025_enterprise_member_consent.sql`,
`0026_subscription_period_and_cancellation.sql` and
`0027_subscription_billing_interval.sql` before deploying this access model.
`0025` resets every existing `enterprise_members` row to `pending`, so any seat
that was live before it stops granting access until the invitee accepts.

The server requires `SUPABASE_SERVICE_ROLE_KEY`: since `0023` the anon key
cannot read tenders at all, and the app falls back to bundled mock data (with a
console warning) rather than serving a silently empty site.

## Renewal

Stripe Checkout and its signed webhook renew subscriptions. Every
`invoice.paid` event advances both `current_period_start` and
`current_period_end`; a non-Stripe row still stops on its manually assigned
end date.

`subscriptions.stripe_subscription_id` is what distinguishes the two cases,
and the account page reads it rather than asserting anything: with a billing
link it says the subscription renews on that date and offers to cancel;
without one it says the subscription ends on that date and offers nothing to
cancel, because there is no renewal to stop. Both notices correct themselves
once checkout writes real provider ids — no copy needs changing.

Cancelling first schedules `cancel_at_period_end` in Stripe, then mirrors the
same state locally: access remains active through `current_period_end`, after
which the deletion webhook changes the row to `cancelled` and entitlement
falls back to the free role.

`0027` also adds a unique index allowing only ONE live (`active`/`trialing`)
subscription per account: the entitlement picks the first row still covering
today out of an unordered list while the cancellation endpoint picks the
newest, so with two live rows those can disagree and a cancellation would
silently leave the other running. An upgrade must close the old row before
opening the new one.

`npm run list:subscriptions` prints every live subscription with its end date
and flags the rows that need attention — expired but still active, no end
date at all, or no billing link.

`npm run test:access-control` covers the three pure rules these decisions rest
on — the Stripe status mapping, `isSubscriptionEntitled()`, and
`selectPreferredSubscription()` — with no Supabase, Stripe SDK, or network. It
runs anywhere. Every case in it is a bug that reached this branch at least
once; add the next one before fixing it.

## Stripe configuration

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the six
`STRIPE_PRICE_*` variables shown in `.env.example`. Register
`/api/stripe/webhook` in Stripe for `checkout.session.completed`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and
`customer.subscription.deleted`. Checkout metadata is the server-validated
source of the Supabase user, while the subscription's current configured
Stripe Price is the source of its plan and billing interval. The browser never
supplies an amount.

Card subscriptions remain denominated in USD and use Stripe Checkout. SPEI
subscriptions use Stripe Billing's `send_invoice` flow because Checkout does
not support bank transfer in subscription mode. The customer sees the same USD
catalog price until selecting bank transfer; the server then converts it using
`USD_MXN_BANK_TRANSFER_RATE`, creates an MXN recurring price, and Stripe locks
that invoice amount for `BANK_TRANSFER_DAYS_UNTIL_DUE`. Review the configured
rate before enabling transfers. A send-invoice subscription may appear
`active` at Stripe before it is paid, so its `customer.subscription.updated`
event never grants initial access. Only `invoice.paid` writes the first row and
extends later periods. Migration `0030_billing_profiles.sql` stores the
validated billing identity and the one pending transfer invoice allowed per
user.

No Stripe Tax calculation is enabled. Displayed catalog prices are treated as
tax-inclusive. Customers request a CFDI manually through
`billing@latintender.com` or WhatsApp; ordinary support uses
`support@latintender.com`.

Stripe has eight subscription statuses; this database stores four.
`subscriptionStatusFromStripe()` in `lib/access-control.ts` maps between them,
and it is deliberately conservative: only Stripe's own `past_due` earns the
grace window below. `incomplete`, `incomplete_expired`, `unpaid` and `paused`
all become `cancelled`. The permissive fallback this replaced — anything not
`active`/`trialing`/`canceled` became `past_due` — was harmless until the
grace window existed, and then meant that a Checkout whose FIRST payment never
cleared (3DS abandoned, card declined) was written as `past_due` with
`current_period_start` set to that moment, granting three days of full access
for nothing, repeatable by starting another Checkout.

A `past_due` subscription keeps access and digest delivery for three days from
its Stripe `current_period_start`. Missing legacy period data fails closed.
After the window ends, entitlement is calculated as free without needing a
scheduled cleanup job. Configure Stripe's retry window to last at least three
days.

**Stripe must be configured to CANCEL a subscription once retries are
exhausted** (Dashboard → Billing → Subscriptions and emails). The other two
settings leave the subscription in `unpaid` or `past_due` forever, and
checkout refuses to open a second agreement while an unresolved `past_due` row
exists — so the account would be permanently unable to buy again, recoverable
only by editing the database. The `unpaid` half of that is covered by the
mapping above; "leave in past_due" is not, and has no code-side defence.

The payment warning deliberately OUTLIVES the grace window. Stripe retries for
roughly two weeks, so the days after the third are exactly when an account has
lost access and still needs telling that recovery is possible — which is why
`getViewerEntitlement()` reports `paymentPastDue` on a free-role entitlement
too, and `PaymentPastDueBanner` only changes its wording rather than
disappearing.

`current_period_start` is Stripe's billing-period value, not a locally
recorded failure timestamp, so the grace window only works if Stripe advances
that field when a renewal fails. Unit tests could not settle that — they prove
the three-day arithmetic, not what Stripe puts in. **Confirmed on 2026-09-08
with a Stripe Test Clock and a renewal-failure card**: the period does advance,
`current_period_start` lands on the failed renewal cycle, and the anchor holds.
No separate `payment_failed_at` column is needed; do not add one without
re-running that test, and if Stripe ever changes this behaviour, store the
failure time explicitly rather than quietly redefining a billing-period column.

The rest of the sandbox run passed alongside it: a monthly personal
subscription, webhook redelivery (idempotent), cancel-at-period-end, a first
payment that fails producing no entitlement at all, a failed renewal landing in
`past_due`, access held on day 2 of the grace window and gone on day 4,
recovery to `active` after updating the card, `current_period_start/end`
self-healing from a redelivered `invoice.paid`, and both enterprise intervals.

If historical or concurrent events leave several eligible rows for one user,
selection is deterministic: `active`/`trialing` outrank `past_due`, then the
newest `created_at` wins. Checkout also refuses to open a second Stripe
subscription while an unresolved `past_due` agreement exists; recovery must
finish on the existing agreement first.

## Test accounts

`npm run seed:test-accounts` creates one account per entitlement level
(试用 / 免费 / 个人版 / 企业版主账号 / 企业成员 / 待处理邀请) with
`email_confirm: true`, so they can sign in immediately. 访客 needs no account.
It is idempotent — re-run it to reset a trial that has aged out — and
`-- --cleanup` deletes them. It needs `SUPABASE_SERVICE_ROLE_KEY` and must
never be pointed at a database holding real users.

## Bank transfer: the two things that can drift

Reviewed 2026-09-08 (Codex's `fb79cfb`). The flow itself is sound —
server-side price selection, idempotency keys on both Stripe calls, an
atomic `pending_payment_request_id` claim, rollback via
`checkout.sessions.expire` if the claim is lost, and a `quotedRate` check
that refuses the purchase when the FX rate moved between page load and
submit. Two things are worth knowing about, one fixed and one deliberate.

**Fixed: price could silently diverge from Stripe.** The transfer amount is
computed from `PLAN_PRICES_USD` in `lib/billing-catalog.ts`, because the
browser must render the quote before the checkout route runs. That made the
catalog a second source of truth next to the real Stripe Price the card flow
charges: raising a price in the Stripe Dashboard would have left every bank
transfer billing the old amount indefinitely, with nothing failing. The
checkout route now retrieves the Price it already fetches for `product` and
refuses the purchase when `unit_amount`/`currency` disagree with the
catalog. **Both must be updated together** — Stripe Dashboard and
`PLAN_PRICES_USD` — or transfer purchases stop with a loud error.

**Deliberate: the MXN amount is fixed for the life of the subscription.**
Bank transfer bills an inline `price_data` in MXN, converted at
`USD_MXN_BANK_TRANSFER_RATE` on the day of purchase, with `recurring` set —
so every renewal charges that same peso amount forever, at the original
rate. Card subscribers bill the real USD Prices and are unaffected. Changing
`USD_MXN_BANK_TRANSFER_RATE` only affects NEW transfer subscriptions;
existing ones keep their rate. Re-pricing an existing transfer subscriber
means cancelling and re-subscribing them.

**Why `invoice.payment_failed` skips bank-transfer subscriptions.** A
`send_invoice` subscription can report `active` before the transfer lands,
so only `invoice.paid` may create or extend access. Moving a transfer
subscriber to `past_due` therefore happens through
`customer.subscription.updated` instead — which is how Stripe reports an
overdue send-invoice subscription anyway, since no automatic payment attempt
is made for `customer_balance`. That event is consequently **required** on
the production webhook endpoint, not optional: without it, a transfer
subscriber whose renewal never arrives keeps full access indefinitely.
