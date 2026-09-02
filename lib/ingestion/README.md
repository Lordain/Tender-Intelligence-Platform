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
- **`compranet5-mapper.ts`** — maps the real 45-column
  `Contratos_CompraNet5.csv` contracts export for the 2010–2022 CompraNet
  5.0 archive (confirmed real header from a real 13,400-row file the user
  downloaded and ran with `--write`). **This mapper originally targeted
  the wrong schema** — the sparser `DD_HISTORICO_CNET5.xlsx` summary
  dictionary (`Código de expediente`, `Nombre del anuncio`, `Dependencia`,
  `Tipo de Contratación`, ...) — and that mismatch (real columns are
  `Código del expediente`, `Título del expediente`, `Institución`, `Tipo
  de contratación`, ...) mapped 0 of 13,400 real rows: every row failed
  the mapper's required-field check, not an encoding or parsing bug (the
  file parsed fine — the previous CSV-encoding fix was real and correct,
  just not the whole story). Rewritten against the real header, which
  turns out near-identical in shape to `compras-mx-contracts-mapper.ts`'s
  (both are Datos Abiertos contract exports), reusing the same
  `inferGovernmentLevelFromOrden`/`inferParticipationScope`/dual-format
  date parsing conventions. One real difference: `Estatus del contrato`'s
  confirmed real values here are Activo/Expirado/Terminado (a contract
  lifecycle), not `compras-mx-contracts-mapper.ts`'s `FORMALIZADO` — since
  every row in a contracts export already has a formalized contract, all
  three map to `awarded` (only an unobserved but plausible "Cancelado"
  maps to `cancelled`). Superseded by `compras-mx-contracts-mapper.ts` for
  anything 2023+; still relevant for the 2010–2022 archive specifically.
  `npm run ingest:compranet5 -- --fixture`.
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

**Lifecycle join between the two sources**: `compras-mx-open-tenders-mapper.ts`
deliberately reuses `compras-mx-contracts-mapper.ts`'s exact slug scheme
(`comprasmx-${slugify(tenderNumber)}`, same field priority) rather than a
separate prefix — confirmed against both real files that "Código del
expediente"/"CÓDIGO DE EXPEDIENTE" and "Número de procedimiento"/"NÚMERO DE
IDENTIFICACIÓN" share the identical format across sources (e.g.
`E-2025-00038653`, `IA-12-NEF-012NEF001-I-30-2025`). So a tender first
ingested as still-open, once it's awarded and shows up in a later Datos
Abiertos contracts export, gets upserted onto the SAME row (status flips to
`awarded`, award date/value fill in) instead of leaving a stale orphaned
"open" duplicate around forever. Known tradeoff: if a *stale* open-tenders
export were re-ingested after the same tender was already awarded
elsewhere, it would blow its award fields back to null — acceptable because
a genuinely fresh export can't contain an already-awarded procedure (it
drops out of the live search results once awarded, confirmed: none of the
515 real rows had any award/contract field populated).

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

**Found running the full real file end-to-end for the first time**: earlier
verification of `compras-mx-contracts-mapper.ts` used pandas (a lenient CSV
parser) to inspect the real file, not this platform's own reader — running
the actual `readComprasMxContractsFile` against the full 23,597-row file
surfaced a real bug: strict `csv-parse` rejects the file outright
(`Invalid Opening Quote`) at row 48, because `Institución` contains an
unescaped literal quote (`HOSPITAL GENERAL DE MéXICO "DR. EDUARDO
LICEAGA"`) in a field that isn't RFC4180-quoted. Fixed with
`relax_quotes: true` on all three CSV readers (all read the same family of
government exports) — confirmed this parses the institution name intact
and all 23,597 rows. Separately, of those, 20,661 map to a `Tender`
successfully; the other 2,936 all have a blank `Fecha de publicación` —
real data-quality gaps in the source, not a bug (the mapper correctly
refuses to fabricate a publication date rather than guessing one).

### Recency filter — only the last N months by default

All seven `Tender`-producing ingest scripts (`ingest-pemex.ts`, `ingest-dof.ts`,
`ingest-dof-search.ts`, `ingest-comprasmx-open-tenders.ts`,
`ingest-compras-mx-contracts.ts`, `ingest-compranet5-bulk.ts`,
`ingest-colombia.ts`) now filter mapped tenders through
`filterRecentTenders()` (`lib/ingestion/recency.ts`) before printing/writing
them, keeping only tenders whose `publicationDate` falls within the last
`--months` (default `6`) — a real yearly Datos Abiertos export or a PEMEX
SharePoint list mixes years of history with genuinely current
opportunities, and older tenders aren't actionable for a Chinese enterprise
deciding what to bid on next. Pass `--months 0` to disable it (or a larger
number to widen the window) — e.g.
`npm run ingest:compranet5 -- file.csv --write --months 12`. The
`ingest:comprasmx-open` source is a special case: every row is still open
to bid and its "publication date" is stamped at export time (see
`compras-mx-open-tenders-mapper.ts`), so the filter is effectively a no-op
there — wired in anyway for consistency and in case a future mapper reads
a real publication date out of that file.

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
given the product is now **Chinese-only, positioned for Chinese
enterprises expanding into Mexico** rather than competing head-on with
Spanish-native local aggregators, Phase 6 should prioritize accurate
es→zh translation and requirement extraction over raw data coverage — the
language/interpretation layer is the gap local competitors have no reason
to fill.

### Layer 2 — document intake and extraction are built; extraction is untested against a live key

Following this project's own rule: nothing below is implemented against a
guessed document URL. One thing was genuinely unresolved and is now a
product decision rather than an unknown:

1. **Document access is gated too — confirmed, not inferred.** A real
   document-download request captured from a browser hits
   `upcp-cnetservicios.buengobierno.gob.mx/norah/documentos/recursos/ulck?id_documento=<uuid>&user=sitiopublico`
   and carries the same `grc`/`igrc`/`xgrc` anti-automation headers as the
   search API. So document retrieval is a manual/human-in-the-loop step
   like the two existing bulk sources — no downloader is built against
   that endpoint, for the same reason no search connector was.
   `lib/ingestion/document-intake.ts` + `npm run ingest:documents` handles
   everything *after* that human step (matching each file to its tender by
   the procedure number in its own text, classifying document type,
   sha256-hashing for reuse) — verified against the real 50-page
   Convocatoria below (all 54 procedure-number occurrences found, one per
   page header; two real classifier bugs found and fixed in the process,
   see the commit history).
