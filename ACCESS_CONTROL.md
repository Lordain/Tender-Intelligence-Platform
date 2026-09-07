# Access control

The site runs in subscription mode. Every newly registered user receives a seven-day, no-card trial. Trial expiry is stored in `profiles.trial_ends_at`.

- `guest`: homepage and pricing are public; the tender list is read-only and all interactions ask the visitor to log in. Homepage-featured tenders remain public in full.
- `trial`: full tender, saved-item, account, and twice-daily notification access until `trial_ends_at`.
- `free`: trial expired and no active subscription. The tender list remains searchable, but detail pages and email delivery require a subscription.
- `subscriber`: full access. An enterprise owner may add two member accounts, producing three accounts total; every account owns its own notification preferences.

Run migrations `0023_server_only_tender_reads.sql` and `0024_trial_and_enterprise_members.sql` before deploying this access model. The server requires `SUPABASE_SERVICE_ROLE_KEY`.
