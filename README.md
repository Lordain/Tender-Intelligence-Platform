# Tender Intelligence Platform

AI Tender Intelligence Platform — 解决企业在"找标、看标、判断能不能投"阶段的高成本问题。

**Discover. Understand. Qualify.**

发现招标机会 → 快速理解招标要求 → 判断企业是否具备投标资格。

**Positioning**: primarily for Chinese enterprises (and other international
bidders) expanding into Mexico — the differentiator against Spanish-native
local competitors (LicitIA, Licitacom, etc.) is the language/translation
layer, not raw data aggregation, which is already a fairly crowded market.

First market: Mexico public procurement (Compras MX, DOF).

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) (TypeScript, App Router, Tailwind CSS, Turbopack).

## Project Structure

```text
app/            Next.js App Router routes (tenders, pricing, account, admin, industries, agencies, saved, alerts)
components/     UI components (tenders/, layout/)
data/           Mock / seed data
lib/            Shared utilities, Supabase clients, and the data-access layer
supabase/       SQL migrations
scripts/        One-off scripts (e.g. db:seed)
types/          Core domain types (Tender schema, etc.)
```

## Database Setup (Supabase)

The app works out of the box with bundled mock data (`data/tenders.ts`) — no
database required. To connect a real Supabase project:

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In **Settings → API**, copy the **Project URL**, the **anon** / **Publishable**
   key, and the **service_role** / **Secret** key (secret — never expose it
   client-side).
3. Open the **SQL Editor** and run, in order:
   - `supabase/migrations/0001_init.sql` — creates all tables (`tenders`,
     `tender_requirements`, `tender_key_dates`, `tender_risks`,
     `tender_documents`, `buyers`, `industries`, `profiles`,
     `subscriptions`) with indexes and Row Level Security policies (public
     read on tender data; private read on profiles/subscriptions).
   - `supabase/migrations/0002_profile_on_signup.sql` — auto-creates a
     `profiles` row whenever someone registers via Supabase Auth.
4. Copy `.env.example` to `.env.local` and fill in the three values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
5. Seed it with the bundled mock tenders (optional):
   ```bash
   npm run db:seed
   ```
6. Run `npm run dev` — the app automatically prefers Supabase when these env
   vars are set, and falls back to mock data otherwise (see
   `lib/tenders.ts`).

## Auth

Register/log in/log out use Supabase Auth (email + password, plus a magic-link
option), via `@supabase/ssr` for session handling — `proxy.ts` (Next.js's
renamed `middleware.ts` convention) refreshes the session cookie on every
request. Auth state is read client-side (`lib/auth.ts`) so
pages stay statically prerendered; reading the session in a Server Component
would force the whole app into dynamic rendering just to know whether one
visitor is logged in.

By default, a new Supabase project requires email confirmation before a
user can log in — after registering, check the inbox for that address. You
can disable this in **Authentication → Providers → Email → Confirm email**
in the Supabase dashboard if you'd rather test without it.

Saved tenders/searches (see below) are still `localStorage`-only, not tied
to the account yet — that migration to per-user Supabase storage is future
work now that accounts exist.

**Note on schema shape**: qualification, experience, and required-document
requirements share one `tender_requirements` table distinguished by a `kind`
column, since they're structurally identical. Localized text (`title`,
`summary`, `description`, etc.) is stored as `jsonb` — `{"es","en","zh"}` —
directly on each row rather than in a separate translations table, keeping
one row the single source of truth per the "original language wins" design
principle.

## Data Ingestion

`lib/ingestion/` — see **`lib/ingestion/README.md`** for the full picture:
confirmed portal structure (Compras MX / CompraNet 5.0 / 3.0 / Datos
Abiertos), what's verified-working, what's still an unverified placeholder,
and what's deliberately not built yet (extracting qualifications/risks/
documents needs an LLM, Phase 6). Two mappers, each verifiable offline:

```bash
npm run ingest:compras-mx -- --fixture    # OCDS release → Tender
npm run ingest:compranet5 -- --fixture    # CompraNet 5.0 bulk-export row → Tender
```

`ingest:compranet5` also accepts a real downloaded file:
`npm run ingest:compranet5 -- path/to/file.xlsx` (dry run) or add `--write`
to upsert into Supabase.