2. **LLM provider: Anthropic, decided.** `lib/ingestion/extract-requirements.ts`
   + `npm run extract:document` calls `claude-opus-5` via the Anthropic
   TypeScript SDK (`client.messages.parse` + `zodOutputFormat`, PDF as a
   base64 `document` content block, prompt-cached system instructions) to
   produce `qualifications`/`experienceRequirements`/`requiredDocuments`/
   `risks` in exactly the shape those fields already have in
   `types/tender.ts`. **Not live-tested** — this environment has no
   `ANTHROPIC_API_KEY`, so every request shape is copied from current SDK
   documentation and confirmed to compile/typecheck, but the actual model
   output has never been seen. Run `npm run extract:document -- <pdf>
   <tender-slug>` against a real document once a key is configured, read
   the output critically before trusting it, and expect the prompt to need
   at least one real iteration. Locale: the model is asked for `es` (a
   paraphrase, not a verbatim legal quote) and a real `zh` translation;
   `en` is mirrored from `es` like `text-utils.ts`'s `untranslated()`
   already does elsewhere — no fabricated English, per the Chinese-only
   product direction.

#### What a real Convocatoria actually contains (read one end-to-end)

Read the full 50-page Convocatoria for `IA-60-N56-901026999-T-50-2026`
(ISSEA, Aguascalientes — the same tender that's row 2 of
`__fixtures__/sample-comprasmx-open-tenders.xlsx`, so this is a real
document for a tender already in the pipeline). Two findings that change
the extraction design:

- **~95% of it is legally-mandated boilerplate**, near-identical across
  every LAASSP procedure of the same (Ley, Tipo de Procedimiento,
  Carácter) combination: glossary, who may not bid (17 fractions), the 23
  `causales de desechamiento`, rescission/conciliation/inconformidad
  procedures, penas convencionales, garantía rules. Sending 50 pages of
  this to an LLM per tender would pay repeatedly for the same answer.
  Cheaper design: author the standard requirement/risk bundle **once per
  (Ley, Tipo de Procedimiento, Carácter) combination** and attach it by
  reference; spend LLM calls only on what's actually tender-specific.
- **The genuinely tender-specific technical requirements are NOT in the
  Convocatoria** — it repeatedly defers to a separate "ANEXO TÉCNICO" and
  "Anexo No. 00" (the document checklist), which are separate files not
  included in this PDF. So "extract the requirements for this tender"
  needs the Anexos, not just the Convocatoria — a tender maps to *several*
  documents, which is why `tender_documents` is per-document with its own
  hash rather than one blob per tender.

What the Convocatoria alone does yield, verified against this real one:
generic-but-real qualifications (SAT `opinión de cumplimiento` positive
and <30 days old, IMSS social-security opinion, INFONAVIT no-debt
certificate, notarised power of attorney, `declaración de integridad`),
and real risk flags (`penas convencionales` at 4-per-thousand per day of
delay capped at the performance bond; a 10% `garantía de cumplimiento`
due within 10 calendar days of contract signature; 23 distinct grounds
for outright rejection, including submitting in a currency other than MXN
or a language other than Spanish — both directly relevant to a foreign
bidder).

#### Volume: why manual document retrieval is actually tractable

Measured on the real 515-row open-tenders export rather than assumed:
deadlines span 36 days, so steady state is **~14 new tenders/day across
all of Mexico** (federal + state, all sectors), ~6/day after
Pre-Screening keeps only flagship tier. And **only 82 of 515 (16%) are
open to foreign bidders at all** — the other 84% are `NACIONAL`, biddable
only by a Mexican legal entity.

