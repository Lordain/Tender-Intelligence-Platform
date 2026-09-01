# Tender Intelligence Platform

AI Tender Intelligence Platform — 解决企业在"找标、看标、判断能不能投"阶段的高成本问题。

**Discover. Understand. Qualify.**

发现招标机会 → 快速理解招标要求 → 判断企业是否具备投标资格。

**Positioning**: for Chinese enterprises expanding into Mexico — the
differentiator against Spanish-native local competitors (LicitIA, Licitacom,
etc.) is the language/translation layer, not raw data aggregation, which is
already a fairly crowded market. Per that same reasoning, the frontend is
**Chinese-only by design** (`lib/i18n.tsx`) — the en/es tender-intelligence
market already has enough similar sites; the underlying `LocalizedText`
data model still carries `es`/`en`/`zh` (Spanish stays the source-of-truth
field for real government data), it's just not rendered in the UI or
switchable anymore.

First market: Mexico public procurement (Compras MX, DOF).

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) (TypeScript, App Router, Tailwind CSS, Turbopack).

## Project Structure

```text
app/            Next.js App Router routes (/, tenders, pricing, login, register, account, saved)
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
3. Open the **SQL Editor** and run every file in `supabase/migrations/` **in
   filename order** (`0001_init.sql` creates all tables — `tenders`,
   `tender_requirements`, `tender_key_dates`, `tender_risks`,
   `tender_documents`, `buyers`, `industries`, `profiles`, `subscriptions` —
   with indexes and Row Level Security policies, public read on tender data
   and private read on profiles/subscriptions; each later-numbered file is a
   small, additive schema change — new nullable columns, a renamed pricing
   tier, etc. — never a rewrite of an earlier one).
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
confirmed portal structure, which mapper to trust most (the one built and
tested against real downloaded data, not documentation alone), and what's
deliberately not built yet (extracting qualifications/risks/documents needs
an LLM, Phase 6). Several mappers, each verifiable offline:

```bash
npm run ingest:comprasmx-contracts -- --fixture   # real Compras MX contracts CSV → Tender (awarded/historical, built from real data)
npm run ingest:comprasmx-open -- --fixture        # real "Difusión de procedimientos" export → Tender (still-open procedures, built from real data)
npm run ingest:compranet5 -- --fixture            # older CompraNet 5.0 (2010-2022) bulk-export row → Tender
npm run ingest:compras-mx -- --fixture            # OCDS release → Tender (format confirmed real, no sample record yet)
npm run ingest:dof -- --fixture                   # DOF daily-edition notice → Tender (CFE/PEMEX supplement, not a Compras MX replacement)
npm run ingest:dof-search -- --fixture            # DOF advanced-search notice → Tender (same CFE/PEMEX supplement role)
npm run ingest:pemex -- --fixture                 # PEMEX's own SharePoint "Concursos Abiertos" list → Tender (no anti-bot gate, built from a real 2,067-item export)
```

`ingest:pemex-attachments` records real document names/URLs against
already-ingested PEMEX tenders (metadata only, no download) — see
`lib/ingestion/README.md` for the browser Console snippet that produces
its input file.

Each also accepts a real downloaded file in place of `--fixture`, e.g.
`npm run ingest:comprasmx-contracts -- path/to/file.csv` (dry run by
default; add `--write` to upsert into Supabase).

Tender documents (Convocatoria, Anexo Técnico, actas) are filed with a
separate step, since Compras MX serves them from behind an
anti-automation gate and this platform doesn't fetch through it:

```bash
npm run ingest:documents -- path/to/downloaded-pdfs   # dry run; --write records them
```

Drop whatever was downloaded into a folder and it works out which tender
each file belongs to (from the procedure number in the document text),
what kind of document it is, and hashes it so the same file is never
analysed twice — no renaming, sorting or matching by hand.

**Product direction has expanded** to Latin America (Mexico, Brazil,
Colombia, Chile, Peru), positioned for Chinese enterprises bidding
overseas. Portuguese (for Brazil) is part of that long-term direction but
explicitly deferred for now. See the "Multi-country expansion" section in
`lib/ingestion/README.md` for what the country expansion means for
ingestion specifically; only Mexico has a real connector so far.
