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

## Stripe configuration

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the six
`STRIPE_PRICE_*` variables shown in `.env.example`. Register
`/api/stripe/webhook` in Stripe for `checkout.session.completed`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and
`customer.subscription.deleted`. Checkout metadata is the server-validated
source of the Supabase user, while the subscription's current configured
Stripe Price is the source of its plan and billing interval. The browser never
supplies an amount.

## Test accounts

`npm run seed:test-accounts` creates one account per entitlement level
(试用 / 免费 / 个人版 / 企业版主账号 / 企业成员 / 待处理邀请) with
`email_confirm: true`, so they can sign in immediately. 访客 needs no account.
It is idempotent — re-run it to reset a trial that has aged out — and
`-- --cleanup` deletes them. It needs `SUPABASE_SERVICE_ROLE_KEY` and must
never be pointed at a database holding real users.