That 16% is also concentrated: mostly medical/health supply
(osteosynthesis, endoprostheses, infusion pumps, interventional radiology
services — health institutions buy internationally); only 3 are
`works` scope. **Infrastructure/EPC/power tenders are almost entirely
`NACIONAL`.** That's a market-structure fact, not a data gap: a Chinese
EPC firm needs a Mexican entity or local partner to bid on those at all —
which is how such firms usually operate in LatAm anyway. Product
implication: `participationScope` should be a prominent *label* ("needs a
Mexican legal entity"), not a default filter that would hide 84% of the
market from customers who do have one.

So the document-retrieval funnel is single-digit documents per week for a
given customer segment, not hundreds per day — manual retrieval is fine
at this stage, and the real scaling path is (a) fetch on demand for
tenders a user actually opens, cached by `content_hash` so the cost is
paid once across all subscribers, then (b) if volume ever justifies it,
official channels: a formal bulk-data request through Mexico's
transparency system (PNT/INAI) or a data-sharing arrangement with the
operating agency. Not headless-browser automation against the anti-bot
gate, at any volume.

Once both are real, the pipeline this schema is already shaped for:

- **Storage**: `tender_documents` (existed since `0001_init.sql` as an
  unpopulated placeholder; `0007_tender_documents_extraction_tracking.sql`
  adds `source_url` (the real government URL, for provenance —
  independent of `storage_url`, this platform's own hosted copy),
  `content_hash` (sha256 of the raw file), and `extraction_status`
  (`pending`/`extracted`/`failed`/`not_extractable`) + `extracted_at`.
- **Extraction, once per unique document**: PDF → text (OCR fallback for
  scanned pages — this session already confirmed `poppler-utils`/
  `pdftoppm` works in this environment for that) → one LLM call per
  document producing `qualifications`/`experienceRequirements`/
  `requiredDocuments`/`risks` in exactly the shape those fields already
  have (`TenderRequirement`/`TenderRisk` in `types/tender.ts` — no schema
  change needed for the extraction output itself, just a populated
  pipeline). `content_hash` is the reuse key: same "analyze once, all
  subscribers reuse" cost-control principle already applied to
  `lib/relevance.ts` — a document that's already been extracted (hash
  match) is never re-sent to the LLM; ingestion just re-links the existing
  `tender_requirements`/`tender_risks` rows to the tender.
- **Confidence/verification**: `TenderRequirement.sourceReference` and
  `TenderRisk.sourceReference` already exist for exactly this — the
  extraction prompt should be required to cite where in the document a
  claim came from (page/section), not just assert it, matching the
  platform's original "Confidence Checking" design intent. No FK from
  `tender_requirements`/`tender_risks` to a specific `tender_documents`
  row yet — `source_reference` as free text is enough until the real
  extraction shape shows whether one's actually needed (e.g. extracting
  from one combined context vs. per-document).
- **Translation**: same LLM call (or a second pass) should also produce
  the `zh` field for description text this extraction pipeline itself
  outputs (`TenderRequirement`/`TenderRisk` — the model is already asked
  for both `es` and `zh` per field, see extract-requirements.ts). Built
  separately from title/summary translation below, since those need a
  translation pass over every already-ingested tender, not just the ones
  that get a document extracted.

### Title/summary translation — es→zh on Haiku 4.5, built and untested

`lib/ingestion/translate-titles.ts` + `npm run translate:tenders` is now
built: batches (25 per call) of already-ingested tenders whose
`title.zh === title.es` (the `untranslated()` mirror every mapper writes —
see `text-utils.ts`) through `client.messages.parse` + `zodOutputFormat`
on **Haiku 4.5**, not Opus 5 — an explicit user decision, since
translating a title/summary is mechanical compared to
`extract-requirements.ts`'s document-comprehension work, so the
cheap/fast tier is the right fit for it specifically. Skips
`relevance_tier: "excluded"` tenders (no point paying to translate what
the default feed never shows). Writes only `title.zh`/`summary.zh` back
via a plain `UPDATE` per tender (not a batched upsert like
`upsert-tenders.ts` — a partial upsert would need every `NOT NULL` column
present or Postgres tries to validate the INSERT branch's missing columns
before it can even discover the conflict; a plain `UPDATE` on an
already-existing row has no such requirement). `title.en`/`summary.en`
stay mirrored from `es` — `en` is never a target locale for this
Chinese-only product.

**Not live-tested**, same caveat as document extraction — no
`ANTHROPIC_API_KEY` in this environment. One real design choice already
made without live testing: no `cache_control` on the system prompt here,
unlike `extract-requirements.ts` — that file's system prompt is long
enough to clear the minimum cacheable-prefix threshold and is genuinely
reused across many real documents; this file's system prompt is short
(likely under that threshold) and the actual batch content is different,
volatile data on every call, so caching would silently do nothing rather
than save anything. Run `npm run translate:tenders -- --limit 20 --write`
against a small real batch once a key is configured, and read the
Chinese output critically (proper nouns, technical terms) before running
it unlimited.

## `governmentLevel` and `industry` are best-effort guesses (mostly)

Shared in `heuristics.ts`. Three tiers of confidence, strongest first:

1. **`compras-mx-contracts-mapper.ts`** reads `Orden de gobierno` directly
   off the row (`inferGovernmentLevelFromOrden`) — a real field, not
   inferred, confirmed APF/GEM.
2. **`compras-mx-open-tenders-mapper.ts`** has no such column, but derives
   the same APF/GEM signal from `NÚMERO DE IDENTIFICACIÓN`'s structure
   (`inferGovernmentLevelFromProcedureNumber` in `heuristics.ts`) — per
   the real `DD_PIC_CONTRATOS_2400703.xlsx` data dictionary, "Número de
   procedimiento" is `XX-##-XXX-XXXXXXXXX-X-#-####` where `##` is "Clave
   del ramo" (02–51 = APF, 60–91 = GEM). Not just documented — checked
   against the full real 23,597-row contracts file, which has both this
   field and the ground-truth `Orden de gobierno` column: the extraction
   predicted the correct value for 23,552/23,552 rows where it parsed
   (100%), falling back to the buyer-name heuristic for the other 45. This
   matters in practice: on the real 515-row open-tenders file, the old
   buyer-name-only heuristic guessed "federal" for 427/515 rows (83%, since
   most buyer acronyms like SIAPA/ISSEA/CCIH don't match any
   state/municipal keyword and fall through to the federal default) —
   the procedure-number derivation instead gives a real 243 state /
   272 federal split.
3. **`compranet5-mapper.ts`** and OCDS records with no procedure-number
   field to parse fall back to `inferGovernmentLevel(buyerName)` — regex
   over the buyer name, reasonable for well-known buyers (CFE, PEMEX,
   "Municipio de X") but not authoritative. Treat as needing human review,
   same as the platform's original "Confidence Checking" design intent —
   no `confidence_score` column exists yet, deliberately, to avoid a schema
   change before Phase 6 actually needs one.

**Update: `industry` is now `industries: string[]`, via a real multi-tag
classifier.** Every connector used to hardcode `industry = "General"`
except `compras-mx-contracts-mapper.ts` (real `Descripción Ramo` column)
and `ocds-mapper.ts` (OCDS item classification) — and even those are
government-branch labels, not the kind of category a bidder filters by.
`lib/industry.ts`'s `classifyIndustries()` (same rule-based keyword-
matching posture as `lib/relevance.ts`) now runs uniformly across every
mapper against real title/description/buyer text (plus a source's own
real category field, like `Descripción Ramo`, fed into the same haystack
rather than special-cased). It returns an array, not a single value — a
railway project is genuinely both `transportation` and `construction`, a
power-plant SCADA upgrade both `power` and `ict_telecom`, and the schema
change reflects that (`supabase/migrations/0008_tender_multi_industry.sql`
replaces the `industry text` column with `industries text[]`).

Category set (product decision, minimum required): `education`,
`healthcare`, `tax`, `energy` (oil & gas / renewables), `power`
(electricity grid — deliberately separate from `energy`: different
buyers, PEMEX-shaped vs. CFE-shaped), `ict_telecom`, `transportation`,
`construction`; plus `mining`/`water`/`manufacturing` added on top since
they're common, real categories in Mexican public procurement, and
`general` as the always-present fallback. Labels are in
`lib/tender-labels.ts`'s `INDUSTRY_LABELS` (the first UI element that
used to show raw English strings — "Energy", "ICT/Telecom" — in an
otherwise all-Chinese interface; now properly localized).

## `participationScope` — whether a foreign bidder can participate at all

