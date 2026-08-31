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

Three independent mappers, each provable without touching the network:

- **`compras-mx-contracts-mapper.ts`** — the strongest one. Maps a row of
  the **real** Compras MX "Datos Abiertos" contracts CSV
  (`contratos_comprasmx_2025.csv`, a real file the user downloaded and
  provided — 73 columns, verified field-by-field with pandas, not
  eyeballed off raw CSV text with embedded commas). `Orden de gobierno`
  gives `governmentLevel` directly (`APF` = federal — confirmed, not a
  name-guessing heuristic) for the first time. Real amounts, real dates in
  two different formats (both handled), a real per-record source URL
  (`Dirección del anuncio`, an actual `comprasmx.buengobierno.gob.mx`
  detail link). The file arrived GB18030-encoded rather than UTF-8
  (evidently round-tripped through a Chinese-locale tool) — the reader
  tries UTF-8 first and falls back automatically.
  `npm run ingest:comprasmx-contracts -- --fixture` runs it against two
  real rows (`__fixtures__/sample-compras-mx-contracts.csv`). **This is
  the mapper to build on going forward** for Mexico.
- **`compranet5-mapper.ts`** — maps the older, sparser
  `DD_HISTORICO_CNET5.xlsx` summary schema (`Código de expediente`,
  `Carácter`, `Nombre del anuncio`, `Dependencia`, `Tipo de Contratación`,
  `Tipo de Expediente`, `Fecha de publicación`, `OCDS`). Superseded by
  `compras-mx-contracts-mapper.ts` for anything 2023+; still relevant for
  the 2010–2022 CompraNet 5.0 archive specifically.
  `npm run ingest:compranet5 -- --fixture`.
- **`ocds-mapper.ts`** — maps a full OCDS release. Confirmed to exist (see
  above) as a per-record download, not yet obtained. Has the richest
  potential fields (tender period, enquiry period, items/classification)
  once a real record is in hand. `npm run ingest:compras-mx -- --fixture`.
- The `SourceConnector` interface (`types.ts`) — the contract every
  source implements, so the mapper/ingestion layer doesn't care which
  portal or file format the data came from.
- All three scripts' Supabase upsert logic — same upsert-by-slug pattern
  verified against a real project during Phase 2.

**IMPORTANT — the Datos Abiertos contracts file is CONTRACTS/AWARDS, not
open tenders.** Every row inspected already has a formalized contract
(`Estatus Contrato` = `FORMALIZADO`). That makes it excellent for
historical intelligence (winners, award values, pricing benchmarks — the
platform's Phase 7 concept) and for backfilling closed/historical tender
records, but it is **not** the feed for "tenders still open to bid on" —
that's the different, still-unconfirmed "Difusión de procedimientos de
Contratación Compras MX" live search page.

**Neither `compranet5-mapper.ts` nor `ocds-mapper.ts`/the OCDS connector
should be treated as more reliable than `compras-mx-contracts-mapper.ts`**
— they're built against documentation and a smaller dictionary,
respectively, while the contracts mapper is built against and tested
against real downloaded data.

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
