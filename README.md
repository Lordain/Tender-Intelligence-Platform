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

**Prerequisite for document ingestion/extraction only** (`npm run ingest:documents`, `npm run extract:document` — not needed for `npm run dev` or the rest of the app): both call into `lib/ingestion/document-intake.ts`, which shells out to Poppler's `pdftotext` binary for PDF text extraction. Install it and confirm it's on `PATH` (`pdftotext -v`) before running either:
- Windows: `winget install --id=oschwartz10612.Poppler -e` (or `choco install poppler`), then restart your terminal
- macOS: `brew install poppler`
- Linux: `apt install poppler-utils` (Debian/Ubuntu) or your distro's equivalent

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

See [ACCESS_CONTROL.md](ACCESS_CONTROL.md) for the guest/member/subscriber
permission matrix and the switch from the free launch stage to paid access.

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

**Manual editing (2026-09-05)**: `/admin/tenders/[slug]` — beyond the tender's
own flat fields, an admin can now add/edit/delete individual `tender_key_dates`,
`tender_requirements` (all three kinds), and `tender_risks` rows directly from
the edit page, for a tender with no source document to run the Layer 2
extraction pipeline against, or to correct/supplement its output by hand.
Each row persists immediately via its own `/api/admin/tenders/[slug]/{key-dates,requirements,risks}[/[id]]`
endpoint (not bundled into the surrounding form's single save), and only ever
writes the `zh` locale from that form — the product is Chinese-only
(`lib/i18n.tsx` hardcodes `LOCALE = "zh"`), so `es`/`en` are left as empty
strings rather than duplicated from the zh text. A new nullable
`tenders.awarded_value` column (migration `0019`, distinct from
`estimated_value` — the pre-tender budget estimate, which a real award can
differ from) is editable the same way as the existing `awarded_to`/`award_date`
fields; the public tender detail page only ever shows the "中标结果" (award
result) block at all once `awardedTo` or `awardedValue` is actually set —
there's no empty/placeholder state for a tender that hasn't been awarded yet.

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

### Batch-downloading tender documents

Where a source publishes real per-document URLs, the download stops being
manual. Peru's SEACE/OECE OCDS records carry them inline
(`compiledRelease.tender.documents[].url`), so `ingest:peru-live` records
them as it writes each tender, and `/admin/documents-needed` grows a
**批量下载标书** button: select rows, click once, get one ZIP plus a
`下载报告.txt` naming every file that failed.

Every entry in that ZIP is named `<slug>__<document name>`, which is the
`SLUG_OVERRIDE_PATTERN` branch of `match-documents-to-tenders.ts` — the
first and only exact step in the matcher, no text extraction and no
ambiguity. Without the prefix these files fall through to "does any known
`tender_number` appear in the name or the extracted text", and the name alone
says nothing: every one of them is called `Bases Administrativas.pdf`. The
ZIP is flat for the same reason `findDocuments()` does not recurse — an
unzipped folder pointed at `/admin/local-batch` has to actually contain the
files.

Those links live in their own table, `tender_document_links`, **not** in
`tender_documents`. A row in `tender_documents` means "this platform holds
this file", and `/admin/documents-needed` treats one as "this tender is
handled" — writing discovered links there would have silently emptied the
worklist for every Peru tender the moment the links were captured, with
nothing actually downloaded.

Rows ingested before that capture existed have no links, so they get a
backfill — re-reads the same OCDS segments and fills in only the links,
touching no tender. It is a button on the 秘鲁 tab (local dev only, since it
calls SEACE) and a command, both on the same implementation:

```bash
npm run backfill:peru-documents -- --months 6 --write   # links for Peru rows ingested before this existed
```

Coverage is per-source and the UI says so rather than failing quietly:

| Source | Per-document links | Why |
| --- | --- | --- |
| Peru — SEACE/OECE | ✅ inline in the OCDS record | Filtered to `biddingDocuments` + `clarifications`; award/evaluation documents are an outcome, not a bid input |

`prod1.seace.gob.pe` is slow and a single *Bases Administrativas* routinely
runs past 10MB, which took two real runs to get right. At a 20s per-file
deadline, 1 of 3 files arrived; at 60s, 3 of 4 — 23.1MB in 105s, about
110 KB/s per stream. Every reported "timeout" was a download working
normally.

The lesson is that **no fixed per-file deadline can separate "slow" from
"broken"** when a healthy transfer legitimately needs two minutes, and an
`AbortSignal` makes it worse by killing the body stream, not just the
connect. Silence is the signal that actually distinguishes them, so
`lib/ingestion/download-file.ts` resets its clock on every chunk: a slow file
takes as long as it takes, a dead one is dropped in 30s. Concurrency also
dropped from 4 to 2 — parallelism creates no bandwidth on a slow origin, it
splits one pipe N ways so nothing finishes early.

The batch carries a wall-clock budget (48s on Vercel, 270s locally), and
"ran out of batch time" and "not attempted" are reported as distinct from
"stalled" because each implies a different fix. `npm run test:download`
covers all of it against a local server that really trickles and really
stalls — including the case both wrong versions failed: a transfer slower
than any per-file deadline, which must still complete.
| Colombia — SECOP II | ⚠️ automatable, not wired up | `colombia-documents-connector.ts` downloads fine, but its `proceso` id matched 0 of 499 stored tenders on the first real run — wiring it before that is understood would return empty ZIPs |
| Mexico — Compras MX | ❌ never | Same anti-automation gate as its search API |
| Peru — ProInversión OxI | ❌ | The export carries a project detail link, no document URLs |

### Peru SEACE is CLI-only on a deployed instance

Confirmed 2026-09-11: SEACE/OECE's proxy answers
`{"code":"403","message":"Forbidden",...}` to requests from Vercel's
datacenter range (`iad1`), while the identical code pulls 2428 records for
the same segment from an ordinary connection. It is the operator's access
policy, and the data is reachable the way they allow, so it is not worked
around — `npm run ingest:peru-live` on the admin's own machine is the
supported path, and `/admin/import-tenders/peru` says so and hands over the
command pre-filled when the button fails. Running the same page under `npm
run dev` locally works normally.

Two consequences worth stating plainly: an import cron for SEACE on Vercel is
impossible, not merely unbuilt — OxI (investinperu.pe, a different host, not
behind this proxy) is the only Peru source that could ever run on a schedule
there; and the document-link backfill is local-only for the same reason — it
appears as a panel on the 秘鲁 tab under `npm run dev` and 404s from the
deployed route, rather than shipping a button that spends two minutes to
produce a 403.

### Which rule kept this? (`保留原因分析`)

`npm run explain:kept` groups the kept set by the first positive signal that
fired, so one loose pattern shows up as a large bucket with real titles under
it. The same diagnostic runs as a button in
`/admin/import-tenders/maintenance`, reading the live `tenders` table instead
of a `reclassify:tenders` CSV — so it is current, needs no terminal, and its
country filter covers Mexico and Colombia exactly as it covers Peru.
Read-only either way.

That 通用维护 tab is the one non-country tab in `/admin/import-tenders`, and
holds the three actions that run across the whole table rather than one
country's import: translate, reclassify, and this. It sits first in the tab
order, separated by a rule; `/admin/import-tenders` still lands on 墨西哥,
since maintenance is the tab you open on purpose, not the daily one.

**Product direction has expanded** to Latin America (Mexico, Brazil,
Colombia, Chile, Peru), positioned for Chinese enterprises bidding
overseas. Portuguese (for Brazil) is part of that long-term direction but
explicitly deferred for now. See the "Multi-country expansion" section in
`lib/ingestion/README.md` for what the country expansion means for
ingestion specifically. Mexico and Colombia have real connectors; Brazil,
Chile and Peru do not yet.

Colombia comes from SECOP II's public Socrata API (`colombia-secop-live.ts`)
rather than a downloaded file, and is filtered twice on the way in. The table
is ~9M rows, so the fetch is narrowed server-side to a publication-date
window plus a coarse `modalidad_de_contratacion like '%icitaci%'`, and the
mapper then applies the exact gate: only **Licitación pública** and
**Licitación pública Obra Pública** are ingested at all
(`isIngestedColombiaModalidad`). Everything else — Contratación Directa,
régimen especial, selección abreviada, supplier information requests — never
enters the system.

That gate replaced an earlier rule that hid any Colombia tender with no
submission deadline. The rule was the indirect version of the same intent and
was wrong in both directions: it hid genuine open tenders whose deadline
datos.gov.co had not synced yet (18 of 37 rows on one import, 14 of them
flagship), while still admitting directa rows whenever they happened to carry
a date.

The `$order` carries `id_del_proceso` as a tiebreaker, which is not
cosmetic: `fecha_de_publicacion_del` is shared by hundreds of rows and
Socrata gives no stable order within a tie, so `$offset` paging over it alone
could return one row twice and another never.

### Local batch analysis (`/admin/local-batch`)

A tender document can run to 900 pages / 100MB. Uploading those through a
browser form is slow enough to be the bottleneck, so the dev server reads
them off the operator's own disk instead: drop the downloaded files in one
folder, paste the folder path, and every file is matched to its tender (by
the procedure number inside the document), grouped so one tender's files are
analysed together, and written back as a one-line summary plus
qualifications / experience / required documents / risks. Identical files are
skipped by content hash, so a re-run is not re-billed.

Page caps keep the token cost bounded: 20 pages for a standard tender, 30 for
significant, 40 for flagship (`maxPagesForTier`), truncated with
`pdfseparate`/`pdfunite` before the file is ever read into memory.

The route is **local-only** — it returns 404 when `NODE_ENV === "production"`,
and the nav entry is compiled out of the deployed bundle. On a deployed
instance the path would address Vercel's filesystem, which would make the
endpoint an arbitrary-path file reader behind nothing but an admin cookie.

**Setting it up on another computer.** The tool runs wherever `npm run dev`
runs; nothing is installed globally.

1. Node >= 20.9 (Next 16's floor), Git, then clone the repo and
   `npm install`.
2. Poppler on `PATH` — `pdfinfo`, `pdfseparate` and `pdfunite` do the page
   counting and truncation, `pdftotext` the text fallback. Install per the
   Getting Started section above and confirm with `pdfinfo -v`.
3. `.env.local`. This tool needs six values and none of the Stripe/Resend
   ones: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS` (your own address),
   `DASHSCOPE_API_KEY` (Qwen — the default extraction tiers), and
   `ANTHROPIC_API_KEY` (scanned PDFs with no text layer route to Claude).
   `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS: move it through a password
   manager, not chat or email, and never commit it.
4. `npm run dev`, sign in with the `ADMIN_EMAILS` address, open
   `/admin/local-batch`.

The Supabase project is shared, so the second machine sees the same tenders
and writes to the same rows — only the folder path is local, and it must be
that machine's own absolute path (`D:\tenders\2026-09`,
`/Users/you/tenders/2026-09`).

**If sign-in bounces you to the production site**, the dev server is on a port
that is not in Supabase's redirect allow list. Supabase falls back to the
project's Site URL when `redirect_to` does not match, rather than erroring.
Add `http://localhost:3000/**` and whatever port `next dev` actually chose
(it takes 3001 when 3000 is busy) under Authentication → URL Configuration →
Redirect URLs.

### Admins on the front end

An account whose email is in `ADMIN_EMAILS` resolves to a full entitlement in
`getViewerEntitlement()` — every paid gate on the public site opens, because
they all read that one function. Keyed on the same list that gates `/admin`,
so one env var decides who is staff and there is no second mechanism (a
comped subscription row, a flag column) to drift from it.

It grants access, not a fabricated subscription: no period, no billing link.
The account page correctly shows nothing to renew.

**Consequence:** an admin cannot see the paywall as themselves. Checking what
a free or trial visitor sees needs an account that is not in `ADMIN_EMAILS`.
`ACCESS_CONTROL.md` has the rest of the entitlement rules.

## Classification and editing

Everything a tender goes through between a source row and the public list.

### The four gates

A tender has to survive all four to reach the feed. They run in this order,
and knowing which one dropped something is usually the whole debugging job:

| # | Where | What it rejects |
|---|---|---|
| 1 | Connector (`$where`, server-side) | Outside the publication-date window; for Colombia, anything that is not a licitación |
| 2 | Mapper | Missing title/buyer/number/publication date; for Colombia, the exact modalidad gate |
| 3 | `lib/relevance.ts` | Below the value floor, or matching an exclude keyword, or carrying no target industry |
| 4 | `upsert-tenders.ts` | `tier === "excluded"` — **never written to Supabase at all** |

Gate 4 is why an excluded tender is absent rather than hidden. The public
list has its own `excluded` filter as a backstop, but only rows admitted
under older rules can ever hit it.

Gate 3 runs **at import time** and stores its verdict, so a row keeps the
tier the rules gave it on the day it was ingested. After changing a rule, run
`npm run reclassify:tenders` (or the 重新分类 panel) to recompute every stored
row's tier and industry tags; rows that are now excluded are deleted. It does
**not** re-apply gates 1 or 2 — a modalidad the mapper would now reject has to
be removed with SQL.

Every rule change is pinned by a fixture in `lib/relevance-fixtures.ts` —
every real title the user has confirmed a tier for, re-verified on every
change by `npm run test:relevance`. Add the new case there **first**: a
failure then tells you exactly which existing decision your rule would
break. That is not theoretical — a leading-"estudios" exclude rule was caught
contradicting a decision made four days earlier, and a narrower rule shipped
instead.

### Industry tags

Ten categories (`lib/industry.ts`), multi-tag, keyword-matched. Education,
tax and mining are deliberately absent: the first two are emptied by this
platform's own exclude rules (school buildings, childcare, medical services,
consulting, tax-culture programs), and mining is granted by concession here
rather than tendered. Mining merged into `energy_mining` (能矿).
`energy_mining` and `power` stay separate — extraction and fuels (PEMEX) vs
the electricity grid (CFE), different buyers and different bidder pools.