The most directly bid/no-bid-relevant field either real Compras MX export
carries: `Carácter del procedimiento` ("Carácter" in the open-tenders
export). Confirmed identical real values in both sources — on the full
23,597-row contracts file: 16,575 `NACIONAL`, 2,807 `INTERNACIONAL
ABIERTO`, 1,279 `INTERNACIONAL BAJO LA COBERTURA DE TRATADOS`; on the
515-row open-tenders file: 433 / 31 / 51 respectively. Mapped 1:1 via
`inferParticipationScope` (`heuristics.ts`) into
`national`/`international_open`/`international_treaty` and shown as-is on
the tender detail page.

Deliberately **not** interpreted further — this platform doesn't assert
which countries a given `INTERNACIONAL BAJO LA COBERTURA DE TRATADOS`
procedure's treaty actually covers (Mexico's major trade agreements don't
uniformly include China), and getting that wrong would be actively
misleading for the exact bid/no-bid decision this field exists to inform.
That interpretation belongs in Phase 6 (real, verified legal/trade
research), not guessed here.

## DOF — now built, real data confirmed

The user captured real DOF daily-edition API responses (a `ListaDiarios`
lookup — date range in, `codDiario` edition codes out — and a per-`codDiario`
notice list). Confirmed real, not guessed: 95 notices in one real day's
edition, exactly 1 title-matched as a tender ("Convocatoria de la
licitación pública LPEM No. 01/16..."). `dof-mapper.ts` +
`connectors/dof-file.ts` + `npm run ingest:dof` map only title/date/
buyer/page — DOF carries no value, deadline, or scope data, so this stays
the lighter connector predicted below. `sourceUrl` uses
`dof.gob.mx/nota_detalle.php?codigo=<id>&fecha=...`, cross-referenced from
a real DOF URL found in unrelated research (not captured for this exact
endpoint) — flagged as a strong inference, not a directly verified link.
Files decode as latin-1, not GB18030 like the Compras MX exports —
confirmed by decode success.

### CFE tenders confirmed in DOF — and the search endpoint isn't anti-bot gated

Closed the loop this was for: searched DOF's advanced search
(`sidof.segob.gob.mx/busquedaAvanzada/busqueda`) for "Comisión Federal de
Electricidad" and got 79 real hits, several filed under the literal DOF
section **"CONVOCATORIAS PARA CONCURSOS DE ADQUISICIONES, ARRENDAMIENTOS,
OBRAS Y SERVICIOS DEL SECTOR PUBLICO"** — DOF's own tender-notice
category, dated the same day. **CFE tenders are real, current, and
findable in DOF.** Captured the actual request that renders the results
table: `POST sidof.segob.gob.mx/busqueda/CargaNotasAvanzadas/`
(DataTables server-side format + `tipoBus`/`textoBus`/`fechaIni`/
`fechaFin`/`idOrg` params). **This endpoint carries no `grc`/`igrc`/`xgrc`
anti-automation headers** — just a `ci_session` cookie, the routine
session cookie any visitor gets, not a deliberate challenge like Compras
MX's search API. `dof-search-mapper.ts` + `connectors/dof-search-file.ts`
+ `npm run ingest:dof-search` map this response shape.

**Important: this endpoint's fields mean something different from the
daily-edition endpoint's.** There, `codOrgaUno` is a short branch code
(PE/PJ/...) and `codOrgaDos` is the publishing department. Here,
`codOrgaUno` instead carries the section name (the tender-category string
above, when it's a tender) or the branch's full name, and the buyer name
lives inside the title itself ("`<BUYER> - REF:<number>`", parsed by
`dof-search-mapper.ts`) rather than a dedicated field — confirmed by
comparing two real notes about CFE side by side (a tariff notice had
`codOrgaUno: "EMPRESAS PUBLICAS DEL ESTADO MEXICANO"`,
`codOrgaDos: "COMISION FEDERAL DE ELECTRICIDAD"`; a tender notice had
`codOrgaUno` set to the section name and `codOrgaDos: null`). Two
separate mappers on purpose, not one merged type — conflating them would
silently mislabel a section name as a buyer name or vice versa.

**Still not built: an actual live fetcher.** Confirmed anti-bot-free
doesn't mean confirmed automatable from here — this session can't reach
`*.gob.mx` at all to test a live request end-to-end (get a `ci_session`
cookie, then POST with it), so both DOF connectors still read a
locally-saved response file, same as every other source in this project.
Worth revisiting if the platform ever runs somewhere with real network
access to verify against.

### DOF is a CFE/PEMEX supplement, not a general replacement for Compras MX

`dof-search-mapper.ts` has no CFE-specific logic — searching any buyer
name works the same way — but it should only ever be *run* for CFE/PEMEX
(and their subsidiaries), not for buyers already covered by Compras MX
(IMSS, SICT, SAT, ...). Two reasons: DOF's fields are far sparser (no
value, deadline, scope, or `participationScope` — Compras MX's summary
exports are strictly richer for anything they actually cover), and the
set of buyers that genuinely need this workaround is small and legally
closed — "Empresas Productivas del Estado" is a specific constitutional
status the 2013-2014 energy reform created for exactly CFE and PEMEX,
not an open category.

**A real search for "Petróleos Mexicanos" surfaced a naming trap, not
PEMEX**: every hit was **Instituto Mexicano del Petróleo (IMP)** — a
SENER-affiliated research institute that shares the word "Petróleo" but
has nothing to do with PEMEX's Empresa Productiva del Estado status
(`codOrgaUno: "PODER EJECUTIVO"` / `"SECRETARIA DE ENERGIA"` for its
general notices, same `CONVOCATORIAS...` section as CFE for its tender
ones — IMP is a normal federal entity, unrelated to the CFE/PEMEX
question). **Follow-up search for "PEMEX" directly confirmed it**: 348
real hits, several dated the same day and titled plainly
"PETROLEOS MEXICANOS - REF:<number>" under the same `CONVOCATORIAS...`
section as CFE's. Both target buyers are now confirmed real in DOF —
PEMEX's tender volume there (348 hits for a ~1-year window) is
noticeably higher than CFE's (79), consistent with oil & gas being a
heavier-procurement sector. IMP remains a useful negative example kept in
the fixture: same section, same title shape, wrong company — a reminder
that `organismos=EPEM` (or comparing `codOrgaDos` on the buyer's
non-tender notices) is the more precise filter than a plain name search
whenever a target buyer's name overlaps another real institution's.

This same real data also caught a mapper bug: some titles prefix a short
internal unit code before the buyer name ("018T0O - INSTITUTO MEXICANO
DEL PETROLEO - REF:579186" vs. plain "INSTITUTO MEXICANO DEL PETROLEO -
REF:573547" for the same buyer on an older notice) — `parseBuyerAndRef`
now strips a leading short all-caps/digit code specifically, rather than
naively splitting on the first "-", which would have also mangled real
buyer names that legitimately contain one (confirmed real:
"COMISION FEDERAL DE ELECTRICIDAD A RUEGO Y ENCARGO").

### CFE's own portal is WAF-protected; PEMEX's is not — checked both directly

Both CFE and PEMEX run their own procurement portals outside Compras MX
(see above). Both were checked directly, with different outcomes:

**CFE (`msc.cfe.mx`)** — a real captured request/response for its search
endpoint (`POST .../Procedure/getProcBusqueda`) carries `X-Cdn: Imperva`
and `visid_incap_*`/`incap_ses_*`/`nlbi_*` cookies: a commercial WAF/
bot-mitigation product, the same category of deliberate anti-automation
gate as Compras MX's `grc`/`igrc`/`xgrc` tokens (different vendor, same
posture). Per this project's standing policy, no connector was built
against it.

**PEMEX (`pemex.com/procura/.../concursosabiertos`)** — checked the same
way and found the opposite: this is an on-premises SharePoint Server 2019
site (`_spPageContextInfo.isSPO: false`) with `isAnonymousUser: true`.
Its standard, Microsoft-documented REST API
(`_api/web/lists?$select=Title,Id,ItemCount`) answered a plain
unauthenticated request with no WAF cookies, no signed tokens, nothing —
confirmed by literally visiting the URL in a browser with no special
tooling. This is not a workaround or a reverse-engineered endpoint; it's
SharePoint's own public REST surface, left open to anonymous visitors the
same way the page itself is.

That enumeration call revealed one SharePoint list per PEMEX subsidiary,
all under the same site, all with an identical item shape:

| List | Items | Subsidiary |
|---|---|---|
| `Concursos-Abiertos-PTI` | 8,382 | Transformación Industrial (refining) |
| `Concursos-Abiertos-PEP` | 2,067 | Exploración y Producción |
| `Concursos-e-invitaciones` | 593 | Invitation-only procedures |
| `Concursos-Abiertos-PL` | 488 | Logística |
| `Concursos-Abiertos-PE` | 181 | Corporate |
| `Concursos-Abiertos-PF` | 48 | Fertilizantes |
| `Concursos-Abiertos-PPS` | 17 | — |
| `Concursos-Abiertos-PCS` | 1 | Cogeneración y Servicios |

`pemex-mapper.ts` / `connectors/pemex-file.ts` / `scripts/ingest-pemex.ts`
were built and verified against a real, full 2,067-item export of the PEP
list (`_api/web/lists/getbytitle('Concursos-Abiertos-PEP')/items`,
captured via a browser Console `fetch()` + Blob download, same "read a
file a human exported from their own session" posture as every other
connector here — see the fixture `sample-pemex-pep.json` for a small,
diverse real sample). 2,065 of 2,067 items mapped (2 dropped for missing
`descripcion`).

Two real findings from running the mapper against the full export:

- **The list name is misleading.** "Concursos Abiertos" (Open Tenders) is
  a historical archive back to at least 2015, not a live "currently open"
  view — real items carry `vencimiento` (expiration) dates years in the
  past sitting alongside ones dated today. `status` is derived by
  comparing `vencimiento` to now (309 of 2,067 came back "open"), the same
  posture as `inferStatus()` in `compras-mx-open-tenders-mapper.ts` for an
  analogous "misleadingly-named source" problem.
- **`tipoevento`'s three real values** ("Nacional" 331 / "Internacional
  bajo TLC" 1,634 / "Internacional" 102) are worded differently from
  Compras MX's "Carácter del procedimiento" ("INTERNACIONAL ABIERTO" etc.)
  for the same underlying concept, so `pemex-mapper.ts` has its own exact
  lookup rather than reusing `inferParticipationScope()` from
  `heuristics.ts`.
- **`vencimiento` is not a submission deadline.** Caught only once real
  data was live in the app's own UI (a screenshot showing every PEP card's
  "提交截止日期" reading 2028): `vencimiento` is 1-2 years out from
  `inicio` for every real item checked (e.g. created 2026-08-27,
  vencimiento 2028-08-27) — it's this standing Concurso Abierto
  mechanism's own validity/expiration window, not a one-time bid cutoff
  the way Compras MX's "FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES"
  genuinely is. It was originally also mapped into `submissionDeadline`
  alongside driving `status` — removed from `submissionDeadline` (kept
  only for `status`), since telling a bidder "you have until 2028 to
  submit" is actively misleading for the bid/no-bid decision this field
  exists to inform, not just imprecise.

