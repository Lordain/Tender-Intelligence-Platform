# Tender Intelligence Platform

AI Tender Intelligence Platform — 解决企业在"找标、看标、判断能不能投"阶段的高成本问题。

**Discover. Understand. Qualify.**

发现招标机会 → 快速理解招标要求 → 判断企业是否具备投标资格。

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
2. In **Settings → API**, copy the **Project URL**, the **anon** key, and the
   **service_role** key (secret — never expose it client-side).
3. Open the **SQL Editor** and run `supabase/migrations/0001_init.sql`. This
   creates all tables (`tenders`, `tender_requirements`, `tender_key_dates`,
   `tender_risks`, `tender_documents`, `buyers`, `industries`, `profiles`,
   `subscriptions`) with indexes and Row Level Security policies (public
   read on tender data; private read on profiles/subscriptions).
4. Copy `.env.example` to `.env.local` and fill in the three values:
   ```
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
5. Seed it with the bundled mock tenders (optional):
   ```bash
   npm run db:seed
   ```
6. Run `npm run dev` — the app automatically prefers Supabase when these env
   vars are set, and falls back to mock data otherwise (see
   `lib/tenders.ts`).

**Note on schema shape**: qualification, experience, and required-document
requirements share one `tender_requirements` table distinguished by a `kind`
column, since they're structurally identical. Localized text (`title`,
`summary`, `description`, etc.) is stored as `jsonb` — `{"es","en","zh"}` —
directly on each row rather than in a separate translations table, keeping
one row the single source of truth per the "original language wins" design
principle.