The public industry filter lists only categories that currently have tenders
behind them, computed from the unfiltered list. A dead filter option reads as
a broken site rather than an empty category, and this needs no hide list to
maintain: a category reappears by itself once a source supplies it.

### Status is derived, not stored

`lib/tender-status.ts` computes what a reader sees from the stored status
plus the calendar: `awarded`/`cancelled` always win, a passed deadline closes
a tender, **澄清中 applies only on the day of the clarification meeting
itself**, and everything else reads 招标中. 计划中 is not used.

Derived because the clarification rule is time-dependent — a stored status is
only correct on the day it was written, which is exactly how a one-day junta
de aclaraciones ended up displayed for weeks. Days are compared in
`America/Mexico_City`: the meeting happens where the meeting happens.

### Manual edits win

An admin edit to a tender is protected from the next import of that same
tender. `tenders.manual_field_overrides` (migration 0032) records the columns
a save actually **changed** — diffed against the stored row, not taken from
the request body, since the form posts every field every time and treating
"present" as "edited" would freeze the whole row on the first typo fix.
`publication_date` and its estimated flag lock as a pair.

`tender_key_dates.manually_added` (migration 0033) does the same for dates
typed into the 其他关键日期 editor: the importer refreshes key dates by
delete-then-insert, so without the flag a hand-entered 现场踏勘 vanished on
every import.