**Update: verified against all seven real subsidiary lists that carry
real data** (all but `Concursos-Abiertos-PCS`, see below), not just PEP. A
paginated version of the same Console `fetch()` snippet (follows
`odata.nextLink` past SharePoint's 5,000-item-per-request cap) pulled
full real exports for PTI, PL, `Concursos-e-invitaciones`, PE, PF and PPS
as well:

| List | Buyer used | Items | Mapped | Currently open |
|---|---|---|---|---|
| Concursos-Abiertos-PTI | Pemex Transformación Industrial | 8,382 | 8,374 | 2,543 |
| Concursos-Abiertos-PEP | Pemex Exploración y Producción | 2,067 | 2,065 | 309 |
| Concursos-e-invitaciones | Petróleos Mexicanos (PEMEX) | 592 | 592 | 143 |
| Concursos-Abiertos-PL | Pemex Logística | 488 | 488 | 132 |
| Concursos-Abiertos-PE | Petróleos Mexicanos (PEMEX) | 181 | 181 | 0 |
| Concursos-Abiertos-PF | Pemex Fertilizantes | 48 | 48 | 1 |
| Concursos-Abiertos-PPS | Pemex Perforación y Servicios | 17 | 17 | 0 |
| **Total** | | **11,775** | **11,765** | **3,128** |

`Concursos-Abiertos-PCS` (1 item) was pulled but deliberately excluded:
its only row is `Title`/`descripcion` both literally "Registro de prueba"
("test record") — an obvious placeholder entry, not a real tender, so
ingesting it would just plant fake data. A real, if minor, reminder that
"the list exists" doesn't mean every row in it is real procurement data.

A real find in the `Concursos-e-invitaciones` sample: it includes PEMEX's
own medical-goods procurement ("Adquisición de diversos materiales para mantenimiento de las
Unidades Médicas de los Servicios de Salud de Petróleos Mexicanos") —
directly relevant to the medical/health-goods expansion decided earlier
in this project.

That list also surfaced a second real procedure type: not every list is a
"Concurso Abierto" — `Concursos-e-invitaciones` mixes in "Invitación a
Cuando Menos Tres Personas" (a real, distinct LAASSP/LOPSRM-equivalent
procedure, not a naming quirk), so `mapPemexConcursoItemToTender()` takes
a `procedureLabel` parameter (defaults to "Concurso Abierto") rather than
hardcoding one label for every source list; `ingest-pemex.ts` exposes it
as `--procedure-label`.

Capturing an item-list export (the input `ingest-pemex.ts` reads) uses a
paginated Console snippet, following `odata.nextLink` past SharePoint's
5,000-item-per-request cap:

```js
async function pullPemexList(listTitle, filename) {
  const base = "https://www.pemex.com/procura/procedimientos-de-contratacion/concursosabiertos/_api/web/lists/getbytitle('" + listTitle + "')/items";
  const select = "$select=Id,Title,descripcion,inicio,vencimiento,tipoevento,tiposuministro,areacontratante,Created,Modified,Attachments";
  let url = base + "?" + select + "&$top=5000&$orderby=Modified desc";
  let all = [];
  while (url) {
    const r = await fetch(url, {headers:{Accept:"application/json;odata=nometadata"}});
    const d = await r.json();
    all = all.concat(d.value);
    url = d["odata.nextLink"] || null;
  }
  const blob = new Blob([JSON.stringify(all)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
await pullPemexList("Concursos-Abiertos-PPS", "pemex-pps.json");
```

### PEMEX document references — the metadata half, not the download

Each item's `Attachments: true` only says files exist, not what they are.
Getting the real file names/URLs needs one more call per item:
`_api/web/lists/getbytitle('<List>')/items(<Id>)/AttachmentFiles` — same
anonymous, anti-bot-free access as everything else on this site. Run this
in the browser Console (swap `listTitle`/`filename`; `onlyOpen=true`
limits the AttachmentFiles round trips to currently-open items only,
since fetching all 11,758 items' attachments one by one would be slow and
mostly pointless for expired procedures):

```js
async function pullPemexAttachments(listTitle, filename, onlyOpen = true) {
  const base = "https://www.pemex.com/procura/procedimientos-de-contratacion/concursosabiertos/_api/web/lists/getbytitle('" + listTitle + "')/items";
  let url = base + "?$select=Id,Title,vencimiento,Attachments&$top=5000&$orderby=Modified desc";
  let items = [];
  while (url) {
    const r = await fetch(url, {headers:{Accept:"application/json;odata=nometadata"}});
    const d = await r.json();
    items = items.concat(d.value);
    url = d["odata.nextLink"] || null;
  }
  const now = new Date();
  // Filtering client-side, not via $filter=Attachments eq true: a real
  // attempt at that server-side filter silently returned 0 items (not an
  // error) — this SharePoint's REST implementation doesn't support
  // filtering on the Attachments field, the same way it does on ordinary
  // list columns.
  const targets = items.filter(i => i.Attachments === true && (!onlyOpen || (i.vencimiento && new Date(i.vencimiento) > now)));
  console.log("fetching attachments for", targets.length, "items...");
  const results = [];
  for (const item of targets) {
    const r = await fetch(base + "(" + item.Id + ")/AttachmentFiles", {headers:{Accept:"application/json;odata=nometadata"}});
    const d = await r.json();
    results.push({Id: item.Id, Title: item.Title, files: (d.value || []).map(f => ({FileName: f.FileName, ServerRelativeUrl: f.ServerRelativeUrl}))});
  }
  const blob = new Blob([JSON.stringify(results)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
await pullPemexAttachments("Concursos-Abiertos-PEP", "pemex-pep-attachments.json");
```

`ingest-pemex-attachments.ts` reads that export, matches each entry to an
already-ingested tender by the same `pemex-${slugify(Title)}` slug
`pemex-mapper.ts` uses, and records `{file_name, source_url,
document_type}` rows in `tender_documents` (`document_type` via
`detectDocumentType()` from `document-intake.ts`, reused as-is — it
already accepts a filename with no text, which is all that's available
here since nothing gets downloaded). `extraction_status` stays `pending`;
dedup key is `source_url` rather than `content_hash`, since there's no
downloaded content yet to hash.

**Deliberately stops at metadata, same posture as Compras MX documents**:
this records where each document is, not the document itself. PEMEX's
portal has no anti-bot gate, so an actual byte-level downloader is
possible here in a way it isn't for Compras MX — just not built yet
(out of scope for this pass).

**Verified against a real 309-tender/3,933-file PEP export** (all
currently-open PEP items). Two real problems found and fixed along the
way:

- The Console snippet's first version used a server-side
  `$filter=Attachments eq true`, which silently matched 0 items (not an
  error) — this SharePoint's REST layer doesn't support filtering on that
  field. Fixed by filtering client-side instead (see the snippet above).
- Chrome blocked the attachments export's automatic download (a third
  script-triggered download in the same tab) with no visible error beyond
  an address-bar icon — the "successful" run silently produced an empty
  file. Worth knowing if a future capture session mysteriously downloads
  an empty/stale file: check for a blocked-download notification before
  assuming the API returned nothing.

