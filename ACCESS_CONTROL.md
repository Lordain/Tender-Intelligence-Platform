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
`0025_enterprise_member_consent.sql`, and
`0026_subscription_period_and_cancellation.sql` before deploying this access model.
`0025` resets every existing `enterprise_members` row to `pending`, so any seat
that was live before it stops granting access until the invitee accepts.

The server requires `SUPABASE_SERVICE_ROLE_KEY`: since `0023` the anon key
cannot read tenders at all, and the app falls back to bundled mock data (with a
console warning) rather than serving a silently empty site.

Cancelling sets `cancel_at_period_end`: access remains active through
`current_period_end`, then the entitlement automatically falls back to the
free role. When Stripe billing is connected, the cancellation endpoint must
also schedule cancellation with Stripe so billing and database state remain
synchronized.

## Test accounts

`npm run seed:test-accounts` creates one account per entitlement level
(试用 / 免费 / 个人版 / 企业版主账号 / 企业成员 / 待处理邀请) with
`email_confirm: true`, so they can sign in immediately. 访客 needs no account.
It is idempotent — re-run it to reset a trial that has aged out — and
`-- --cleanup` deletes them. It needs `SUPABASE_SERVICE_ROLE_KEY` and must
never be pointed at a database holding real users.