Separately, an **estimated** publication date never overwrites a stored one.
Sources with no real publication-date field fall back to the ingestion
timestamp, so re-importing used to move a tender's 发布日期 forward every
single run. A real date still overwrites anything — that is how an estimate
gets corrected.

Protected columns are written back with their current stored value rather
than omitted from the upsert: `ON CONFLICT DO UPDATE` validates the proposed
INSERT tuple before detecting the conflict, so omitting a NOT NULL column
fails the whole statement even though only the UPDATE branch could run.

### Translation

```bash
npm run translate:tenders -- --limit 20            # dry run, no API calls
npm run translate:tenders -- --limit 20 --write    # translate 20 and save
npm run translate:tenders -- --write               # everything still untranslated
```

es→zh on Qwen3.6-Plus via DashScope (`DASHSCOPE_API_KEY`), batched. Title and
summary are decided **separately**: a field is translated only if it is still
the untranslated mirror every mapper writes (`zh === es`, byte for byte) and
is not in `manual_field_overrides`. A human's Chinese is never overwritten,
and a hand-translated title no longer blocks its own summary from being
translated.

The admin 新项目清单 page's 翻译所有标题 button runs the same function.

## Scheduled jobs (Vercel Cron)

`vercel.json` registers the four scheduled runs the product depends on. Until
it existed, both routes below were reachable but nothing ever called them — the
twice-daily digest is a paid feature, so on a deployment with no scheduler
subscribers pay and receive nothing.