Real PEMEX file names turned out to need two small `document-intake.ts`
classifier additions (it was written against Compras MX naming, and
already gets reused here since it takes a bare filename fine): a `bases`
type (e.g. "02_Bases Iniciales_...zip" — the actual substantive
tender-terms document, distinct enough from `anexo_tecnico` to need its
own type) and a bare `\bfallo\b` fallback after every self-titling check
(PEMEX names it "Fallo_....pdf" directly, not "Acta de Fallo..." the way
Compras MX documents do). Result on the real 3,933-file export:
convocatoria 125, bases 603, fallo 45, contrato 26, unknown 3,134 (up
from 3,782 before the fix). The remaining `unknown` majority is real
procedural paperwork (Q&A rounds — "Recep de Preguntas"/"Notificación de
Resp", deadline extensions — "Diferimiento"/"Reactivación", bid-opening
minutes — "Acta de Apertura") — deliberately left unclassified rather
than force-mapped into an existing type that means something more
specific, since qualification/requirement extraction (this platform's
actual Layer 2 target) only needs Convocatoria and Bases, not the
procedural trail.

### First real `--write` run against Supabase — and two more real bugs it found

This environment's own outbound network policy blocks arbitrary external
hosts (confirmed via `$HTTPS_PROXY/__agentproxy/status`'s
`recentRelayFailures` — a 403 "policy denial" on the CONNECT tunnel,
naming the Supabase project host explicitly, the same class of block
seen earlier for `pemex.com` and `msc.cfe.mx`), so the actual `--write`
run happened on the user's own machine instead, against a real Supabase
project with all 7 migrations applied. Two real bugs surfaced by finally
exercising this path for the first time in the project's history:

