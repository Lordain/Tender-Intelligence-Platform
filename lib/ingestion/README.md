# Data Ingestion — Phase 5

What's real, what's a verified-working architecture, and what's an
explicitly-flagged placeholder. Read this before touching anything here.

## Confirmed portal structure (from official docs, not guessed)

Per the official "Guía de navegación en el portal Compras MX" (Secretaría
Anticorrupción y Buen Gobierno) and `DD_HISTORICO_CNET5.xlsx` (the official
CompraNet 5.0 data dictionary), both provided directly by the user:

- **Compras MX** (current platform, since Jan 2023) —
  `comprasmx.buengobierno.gob.mx/sitiopublico/#/` — live/current tenders,
  230k+ procedures. Public search UI under
  CIUDADANÍA EN GENERAL → DIFUSIÓN DE PROCEDIMIENTOS.
- **CompraNet 5.0** (2010–2022, 2M+ procedures) —
  `historico-compranet.buengobierno.gob.mx/` — historical, searchable web
  table (716 pages / 71,524+ shown in the guide's screenshot alone).
- **CompraNet 3.0** (2002–2011) — `comprasmx.buengobierno.gob.mx/cnet3` —
  Excel downloads only.
- **Datos Abiertos** (open data) —
  `comprasmx.buengobierno.gob.mx/datos-abiertos` — official bulk downloads.
  Confirmed from the guide: covers **2023+ only** ("a partir del año
  2023"), organized as yearly files ("Contratos de Plataforma Integral
  Compranet 2025/2024/2023") under "Contratos ingresados a CompraNet".
- **OCDS is real.** `DD_HISTORICO_CNET5.xlsx`'s first documented field is
  literally `OCDS` — "indica si se puede realizar la descarga de la
  información en formato OCDS correspondiente." So the OCDS format this
  pipeline was originally built against does exist — it's a per-record
  download link, not (as far as confirmed) a queryable REST API. That
  distinction matters: `ocds-mapper.ts` (the field mapping) stays valid:
  `connectors/compras-mx-connector.ts` (the fetch-a-live-API assumption)
  is the part still unconfirmed — see below.

None of this was scraped or reverse-engineered — it's read directly off
official documentation the user supplied.

## What's verified working (offline, no network needed)

Four independent mappers, each provable without touching the network:

- **`compras-mx-contracts-mapper.ts`** — maps a row of the **real** Compras
  MX "Datos Abiertos" contracts CSV (`contratos_comprasmx_2025.csv`, a real
  file the user downloaded and provided — 73 columns, verified
  field-by-field with pandas, not eyeballed off raw CSV text with embedded
  commas). `Orden de gobierno` gives `governmentLevel` directly (`APF` =
  federal — confirmed, not a name-guessing heuristic) for the first time.
  Real amounts, real dates in two different formats (both handled), a real
  per-record source URL (`Dirección del anuncio`, an actual
  `comprasmx.buengobierno.gob.mx` detail link). The file arrived
  GB18030-encoded rather than UTF-8 (evidently round-tripped through a
  Chinese-locale tool) — the reader tries UTF-8 first and falls back
  automatically. `npm run ingest:comprasmx-contracts -- --fixture` runs it
  against two real rows (`__fixtures__/sample-compras-mx-contracts.csv`).
  **Covers awarded/historical contracts** — see the gap section below for
  why this is deliberately not the whole picture.
- **`compras-mx-open-tenders-mapper.ts`** — maps a row of the real
  "Difusión de procedimientos" browser export (the public search page's
  own Excel export — see the gap section below). Covers procedures **still
  in progress** (no award yet): `ESTATUS` (VIGENTE / EN ACLARACIONES / EN
  REPREGUNTAS / EN ATENCIÓN DE PREGUNTAS), a real submission/opening date,
  a clarification-meeting date, state (`ENTIDAD FEDERATIVA`), and procedure
  type. Verified against the **full real file** (515 rows, not a trimmed
  sample) — every row mapped cleanly, 0 skipped.
  `npm run ingest:comprasmx-open -- --fixture` runs it against 6 real rows
  (`__fixtures__/sample-comprasmx-open-tenders.xlsx`, deliberately including
  both VIGENTE and EN ACLARACIONES/EN REPREGUNTAS statuses).
- **`compranet5-mapper.ts`** — maps the older, sparser
  `DD_HISTORICO_CNET5.xlsx` summary schema (`Código de expediente`,
  `Carácter`, `Nombre del anuncio`, `Dependencia`, `Tipo de Contratación`,
  `Tipo de Expediente`, `Fecha de publicación`, `OCDS`). Superseded by
  `compras-mx-contracts-mapper.ts` for anything 2023+; still relevant for
  the 2010–2022 CompraNet 5.0 archive specifically. (A much richer 45-column
  real contracts export for this era, `Contratos_CompraNet5.csv`, also
  exists — `Estatus del contrato` there is Activo/Expirado/Terminado, i.e.
  still post-award only; not yet mapped since `compras-mx-contracts-mapper.ts`
  already covers the current system and this older one has no open-tenders
  angle to add.) `npm run ingest:compranet5 -- --fixture`.
- **`ocds-mapper.ts`** — maps a full OCDS release. Confirmed to exist (see
  above) as a per-record download, not yet obtained. Has the richest
  potential fields (tender period, enquiry period, items/classification)
  once a real record is in hand. `npm run ingest:compras-mx -- --fixture`.
- The `SourceConnector` interface (`types.ts`) — the contract every
  source implements, so the mapper/ingestion layer doesn't care which
  portal or file format the data came from.
- All four scripts share one batched Supabase upsert helper
  (`upsert-tenders.ts`) — see "Bulk ingestion at real scale" below.

**Neither `compranet5-mapper.ts` nor `ocds-mapper.ts`/the OCDS connector
should be treated as more reliable than the two Compras MX mappers above**
— they're built against documentation and a smaller dictionary,
respectively, while the Compras MX mappers are built against and tested
against real downloaded/exported data.

### The open-tenders-vs-contracts gap — resolved without touching the anti-bot API

This was open for a while: the Datos Abiertos contracts export looked like
it might be contracts-only, based on a 2-row sample. Re-investigated twice
more this session:

1. **Re-confirmed the live search API is anti-bot-gated, and decided not to
   build against it.** The user captured real requests to
   `whitney/sitiopublico/expedientes` (list) and its per-record detail
   endpoint, both under `upcp-cnetservicios.buengobierno.gob.mx`. Both
   require `grc`/`igrc`/`xgrc` headers — long signed tokens paired with a
   dedicated `.../adele/interoperabilidad/tp/reloj` ("clock") call, the
   classic pattern for a time-synced anti-automation challenge, not a plain
   API key or CSRF token (there's no login on this public search — a
   normal session token wouldn't be needed at all). Building a connector
   that keeps working over time would mean either running a headless
   browser to solve that challenge or reverse-engineering the token
   algorithm — both are bypassing anti-bot protection, which this project
   doesn't do. This connector was never built.
2. **Re-verified the contracts export against the FULL real 2025 file**
   (23,597 rows, not the earlier 2-row sample): `Estatus DRC` is
   `PUBLICADO` for literally every row (not a useful discriminator), and
   the 8,414 rows with no `Estatus Contrato` value turned out to still have
   a real `Fecha de fallo` (ruling/award date) and a contract title/code in
   99% of cases — i.e. already awarded, just missing one status field, not
   "still open." Confirmed: **this export is exclusively post-ruling
   records** — the original finding held up under the full file, it just
   needed the bigger sample to be sure.
3. **Found the actual answer in a file the user already had**: Compras MX's
   public search page has its own **"export" button** (Información
   Pública/`Informaci_nP_blica_export_*.xlsx`) that dumps the current
   search results — no anti-bot token needed, because it's a normal
   browser-side download, the same category of thing as the Datos Abiertos
   CSV. A real export (515 rows) had `ESTATUS` values of VIGENTE / EN
   ACLARACIONES / EN REPREGUNTAS / EN ATENCIÓN DE PREGUNTAS and **no**
   award/contract fields at all — genuinely still-open procedures, several
   with a submission/opening date literally the next day relative to when
   it was exported. `compras-mx-open-tenders-mapper.ts` is built and
   verified against this real file (see above).

**Residual caveat**: this is still a manual/periodic export, not a live
feed — someone has to click "export" on the search page and hand us the
file, the same workflow as the Datos Abiertos CSV. That's an acceptable
tradeoff for real, unblocked data over a technically-live feed that would
require bypassing anti-bot protection to keep running.

## Bulk ingestion at real scale

`upsert-tenders.ts` (`upsertTendersBatched`) is the shared write path for
`ingest-compras-mx-contracts.ts`, `ingest-compranet5-bulk.ts`, and
`ingest-comprasmx-open-tenders.ts`. It replaced each script's original
one-row-at-a-time upsert loop, which would have taken hours and burned
through Supabase rate limits against a real yearly export (tens of
thousands of rows) — confirmed by generating a synthetic 5,000-row file
with the real column headers and timing the mapping step (~1s once
Node/tsx is warm; the actual bottleneck was always going to be network round
trips, not parsing). It upserts tenders `BATCH_SIZE` (500) rows at a time,
replaces `tender_key_dates` per batch with two bulk calls instead of two
calls per row, and records per-slug failures without aborting the whole run
so one bad batch doesn't lose everything else in a large file. All three
scripts' dry-run mode (no `--write`) now prints only the first 5 mapped
tenders for a real file, not the whole file, so a large dry run doesn't flood the
terminal — `--fixture` still prints in full since it's only a couple of rows.

## What's still an unverified placeholder

- `connectors/compras-mx-connector.ts` — assumes a queryable OCDS REST API
  at `COMPRAS_MX_OCDS_API_URL`. The official navigation guide never
  mentions such an endpoint — only per-record OCDS download links and
  bulk yearly files. This connector may not reflect how the site actually
  works and should be treated as the least-trustworthy piece here until
  proven otherwise. Prefer `compranet5-mapper.ts` / the bulk-file path
  for real work; revisit this one if/when a real queryable API turns up.
- The exact yearly bulk-file URL/format (CSV vs. XLSX) under Datos
  Abiertos — confirmed to exist, not yet confirmed in exact shape. The
  parser (`compranet5-bulk-file.ts`) handles both `.csv` and `.xlsx`
  defensively for this reason.

## What's deliberately NOT built yet (Layer 2/3 — Phase 6)

Neither mapper produces `qualifications`, `experienceRequirements`,
`requiredDocuments`, or `risks` — those live in attached documents
(Convocatoria, Anexo Técnico PDFs) or in the full OCDS record behind a
per-record link, not in the summary exports mapped so far. Reading them
needs an LLM (Layer 2 of the platform's three-layer extraction design) —
no provider is configured, so both mappers leave those four fields as
empty arrays rather than fabricating content. The UI already renders
"none listed" gracefully for empty arrays.

**This is also where the platform's actual differentiation has to live.**
LicitIA (licitia.com.mx) and several other independent platforms already
aggregate ComprasMX + state portals and use AI to extract exactly these
fields from tender documents — that market is not empty. Given that, and
given the product's positioning is shifting toward **Chinese enterprises
(and other non-Spanish-speaking bidders) expanding into Mexico** rather
than competing head-on with Spanish-native local aggregators, Phase 6
should prioritize accurate es→zh/es→en translation and requirement
extraction over raw data coverage — the language/interpretation layer is
the gap local competitors have no reason to fill.

## `governmentLevel` and `industry` are best-effort guesses

Shared in `heuristics.ts` — neither OCDS nor the CompraNet 5.0 summary
schema has a government-level field or this platform's own industry
taxonomy. Inferred from the buyer name via regex; reasonable for
well-known buyers (CFE, PEMEX, "Municipio de X") but not authoritative.
Treat as needing human review, same as the platform's original
"Confidence Checking" design intent — no `confidence_score` column exists
yet, deliberately, to avoid a schema change before Phase 6 actually needs
one.

## Why DOF isn't built yet

DOF (Diario Oficial de la Federación) also has an open-data section
(`sidof.segob.gob.mx/datos_abiertos`), but it publishes the *full text* of
official notices (laws, decrees, standards, and — among many other things
— tender announcements), not structured procurement records the way
OCDS/CompraNet 5.0's summary export does. A DOF connector could supply
little more than title/date/URL automatically; extracting real tender
fields from a DOF notice's body text needs the same Layer 2 (AI) work,
just for more of the record. Compras MX stays the primary source; DOF is
future work as a secondary/cross-validation source (its original intended
role per the platform's design), not a replacement.

## Multi-country expansion (strategic direction, not yet built)

The product direction is now **Latin America Tender Intelligence for
Chinese Enterprises** — Mexico, Brazil, Colombia, Chile, Peru. Portuguese
(for Brazil) is part of that long-term direction but explicitly deferred
for now — the app stays zh/en/es. Also part of the direction: a
"Pre-Screening" / China overseas relevance classification step deciding
how much analysis depth a
given tender gets (per-country connectors documented in the country's own
official sources: Brazil PNCP, Colombia SECOP I/II, Chile Mercado
Público/ChileCompra API, Peru SEACE/OECE/OCDS). None of that is built —
only Mexico has a verified connector so far, and building Brazil/Colombia/
Chile/Peru connectors without real documentation or sample files from
those portals (the way Mexico's connectors were built from user-provided
real files) would repeat the mistake this file's history already shows
the cost of: guessing at an API shape produces a placeholder, not a
working connector. Each new country needs the same treatment Mexico got —
real docs or a real sample file — before its connector is written.