| Schedule (UTC) | Path | What it does |
|---|---|---|
| `0 15 * * *` | `/api/cron/tender-digest` | 09:00 morning digest |
| `0 0 * * *` | `/api/cron/tender-digest` | 18:00 evening digest |
| `0 16 * * *` | `/api/cron/subscription-renewal-reminders` | Warns a subscriber five days before a card renews |
| `30 3 * * *` | `/api/cron/purge-stale-colombia` | Deletes Colombia rows whose `Modalidad de Contratación` the ingestion gate would reject today, two months after publication |

**The digest times are not arbitrary and cannot be shifted.** The route itself
only accepts hour 09 or 18 in `America/Mexico_City` and returns 409 otherwise
(`mexicoSlot()`), so a schedule that misses those hours does not run late — it
runs and refuses. Mexico has had no DST since 2022, so the zone is UTC-6 all
year and the conversion is fixed: 09:00 → 15:00 UTC, 18:00 → 00:00 UTC the
following day. If Mexico ever restores DST, these two entries have to move with
it.

Auth needs no code: set `CRON_SECRET` in the Vercel project and Vercel sends it
as `Authorization: Bearer <CRON_SECRET>`, which is exactly what both routes
already check. A missing `CRON_SECRET` fails closed — `authorized()` requires
the variable to be set, so every request 401s rather than running unprotected.
`EMAIL_NOTIFICATIONS_ENABLED` and the Resend variables gate the digest
separately; without them it 409s.