- **Every ingest script's `--fixture --write` silently no-opped.** The
  dry-run guard was `if (useFixture || !shouldWrite)` — always true
  whenever `--fixture` was set, regardless of `--write` — so "smoke-test
  the write path against the fixture" did nothing, across all six scripts
  that copied this pattern. Fixed to `if (!shouldWrite)`.
- **None of the `tsx scripts/*.ts` commands loaded `.env.local` at all.**
  Only Next.js's own dev/build does that automatically; a standalone tsx
  script needs it explicitly. Every script in `package.json` now runs
  with `--env-file-if-exists=.env.local` (the `-if-exists` variant
  specifically, since this repo has run dry-run-only with no `.env.local`
  present for its entire history until now, and the plain `--env-file`
  hard-errors when the file is missing).

With both fixed, a real write against the full 2,067-item PEP export was
attempted and the attachments export against it recorded real
`tender_documents` rows for the matching tenders — the 2 items dropped by
the mapper (missing `descripcion`) correctly logged as "skipped, no
ingested tender matches" rather than either crashing or silently losing
those documents. **Correction**: this section originally claimed all
2,065 mapped tenders upserted cleanly — the real run actually only
upserted 1,565 and failed the other 500 as one whole batch; see the next
section for the actual bug and fix.

### Second real `--write` session — three more real bugs it found

A later real run — PEMEX `--write` against the full PEP export, plus
first-time real writes for Compras MX contracts, Compras MX open tenders,
and CompraNet5 — surfaced three more real bugs, none reachable from a
fixture or a dry run:

- **PEMEX: "ON CONFLICT DO UPDATE command cannot affect row a second
  time" failed a whole 500-row batch at once**, not just the offending
  rows — 500 of 2,065 tenders in that run. Root cause: `upsertTendersBatched`
  (`upsert-tenders.ts`) chunks tenders into 500-row batches and upserts
  each as one `.upsert(rows, { onConflict: "slug" })` call, which Postgres
  treats as one SQL statement — and Postgres rejects a single statement
  that would update the same conflict-key row twice. A real PEMEX export
  genuinely repeats the same procedure (same slug) more than once, so two
  duplicate-slug rows landing in the same 500-row batch failed that
  entire batch, not just the duplicates. Fixed by de-duplicating by slug
  (last occurrence wins) across the whole input before chunking, so every
  batch's conflict keys are guaranteed unique.
- **`compras-mx-contracts` and `compras-mx-open-tenders` both worked
  correctly on the first real `--write` run** (254/254 and 515/515
  upserted respectively) — no new bugs in either mapper. These numbers
  also confirm the recency filter (see "Recency filter" above) is doing
  real work: of 20,661 mapped Compras MX contracts, only 254 fell within
  the last 6 months and were kept.
- **CompraNet5 mapped 0 of 13,400 real rows** — not an encoding bug (the
  earlier UTF-8→latin-1 fallback fix was real and correct, and this run
  proves the file parsed fine). The real cause: `compranet5-mapper.ts`
  was built against the wrong schema entirely. See the `compranet5-mapper.ts`
  entry above for the full real-header comparison and the fix.

### Original framing (still accurate for what DOF _isn't_)

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

**Newly relevant: DOF may be the only real path to CFE/PEMEX.** Confirmed
via real 2025 data (23,597 contracts, 515 open tenders) that CFE and
PEMEX have **zero** rows in Compras MX — as state productive enterprises
("Empresas Productivas del Estado," 2013-2014 energy reform) they run
their own procurement regimes (CFE: `msc.cfe.mx`; PEMEX: SISCeP/HIIP via
`pemex.com/procura`), not LAASSP/LOPSRM. Neither publishes an OCDS feed or
bulk API — only retrospective, static awarded-contract CSVs on
`datos.gob.mx`. But PEMEX's own "Disposiciones Generales de Contratación"
(DOF, 2021-10-08) explicitly requires publishing the convocatoria summary
in DOF before a licitación can start — a real legal citation, not
inferred; CFE's equivalent obligation is plausible (same 2013-2014 reform
family) but not confirmed with an equally direct quote.