**On plan limits.** Vercel lifted the per-project cron cap to 100 on every plan
in January 2026, so three entries is not close to any count limit. Two Hobby
restrictions still shape this file:

- *Each expression may fire at most once a day.* A twice-daily expression fails
  at deploy time. This is why the digest is written as two separate once-daily
  entries rather than the equivalent-looking `0 0,15 * * *` — the combined form
  is one job firing twice and would be rejected; the split form is two jobs
  firing once each, which is allowed. Do not "simplify" it back.
- *Hobby fires anywhere within the scheduled hour*, not at the minute (Pro is
  minute-accurate). That happens to be safe for the digest: `0 15 * * *` lands
  somewhere in 15:00–15:59 UTC, which is 09:00–09:59 in Mexico City, so the
  route's hour check still sees 09. The margin is the full hour and no more —
  any schedule not aligned to the top of the target hour would drift out of it.

So the cron configuration itself would run on Hobby. The reason this project
needs Pro is unrelated: Vercel's Hobby plan is licensed for personal,
non-commercial use only, and this is a paid subscription product. Cron jobs
carry no separate charge on any plan — their runs bill as ordinary function
invocations.

**When to upgrade:** on the day Stripe moves out of test mode, not before and
not later. Until then the deployment is not being run for financial gain and
Hobby is the right plan for it; from the moment a real Checkout can take a real
payment, it is. Upgrading is an account-level change — no redeploy, no code
change, no domain move — so it costs nothing to do it late, and it belongs in
the same checklist as the live webhook endpoint, `STRIPE_WEBHOOK_SECRET`, and
the six live Price IDs.

To verify without waiting for a schedule:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/purge-stale-colombia?dryRun=true
```

The digest has no dry-run flag and will really send, so test it against a
staging deployment or a seeded test account rather than production.

### When one of them breaks

Three layers, because they catch different failures:

1. **A run that fails** writes an `admin_alerts` row and emails
   `WEBHOOK_ALERT_EMAILS` (falling back to `ADMIN_EMAILS`) —
   `lib/notifications/ops-alert.ts`. Deduped per incident, not per run: while
   an unresolved row with the same `source` exists, a repeat writes nothing and
   sends nothing, so a digest failing for one subscriber twice a day for a week
   is one email rather than fourteen. Dismissing the banner row re-arms it.
   That is why a source names the failing thing
   (`tender-digest:recipient:<id>`) and never the moment.
2. **A run that fails wholesale** — Supabase unreachable, a schema change, a
   throw between the queries — is caught at the top of each route and reported
   the same way. Before this it was a 500 in a log nobody reads.
3. **A job that never runs at all** is what the first two structurally cannot
   see, and the likeliest failure on a fresh deploy: a schedule that was not
   deployed, or a rotated `CRON_SECRET` making every call 401. Each route
   records a heartbeat (`cron_heartbeats`, migration 0041) and `/admin` shows
   an amber banner for any job past its expected interval. A legitimate skip
   (notifications off, digest fired outside its slot) still writes a heartbeat
   with status `skipped` — the job ran and had nothing to do, which is exactly
   what has to be told apart from never running. A dry-run purge writes none,
   so running one by hand cannot mask a dead scheduler.

The amber banner has no dismiss control: it reports a state that is still true
and clears itself when the job next runs. The red one reports events, which is
why those are acknowledged by hand.

**Sending a real test email** without waiting for a cron: `/admin/email-preview`
has buttons for the digest, the renewal reminder and the enterprise invitation
— all to the signed-in admin's own address, rate-limited to 3/hour, and the
invitation writes no `enterprise_members` row. `/admin/billing` has the Stripe
webhook alert test. The invitation is there because it is otherwise unreachable
for staff: sending a real one requires an enterprise owner, and an admin
deliberately is not one (see "Admins on the front end").