**DOF's own API/open-data structure is still unverified** — re-checked:
`sidof.segob.gob.mx/datos_abiertos` and `sidof.segob.gob.mx/apiStatus`
are real government URLs (found via search) but unreachable from this
environment; the only concrete "API" descriptions found are a stale 2012
third-party scraper (`github.com/imco/dof-api`, hitting undocumented PHP
endpoints like `WS_getDiarioFecha.php`) and a commercial value-added
search service, neither a real official API to build against. Same
pattern as every other source here: needs the user to visit
`sidof.segob.gob.mx/datos_abiertos` directly and share what's actually
there (a sample bulk file, or a captured request if it's interactive)
before a connector gets written.

## Multi-country expansion (strategic direction — Colombia now has a real connector)

The product direction is **Latin America Tender Intelligence for Chinese
Enterprises** — Mexico, Brazil, Colombia, Chile, Peru. Portuguese (for
Brazil) is part of that long-term direction but explicitly deferred for
now — the app stays zh/en/es. Each new country needs the same treatment
Mexico got — real docs or a real sample file — before its connector is
written; guessing at an API shape produces a placeholder, not a working
connector, per this file's own history.

### Colombia — SECOP II via `datos.gov.co`, real and unauthenticated

Confirmed real by a direct, unauthenticated browser request (no login,
no API key) returning 5 real rows: Colombia's official open-data portal
(`datos.gov.co`, a Socrata deployment) hosts **"SECOP II - Procesos de
Contratación"** (resource id `p6dx-8zbt`, published by Agencia Nacional
de Contratación Pública — Colombia Compra Eficiente), 9,097,326 rows as
of this writing. The dataset's own "Exportar conjunto de datos" dialog
defaults to SODA3 (which needs an auth token), but the plain SODA2 read
endpoint needs none for a public dataset:

```
https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=N&$offset=M
```

This is a materially easier source than anything on the Mexico side —
no anti-bot layer to work around (like Compras MX/CFE), no anti-bot-free-
but-undocumented-shape reverse engineering (like DOF/PEMEX), just a
standard, publicly documented open-data API. `colombia-mapper.ts` /
`connectors/colombia-secop-file.ts` / `scripts/ingest-colombia.ts` are
built and verified against the real 5-row sample
(`sample-colombia-secop.json`) — all 5 mapped correctly, including a real
find: `estado_del_procedimiento` values like "Seleccionado" do NOT mean
"awarded" despite the name (seen on rows where `adjudicado: "No"`) — the
real awarded signal is `adjudicado` itself, checked directly rather than
inferred from the friendlier-sounding phase name.

Not yet done: pulling past the 5-row sample (needs `$limit`/`$offset`
pagination and almost certainly a `$where` date filter — 9M rows is not
a "dump the whole thing" source), and broadening `inferScopeType()`,
which is currently just an exact lookup over the 2 distinct
`tipo_de_contrato` values the 5-row sample happened to contain.

### Currency unified to USD platform-wide

Adding a source with real values in a currency other than MXN (Colombian
COP) surfaced a real bug before it shipped: `lib/relevance.ts`'s value
thresholds were MXN-scale, and a raw COP figure compared directly against
them would be wildly over-classified (COP is worth roughly 1/4,200 of a
USD — a real COP 57,333,333 tender, worth about USD 13,650, would have
cleared the "significant" bar meant for actual high-value opportunities).
`lib/currency.ts` is now the single shared (approximate, static — this
environment can't reach a live FX API) currency→USD rate table, used by
both `lib/relevance.ts` (thresholds now in USD) and
`lib/format.ts`'s `formatEstimatedValueUsd()` (the one place the app
displays a value — a Chinese enterprise comparing opportunities across
countries sees one consistent unit instead of mentally converting several
currencies per session). Real source currency is still what's stored
(`tender.currency`) — conversion happens at display/classification time,
not by overwriting the real ingested value.

### Filtering refined: a real-value floor, plus wider routine-service keyword coverage

`lib/relevance.ts`'s `excluded` tier previously only caught routine
services by keyword — a tender with a genuinely tiny value (a few office
chairs, a single small repair) but no matching keyword still landed in
`standard` and showed in the default feed. Added `MIN_VALUE_USD` (10,000):
a tender with a *known* estimated value under that floor is now excluded
too, unless `hasIncludeOverride` matched (the same override that protects
a flagged technical category — e.g. `subestación`, `fibra óptica` — from
the keyword list also protects it here, since a small line item inside a
genuinely significant technical project shouldn't be dismissed on value
alone). Deliberately does **not** apply when `estimatedValue` is missing
— most Mexican open-tenders rows carry no value at all, and absence isn't
evidence of smallness. The two exclusion reasons (routine-service keyword
vs. too-small value) now show distinct explanations in the UI
(`EXCLUDED_REASON_BY_SIGNAL` in `relevance.ts`) even though both hide from
the default feed identically.

Also widened `EXCLUDE_KEYWORDS` with more routine-procurement categories
common across Mexican/Colombian government tenders (bottled water,
uniforms, vehicle rental, cafeteria/coffee service, fire-extinguisher
recharge, routine landline phone service, cleaning-supply consumables) —
added without a specific real observed case this time (unlike every other
keyword addition in this project, which was added after seeing it in real
data), since none was available when this was designed. Flag if any of
these turn out to be over- or under-matching once real data surfaces
cases — this is the one place in this file where a rule was added on
general knowledge of the domain rather than a confirmed real example.

**Update — `MIN_VALUE_USD` raised to 50,000, plus a second unverified
keyword batch.** Per explicit user direction: before adding the next
batch (software license renewals; fuel/gas/chemical consumables), every
real fixture file and every real finding documented in this README was
searched for those terms first — none appear anywhere in this project's
real data so far, so there was nothing to ground these in (unlike the
project's normal bar). Added anyway, deliberately scoped to "for our own
internal operations" phrasing rather than a bare "combustible"/"gas"/
"químicos" — those bare words would also catch a real large-value
fuel-supply-for-power-plant or industrial-process-chemical contract,
which can be a genuinely flagship-tier opportunity this list must not
swallow. The chemicals pattern also deliberately avoids "reactivo"
(already a `FLAGSHIP_INDUSTRY_KEYWORDS` term for clinical lab reagents,
added earlier in this file) so the two lists can't collide on the same
tender — verified with a synthetic test case (a lab-reagents tender
containing both "reactivo" and "productos químicos" still classifies as
`significant`, not `excluded`) since no real one was available either.
Flag any of these — the value floor included — the moment real data
shows over- or under-matching.

### Brazil / Chile / Peru — still unbuilt

Brazil PNCP, Chile Mercado Público/ChileCompra API, Peru SEACE/OECE/OCDS
— none of these have been checked yet. Same posture as Colombia before
this session: needs a real, verified capture (an unauthenticated request
returning real rows, or a real downloaded export) before a connector gets
written, not assumed from general knowledge of what these portals
probably look like.
