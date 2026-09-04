# Data Ingestion — Phase 5

What's real, what's a verified-working architecture, and what's an
explicitly-flagged placeholder. Read this before touching anything here.

## Operating runbook — the real manual capture step, per source

**No source in this project has a live, scheduled fetcher today** — "live"
here means the ingest script itself makes the real HTTP request, not that
anything runs automatically on a timer (see the note below the table).
Two sources are automatable in that sense (Colombia's SECOP II tender
list and its document downloads — see "SECOP II tender list — automated"
and "SECOP II tender documents" below). Every other source's ingest
script reads an already-downloaded local file; a human has to capture
that file first, by one of three real techniques depending on the
source. This section is
the operational quick-reference — the *why* behind each technique, and
every real endpoint/field finding it depends on, is in the dated
sections further down; this is just "what do I actually click/paste."

None of these run on any schedule — every capture below is a manual,
on-demand action; there is no cron/daily automation anywhere in this
project yet.

| Source | Capture technique | Ingest command |
|---|---|---|
| Compras MX — contracts | Browser download button | `npm run ingest:comprasmx-contracts -- <file>.csv --write` |
| Compras MX — open tenders | Browser export button | `npm run ingest:comprasmx-open -- <file>.xlsx --write` |
| CompraNet 5.0 (historical) | Browser download button | `npm run ingest:compranet5 -- <file>.csv\|.xlsx --write` |
| DOF — daily edition | DevTools Network capture | `npm run ingest:dof -- <file>.json --write` |
| DOF — advanced search (CFE/PEMEX) | DevTools Network capture | `npm run ingest:dof-search -- <file>.json --write` |
| PEMEX — subsidiary lists | Browser Console script | `npm run ingest:pemex -- <file>.json --buyer "<name>" --write` |
| PEMEX — attachment references (+ optional real download) | Browser Console script (list only — the files themselves download automatically) | `npm run ingest:pemex-attachments -- <file>.json --write [--download]` |
| Colombia — SECOP II process list (manual, offline fallback) | Direct browser request | `npm run ingest:colombia -- <file>.json --write` |
| Colombia — SECOP II process list (automated) | **Automatic — no capture step** | `npm run ingest:colombia-live -- --write` |
| Colombia — SECOP II documents | **Automatic — no capture step** | `npm run ingest:colombia-documents -- --proceso <id> --tender-slug <slug> --write` |
| Ecopetrol — contracts | Browser download button (public page, no login) | `npm run ingest:ecopetrol-contracts -- <file>.xlsb --write` |
| Ecopetrol — convocatorias | Copy-paste the on-page table (public page, no login) | `npm run ingest:ecopetrol-convocatorias -- <file>.tsv --write` |
| Peru — OECE OCDS (automated) | **Automatic — no capture step** | `npm run ingest:peru-live -- --write` |
| Peru — OECE OCDS (manual, offline fallback) | Download + unzip a monthly file | `npm run ingest:peru -- <file>.json --write` |
| Proyectos Estratégicos MX (Hacienda strategic-infrastructure-law projects, supersedes the retired Proyectos México source) | Browser export button (same "Información Pública" format as Compras MX open tenders, no anti-bot gate) | `npm run ingest:proyectos-estrategicos -- <file>.xlsx --write` |

Every `ingest:*` command also accepts `--fixture` (runs against the small
real sample already committed under `__fixtures__/`, no capture needed)
and `--months N` (default 6 — see "Recency filter" below).

### How current is each source's *own* data — separate question from the `--months` filter

`--months`/`filterRecentTenders()` only controls what this platform
*keeps* after ingesting — it can't make a source's underlying data any
newer than the source itself actually publishes. This table is the
other, real question: as of when a source is queried/captured, how far
back does its "latest" data actually go? Verified per-source, not
assumed — several of these (Peru especially) turned out more nuanced
than a first pass assumed.

| Source | How current, as of capture/query time |
|---|---|
| Compras MX — contracts / open tenders | **Genuinely current** — a live government portal; a human's export reflects whatever is posted at the moment they download it. No inherent lag beyond "whenever someone last ran the export." |
| CompraNet 5.0 | **Historical only, not current** — this is Mexico's *retired* pre-2021 procurement system, superseded by Compras MX. A real 13,400-row export mapped 12,877 rows, nearly all older than the 6-month recency window — confirmed by the user's own run, who then chose to skip ingesting it for exactly this reason. Useful for historical/statistical reference, not for finding open tenders. |
| DOF — daily edition / advanced search | **Current only for the specific date(s) a human captures** — the DOF publishes one edition per day; each capture is a snapshot of that day's (or search window's) content, not an ongoing feed. No automatic "give me today's" without a human re-running the capture. |
| PEMEX — subsidiary lists / attachment references | **Genuinely current at capture time** — a live SharePoint REST API reflecting PEMEX's currently posted items; only "stale" in the sense that nothing re-runs it automatically. |
| Colombia — SECOP II process list (`ingest:colombia-live`) / documents | **Genuinely live** — the automated connector issues a real `$where`-filtered query at run time; this is the most current source in the project, with zero batch/file lag at all (not even "last night's export" — this second's data). |
| Ecopetrol — contracts | **Snapshot-dated, not always-current** — the real downloaded filename itself carries a cutoff (`contratacioncortejun2026.xlsb`, "corte jun2026" = a June 2026 snapshot), suggesting the source page publishes periodic dated snapshots rather than always serving today's data. Getting anything newer means checking the source page again for a later "corte," not just re-running the same download. |
| Ecopetrol — convocatorias (Ley de Garantías) | **Historical/bounded — confirmed real, hard cutoff, not a live feed.** Tied to a real Colombian pre-election "garantías electorales" disclosure period; the user confirmed directly that the real data only goes up to June, with no July-onward rows, because the disclosure window itself closed. This will never get more current no matter how often it's re-checked, unless a future election cycle opens a new window. |
| Peru — OECE OCDS (`ingest:peru-live` / `ingest:peru`) | **Real, but batched by complete calendar month — not a rolling "current" feed.** The latest available file is always the *previous* full month (confirmed: a September 2026 file request returned a real 404 on 2026-09-02, two days into that month). A tender published on the 1st of a month is invisible until the *following* month's file — up to ~30 days' real lag; one published on the last day of the month appears within about a day. `/records`/`/releases` (the non-file OCDS endpoints) were not tested for whether they serve current-month data live instead — a real, unconfirmed opportunity, not assumed either way. |

None of the "automated" sources above run on a schedule yet (see the
top of this section) — "genuinely current" describes what the data
*would* reflect if run right now, not that it's being kept current
continuously.

### Which sources carry a real reference/estimated value — a separate question from recency

The user asked directly (2026-09-02): which countries/sources have a
usable `estimatedValue`, and which don't? This matters because
`lib/relevance.ts`'s value-based tiers (flagship/significant, and the
`MIN_VALUE_USD` exclusion floor) simply can't fire on a source that
never carries a number — those tenders fall back entirely to
keyword/industry/scopeType signals. Grounded in what each real mapper
actually reads (`lib/ingestion/*-mapper.ts`), not assumed:

| Source | Real field read | Coverage, as actually observed |
|---|---|---|
| Compras MX — **contracts** (awarded) | `Monto sin imp./máximo` / `Importe DRC` | **Usually present** — awarded contracts publish a real peso figure. |
| Compras MX — **open tenders** (via the shared OCDS mapper) | `tender.value.amount` | **Mostly absent** — the real OCDS export from this source overwhelmingly leaves this at 0/missing before award; this is *why* `lib/relevance.ts`'s value checks are all written to skip when `estimatedValue` is `undefined` rather than treat it as "worth $0." |
| CompraNet 5.0 (retired system, historical only) | `Importe del contrato` | **Usually present** — same reasoning as Compras MX contracts (awarded, historical data), moot in practice since this source is skipped for being too old (see the recency table above). |
| DOF — daily edition / advanced search | *(no value field mapped at all)* | **Never** — DOF notices carry no monetary figure in the real data; some don't even carry a real title (`BARE_BUYER_REF_TITLE`, see below). Classification here relies entirely on keywords/industry. |
| PEMEX — subsidiary lists / attachment references | *(no value field mapped at all)* | **Never** — PEMEX's SharePoint listings carry no monetary figure. |
| Colombia — SECOP II (`ingest:colombia-live` and the documents connector) | `precio_base` | **Often present, not universal** — real Socrata rows frequently carry a nonzero `precio_base`; mapped to `estimatedValue` only when `> 0`. |
| Ecopetrol — contracts (awarded) | `Valor Suscrito en Ordenes Despacho` | **Usually present** — same "awarded contract" reasoning as the other awarded-contracts sources above. |
| Ecopetrol — convocatorias (Ley de Garantías) | *(uses the generic OCDS mapper — same field as Compras MX open tenders)* | **Mostly absent**, consistent with pre-award OCDS data elsewhere in this project. |
| Peru — OECE OCDS (`ingest:peru-live` / `ingest:peru`) | `tender.value.amount` | **Frequently `0.0`** — confirmed in the real sample (see `peru-oece-mapper.ts`'s header comment): "absence isn't evidence of smallness," same posture as Compras MX's open-tenders export. When it IS present, real currencies seen are both `PEN` and `USD`. |

The pattern across every source: **awarded/historical contract data
tends to carry a real value; pre-award open-tender data tends not to.**
This is exactly why `lib/relevance.ts` was built to never treat a
missing value as "worth $0" (`MIN_VALUE_USD`/`FLAGSHIP_VALUE_USD` checks
all gate on `normalizedValue !== undefined` first) — for most sources,
the *majority* of open, still-biddable tenders would otherwise be
misclassified as too small.

### Technique 1 — browser download/export button

The simplest real case: the source's own UI has a download/export
control. Compras MX contracts, CompraNet 5.0, and Ecopetrol contracts all
work this way:

- **Compras MX contracts**: open `https://comprasmx.buengobierno.gob.mx/datos-abiertos`,
  find "Contratos ingresados a CompraNet", pick a year, click download.
- **Compras MX open tenders**: open `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/`
  ("Difusión de procedimientos"), filter as needed, click the page's own
  Excel export button.
- **CompraNet 5.0**: same `datos-abiertos` page as Compras MX contracts,
  "Histórico de CompraNet 5.0" instead.
- **Ecopetrol contracts**: open
  `https://www.ecopetrol.com.co/wps/portal/Home/es/GruposInteres/GestionDeAbastecimiento/Gestioncontractual/ContratacionAsignadaFecha`
  (public, no login — confirmed by the user with a screenshot showing the
  public breadcrumb) and click "Ver información."

### Technique 2 — DevTools Network capture (DOF, both connectors)

DOF's advanced search has no download button — the results table is
rendered from an API response, so the response itself is what gets
captured:

1. Open `https://sidof.segob.gob.mx/busquedaAvanzada/busqueda`.
2. Search for the target buyer (e.g. "COMISIÓN FEDERAL DE ELECTRICIDAD",
   or "PETROLEOS MEXICANOS" for PEMEX — **not** "Instituto Mexicano del
   Petróleo," a real, differently-owned entity with a confusingly similar
   name, see "DOF is a CFE/PEMEX supplement" below).
3. Open DevTools (F12) → Network tab.
4. Find the `POST .../busqueda/CargaNotasAvanzadas/` request, open its
   Response, save it as a local `.json` file.
5. `npm run ingest:dof-search -- <file>.json --write`.

The daily-edition connector (`ingest:dof`) captures the same way, from
DOF's daily-edition browsing feature (a `ListaDiarios` lookup, then the
per-edition notice list) rather than the advanced search — see "DOF —
now built, real data confirmed" below for the exact real response shape.

### Technique 3 — browser Console script (PEMEX)

PEMEX's SharePoint site answers anonymous requests directly — no button
needed, just a script pasted into the Console:

1. Open the relevant subsidiary list page, e.g.
   `https://www.pemex.com/procura/procedimientos-de-contratacion/concursosabiertos`.
2. Open DevTools Console (F12), paste and run:

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
await pullPemexList("Concursos-Abiertos-PEP", "pemex-pep.json");
```

Swap the list title for any real subsidiary list: `Concursos-Abiertos-PTI`
/`PL`/`PE`/`PF`/`PPS`, or `Concursos-e-invitaciones`. Attachment
*references* (file names + URLs, not the file bytes — PEMEX's connector
never downloads them, see "PEMEX document references" below) use the
same technique with a second script — full snippet in that section.

### Technique 4 — direct browser request (Colombia's Socrata endpoints)

Colombia's open-data portal needs no button and no script — just a URL
typed directly into the address bar, since the endpoint is public
unauthenticated JSON:

- **SECOP II process list**: `https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=N&$offset=M`
  (paginate `$offset` for more than one page; a real `$where` date filter
  is worth adding once pulling past a small sample — see "Colombia —
  SECOP II" below). Save the response as a local `.json` file, then
  `npm run ingest:colombia -- <file>.json --write`.
- **Ecopetrol convocatorias**: not a JSON endpoint — the real table is
  rendered server-side on
  `https://proveedores.ecopetrol.com.co/es-ES/Convocatorias-p%C3%BAblicas-en-ley-de-garant%C3%ADas/`
  (public, no login), so the capture here is copy-pasting the visible
  table (raise "Mostrar ... registros por página" to show more rows
  first) into a local `.tsv` file — see "Ecopetrol" below for the
  important time-bounded-window caveat.

### The one exception — SECOP II tender documents, genuinely automatic

`npm run ingest:colombia-documents` needs **no capture step at all** — it
fetches real document metadata and downloads real file bytes itself, live,
both confirmed genuinely unauthenticated by the user directly (see "SECOP
II tender documents" below for the full verification). This is the one
piece of this project that doesn't belong in the table above.

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

### Re-classifying already-ingested tenders against the current ruleset

`fetchAllTendersFromDb()` (`lib/db/tenders.ts`) only recomputes relevance
on the fly for legacy rows with no stored `relevance_tier` at all — every
row that already has one (almost everything ingested so far) keeps
showing whatever tier it got at ingest time. `lib/relevance.ts` has
changed a lot since most real data was ingested this session
(`MIN_VALUE_USD` raised $10k→$50k, two real-observed exclude-keyword
batches added, the allowlist gate added) — so the live site is currently
showing stale classifications for most already-ingested tenders, and
"excluded" is always hidden from the default feed (see the comment in
`TenderExplorer.tsx`), so a stale tier isn't just cosmetic.

`scripts/reclassify-tenders.ts` (`npm run reclassify:tenders`) fixes
this: fetches every tender, recomputes relevance with today's rules, and

1. always exports `exports/tenders-kept-<date>.csv` (tier != "excluded",
   what the default feed shows) and `exports/tenders-excluded-<date>.csv`
   (everything hidden) — both carry `previous_tier`/`new_tier`/
   `tier_changed` columns so a changed classification is visible at a
   glance, ready to download and review for the next round of keyword
   tuning;
2. only with `--write`, also `UPDATE`s `relevance_tier`/`relevance_label`/
   `relevance_reason` in Supabase for every row whose recomputed value
   actually differs from what's stored — this is what actually brings
   the live site's feed current. No rows are ever deleted; relevance is
   metadata, safely re-derivable again the next time the keyword lists
   change.

Confirmed the code reaches the real production Supabase instance
correctly: a real run (dry run, no `--write`) returned a real
`Host not in allowlist: <project>.supabase.co` error — this
*environment's* egress block, the same one every other real endpoint
hits in this sandbox, not a bug. Needs a real run on a machine with
network access to actually see the numbers and download the CSVs.

**Real bug found and fixed on the first actual production run**: the
user's first real run silently fetched exactly 1,000 rows with no
error — PostgREST caps an unranged `.select()` at 1,000 rows by default.
This wasn't just this script's problem: `fetchAllTendersFromDb()`
(`lib/db/tenders.ts`, what the live site's `/tenders` page and every
other public listing actually calls) had the exact same unranged
`.select(TENDER_SELECT)`, meaning **the live site itself was silently
capped at showing only 1,000 tenders** once real ingestion pushed past
that count — not a hypothetical, the reclassify run's own 1,000-row
fetch is direct evidence the real count is at or past the cap.
`translate-tenders.ts`'s fetch had the same issue. All three now page
with `.range(from, from + 1000 - 1)` in a loop until a page comes back
shorter than the page size. The other real `.from("tenders")` call sites
(`upsert-tenders.ts`, `ingest-compras-mx.ts`) are per-batch
upserts/single-slug lookups, not full-table selects, so they were never
at risk the same way.

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

**These "<BUYER> - REF:<number>" titles carry zero descriptive content**
— confirmed real from the user's own translation-pipeline test run: 3 of
5 sampled untranslated tenders were exactly this shape (e.g.
"COMISION FEDERAL DE ELECTRICIDAD - REF:579845"), and there's no other
real field on this source to recover a description from (see
`DofSearchNota`'s comment above — `titulo` is genuinely all there is).
Translating or surfacing these adds no information a reader can act on,
so `lib/relevance.ts` now excludes them directly: `BARE_BUYER_REF_TITLE`
tests the real title alone (not the combined keyword-matching haystack,
and deliberately case-sensitive — real Spanish descriptive text always
has lowercase letters, real DOF entity names are always full caps) for
"nothing but a buyer name and a REF: number, start to end." Verified
against all 4 real bare-title examples seen so far (all excluded) and
against synthetic descriptive titles that happen to end in "- REF:12345"
(none excluded — the lowercase-content check protects them).

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

**CFE's per-procedure detail data is gated too, not just the search box**
(2026-09-03, real captured requests from a working browser session on
`msc.cfe.mx/.../Procedure/Details`): every request — including
`Procedure/FechasRecepcionPropuesta`, which returns real per-procedure
data (a key-dates list) — carries the same `visid_incap_*`/`nlbi_*`/
`incap_ses_*` Imperva cookies as the search endpoint, PLUS a
session-bound `__RequestVerificationToken` sent both as a cookie and in
the POST body — an ASP.NET anti-forgery token that only exists after a
real browser session has already loaded the page once. Stricter than
Compras MX's `grc`/`igrc`/`xgrc` tokens, not looser: this isn't "open but
undocumented" the way PEMEX's SharePoint REST API is, it's "requires a
live, freshly-established session, not just no login." Confirms rather
than revises the conclusion above — CFE's own site stays off-limits at
every layer tested so far (search AND detail), so real CFE tender content
still has to come through DOF's notice detail pages (see "LicitIA" section
above's `dof-notice-detail.ts`) instead.

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

**`sourceUrl` bug found and fixed, two rounds (2026-09-03):** every row
above was originally written with `sourceUrl` built from one hardcoded
site-root guess (`.../concursosabiertos/DispForm.aspx?ID=<id>`) shared
across all 7 lists — the user clicked "查看原始来源文件" on a real tender
(`pemex-snr-mad-140-ca-o-2026`) and got PEMEX's own 404 page. First fix
attempt: look up each list's real `DefaultDisplayFormUrl` via the same
anonymous REST API (`_api/web/lists/getbytitle('<title>')?$select=
DefaultDisplayFormUrl`) and point each subsidiary at its own real
`Lists/<ListInternalName>/DispForm.aspx` path instead of the site root.
That path was real (matched the REST property exactly) but STILL didn't
work: opening it redirected to `pemex.com/acceso-denegado`, a real PEMEX
login form — this SharePoint's anonymous access covers the REST *data* API
but not this rendered *UI* page, a narrower anonymous surface than the
earlier `isAnonymousUser: true` finding implied. No anonymous per-item deep
link exists anywhere on this site, confirmed by hitting the actual wall
rather than assuming one didn't exist.

Second, landed fix: point `sourceUrl` at each subsidiary's own real
**search page** instead — confirmed genuinely public (the user loaded one,
`Paginas/Pemex-Transformación-Industrial.aspx`, with no login prompt, real
search form and results table visible). Real page filenames for all 7
lists enumerated via an anonymous REST folder listing
(`_api/web/getfolderbyserverrelativeurl('.../Paginas')/files`), not
guessed — but only 4 of the 7 known lists (PEP, PTI, PL, and a
best-effort match `Pemex.aspx` for PE) turned out to have a matching page
in that listing; PF, PPS, and Concursos-e-invitaciones have none, so those
three fall back to the root search page. `pemex-mapper.ts` now takes a
`listTitle` parameter (`SEARCH_PAGE_PATH_BY_LIST_TITLE`) instead of a bare
`sourceUrl` string, and `ingest-pemex.ts` requires `--list-title` to build
it correctly going forward. `scripts/fix-pemex-source-urls.ts` repairs
already-written rows by inferring which list each came from via `(buyer,
procedureType)`, since the list itself was never stored as its own column.

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

**Metadata-only by default, same posture as Compras MX documents** —
this records where each document is, not the document itself, unless you
pass `--download`. PEMEX's portal has no anti-bot gate, so unlike Compras
MX an actual byte-level downloader is possible here, and it's now built:
`npm run ingest:pemex-attachments -- <file>.json --write --download`
fetches each real file's bytes (`downloadPemexDocument()` in
`connectors/pemex-attachments-file.ts` — a plain unauthenticated
`fetch()`, no anti-bot workaround needed), saves them under
`downloads/pemex/<tender-slug>/` (same "never re-served to users, only
used to update structured info" posture as
`ingest-colombia-documents.ts` — `tender_documents.storage_url` stays
unset either way), and records a real `content_hash` instead of relying
on `source_url` alone for dedup. Only `.pdf` files get
`extraction_status: "pending"`; other real PEMEX attachment formats
(`.zip` bases packages, etc.) are downloaded and recorded but marked
`"not_extractable"` until a non-PDF extraction path exists. Not yet
verified against a real `--download` run — the metadata-only path above
was the one verified against the real 309-tender/3,933-file PEP export;
`--download` reuses the same anonymous fetch already confirmed to work
for that export's `AttachmentFiles` calls, so no new access assumption is
being made, but the download+hash+save path itself is untested against
real bytes.

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

### Ecopetrol — Colombia's PEMEX-equivalent state oil company, two real public sources found

Same question asked of Mexico's state productive enterprises (do they run
their own procurement outside the general platform?) applies to Colombia
too. First real finding was a negative one: Ecopetrol's supplier portal,
`proveedores.ecopetrol.com.co`, is not the SharePoint-with-anonymous-REST
pattern PEMEX turned out to have — the user confirmed directly that most
of it **requires login**. Later confirmed by the user: the actual bidding
workflow behind that login runs on **SAP Business Network** (formerly SAP
Ariba) — a real, standard enterprise procurement platform, not something
specific to Ecopetrol, and consistent with why registration is gated.

Two real, genuinely public (no login) pages were found on the same
portal domain, though, and both now have working connectors:

- **`ecopetrol-contracts-mapper.ts` + `connectors/ecopetrol-contracts-xlsb-file.ts`**
  — Ecopetrol's own **"Contratación asignada a la fecha"** disclosure,
  actually hosted on the main corporate site
  (`ecopetrol.com.co/wps/portal/.../Gestioncontractual/ContratacionAsignadaFecha`,
  confirmed by the user with a screenshot showing the public breadcrumb
  trail and a direct download link — not the login-gated supplier
  portal). A real `.xlsb` (binary Excel) file, one sheet per year
  (2016–2026); the 2026 sheet alone has 5,506 real rows, 17 real columns,
  zero missing values, zero duplicate contract numbers. This is an
  **awarded-contracts registry** (`status: "awarded"` always), same
  posture as `compras-mx-contracts-mapper.ts`/`compranet5-mapper.ts` —
  historical intelligence, not open-to-bid tenders. Real finds while
  parsing it: dates are Excel serial numbers (verified the exact epoch
  conversion — `1899-12-30` base — against Python before porting to
  TypeScript, confirming e.g. serial `46096` → `2026-03-15`, a plausible
  date for a 2026-sheet row); the two value columns are year-suffixed
  (`"Valor Suscrito en Ordenes Despacho en Pesos en 2026"`), so the reader
  finds them by prefix match rather than a hardcoded year; real supplier
  countries in the 2026 sheet include 2 from China, 152 from the US, 14
  from Mexico, alongside 5,285 from Colombia itself — genuine evidence of
  Ecopetrol contracting with foreign suppliers, not just domestic ones.
  Needed adding the `xlsx` (SheetJS) npm package — this project's
  existing `exceljs` dependency reads `.xlsx` (OOXML) only, not the
  binary `.xlsb` format this real file turned out to be.
- **`ecopetrol-convocatorias-mapper.ts` + `connectors/ecopetrol-convocatorias-file.ts`**
  — the **"Convocatorias públicas en Ley de Garantías"** page (confirmed
  public by the user directly opening it with no login), a DataTables
  widget with the real tender list rendered server-side (no separate API
  call needed — confirmed by inspecting a captured network request that
  turned out to just be Microsoft OneCollector page-view telemetry, not
  the actual data), so the intake is a plain tab-separated copy-paste of
  the visible table. Real, important scope caveat the user confirmed
  directly: **"Ley de Garantías"** is Colombia's pre-election
  restricted-contracting disclosure law — this page only lists
  convocatorias published under that legally-mandated window, and rows
  stop appearing once the window closes (confirmed real: nothing past
  June 2026 in what the user could see). This is a real, valuable, but
  **time-bounded batch, not a continuously live feed** — unlike SECOP II
  or the contracts export above. A genuinely year-round public tender
  list, if one exists, would be under the portal's "Procesos" section
  instead — not checked yet.

Both mappers verified against small real fixtures (`sample-ecopetrol-contratacion.xlsb`,
built from 3 real rows of the actual file; `sample-ecopetrol-convocatorias.tsv`,
3 real rows the user pasted) — dates, COP amounts, and relevance
classification all checked by hand against the source values, not just
"the script ran."

### SECOP II tender list — automated, no manual capture step needed

The main SECOP II process dataset (`p6dx-8zbt`, documented in
`colombia-mapper.ts`) is the same real, unauthenticated Socrata endpoint
`ingest-colombia.ts` already reads from a manually-captured file — it
just turns out the ingest script itself can make that request directly,
same as the documents dataset below. Built as
`lib/ingestion/connectors/colombia-secop-live.ts` +
`scripts/ingest-colombia-live.ts` (`npm run ingest:colombia-live --
--write`), reusing the exact same `mapSecopRowToTender()` mapper —
nothing about the mapping changes, only how the raw rows arrive.

The one real constraint this dataset imposes that the documents dataset
doesn't: **9,097,326 rows total**, far too many to page through. A full
`$offset`-paginated dump isn't viable, so this connector always applies a
server-side `$where=fecha_de_publicacion_del >= '<sinceDate>'` filter
(SoQL, not client-side) computed from `--months`, the same 6-month
default every other source uses — plus `$order=fecha_de_publicacion_del
DESC` and a `--max-pages` cap (default 20 × 1,000 rows = 20,000) as a
safety net in case the real recent-window row count turns out larger
than expected. `filterRecentTenders()` still runs afterward too, as a
second, exact check against the same real `publicationDate` every other
source uses — cheap, and it guards against the `$where` cutoff and
`filterRecentTenders()`'s own cutoff math ever drifting apart.

Confirmed the code reaches the real endpoint with the correct query
shape: a live run (`--max-pages 1`) against the real `p6dx-8zbt` resource
returned a real `403 Forbidden` — this *environment's* egress block, the
same one every other real gov endpoint hits in this sandbox, not a bug
in the request (same evidence pattern as the documents connector below).
Not yet run for real against an unblocked network — the `$where` SoQL
syntax and the pagination loop are unverified against real Socrata
response shapes beyond that one blocked request; worth a close look at
the row count and a couple of sample rows on the first real `--write`
run before trusting it at scale.

The manual, file-based `ingest-colombia.ts` stays as-is — an offline
fallback (works from a saved export with no network access at ingest
time) and useful for re-processing a specific already-captured page.

### SECOP II tender documents — genuinely automatable, unlike Mexico

The user asked directly whether Colombia's tender attachments could be
fetched automatically instead of needing a human to download them first
(the posture every Mexican source needs — Compras MX is anti-bot gated,
PEMEX's attachments connector deliberately never downloads bytes). The
answer turned out to be yes, confirmed real end-to-end:

1. Colombia's open-data portal hosts a **second real Socrata dataset**
   specifically for document metadata — "SECOP II - Archivos Descarga
   Desde 2025" (resource id `dmgg-8hin`), found via search and confirmed
   real by the user with a direct unauthenticated request
   (`datos.gov.co/resource/dmgg-8hin.json?$limit=5`). Real fields:
   `id_documento`, `proceso` (the SECOP process id, same shape as
   `id_del_proceso` in the main `p6dx-8zbt` dataset — NOT necessarily the
   same as a tender's `tenderNumber`, which prefers
   `referencia_del_proceso`), `nombre_archivo`, `tamanno_archivo`,
   `extensi_n`, `fecha_carga`, `entidad`, `nit_entidad`, and — the real
   find that makes this automatable —
   `url_descarga_documento.url`, a per-document direct download link on
   `community.secop.gov.co`.
2. That download link is **genuinely unauthenticated** — confirmed by
   the user opening one in a private/incognito browser window (no
   session cookie) and it downloaded immediately, no login. The
   downloaded file's real size matched the dataset's own
   `tamanno_archivo` value exactly (29,155 bytes) — not just "a file
   downloaded," a verified match to the real metadata.
3. Real find while inspecting the 5-row sample: this dataset spans
   SECOP II's **whole contract lifecycle**, not just tender-stage
   documents. 4 of 5 real rows carried a
   `n_mero_de_contrato` (contract number) and were post-award
   contract-management paperwork (a payment receipt, a supervisor
   designation, an insurance certificate); the one row without a
   contract number was a genuine pre-award document (a market-analysis
   study, part of Colombia's standard "Estudios Previos" pre-tender
   package). `isPreAwardDocument()` in the connector uses that
   structural signal (contract number present/absent) rather than a
   filename guess to skip the post-award noise — thin evidence (n=1 for
   the "clean" case), needs broadening once more real data is seen.

Built as `lib/ingestion/connectors/colombia-documents-connector.ts` +
`scripts/ingest-colombia-documents.ts` — the first script in this
project to make live HTTP requests itself (fetch metadata, then download
each file's real bytes) rather than reading an already-downloaded local
file, since both real endpoints turned out to need no auth. Confirmed the
code reaches the real endpoint correctly (a live run against the real
`proceso` id from the 5-row sample returned a real `403 Forbidden` —
this *environment's* egress block, the same one that blocks every other
real gov endpoint touched this session, not a bug in the request). Per
explicit product direction — this platform never offers tender document
downloads to its own users, only the structured information Layer 2
extracts from them — downloaded files are saved locally only (ready for
`npm run extract:document`) and `tender_documents.storage_url` is
deliberately never populated; only `source_url` (real government link,
provenance) and a real `content_hash` (computed from the actual
downloaded bytes — a first, since PEMEX's reference-only connector never
had bytes to hash) are recorded. Non-PDF real files (`.xlsx`, `.zip`
both seen in the 5-row sample) are downloaded and recorded but marked
`extraction_status: "not_extractable"` — `extract-requirements.ts` only
reads PDFs.

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

### Ten real observed titles, plus a real medical-equipment-vs-consumables bug they surfaced

The user's next batch was the first grounded in **actual titles from the
live site** rather than domain knowledge — a real course-correction after
the two speculative batches above. Ten titles, each added as a specific,
scoped `EXCLUDE_KEYWORDS` pattern rather than a broad generalization:
routine road maintenance (not new road construction — "carretera" stays a
`FLAGSHIP_INDUSTRY_KEYWORDS` signal), a single overhead-crane purchase,
staff training, computer/telecom spare parts (would otherwise have hit the
`telecom` flagship keyword — real proof the exclude-before-flagship check
order matters, not just a theoretical concern), routine HVAC/cooling-unit
maintenance, small-scale rural sanitation construction (would otherwise
have hit the `construcción` flagship keyword — same real proof), a social
program's food supply, vendor IT support (Oracle), and event logistics.
Verified against all ten plus three control titles (real medical imaging
equipment, a real bridge, a real power-plant fuel contract) that must
stay classified normally — all thirteen behaved correctly.

One of the ten was a real bug, not just a missing keyword:
**"ADQUISICIÓN Y SUMINISTRO DE INSUMOS DE OSTEOSÍNTESIS Y ENDOPRÓTESIS"**
was already matching `FLAGSHIP_INDUSTRY_KEYWORDS`'s medical-goods pattern
(`osteosíntesis|endoprótesis|prótesis|implante|ortopedia`, added earlier
in this file after the 82-of-515-foreign-biddable analysis) — meaning it
was being actively promoted to `significant`/`flagship`, not just left
unfiltered. The user's product scope is medical **equipment**, not
consumables/implants — a real, previously-undecided scope boundary this
example forced. Fixed by moving that pattern (plus `reactivo`, and
`medicamento|fármaco|insumo médico|material de curación`, both already in
`FLAGSHIP_INDUSTRY_KEYWORDS`) to `EXCLUDE_KEYWORDS`, removed from
`FLAGSHIP_INDUSTRY_KEYWORDS` entirely rather than left duplicated (a term
always shadowed by `EXCLUDE_KEYWORDS`'s earlier check serves no purpose
staying in the flagship list too). `equipo médico`/imaging/lab-equipment/
infusion-pump/ventilator/dialysis-machine patterns are genuine equipment
and stay untouched. This makes the earlier "reactivo" collision-avoidance
comment on the chemicals keyword (previous section) now describe a
resolved situation, not a live one — left as-is since it's still an
accurate record of that decision at the time.

### Allowlist gate — built, hybrid with the blocklist

Raised by the user after the previous batch: instead of (or in addition
to) an ever-growing `EXCLUDE_KEYWORDS` blocklist, gate the default feed on
*positively* matching a target industry (via the existing multi-tag
`lib/industry.ts` classifier) or clearing a high value bar — "白名单"
(allowlist) rather than "黑名单" (blocklist). Real tradeoff flagged before
building it: a blocklist's misses are visible (a junk tender sits in the
list, a human notices, reports it — exactly how the previous section's
ten examples arrived); an allowlist's misses are silent (a genuinely
relevant tender using unanticipated terminology just never appears, and
nobody knows to report an absence). Latin American procurement phrasing
varies a lot across countries/sources, and `classifyIndustries()` is
rule-based matching, not exhaustive.

Direction agreed and built as a **hybrid**, not a replacement: keep
`EXCLUDE_KEYWORDS` (cheap, catches unambiguous noise) and add one targeted
gate at the very end of `classifyRelevance()` — a tender reaching that
point already failed every positive signal above it (not keyword-excluded,
cleared the value floor, didn't match `FLAGSHIP_INDUSTRY_KEYWORDS`, didn't
clear `SIGNIFICANT_VALUE_USD`). If it *also* carries no target-industry
tag at all (`input.industries` is exactly `["general"]` — the
`classifyIndustries()` fallback for "no keyword matched") **and** no known
value, there's nothing left distinguishing it from noise, so it's excluded
too — a new `"industry"` signal on the existing `excluded` tier, with its
own explanation text (`EXCLUDED_REASON_BY_SIGNAL`), not a new tier. Kept
deliberately narrow: a tender with a real value (even below
`SIGNIFICANT_VALUE_USD`) still shows as `standard` — a concrete dollar
figure is itself a legitimizing signal even when the source text doesn't
use any `INDUSTRY_KEYWORDS` phrasing — so the `general`-tagged bucket
isn't wiped out, only the "no industry AND no value" combination is,
which is the specific weak-signal case the discussion above was about.
Uses `input.industries` (the multi-tag result callers already computed
via `classifyIndustries()`) rather than re-running `FLAGSHIP_INDUSTRY_KEYWORDS`
against title text, so a tender tagged from a real source field (e.g.
Compras MX's `Descripción Ramo`) still counts even when its title text
alone wouldn't match.

Verified with five synthetic cases (no real "silently gated out" example
available to check against yet, same caveat as the earlier speculative
batches): a general-only/no-value tender is now excluded; the same
tender with a real $80k value stays `standard`; an `education`-tagged
tender with no value stays `standard` (has an industry tag); a
`healthcare`-tagged tender with real equipment terms still reaches
`significant`. Also fixed a parallel inconsistency this surfaced:
`lib/industry.ts`'s `healthcare` keyword pattern still matched the same
consumable terms (osteosíntesis, reactivo, medicamento, ...) just moved
out of `FLAGSHIP_INDUSTRY_KEYWORDS` in the previous section — a tender
`relevance.ts` now excludes shouldn't still carry a `healthcare` tag
implying it's a target opportunity, so the same terms were removed there
too.

### Twelve more real observed titles — the allowlist gate's real blind spot

A second real batch, arriving right after the allowlist gate shipped —
and two of these twelve are exactly the blind spot that section's own
tradeoff discussion predicted, just from the opposite direction (a false
positive the gate can't catch, not a false negative): **"REHAB. DE
SISTEMAS DE CAPTACIÓN DE AGUA POTABLE EN LA LOCALIDAD DE TIXKUNCHEIL"**
(a small rural water-catchment repair) and **"ADQUISICIÓN DE MOBILIARIO Y
EQUIPO PARA EQUIPAR AULA MULTISENSORIAL"** (classroom furniture) both get
a real `water`/`education` tag from `classifyIndustries()` — which means
the allowlist gate's `hasTargetIndustry` check does NOT exclude them,
since having *any* industry tag is exactly what rescues a tender from
that gate. The gate answers "does this have a target-industry signal at
all," not "is this genuinely significant within that industry" — a
small-scale, routine tender inside a real target sector still needs
`EXCLUDE_KEYWORDS` specifically, the gate doesn't substitute for it.
Two more of the twelve are the same "keyword match promotes it, EXCLUDE_KEYWORDS
must run first to stop that" bug as the previous batch's "refacciones"/
"sanitarios rurales": **"SERVICIO MÉDICO SUBROGADO DE RESONANCIA
MAGNÉTICA"** and **"SERVICIO PARA TRATAMIENTO SÍNDROME DE APNEA
OBSTRUCTIVA DEL SUEÑO"** are outsourced medical *services* (paying a
third party to run a scan or a treatment program), not equipment
purchases — but "resonancia" alone is a `FLAGSHIP_INDUSTRY_KEYWORDS` term
for imaging *equipment*. Fixed with a `servicio médico subrogado|servicio
(médico )?(para|de) tratamiento` pattern requiring "servicio" as the
anchor word specifically, so a genuine "equipo ... para tratamiento
oncológico" (an actual equipment purchase that happens to mention
"tratamiento") still isn't caught — verified with that exact synthetic
title as a control case, alongside a real MRI-equipment-purchase title, a
real water-treatment-plant construction title, and a real bridge title,
all of which still classify normally.

The remaining eight: cardiac-screening consumables (medical materials,
same "equipment only" principle as before), a combined
"actualización/mantenimiento preventivo/soporte" IT-support phrase,
routine air-conditioning maintenance, one street's sidewalk work
("embanquetado"), a food-products purchase (different real phrasing —
"productos alimenticios" — from the "alimentos" pattern the previous
batch already added), one small neighborhood's local pipe network
("circuito hidráulico" — would otherwise have hit the "construcción"
`FLAGSHIP_INDUSTRY_KEYWORDS` match, same class of bug as "sanitarios
rurales"), and swimming-pool maintenance. One of the twelve — "ARTÍCULOS
DE ASEO GRUPO DE SUMINISTRO 350" — needed no new rule at all; it was
already caught by the `artículos de aseo` pattern from the very first
speculative batch, a real confirmation that pattern was correctly scoped.

### `scopeType === "equipment"` joins the allowlist gate; a real "vehicles" industry added

A third real batch — this time 18 titles the user evaluated directly as
legitimate opportunities, plus an explicit question: should "车"
(vehicles) become its own industry, given how much government vehicle
buying happens via tender (fleet buses, tanker trucks, heavy
machinery)? Checking why several of these were being excluded surfaced
a real structural gap, not just missing keywords: most of the batch
(laptops, a video-inspection robot, transformers, a resistivity system,
industrial equipment, vehicles, heavy machinery) are `scopeType ===
"equipment"` — a real, structured signal `compras-mx-open-tenders-
mapper.ts` already derives from an exact lookup on the source's own
"Tipo de contratación" field (`ADQUISICIONES`/`ARRENDAMIENTOS` ->
`"equipment"`, not a guess) — yet the allowlist gate only ever checked
`industries`/`estimatedValue`, never `scopeType`, so a genuine
"Adquisición de X" with no matching industry keyword and no listed
value (extremely common in the open-tenders export — see the "no value
at all" note earlier in this file) fell straight through to excluded.
Since "this tender is a real goods/equipment acquisition" is exactly
this platform's core interest, `scopeType === "equipment"` now counts
as its own positive signal in the gate, alongside the existing
industry-tag and known-value checks. `EXCLUDE_KEYWORDS` still runs
*before* the gate, so routine equipment-shaped noise (office supplies,
uniforms, vehicle *rentals*) stays excluded regardless — verified with
regression controls, no change in outcome for any of those.

Two items in the batch are real *services*, not equipment, so the
`scopeType` fix doesn't reach them — added directly to
`INCLUDE_OVERRIDE_KEYWORDS` instead: `seguridad perimetral` (a managed
perimeter-security infrastructure service — fencing/sensors/cameras,
not a routine guard contract) and the fire alarm/detection/suppression
system phrasing. A third services item, the private-cloud
virtualization one, needed no new rule — already covered by `nube
privada` from the earlier ICT batch.

New `vehicles` `IndustryKey` added (`lib/industry.ts` + `tender-
labels.ts`, zh: "车辆") for the explicit ask: `vehículo(s)`, the real
`vehs\.` abbreviation seen in "22 VEHS. CISTERNA," `camión(es)`,
`autobús(es)`, `maquinaria pesada` — deliberately distinct from
`transportation` (which here means transit *infrastructure/services*,
not buying the vehicles themselves). A few other existing industry
patterns were also broadened with real variant phrasings hit by this
batch: `equipo médico` -> also `equipamiento médico` (healthcare, kept
in sync with `FLAGSHIP_INDUSTRY_KEYWORDS`), `equipo industrial` -> also
`equipamiento industrial` (manufacturing), and `power` gained
`transformador(es)` and `casa de máquinas` (a hydroelectric plant's
powerhouse equipment) while `energy` gained `resistividad` (geophysical
exploration equipment). One title needed a narrowly-scoped structural
signal instead of a keyword: "ELABORACIÓN DEL PROYECTO RAMO: DEL KM
150+000 AL KM 170+000 CAMPECHE" mentions no road/carretera word at all,
just the real Mexican federal-highway kilometer-marker notation — added
`\bkm\s*\d+\+\d{3}\b` to `construction`.

Verified against all 18 real titles (0 still excluded) and against
regression controls (office cleaning, HVAC maintenance, office
supplies, uniforms, vehicle *rentals*, and the earlier ICT/bare-title
batches) — no false positives introduced.

### Peru — OECE OCDS, confirmed real and built (a third automated country, alongside Colombia)

Peru's real endpoint went through the same "confirmed real, not guessed"
process as everything else in this README, entirely through the user's
own browser (this sandbox can't reach `*.gob.pe` — every direct fetch
attempt, and even `WebFetch`, returned `ENOTFOUND`/`EGRESS_BLOCKED`):

1. **The institution renamed itself** — "Organismo Supervisor de las
   Contrataciones del Estado (OSCE)" became "Organismo Especializado
   para las Contrataciones Públicas Eficientes (OECE)." The old
   `contratacionesabiertas.osce.gob.pe` subdomain genuinely stopped
   resolving as a result (a real `ENOTFOUND`, not this sandbox's egress
   block — confirmed by the *different* error type on the new domain:
   `contratacionesabiertas.oece.gob.pe` returned `EGRESS_BLOCKED`
   instead, meaning it resolves fine and is only blocked by this
   sandbox specifically). Search results kept surfacing the old domain
   since most indexed pages predate the rename.
2. **Base URL and full endpoint set confirmed directly from the live
   Swagger docs** (`contratacionesabiertas.oece.gob.pe/api`, screenshotted
   by the user): `GET /release/{id}`, `/release/{sourceId}/{tenderId}`,
   `/releases`, `/releasesAfter` (Release endpoints); `/record/{ocid}`,
   `/record/{sourceId}/{tenderId}`, `/records`, `/recordsAfter` (Record
   endpoints); `/file/{source}/{type}/{year}/{month}`, `/files` (bulk
   download endpoints) — all OAS 3.0, `source` ∈ `seace_v3`/`seace_v2`,
   `type` ∈ `csv`/`xlsx`/`json`/`sha`.
3. **A real `Try it out` + `Execute` run confirmed the exact base URL**
   (`https://contratacionesabiertas.oece.gob.pe/api/v1`) and that no
   auth is needed: `GET /file/seace_v3/json/2020/01` → real `200`, a
   1.85MB ZIP (`content-disposition: attachment;
   filename="2020-01_seace_v3_json.zip"`). `GET /files?page=1` returned
   a real listing — most recent entry `seace_v3-2026-08`
   (`timestamp: "2026-09-01T12:05:18..."`) — real, current data, not
   stalled at 2023 the way some indexed documentation implied. **The
   real lag pattern is not a flat "~1 month," though** — this was
   corrected after the user pushed back on that first characterization
   (checked on 2026-09-02, only 2 days into September): `GET
   /file/seace_v3/json/2026/09` returned a real `404`, confirming these
   are **complete-calendar-month batch files**, each published shortly
   after its month closes (the August file's `last-modified` was
   2026-09-01). That means the *current* month is invisible through
   this endpoint the entire time it's in progress — a tender published
   on September 1st doesn't appear until the October file is published,
   nearly a full month later, while one published September 30th
   appears within about a day. The real lag for the most recent tenders
   ranges roughly 1–30 days depending on where in the calendar month a
   tender was published, not a fixed number. `/records`/`/releases`
   (the non-bulk-file Record/Release endpoints from point 2) were
   *not* tested for whether they query live, current-month data instead
   of the monthly batch — a real, unconfirmed opportunity to close this
   gap, not assumed either way.
4. **The real record-package JSON structure was pasted directly by the
   user** after downloading and unzipping `2026-08_seace_v3_json.zip`
   themselves — 9 complete real records now live in
   `__fixtures__/sample-peru-oece.json`, covering municipal/regional/
   federal/state-owned-enterprise buyers, PEN and USD currencies,
   goods/services/works categories, and one real awarded tender (with a
   real `awards` array and real supplier RUCs). See
   `peru-oece-mapper.ts`'s header comment for the full real-structure
   notes (`tender.title` is the procedure code not a description,
   `tender.value.amount` is frequently `0.0` = "no value published,"
   `awards` presence is the real awarded-status signal, no confirmed
   real per-tender human-facing deep link found yet, etc.).

Built as `lib/ingestion/peru-oece-mapper.ts` +
`lib/ingestion/connectors/peru-oece-live.ts` (live: `GET /files` to
discover which real months exist, then downloads + unzips each one in
the recency window — needed a new dependency, `adm-zip`, since the real
API returns a ZIP archive around the JSON, not raw JSON) +
`lib/ingestion/connectors/peru-oece-file.ts` (manual/offline fallback,
same file-based pattern as every other source) +
`scripts/ingest-peru-live.ts` / `scripts/ingest-peru.ts`
(`npm run ingest:peru-live -- --write` / `npm run ingest:peru -- --fixture`).

Verified against the real fixture: 9 of 9 records mapped, government
level/scope type/currency/status all correct by hand-check (one real
bug caught and fixed in the process — EGEMSA, a real state-owned power
company, has no "S.A." suffix in its actual buyer string despite its
real legal name carrying one, so the first version of
`inferGovernmentLevel()`'s regex missed it; loosened to match the
`EMPRESA`/`ENTIDAD PRESTADORA` prefix alone, since a real *buyer* in
this dataset starting with "Empresa" is essentially always a
state-owned utility — private sellers only ever appear as
`tenderer`/`supplier` parties, never as `buyer`). The ZIP-extraction
logic was verified structurally (built a synthetic ZIP with the same
single-`.json`-entry shape and round-tripped it through `adm-zip`); the
live fetch itself reaches the confirmed real host and query shape
correctly (a real run returned a real `403 Forbidden` — this
*environment's* egress block, same as every other source) but hasn't
been run to completion against real network access yet.

**A real bonus find**: unlike Colombia (which needed a *second* Socrata
dataset just for document metadata), Peru's OCDS records already embed
real per-document URLs and classifications directly
(`tender.documents[].url` → `prod1.seace.gob.pe/SeaceWeb-PRO/...`,
`documentType` ∈ `biddingDocuments`/`evaluationReports`/
`clarifications`/`awardNotice`). A follow-up `ingest-peru-documents`
connector analogous to Colombia's could reuse this data directly with
no second live request — not built yet, noted here as a real, confirmed
opportunity rather than a guess.

### Brazil / Chile — still unbuilt

Chile Mercado Público/ChileCompra API — not checked yet. Same posture as
Colombia and Peru before this session: needs a real, verified capture
(an unauthenticated request returning real rows, or a real downloaded
export) before a connector gets written, not assumed from general
knowledge of what these portals probably look like.

**Brazil PNCP — partially confirmed real, blocked by a real server-side
reliability problem, not a missing/wrong endpoint.** This sandbox can't
reach `pncp.gov.br` at all (same egress policy as every other
gov/corporate site), so all verification here ran through the user's own
browser, same as Colombia's original capture:

- The base API (`https://pncp.gov.br/api/consulta/...`) and its query
  shape (`/v1/contratacoes/publicacao?dataInicial=&dataFinal=&codigoModalidadeContratacao=&pagina=`,
  paginated response with `data`/`totalRegistros`/`totalPaginas`) are
  confirmed real via public documentation (a GitHub gist, the
  `powerandcontrol/PNCP` collector repo) — not guessed.
- `codigoModalidadeContratacao`'s real value table is confirmed via a
  direct, unauthenticated real request the user ran
  (`GET /v1/pncp/v1/modalidades?statusAtivo=true` — 19 real modality
  codes returned, e.g. `6` = Pregão Eletrônico, `16` = Concorrência –
  Eletrônica Internacional).
- The actual data endpoint (`/v1/contratacoes/publicacao`) **times out
  with a real 504 Gateway Time-out** — confirmed on two separate real
  attempts by the user, including the narrowest reasonable request (one
  day, `tamanhoPagina=5`, a rarer international modality code expected to
  return few rows). This is not a parameter mistake (the modalities
  endpoint on the same domain answered instantly) — it looks like a real,
  current reliability problem with this specific PNCP endpoint, matching
  informal complaints found in the same search results (a GestGov
  community thread asking about this exact API). Not pursued further this
  session; worth retrying later rather than assuming it's permanently
  broken.

## Tightening pass (2026-09-02) — fewer, larger kept tenders

Per explicit user direction ("我感觉当前Kept的项目太多，我想再加大筛选，减少投标项目数量。也不要常规规模项目"), `lib/relevance.ts` was tightened in several ways at once. All of this is live-testable against production data via `npm run reclassify:tenders` (dry run — exports `exports/tenders-kept-<date>.csv`/`tenders-excluded-<date>.csv`; add `--write` to actually update Supabase). Run from the user's own machine — this sandbox can't reach production Supabase.

- **`MIN_VALUE_USD` raised 50,000 → 100,000** — a known contract value below this is excluded outright (unless it also carries an include-override/major-project signal).
- **`FLAGSHIP_VALUE_USD` lowered 2,000,000 → 1,000,000** — the "flagship" tier (this platform's existing "大项目/旗舰项目" concept) now also triggers at the user's requested USD 1,000,000 bar, not just 2,000,000.
- **`MAJOR_PROJECT_KEYWORDS` added** — a real keyword list (railway, long-distance highway/pipeline, dam/reservoir, power plant, airport, large/national network, data center, core network, bridge, port, national cloud) that promotes straight to flagship regardless of value. Two items on the user's original list were deliberately **not** encoded: "多期项目(2期以上)" (multi-phase) — dropped after a real counter-example surfaced in the same conversation (a small perimeter-fence job on its "2a etapa" is not a major project); and the vague "大规模项目(数量大或距离长)" descriptor, whose concrete distance-based cases are already covered by the highway/pipeline/railway patterns.
- **Duration-based signals added, anchored to explicit contract-duration phrasing only** (`plazo de ejecución`/`plazo de entrega`/`vigencia del contrato`/`duración del contrato` + a day count) — deliberately NOT a bare "\d+ días" scan, since an unrelated day count (e.g. a goods delivery lead time) isn't project duration. ≥360 days promotes to flagship; <180 days is now blacklisted. Not yet confirmed to fire against any real title in this project's data — added defensively per the user's explicit ask, worth revisiting if it stays silent.
- **~20 new `EXCLUDE_KEYWORDS` patterns added**, grounded in a real ~200-row exclusion-review list the user built by hand from the live site (single-well/tank rehab work, inspection-only "supervisión" contracts, routine maintenance services, spare-parts/tools/materials supply, outsourced integrated medical services, waste disposal, analysis/monitoring services, perimeter fencing, satellite-imagery subscriptions, minor civil works, vehicle tires, venue/equipment rental, training simulators, refresher courses, and property-appraisal professional services). The maintenance-services and analysis-services patterns are deliberately broad — an explicit trade-off accepted per the user's stated preference to cut kept volume, even at the cost of also excluding a genuinely large maintenance-only or analysis-only contract.

### Second pass (same day) — buyer-name industry-tag bug, and hiding "standard" by default

The user ran `reclassify:tenders` against production and shared the real `tenders-kept-<date>.csv` export (1,900 kept rows). Two findings came directly out of reading it:

- **`purge:old-tenders` hadn't been run yet** — 1,181 of the 1,900 kept rows (62%) had a `publication_date` older than 6 months, some back to 2015. This wasn't a rules problem, just confirming the purge script (already built, still dry-run-only) needed to actually be run with `--write`.
- **A real classification bug, not a threshold problem**: 992 of the 1,900 kept rows — over half — were tagged `industries: "energy"` purely because their buyer field is `"Pemex Exploración y Producción"`, and `industry.ts`'s energy pattern includes a bare `/\bpemex\b/`. Several mappers (`compras-mx-open-tenders-mapper.ts`, `dof-mapper.ts`, `dof-search-mapper.ts`, `peru-oece-mapper.ts`) pass the raw buyer name into `classifyIndustries()` alongside the title — a reasonable signal for a narrowly-scoped buyer (e.g. "Secretaría de Salud" → healthcare), but PEMEX and CFE are diversified conglomerates that procure everything under their own name (valve calibration services, personnel transport, office chemicals — real titles from the export), so their buyer name alone says nothing about what a given tender actually is. This let hundreds of genuinely routine PEMEX service contracts survive `classifyRelevance()`'s allowlist gate as "standard" for no reason but the buyer's name.

  **Fix**: `classifyRelevance()` now recomputes industry tags from `title`/`summary` alone (`classifyIndustries(input.title, input.summary)`) for its own allowlist-gate check, instead of trusting the already-stored, buyer-inclusive `input.industries`. The stored `industries` column (and the filter UI) are untouched — a user deliberately filtering by "energy" to browse everything PEMEX procures is still a defensible thing to want — this only stops a buyer-only tag from being what keeps a no-value, non-equipment tender out of "excluded". Verified against real titles from the export: a PEMEX calibration-service tender that used to classify "standard" now correctly excludes; a real power-plant title is unaffected (still flagship).
- **`RELEVANCE_TIERS`'s "standard" tier is now hidden from the default view** (`TenderExplorer.tsx`'s new `DEFAULT_RELEVANCE_TIERS = ["flagship", "significant"]`), the same treatment "excluded" already gets — per the user's explicit "也不要常规规模项目". Unlike "excluded", "standard" stays a normal, selectable pill: picking it (or any other tier combination) writes an explicit `?tier=` param that overrides the default. This was a UI-layer decision, not a `filterTenders()`/`classifyRelevance()` change — the tier itself, and everything already tagged "standard", is untouched; it's just not what shows before a filter is chosen.

Recomputed against the same 1,900-row export: after the 6-month purge alone, 719 rows remain in the non-excluded set; the buyer-tag fix flips ~22 more of the recent ones to excluded (mostly service contracts, not the equipment purchases the platform still treats as a positive signal on their own); and the new default view (flagship + significant only) would show **~279** rows instead of 1,900 — with "standard" (whatever amount that ends up being) one click away via the tier pill, not deleted.

**Next step for the user**: run `npm run reclassify:tenders` again (dry run first) to confirm these two code changes against live data, then `-- --write` once satisfied — followed by `npm run purge:old-tenders -- --write`, which still hasn't actually been applied to Supabase.

### Third pass (same day) — a buyer-name exclude list, the inverse of the PEMEX bug

After the user ran the purge and re-ran `reclassify:tenders`, the real result (719 kept, all within 6 months — confirming the purge landed) still had 440 "standard"-tier rows and the user flagged the volume of `常规规模项目，未触发重点筛选条件` (bare "standard, no priority signal" fallback classifications) as still too high. Reading the new export found the single largest remaining source: **208 of 719 kept rows (29%) belonged to one buyer**, `ALIMENTACIÓN PARA EL BIENESTAR, S.A. DE C.V.` — Mexico's federal below-poverty-line food/hygiene distribution program — and 207 of them were "standard" purely via the `scopeType === "equipment"` fallback signal. Their real titles are bare retail product names (`COLGATE TRIPLE`, `PAPEL HIGIENICO`, `SARDINA SAL ROJA`, `MANGO ROJO`), which don't match `EXCLUDE_KEYWORDS` (that list is category phrases like "artículos de aseo", not brand/product names) and don't match any industry.

This is the mirror image of the PEMEX bug from the second pass: there, a buyer's name wrongly ADDED a false industry signal; here, a buyer's name is exactly the reliable signal that's missing — this specific buyer's entire real-world catalog is bulk groceries for a social program, never an industrial or infrastructure opportunity, regardless of what the individual item is called. Rather than chase individual product names, `classifyRelevance()` now takes an optional `buyer` field and checks it against a new, deliberately short `EXCLUDE_BUYER_KEYWORDS` list (currently just this one buyer, added only because its irrelevance is confirmed by 207 real rows) — same `hasIncludeOverride`-protected, unconditional-unless-overridden posture as `EXCLUDE_KEYWORDS`. `buyer` is now threaded through every `classifyRelevance()` call site (all ingestion mappers, `lib/db/tenders.ts`'s on-the-fly legacy path, `data/tenders.ts`, `reclassify-tenders.ts`) — all already had a real buyer value in scope, so this was wiring, not new data collection.

Recomputed against the 719-row export: this flips all 208 ALIMENTACIÓN rows to excluded, landing kept at ~511; the default view (flagship + significant only, from the second pass) is largely unaffected since none of those 208 were already in it (~278, same order as before).

### Fourth pass (same day) — removed the standalone "equipment scope" fallback

After the buyer-exclude fix landed, the kept export dropped to 498 rows (`flagship 201 / significant 77 / standard 220`). The user asked for a broader "how do we keep improving this filter" recommendation, adding real operational context: every kept row is at minimum one technical document this platform will eventually need to fetch and analyze (round 2), so kept-count isn't just a UI-noise question, it's a real cost driver.

Digging into the 220 "standard" rows: 177 had no estimated value, and 125 of those also carried no industry tag at all (`general`) — meaning they'd failed every real positive signal and were surviving purely on the old `scopeType === "equipment"` fallback (any goods-acquisition tender counts as a keeper, regardless of what the good is). Real examples: office computers, printer paper, gold coins, a mini-excavator, farm animals, hand tools — none matching any `EXCLUDE_KEYWORDS` phrase (they're specific item names, not category phrases) and none matching any industry.

Checked this fallback against every previously-approved "legitimate equipment" case from earlier passes (vehicles, transformers, lab equipment, BTS/RAN gear) — every one of them already survives independently through a real `industry.ts` keyword match in the title itself (e.g. "vehículos", "transformadores"), so none of them actually depend on the bare `scopeType === "equipment"` escape hatch. **Removed it entirely** — the allowlist gate in `classifyRelevance()` now requires a genuine content-based industry match OR a known value; scope type alone no longer rescues a tender. Verified against the real noise titles above (all now excluded) and the previously-approved cases (all unaffected, still classify the same tier as before). Projected from the 498-row export: ~125 more rows flip to excluded, landing kept around 373. The accepted trade-off, consistent with the maintenance/analysis-service exclude patterns from the first tightening pass: a handful of genuinely industrial but generically-titled items (e.g. a mini-excavator with no "maquinaria pesada"/"construcción" wording) get excluded too, rather than keeping the entire long tail to avoid missing them.

### Fifth pass (same day) — removed the works-scope flagship fallback, fixed a plural-keyword gap

The user then asked directly: of the 201 "flagship" rows in the 498-row export, how many actually matched the 大项目 criteria they'd originally specified (value ≥ $1,000,000 USD, or one of the twelve MAJOR_PROJECT_KEYWORDS categories)? Recomputing against the real export: only **32** did (19 by value, 13 by keyword — and of the twelve keyword categories, only bridge/port/dam/airport ever fired on real titles; railway, highway, power plant, data center, national/core network, national cloud, and pipeline never appeared). A further 9 matched the separate ICT/security override whitelist (legitimate, unrelated to this list). The remaining **160 (80%)** were flagship purely via a bare rule this session hadn't touched yet: any `scopeType === "works"` tender with no known value defaulted straight to flagship, regardless of what the work actually was — real examples: "REHAB. PAVIM. CON MEZCLA ASFALT. EN CALIENTE CALLE S/N" (one street's asphalt patch), "MANTENIMIENTO EN EDIFICIOS DE LA TERMINAL DE TRANSBORDADORES" (a maintenance job).

**Removed** that fallback (`isWorksLike`) from the flagship condition in `classifyRelevance()`, with the user's explicit go-ahead. Unlike the equipment-scope removal, this doesn't send everything straight to "excluded" — a real infrastructure title still lands on "significant" via `matchesFlagshipIndustry` (construcción/carretera/puente/etc.) or "standard" via the content-industry allowlist gate; only "no value + happens to be scoped works, with nothing else distinguishing it" loses the top tier. Verified against the real noise titles (now excluded or demoted to standard/significant as appropriate) and every real major-project case from earlier passes (dam, bridge, airport, a $5M generic works title) — still flagship.

While verifying, found and fixed a genuine regex gap: "DRAGADO DE DESAZOLVE DE LOS **PUERTOS** DE CHUBURNA Y CHABIHAU" (port dredging — real major-project work) failed to match `MAJOR_PROJECT_KEYWORDS`'s port pattern because it used the plural "puertos" and the pattern was `\bpuerto\b` (singular only). Added optional pluralization (`s?`) to every bare-word entry in that list (presa/represa/embalse, planta/central, aeropuerto, red, centro de datos, puente, puerto, nube, oleoducto/gasoducto/poliducto) rather than fixing just the one case found.

Recomputed against the same 498-row export with both this pass and the equipment-scope removal applied: **`flagship 48 / significant 118 / standard 113 / excluded 219` — 279 total kept**, down from the session's starting point of ~1,900.

### Sixth pass (same day) — a permanent regression fixture suite, the "growing whitelist"

The user then handed over 18 real "keep as significant" titles (building/facility construction, wastewater treatment plants, highway rehab, railway construction, PEMEX pipeline works, medical/lab equipment) and asked to update the filter to match — but checking each one first, **all 18 already classified "significant" correctly**, via two real content matches: bare "construcción"/"infraestructura"/"carretera" (`FLAGSHIP_INDUSTRY_KEYWORDS`) for the works items, and equipo médico/rayos x/imagenología/resonancia for the healthcare items. Nothing needed fixing there.

What the user asked for next was more structural: "the filter whitelist function should be able to train and learn, because this will be one of the key functions for this website." Worth being precise about what that can mean here — `classifyRelevance()` is deliberately rule-based, not ML (see this file's own earlier reasoning for why: it's a cheap Layer 1 cost-control pass that has to run before any paid AI call), so it can't literally train on new data. What it *can* do is remember every real, human-confirmed example permanently and re-verify all of them on every future rule change — which is the practical version of "learning" a rule-based system supports, and exactly what would have caught the "puertos" plural gap immediately instead of by chance.

Built `lib/relevance-fixtures.ts` (a permanent `RELEVANCE_FIXTURES` array — every real confirmed case from this whole session: the 18 significant examples, the flagship majors, the buyer-tag fixes, the equipment/works fallback removals, the exclusion-review batch) and `scripts/test-relevance.ts` (`npm run test:relevance`) — a pure-function regression runner, no Supabase/network needed, so it runs anywhere. 39/39 fixtures pass as of this pass. Going forward: when the user gives new real examples with a stated expected tier, append them to the fixtures file and run the suite — a failure pinpoints exactly what rule needs to change, and passing fixtures make every future keyword change safe to verify against the full confirmed history instead of ad hoc one-off checks.

### Seventh pass (same day) — narrowed FLAGSHIP_INDUSTRY_KEYWORDS to what the whitelist actually covers

The user then said explicitly: they don't want all of "significant" and "standard" anymore, only tenders matching 13 (of the original 18) real titles they'd confirmed — dropping the 5 PEMEX pipeline items from consideration this time without saying why (flagged back to them, not resolved yet). Narrowed `FLAGSHIP_INDUSTRY_KEYWORDS` from six alternatives to two — construction/infrastructure and medical/lab equipment — dropping the bare "energía|eléctrico|power" and "telecom|comunicaciones|datacenter" categories, since none of the 13 confirmed titles needed them. Real infrastructure for power/telecom is unaffected: `MAJOR_PROJECT_KEYWORDS` (power plants, national/core networks, data centers) and `INCLUDE_OVERRIDE_KEYWORDS` (the real BTS/RAN batch) still promote those straight to flagship independent of this list — what's gone is only the weak "bare mention of energía/telecom, no other evidence" signal.

Recomputed against the export: `flagship 48 / significant 102 / standard 121 / excluded 227` — 271 total kept. Caught one fixture that only passed "significant" via a coincidental artifact (`industries: ["power"]`'s literal English word "power" matching the old bare `/power/i` alternative, not real title content) — updated its expected tier to "standard" with a note explaining why, rather than silently deleting the fixture.

This pass was explicitly not the full ask — confirmed directly (2026-09-02, three-question check-in):

1. **"standard" eliminated as a kept tier entirely.** `classifyRelevance()` never returns "standard" anymore — the final fallback that used to land there now returns "excluded" with a new `below_threshold` reason. This is a deliberate reversal of several "standard"-tier cases approved earlier the same session (vehicle/heavy-machinery purchases, a PEMEX service with genuine hydrocarbon content in its title) — all now excluded too, per explicit confirmation. The "standard" tier stays in the type/schema and UI (for already-stored legacy rows until reclassified) but is no longer a real outcome of the classifier.
2. **The 5 PEMEX pipeline/ductos titles were intentionally dropped**, not an oversight, from the user's narrower 13-title whitelist (they'd been in an earlier, broader 18-title version). Added targeted excludes grounded in the exact real title wording: bare `\bductos?\b` (word-boundary-safe — confirmed it never matches inside the compound words "oleoducto"/"gasoducto"/"poliducto", which stay flagship signals via `MAJOR_PROJECT_KEYWORDS`), plus `líneas de descarga` and `infraestructuras complementarias` for the two titles in that same group that didn't literally say "ducto".
3. **"Delete" means literal deletion from Supabase**, not just hiding — confirmed, but not yet built. Given the scale (this now excludes the large majority of the former significant/standard pool) and that it's irreversible, this needs its own dry-run-first script (the `purge-old-tenders.ts` pattern) rather than being folded into a relevance-only change — not done this pass.

Recomputed against the export with all three changes: **`flagship 48 / significant 96 / standard 0 / excluded 354` — 144 total kept**, down from the session's starting point of ~1,900 (about 7.6%).

### Multi-industry filtering — the data already supports it; the UI now does too

The user asked whether the industry tag being singular blocks finding a tender that spans two sectors at once (e.g. ICT + Power). The underlying data model already didn't have that limitation: `lib/industry.ts`'s `classifyIndustries()` has always returned an array (a tender can carry multiple tags — see its own header comment), the `tenders.industries` column is `text[]`, and `TenderCard.tsx` already renders every tag, not just the first. What the UI filter (`components/tenders/TenderExplorer.tsx`) didn't offer was a way to isolate a specific combo: checking both "ICT" and "Power" used plain OR semantics (`lib/filter-tenders.ts`), so it surfaced every ICT-only and every Power-only tender mixed in with the genuine ICT+Power combos, with no way to see just the combos. Added a small toggle (shown once 2+ industries are checked) that switches to AND semantics (`industryMatchMode: "all"`) — every selected tag must be present on the tender, not just one.

### "awarded"/"cancelled" status hidden by default

The user asked directly why the platform ingests already-awarded contract data at all (Ecopetrol contracts, Compras MX contracts) — the honest answer: it's the main source of real monetary values for calibrating `lib/relevance.ts`'s thresholds (see "Which sources carry a real reference/estimated value" above), and it's useful market intelligence (who buys what, at what price). But that surfaced a real gap: `TenderExplorer.tsx`'s status filter had no default — an already-awarded contract (not a live bid opportunity) showed mixed into the default feed exactly like a genuinely open tender, with nothing distinguishing them. Confirmed explicitly: bid-outcome/competitive-intelligence features are real future value-adds (post-launch, once the product has real usage), not the current priority — for now, `awarded`/`cancelled` are hidden from the default view the same way `excluded` relevance and `standard` tier already are (`DEFAULT_STATUSES` in `TenderExplorer.tsx`, mirroring the `DEFAULT_RELEVANCE_TIERS` pattern) — kept in the database, one click away via the status pills for anyone doing pricing/competitor research, just not shown by default.

### Re-ingestion dedup — already handled, confirmed for the user

The user asked whether re-running `ingest:comprasmx-open` (which they do repeatedly, since it's a manual periodic export) creates duplicates when the same still-open tender appears in two consecutive exports. Confirmed already handled: `upsert-tenders.ts` does `.upsert(rows, { onConflict: "slug" })`, and the slug is derived from the tender's real procedure number (`comprasmx-${slugify(tenderNumber)}`), shared across the open-tenders and contracts mappers (see the "Lifecycle join" note above) — so re-ingesting the same tender, whether still open or now awarded, updates the same row rather than inserting a duplicate.

### Purging old data

`npm run purge:old-tenders` (dry run by default, `--write` to actually delete) removes tenders whose `publication_date` is older than a cutoff (default 6 months, `--months=N` to override), per the user's explicit request to clear out stale data alongside this tightening pass. Related rows (`tender_requirements`/`tender_key_dates`/`tender_risks`/`tender_documents`) all cascade-delete via their `tender_id` foreign key (`supabase/migrations/0001_init.sql`), so no orphaned rows are left behind. Same dry-run-first, CSV-export posture as `reclassify:tenders` — must be run from the user's own machine.

`npm run purge:excluded-tenders` (same dry-run-first/`--write` posture) deletes every tender whose stored `relevance_tier` is `"excluded"` — built after the user confirmed (in the seventh-pass check-in above) that "剩余的可以删除" meant literal deletion, not just hiding. It trusts whatever tier is already stored rather than recomputing anything itself, so `npm run reclassify:tenders -- --write` must be run first (and current) or this purges against stale tiers. Not yet run against production — the user still needs to confirm the reclassify write landed with the "standard" tier eliminated before running this.

## Two-round screening/analysis — current state and the real gap

The user described the intended shape of this platform's filtering pipeline directly: **round 1** happens before any document exists — title/buyer/keyword-only Pre-Screening (`lib/relevance.ts` + `lib/industry.ts`, both described above), necessarily coarse since a title alone often can't show the full scope. **Round 2** happens once a tender's actual bid documents have been captured and analyzed — using what the document really says to refine the tags: which industries it actually spans (their own examples: "ICT + 交通", "电力+车", "只有电力"), how large it really is, and how broad its scope is, feeding back into a better-informed keep/exclude decision than round 1 could make from a title alone.

**What already exists toward round 2**: the Layer 2 document-extraction pipeline (`lib/ingestion/extract-requirements.ts`, `npm run extract:document`) reads a real captured document (PDF) and produces `qualifications`/`experienceRequirements`/`requiredDocuments`/`risks` — genuinely document-grounded, not title-based. **Now live-tested** (2026-09-02, on the user's own machine, once the missing `pdftotext`/Poppler prerequisite below was resolved) against a real Convocatoria and a real Anexo Técnico — see that file's own header comment for the specifics. It, as of this pass, still **does not yet re-derive `industries`/`relevance` from document content** — those still only ever come from `classifyIndustries()`/`classifyRelevance()` running against the title/buyer text a mapper had at ingest time, even for tenders that already have a fully-extracted document sitting in `tender_documents`. The live test made the cost of that gap concrete: the tested Convocatoria's real risks included being a "carácter NACIONAL" procedure requiring Mexican nationality and ≥65% national content — invisible from the title alone, and exactly the kind of fact `participationScope` (see below) exists to capture but currently only best-effort-guesses.

**Cost pass, same day**: after the two live-test calls, the user checked their real Anthropic console usage ($1.30 for both) and asked to cut cost further given the product is Chinese-only. The extraction prompt originally asked the model for an `es` paraphrase of every field AND a `zh` translation of that paraphrase — doubling generated output tokens for `es`/`en` text nobody ever renders in this Chinese-only UI. Changed the schema so the model generates `zh` directly from the source document (skipping the paraphrase-then-translate step entirely); `es`/`en` are still populated on write (types/tender.ts's `LocalizedText` requires all three) by mirroring `zh`, the same `untranslated()` convention already used elsewhere — no real loss, since this `es` was always AI-authored paraphrase, not captured government text, unlike other `LocalizedText` fields in the app. Also added real `response.usage` (input/output/cache tokens) printed on every `extract:document` run, so cost is visible per call going forward instead of only checkable after the fact on the Anthropic console.

**The bigger cost lever, discussed but not yet built**: the user's own proposal — run the cheap Haiku 4.5 title/summary translation for every tender (as already planned), but only run this expensive Layer 2 extraction on demand, gated behind a subscribed user clicking "analyze" on a specific tender, with the result cached in `tender_documents` so the same document is never re-extracted for a second viewer. This is the real fix (proactive extraction on every captured document doesn't scale, on-demand + cache does) and should be prioritized over further model changes — flagged here as the next real piece of work, not built this pass. As a smaller, parallel experiment per the user's explicit request, also swapped the model from `claude-opus-5` to `claude-sonnet-5` — **not yet re-verified against a real document**, since Opus 5's extraction quality was already confirmed live and this is purely a cost/quality trade-off test; re-run `npm run extract:document` against the same two test PDFs and compare before trusting Sonnet 5 at scale.

**Two-tier pricing idea, same day**: rather than picking one model, the user proposed offering both as separate tiers — Sonnet 5 as the default/included "标准分析," Opus 5 as a paid "精度分析" (precision analysis) upsell. `extractTenderRequirements()` now takes an `ExtractionModel` parameter (`"claude-sonnet-5" | "claude-opus-5"`, defaulting to Sonnet 5) instead of a hardcoded model, and `npm run extract:document -- <file> <slug> --precise` runs the Opus 5 tier for manual comparison. Not wired to any real paid-gating UI/API route yet — that doesn't exist (see the on-demand-trigger gap above); this is the plumbing such a route would call into once built.

**Overwrite decision, same day**: the user confirmed precision (Opus 5) results overwrite standard (Sonnet 5) results outright — one stored result per document, not two parallel copies (`writeToSupabase()` already deleted-then-inserted `tender_requirements`/`tender_risks` on every re-run, so this was already the real behavior; nothing to change there). Added `supabase/migrations/0009_tender_documents_extraction_model.sql` (`tender_documents.extraction_model`) to track which tier produced the currently-stored result — the actual reason for asking the caching question in the first place was to prevent a standard-tier re-run from silently downgrading a document a subscriber already paid to have analyzed at the higher tier. `extract-tender-document.ts --write` now checks this before overwriting: refuses if the stored tier is `claude-opus-5` and the new run is `claude-sonnet-5`, unless `--force` is also passed.

**The concrete gap, and the smallest real next step**: extend `extractTenderRequirements()`'s structured-output schema (already Zod + `client.messages.parse`, see that file) to also return a document-grounded industry-tag list and a scale/scope assessment, then add a step — either inside `extract-requirements.ts` itself or a follow-up pass over `tender_documents` rows already marked `extraction_status: "extracted"` — that re-runs `classifyRelevance()`/merges the document-derived industry tags into the stored `industries` array and updates `relevance_tier`/`relevance_label`/`relevance_reason` accordingly, the same "recompute and diff against what's stored" pattern `reclassify-tenders.ts` already uses for round-1-only reclassification. Not built this session — flagged here as the concrete, scoped piece of work round 2 actually needs, rather than a vague "add AI analysis" note, since the extraction plumbing (PDF intake, structured output, Supabase write-back) already exists and mostly just needs its output schema and write path extended.

### First real live-test attempt of `npm run extract:document` — a missing prerequisite found

The user tried running the extraction pipeline for real (2026-09-02) and hit a setup gap that had gone completely undocumented: `document-intake.ts`'s `extractPdfText()` shells out to Poppler's `pdftotext` binary (`execFileSync`) for text extraction (procedure-number detection, document-type classification), and its own header comment only said `pdftotext` is "present in this environment" — true of the sandbox this code was written in, but never stated as a real prerequisite for anyone else's machine. On a fresh Windows checkout with no Poppler installed, this fails with `spawnSync pdftotext ENOENT` — a confusing low-level error with no hint about what's actually missing.

**Fix (documentation only, not a code change)**: `pdftotext` needs to be installed and on `PATH` before `npm run extract:document` (or `npm run ingest:documents`, which also calls `intakeDocument()`) will work. On Windows: `winget install --id=oschwartz10612.Poppler -e` (or `choco install poppler`), then restart the terminal and confirm with `pdftotext -v`. On macOS: `brew install poppler`. On Linux: `apt install poppler-utils` (Debian/Ubuntu) or the equivalent for your distro. Added as a real "Prerequisite" note in the root `README.md`'s Getting Started section.

## Proyectos México (Banobras/SHCP) — RETIRED 2026-09-03, superseded by Proyectos Estratégicos MX (see below)

Kept below for the real history/debugging narrative, but this source is no longer ingested: its mapper (`proyectos-mexico-mapper.ts`), connector, ingest script, and fixture were all deleted, `ingest:proyectos-mexico` no longer exists, and the 57 rows this source had put into production were deleted outright (not kept alongside the new source). Why: the user found a real Proyectos México project page that itself links out to Proyectos Estratégicos MX once the project reaches actual bidding — confirming the latter is the real procurement destination for a Proyectos México pipeline listing, not an unrelated system — and unlike Proyectos México, it comes with real Convocatoria/Anexo attachments. See "Proyectos Estratégicos MX" below for the replacement.

## Proyectos México (Banobras/SHCP) — a new source, and a real new relevance signal

The user found `proyectosmexico.gob.mx/proyectos/` — a federal platform (hosted by Banobras, the national public-works bank, with SHCP/the Finance Ministry) that curates strategic national infrastructure/energy investment projects across every stage (pre-investment through operating). Confirmed via the user's own screenshot (DevTools Network tab open) that the page is WordPress-based (`admin-ajax.php` calls) but — more usefully — has its own CSV export button right on the results table, the same "Technique 1" browser-download pattern as Compras MX/Ecopetrol contracts, no anti-bot gate or AJAX reverse-engineering needed.

**Real 58-row export the user captured and provided**: every row had `Etapa: "Licitación"` (currently in the bidding stage — confirmed by the user directly: "CSV是投标中的项目") — not the pre-investment/construction/operation stages the full site also lists. `Sector` distribution: Transporte (36), Agua y Medio Ambiente (11), Electricidad (8), Infraestructura Social (2), Telecomunicaciones (1). `Entidad responsable` (buyer) includes Comisión Federal de Electricidad directly (7 rows) — a real, independent path to CFE tenders alongside the existing DOF route. `Proceso de selección` gives a genuinely reliable participation-scope signal, unlike every other source's best-effort guess: 26/58 "Licitación Pública Internacional Bajo Tratados" (`international_treaty`), 5/58 "Licitación Pública Internacional" (`international_open`), 13/58 "Licitación Pública Nacional" (`national`). Investment value ("Inversión (Millones MXN/USD)") present on only 15/58 rows — consistent with the "pre-award data usually carries no value" pattern documented above, though when present it's a real government figure in millions (parsed accordingly — `parseMillions()` multiplies by 1,000,000, confirmed against the real column header wording).

**New relevance signal**: per the user's explicit instruction ("麻烦只要属于这个清单的项目，都放重大项目点1标签"), `classifyRelevance()` gained `isNationalPriorityProject?: boolean`, folded directly into the existing `hasIncludeOverride` computation (same two effects that flag already provides — bypass every exclude/value-floor check, then count toward flagship promotion — reusing it rather than a parallel branch that could drift out of sync). `proyectos-mexico-mapper.ts` always sets it `true`: being listed on this official government source IS the flagship signal, stronger than any keyword/value proxy. Verified against the real fixture and the full 58-row file: 57/57 mapped rows land on `flagship` (1 row skipped — no `Entidad responsable`, the same defensive null-check every mapper applies).

**No ID-based dedup against other sources is possible — a real, documented limitation, not silently resolved.** Proyectos México's own numeric project id (extracted from the `Proyecto` column's `"<id> <title>"` prefix, confirmed against all 58 real rows and the real per-project URL slug) has no relationship to a Compras MX procedure number or a PEMEX SharePoint item Title — there's no shared key between this source and any other this platform ingests. A real project could genuinely be double-counted: once here (while it's an investment-pipeline listing) and again later as its own Compras MX/PEMEX procedure once that agency actually opens the LAASSP/LOPSRM tender, with nothing in either system linking the two rows. Ingested under its own slug scheme (`proyectosmexico-<id>`) rather than attempting unreliable fuzzy title/buyer matching to merge them.

`npm run ingest:proyectos-mexico -- <file>.csv [--write]` (`--fixture` for an offline dry run against two real rows). No `--months` recency filter, unlike every other ingest script — this source only ever lists currently-in-bidding projects (filtered to `Etapa === "Licitación"` inside the mapper itself), so there's no multi-year historical backlog to trim.

**`status` fix (2026-09-03, user-caught real data bug)**: every mapped row originally hardcoded `status: "open"` (i.e. always shown as "招标中"), reasoning `Etapa === "Licitación"` already meant "currently accepting bids." Wrong — the user checked several rows manually against Compras MX and found some the site still still tagged `open` hadn't actually had their Convocatoria published yet. `Etapa === "Licitación"` only means the project's current lifecycle stage is *procurement*, not that a specific bidding window is live right now. Fixed to derive `status` from the two real date columns this source does give: `submission_closed` if `Recepción de propuestas` is already in the past, `open` if `Anuncio/ Convocatoria` is in the past (and the deadline hasn't passed), otherwise `planned` (not yet actually announced). Existing already-ingested rows still carry the old hardcoded `open` until the same source CSV is re-ingested with `--write` (an upsert, so this is a safe no-duplicate re-run) — this hasn't been done yet.

### Three real fixes, same day, after the first real ingest attempt

The user's first real dry run surfaced three real issues, all fixed:

1. **Value/currency**: the mapper originally read the site's own precomputed "Inversión (Millones USD)" column. The user pointed out this platform's convention (every other Mexican-sourced mapper) is to store the real native-currency figure and let `classifyRelevance()`'s own `convertToUsd()` table normalize it — trusting the site's own USD conversion (unknown exchange rate, unknown as-of date) would be inconsistent with every other tender. Switched to reading "Inversión (Millones MXN)" first, with the real "Moneda del contrato" field (confirmed values: "Pesos mexicanos MXN" on 55/58 rows, "Dólares americanos USD" on 3/58 — those 3 had no value at all in the file inspected) as the actual currency code rather than assuming MXN.
2. **Summary field**: was preferring the long multi-paragraph "Descripción" over "Alias". The user pointed out "Alias" (confirmed real: a one-sentence restatement, close in shape to a normal tender summary) is the better fit for this platform's summary field; "Descripción" is still fed into `classifyIndustries()` for its real signal even when Alias wins the display summary.
3. **File format**: the user's next real capture came back named `Proyectos – Proyectos México.xls` despite clicking the page's CSV export button — a common real-world server misconfiguration (wrong `Content-Type` on the export response), not necessarily a real binary Excel file. `readProyectosMexicoFile()` now dispatches on real file content (the ZIP magic bytes `PK\x03\x04` that a true `.xlsx` always starts with) rather than trusting the extension — anything else parses as CSV regardless of what it's named. Verified against both a real CSV and a synthetic `.xlsx` built with the same real headers.

## Proyectos Estratégicos MX (Hacienda) — replaces Proyectos México, 2026-09-03

Found by the user while investigating why a tender they'd downloaded real documents for (`FP-16-B00-016B00985-N-6-2026`, CONAGUA's "Presa Mujer Solteca" acueducto) wasn't in this platform's database and couldn't be found on Compras MX's own search either. The tender's real detail page turned out to live on a completely different domain — `proyectosestrategicosmx.hacienda.gob.mx`, not `comprasmx.buengobierno.gob.mx` — serving projects under the "Ley para el Fomento de la Inversión en Infraestructura Estratégica para el Desarrollo con Bienestar." The user then confirmed a real Proyectos México project page ("Presa Mujer Solteca," project id 0993) itself links out to this exact portal once the project reaches actual bidding — so this is the real procurement destination for a Proyectos México pipeline listing, not an unrelated third system.

**Same export format as Compras MX open tenders — confirmed, not assumed.** The user downloaded this portal's own export button's output (`Informaci_nP_blica_export_*.xlsx` — the identical filename pattern Compras MX's "Difusión de procedimientos" export uses) and its columns are byte-identical to `ComprasMxOpenTenderRow`: `NÚM.`/`NÚMERO DE IDENTIFICACIÓN`/`CARÁCTER`/`NOMBRE`/`SIGLAS DEPENDENCIA O ENTIDAD`/`ESTATUS`/`FECHA JUNTA DE ACLARACIONES`/`FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES`/`TIPO DE PUBLICACIÓN`/`TIPO DE CONTRATACIÓN`/`CÓDIGO DE EXPEDIENTE`/`UNIDAD COMPRADORA`/`ENTIDAD FEDERATIVA`. This portal clearly runs on the same government web platform as Compras MX, just scoped to this specific investment law. `proyectos-estrategicos-mapper.ts` therefore reuses `compras-mx-open-tenders-mapper.ts`'s `mapComprasMxOpenTenderRowToTender()` and `compras-mx-open-tenders-file.ts`'s reader wholesale rather than duplicating either — it only overrides:
- **slug**: own namespace (`proyectosestrategicos-<procedure number>`), not `comprasmx-` — these procedure numbers never actually appear in a real Compras MX export, so sharing that prefix would be misleading, not just redundant.
- **`isNationalPriorityProject: true`** — same reasoning the retired Proyectos México source used: being listed under this strategic-infrastructure law IS the flagship signal, stronger than any keyword/value proxy.

**Real 48-row export the user captured**: buyers were CONAGUA (mostly water — acueductos, PTARs, potabilizadoras) and SICT (highways — modernización/construcción of carreteras). `Carácter` was `NACIONAL` on every row in this particular export (no `INTERNACIONAL`/`INTERNACIONAL BAJO LA COBERTURA DE TRATADOS` rows this time, unlike Compras MX's own open-tenders export, which had both). 48/48 rows mapped, all correctly landed on `flagship`.

**This same real file also surfaced three real `classifyIndustries()` bugs**, fixed directly (`lib/industry.ts`), independent of this specific mapper — the classifier is shared across every source:
1. `energy`'s `ducto\b` was missing its leading `\b`, so it matched as a bare substring of "acueducto" — wrongly tagging 5/48 real water projects `energy`. Fixed to `\bducto\b`.
2. `construction`'s `carretera` alone missed real SICT titles using the adjective form ("EJE CARRETERO..."), landing them on the `general` fallback. Widened to `carreter[ao]`.
3. `water` had no abbreviation match for CONAGUA's own overwhelmingly-preferred short form of "Planta de Tratamiento de Aguas Residuales" — `PTAR` — appearing spelled-out nowhere in most of these real titles. Added `\bptar\b`.

`npm run ingest:proyectos-estrategicos -- <file>.xlsx [--write]`. No `--fixture` (no synthetic sample committed — the real file's shape is already covered by `compras-mx-open-tenders-mapper.ts`'s own tests). No `--months` recency filter, for the same reason `ingest:comprasmx-open` has none: this export carries no real publication-date column, so a "recent" filter would be a no-op against the ingestion-timestamp stand-in.

**Same known gap as the retired source, not fixed**: no ID shared with Compras MX/PEMEX/DOF, so a project appearing both here and as its own Compras MX procedure will show as two separate rows — accepted, not silently merged.

## LicitIA — a third-party ComprasMX/CompraNet mirror, first used to fix missing deep links, then to automate open-tender discovery (2026-09-03)

The user found and shared `licitia.com.mx` — a free, read-only, no-API-key third-party index (600 req/min/IP, CC BY 4.0, "Global Tech Operations, LLC," explicitly not affiliated with the Mexican government). **Confirmed real, not guessed**, via its own methodology page (`https://licitia.com.mx/datos`) and its `llms.txt` (`https://api.licitia.com.mx/api/open/v1/llms.txt`), both fetched by the user and pasted in full: "el índice reproduce información... que el Gobierno de México publica... en ComprasMX y en su portal de Datos Abiertos [comprasmx.buengobierno.gob.mx/datos-abiertos]. No añadimos hechos que no estén en esa fuente." — i.e. it's a normalized republish of ComprasMX's own official open-data files, not a scrape of the anti-bot-gated detail API this project deliberately avoids (see "The open-tenders-vs-contracts gap" above). 367,756 distinct procedure numbers, publications from 2023, exercises 2022–2026, resynced continuously with a nightly full rebuild.

**First real bug, and why it matters**: the docs' "Formatos por página" section reads as if appending `.json` to a resource path gets you JSON. That's wrong — `.json` returns a real `{"success":false,"error":{"code":"NOT_FOUND",...}}` for every query, indexed or not (a routing-level 404, not "not indexed"). The real way is the bare path (`/licitaciones/{numero}`, no suffix) with an `Accept: application/json` header. This was caught only because a real batch run (`resolve-comprasmx-links.ts`, below) came back 0/526 resolved and the user curl'd both variants side-by-side against a known-good procedure to compare — a genuine guessing mistake on this end, not a docs bug.

### Deep-link backfill — `resolveComprasMxDetailUrl()` / `npm run resolve:comprasmx-links`

`compras-mx-open-tenders-mapper.ts`'s source (the "Difusión de procedimientos" browser export) has no deep-link column — every open tender's `sourceUrl` fell back to Compras MX's generic search page. `GET /licitaciones/{numero}` exposes the exact internal Compras MX database id (`data.id`) needed to build the real `.../sitiopublico/detalle/<id>/procedimiento` URL — confirmed byte-for-byte against a procedure the user found the real URL for by hand. `resolveComprasMxDetailUrl()` (`lib/ingestion/connectors/licitia-connector.ts`) returns a tagged `{status: "resolved"|"not_found"|"error"}` result rather than collapsing every failure into `null` — the first version did that, and the resulting 0/526 run gave no way to tell "genuinely not indexed yet" from "every request is silently failing" (it was the latter, i.e. the `.json`-suffix bug above). `resolve-comprasmx-links.ts` also has a 5-consecutive-error circuit breaker for the same reason: a systemic failure should stop the run loudly, not grind through hundreds more doomed requests. **Real production run, after the fix**: 591/591 resolved, 0 not found, 0 errored — every already-ingested Compras MX tender now has a real deep link.

### Automated "vigente" discovery — `discover-comprasmx-vigente.ts` / `npm run discover:comprasmx-vigente`

LicitIA's `GET /descargas` (manifest) + `GET /descargas/licitaciones/{lote}` (NDJSON bulk dump, confirmed real 2026-09-03: 15 lotes, 372,449 rows total, covering every status/year since 2022) let this platform discover currently-open ("`seccion: "vigente"`") Compras MX procedures directly, instead of relying only on the user remembering to open the browser, filter, and click export. `fetchAllVigenteLicitaciones()` downloads every lote and keeps only `seccion === "vigente"`; `licitia-vigente-mapper.ts` maps each row into a `Tender` using the SAME `comprasmx-<slug>` scheme the manual-export mapper uses, so a procedure already ingested by hand merges into the same row instead of duplicating; `discover-comprasmx-vigente.ts` additionally skips any `tender_number` already in Supabase from ANY source before mapping, specifically so this coarser bulk row (no Carácter/Tipo de contratación columns — see the mapper's own header comment for the full list of honest gaps) never overwrites a manually-ingested row's real fields. New rows still get a real deep link via `resolveComprasMxDetailUrl()`, same function, same circuit breaker.

Real production run: 564 procedures currently "vigente" in the whole corpus, 555 already in Supabase (confirming the manual-export workflow already covers most of what's actually open), 9 genuinely new — all small "Acuerdo Marco" (framework-agreement) direct assignments (fumigation, computer-equipment leasing, Oracle support), correctly classified `excluded` (routine/low-value) by the existing relevance rules. Upserted 9/9 with `--write`.

**A real off-by-one this caught**: `/descargas`'s `lotes: 15` is a COUNT, and lote indices are 0-based (0..14) — the first version assumed 1-based (1..15) and crashed with a real HTTP 404 requesting the nonexistent lote 15. Fixed by starting the loop at 0.

**This does not replace `ingest:comprasmx-open`** — the manual export still carries real `Carácter`/`Tipo de contratación` columns this bulk source doesn't have, and re-running it stays safe (same slug scheme). This is a second, independent discovery path layered on top.

### Confirmed NOT covered by LicitIA (and why that's expected, not a bug to chase)

Real `GET /buscar?q=<term>` results (2026-09-03), not guessed — checked because the user asked directly whether this could also surface PEMEX/CFE/Proyectos Estratégicos MX data:

- **PEMEX**: every `q=PEMEX` hit's `detalle` (the actual publishing dependencia) was some OTHER agency buying something PEMEX-related (ISSSTE/SADER buying "Diesel PEMEX," ASIPONA-Mazatlán buying "apoyo normatividad PEMEX," etc.) — never PEMEX itself as the publisher. Consistent with PEMEX running its own separate SharePoint-based system (see "CFE's own portal is WAF-protected; PEMEX's is not" above) — `ingest:pemex` stays the only path for PEMEX's own tenders.
- **CFE**: same pattern for `q=CFE` — every hit's dependencia is a different buyer (INEEL, ININ, CIDESI, CIQA) purchasing CFE-related electricity/services/equipment, never CFE itself publishing. Consistent with CFE tenders routing through DOF (see "CFE tenders confirmed in DOF" above) — `ingest:dof-search` stays the only path.
- **Proyectos Estratégicos MX**: `GET /licitaciones/{numero}` for a real Proyectos Estratégicos MX procedure number (`FP-16-B00-016B00985-N-6-2026`) returned a genuine `NOT_FOUND` using the corrected (bare-path + `Accept` header) request format — not the `.json`-suffix bug. Expected: LicitIA's own methodology page scopes it to ComprasMX/CompraNet + Datos Abiertos specifically, and Proyectos Estratégicos MX is a separate portal under a separate law, same category of gap as PEMEX/CFE. `ingest:proyectos-estrategicos` stays the only path. (One caveat, not systematic: a project that starts in Proyectos Estratégicos MX and later ALSO gets published as its own ordinary Compras MX procedure — same real-world pattern as the retired Proyectos México source, see above — would show up on the ComprasMX side under a different, unrelated procedure number; there's no way to link the two automatically.)

## Layer 2 extraction hardening — PDF limits, a second provider, and auto-routing (2026-09-03/04)

A real 14-document batch run across 7 tenders (`npm run analyze:batch`, the user's own local `haiku-test` folder) surfaced every real limit the "Layer 2 — document intake and extraction" section above only anticipated in the abstract. Each was fixed against real failures, not guessed defensively in advance.

### PEMEX `sourceUrl` — two-round real fix

The "查看原始来源文件" link on a PEMEX tender first 404'd, then (once pointed at a guessed `DispForm.aspx` per-item URL) hit a real login wall (`pemex.com/acceso-denegado`) — PEMEX's SharePoint answers anonymous REST reads (see "Technique 3" above) but gates its rendered item-detail UI behind a login the public has no path into. Fixed by switching `pemex-mapper.ts` to PEMEX's public, anonymously-reachable `Paginas/` search pages (confirmed real per-list via the user's own screenshots and folder listing) instead of any per-item detail URL — `SEARCH_PAGE_PATH_BY_LIST_TITLE`, 4 of 7 subsidiary lists with an exact real page match, the rest falling back to the concursos root page. `scripts/fix-pemex-source-urls.ts` (one-off) repaired the 25 already-ingested rows carrying the old, broken URL — run once by the user with `--write` ("25 fixable, 0 already correct, 0 skipped").

### PDF chunking — real, distinct limits from two different providers

Claude's native `document` content blocks have two real hard caps hit directly in this batch run: **100 pages** per request, and a request-body size limit (~413 on the API, effectively a ~32MB request cap). `isPdfNativeLimitError()` (`extract-requirements.ts`) recognizes both from the real error text and falls back — first to plain-text extraction (`pdftotext`), then, if that also overflows Claude's 200k-token context (`parseContextOverflow()` parses the exact `prompt is too long: N tokens > 200000 maximum` shape and retries with a computed truncation ratio), to **PDF chunking** (`lib/ingestion/pdf-split.ts`, new): `pdfseparate`/`pdfunite` (poppler, already a prerequisite — see above) split an oversized PDF into ≤80-page pieces under a byte budget, each chunk sent through the SAME native-document call, results merged (`mergeExtractions()`, dedup by `title|description`).

**Why chunking, not just the text fallback, mattered**: a real 33MB scanned Anexo (image-only pages, no text layer) produced an empty `0/0/0/0` result under the text-only fallback — `pdftotext` has nothing to read from a page that's a scanned image. Chunking keeps Claude's native PDF *vision* per chunk, so a scanned page still gets read; the real, disclosed cost is a requirement whose text spans a chunk boundary can be missed, inherent to splitting. Confirmed real success on this exact document once chunked: 11 qualifications, 5 experience, 35 documents, 31 risks (7 critical).

The chunk byte budget (`MAX_CHUNK_BYTES`) went through three real values before landing at **8MB** — see the DashScope section below for why 20MB and 15MB both still failed once Qwen was added as a second provider through the same chunking path.

### Qwen3.5-plus via DashScope's Anthropic-compatible endpoint — a second, cheaper provider

Per the user's request to compare against Qwen for cost, DashScope (`https://dashscope-intl.aliyuncs.com/apps/anthropic`) turns out to accept the real `@anthropic-ai/sdk` `Anthropic` client unmodified — just a `baseURL` override (`lib/ingestion/extract-requirements-qwen-anthropic.ts`). Confirmed, not assumed, against real documents:

- **Native PDF vision genuinely works** — a non-chunked CFE PDF produced 38,667 real input tokens and rich, real extraction output, not a degraded text-only pass.
- **Prompt caching genuinely works** — real `cache write`/`cache read` fields observed in responses through this endpoint.
- **Structured outputs (`output_config.format`, the same Zod-schema feature `extractTenderRequirements()` uses on Claude directly) do NOT translate reliably** — real responses came back as a bare top-level array instead of the expected object once, and with `qualifications`/`risks` keys silently omitted another time; not fixable by retrying. Worked around with a `useStructuredOutput: boolean` flag on `runExtraction()`: the Qwen path uses `client.messages.create()` + an explicit JSON-shape prompt (`JSON_SHAPE_INSTRUCTIONS`) + manual `extractJsonObject()`/`JSON.parse()` + Zod `.safeParse()` + defensive `[]`-defaulting for any missing array key — mirroring the already-proven `extract-requirements-qwen.ts` (OpenAI-compat) pattern rather than trusting the beta feature through a compat layer.
- **Three separate, stricter real request-size limits than Claude's own API** — all surfaced by the SAME chunked PDF that worked fine on Claude: (a) a 28,000,000-character cap on a single base64 JSON string field (`StreamReadConstraints.getMaxStringLength()` in the real error), (b) a 16,777,216-byte cap on the total request body — a separate, stricter limit found only after narrowing `MAX_CHUNK_BYTES` to 15MB for (a) and still failing, (c) DashScope's JSON-mode requiring the literal word "json" somewhere in the prompt, worked around by appending that requirement to the shared instruction text. `MAX_CHUNK_BYTES` settled at **8MB** — the value low enough to clear all three real limits at once, on both providers.
- **A real, unresolved gap, not fixed**: a programmatically reassembled (`pdfseparate`+`pdfunite`) PDF chunk specifically returns suspiciously tiny input tokens (~535-570) and an empty result through this endpoint — reproducible on both qwen3.5-plus and qwen3.6-plus, while the SAME provider handles a normal (non-chunked) PDF correctly. Root cause narrowed (something about the reassembled file specifically, not the provider or the content) but never definitively diagnosed — worked around by routing anything that would need chunking to Claude Haiku instead (see auto-routing below), not fixed at the source.

### `--provider=auto` — text-layer detection routes each document to the cheaper or the more capable provider

Per the user's request ("截图式PDF走 haiku，非文字走Qwen 3.5-plus"), `lib/ingestion/text-layer.ts` (`hasRealTextLayer()`, shared by the eval script and the production pipeline) runs `pdftotext` and treats ≥500 extracted characters as "has a real text layer" — a threshold picked from real observed data: the 33MB scanned Anexo above yielded well under that (~1,561 input tokens' worth) via the text-only path, while every real text-layer PDF tested that day ran into the tens of thousands of tokens. Word documents (`.docx`/`.doc`) always count as having real text — no scanned-Word case exists.

Routing decision: **has a real text layer → qwen3.5-plus** (cheaper, confirmed reliable on non-chunked documents); **no real text layer (scanned) → claude-haiku-4-5-20251001** (the only provider confirmed to read scanned pages correctly, including through PDF chunking for an oversized one — sidesteps the unresolved DashScope chunked-PDF gap above entirely, since a document needing chunking never reaches the Qwen path under this routing). Built first as `--provider=auto` in `scripts/analyze-batch.ts` for comparison, then — since the product hasn't launched yet and the user wanted it live immediately rather than staged — wired directly into the production `scripts/extract-tender-document.ts` as the new default (`--precise` still overrides to force `claude-opus-5` regardless of text layer). `supabase/migrations/0010_tender_documents_extraction_model_auto.sql` widens `tender_documents.extraction_model`'s CHECK constraint (previously only `claude-sonnet-5`/`claude-opus-5` per migration 0009) to also allow `claude-haiku-4-5-20251001`/`qwen3.5-plus` — **apply this migration via the Supabase SQL Editor before any `--write` run of the auto-routed pipeline**, or the write will fail the old constraint.

**Decided, not acted on (2026-09-04)**: qwen3.5-plus appears to systematically under-detect "critical"-level risks compared to Haiku — 1 critical flag across 12 comparable real documents in one full run, versus Haiku finding several per document elsewhere in the same batch. Not root-caused (could be a genuine model capability gap, or a prompt/threshold difference worth tuning). Raised the option of forcing critical-risk documents to a Claude-tier model regardless of the text-layer auto-routing decision — the user explicitly declined ("不要"): auto-routing stays exactly as built, this is accepted as a known model-capability trade-off rather than a bug to fix. Not revisit unless the user raises it again.

### `analyze-batch.ts` export data-loss bug — found and fixed, affected every batch run's export this session

`results[tender.slug] = extraction` silently overwrote an earlier document's result whenever a tender had more than one source file (the common case — most tenders here have 2-3 documents) — a 14-document run's export JSON only ever had 7 keys, caught by the user noticing the count mismatch. Fixed by keying exports as `` `${tender.slug} :: ${basename(pdfPath)}` `` (one entry per document, not per tender) for both success and error paths. This is also why importing an already-produced export needs to *merge* per tender rather than write one document's result straight in — see below.

### Getting eval results onto a real tender page without re-running the LLM

Once a batch of documents has already been analyzed through `analyze-batch.ts` (an eval/comparison tool that only ever writes a JSON export, never touches Supabase), `lib/ingestion/import-batch-analysis.ts` + `npm run import:batch-analysis` writes those results into `tender_requirements`/`tender_risks` for real, so they render on the actual tender detail page instead of only being visible in the export file. It groups a multi-document tender's per-document entries and merges them (`mergeExtractions()`, the same dedup logic chunked-PDF merging already used) into one write per tender — writing per document the way `extract-tender-document.ts`'s `writeToSupabase()` does would have each later document's delete-then-insert blow away the previous document's rows for the same `tender_id`, since that function's overwrite semantics were designed for one document being re-extracted at a different tier, not several distinct documents each contributing part of a tender's picture. Accepts more than one export file in one invocation for exactly this reason — a document re-run separately later (a missing file found and tested on its own) still merges into the same tender instead of its own write wiping out the earlier run's.

The same function backs `/admin/import-analysis` (`components/admin/ImportBatchAnalysisForm.tsx` + `app/api/admin/import-analysis/route.ts`) — a small admin-gated web form (multi-file upload, preview before write, force-overwrite checkbox) added specifically so this step doesn't require the terminal; both entry points call the identical shared function so they can't drift.

## Proyectos Estratégicos MX's detail-page API — confirmed anti-bot gated, same as Compras MX (2026-09-04)

Real DevTools capture from the user, checking whether the per-tender detail page (`proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/sitiopublico/detalle/<id>/procedimiento` — the page with real fields this platform's bulk export doesn't carry, notably a genuine `Plazo de ejecucion en dias naturales` duration field and a full `DATOS ESPECÍFICOS` section) is backed by a public, anonymous API worth building a connector against:

- `GET https://peservicios.hacienda.gob.mx/whitney/sitiopublico/expedientes/<id>?id_proceso=procedimiento` (the tender detail itself) and `GET .../expedientes/<id>/anexos?id_proceso=procedimiento&rows=10&page=1` (its attachment list) both carry `grc`/`igrc`/`xgrc` request headers with long signed-token values — the exact same three header names, same shape, as Compras MX's own gated detail API (`upcp-cnetservicios.buengobierno.gob.mx/whitney/sitiopublico/expedientes`, see "The open-tenders-vs-contracts gap" above). Confirms this portal runs the same underlying government procurement platform as Compras MX (already suspected from the identical export file format — see "Same export format as Compras MX open tenders" above) right down to sharing its anti-automation gateway.

**Conclusion: no connector will be built against this API**, for the same reason none exists for Compras MX's own detail/attachment endpoints — building one that keeps working means solving a time-synced signed-token challenge, which is bypassing anti-bot protection. This means real per-tender fields only visible on the detail page — contract execution duration (`Plazo de ejecucion en dias naturales`, which would trigger `lib/relevance.ts`'s `LONG_DURATION_DAYS`/`SHORT_DURATION_DAYS` signals directly if it were ever captured), a real budget figure (none was found in the one real detail page inspected, so this specific tender's "未公开" estimated-value display is accurate, not a data gap), and real attachment/document links — stay a manual, one-tender-at-a-time lookup, same posture as everything else behind this gateway.

This also confirms why `lib/relevance.ts`'s `DURATION_ANCHOR` regex (matching "plazo de ejecución: N días" and similar) is architecturally unlikely to ever fire on real data: it only runs against `[title, summary, industries]` (see `classifyRelevance()`'s `haystack`), and real duration phrasing lives on this gated detail page, never in the short title/summary text the bulk export files carry. Confirms the header comment's own long-standing caveat ("not yet confirmed against a real title carrying this phrasing") rather than resolving it — the signal is real, defensive code that's very unlikely to ever have anything to match against under the current data model, not a bug.

## "excluded" (routine-service) tenders no longer stored at all (2026-09-04)

Per the user's explicit call, prompted by the admin tender list showing a growing pile of "日常服务类" rows after a fresh `ingest:comprasmx-open` re-run: the design changed from "write every tender, including excluded ones, and hide them by default" (documented everywhere above as "kept but not shown, for future market statistics") to **excluded tenders are never written at all**.

- `upsertTendersBatched()` (`lib/ingestion/upsert-tenders.ts`, the shared write path every real ingest script routes through) now filters `tender.relevance.tier !== "excluded"` before upserting anything, logging how many were skipped. Every `ingest:*` script picks this up automatically — no per-script changes needed.
- `reclassify-tenders.ts --write` now DELETEs any row whose recomputed tier is "excluded" (cascades to `tender_requirements`/`tender_key_dates`/`tender_risks`/`tender_documents` via the existing FK constraints) instead of just updating its stored tier — so tightening the ruleset also cleans out what's already in Supabase, not just what gets ingested going forward.
- `purge-excluded-tenders.ts` still exists for a quick one-off cleanup of whatever is *currently* tagged excluded, without recomputing relevance first — harmless to run anytime, including after a `reclassify-tenders.ts --write` (finds nothing left to delete).

Real trade-off, stated plainly: recovering an excluded tender's data now means re-ingesting its original source file, not querying Supabase — this tier genuinely stops being "hidden metadata" and becomes "not kept." Every other relevance tier (`flagship`/`significant`/`standard`) is unaffected — still written and still just hidden-by-default for `standard` per the existing design.

## Admin backend for what used to be terminal-only workflows (2026-09-04)

Per the user's request to move CLI-only ingestion work into `/admin`, three real UI+API additions, each a thin layer over a shared `lib/ingestion/*` function so the web form and the CLI script can never drift apart (same pattern each time — see the individual files' header comments for the full story):

- **`/admin/import-tenders`** — upload a Compras MX open-tenders or Proyectos Estratégicos MX export (`.xlsx`/`.csv`) instead of running `npm run ingest:comprasmx-open`/`ingest:proyectos-estrategicos` by hand (`lib/ingestion/import-new-tenders.ts`). Required refactoring `compras-mx-open-tenders-file.ts`'s reader to accept an in-memory buffer, not just a file path.
- A **"翻译所有标题"** button on the same page runs the Haiku 4.5 es→zh translation pass (`lib/ingestion/translate-all-tenders.ts`, previously only `npm run translate:tenders`), with a `limit` field so one web request stays bounded — a real --write run over hundreds of tenders makes that many sequential Anthropic calls and can run for minutes.
- **`/admin/documents-needed`** (merged with what was briefly a separate `/admin/analyze-document` page) — each worklist row gets an inline "上传分析" upload, scoped to that exact tender, combining what used to be two CLI steps (`ingest:documents` then `extract:document`) into one action (`lib/ingestion/analyze-uploaded-document.ts`). The uploaded file is never persisted — written to a temp file only for the duration of intake+extraction, deleted in a `finally` block as soon as analysis finishes either way, since this platform has no Supabase Storage bucket wired up at all (`tender_documents.storage_url` is a placeholder column, never written anywhere).

`upsertTendersBatched()` also now returns `skippedExcludedCount` so any caller (CLI or web) can report how many rows were skipped for being "excluded" — a direct follow-on to the write-path change above.

### PEMEX gets a genuine live connector — no more manual browser Console capture

Unlike Compras MX/Proyectos Estratégicos MX (confirmed `grc`/`igrc`/`xgrc`-gated, see below), PEMEX's SharePoint REST API was already confirmed genuinely anonymous with zero anti-bot layer (`pemex-mapper.ts`'s own header comment: "confirmed by the absence of any WAF cookies/headers and by the request succeeding with a plain unauthenticated fetch"). That means the exact request the browser-Console script (README's "Technique 3") has always used — same URL, same `$select`, same `odata.nextLink` pagination — works identically from a plain server-side `fetch()`, no cookies or session state needed at all. `lib/ingestion/connectors/pemex-live.ts` replicates it directly; `lib/ingestion/import-pemex-live.ts` + `/admin/import-tenders`'s "PEMEX 直接拉取" section wire it to the same mapper/upsert path `npm run ingest:pemex` uses for a locally-saved capture.

**Not yet exercised against the real endpoint from this session** — this sandbox has no network egress to pemex.com, so the very first live run needs to happen from the user's own machine and be watched once before trusting it at scale, same caveat every other "not yet live-tested" note in this file carries. The request shape itself isn't a guess, though — it's copied exactly from real captures already used successfully via `npm run ingest:pemex` all session.

### DOF's advanced-search endpoint — live connector built

The user captured the complete real request DOF's advanced search page sends (`POST sidof.segob.gob.mx/busqueda/CargaNotasAvanzadas/`) via "Copy as cURL," confirming what README already suspected: a routine `ci_session` cookie (set on any visit to the site) plus a full DataTables-format body (`draw`/`columns[]`/`order[]`/`start`/`length` alongside the real search params `tipoBus`/`textoBus`/`fechaIni`/`fechaFin`/`idOrg`/`sinonimos`/`tipoTexto`) — no `grc`/`igrc`/`xgrc` token. `lib/ingestion/connectors/dof-search-live.ts` replicates it directly (GET the search page first to receive `ci_session`, then POST with it, paginating via `start`/`recordsTotal`); `lib/ingestion/import-dof-search-live.ts` wires it to the existing detail-page fetch (`dof-notice-detail.ts`, same per-notice enrichment `npm run ingest:dof-search` already does) + `dof-search-mapper.ts` + `upsertTendersBatched`, with the CLI script's `process.exit(1)` circuit breaker converted to a thrown `Error` since this runs inside a live web request rather than a terminal process. `/admin/import-tenders`'s "DOF 直接拉取" section exposes it — buyer keyword, date range, and machine scope (`idOrg`, defaulted to the value captured in the real request) as form fields.

**Live-tested, two real bugs found and fixed (2026-09-04)** — the first real run (from the user's own machine, this sandbox still has no egress to *.gob.mx) returned 0 results for a search the user then confirmed by hand DOES have real hits (CFE, the same window).

1. `fechaIni`/`fechaFin` were being sent as `DD/MM/YYYY` (slashes) — a guess based on this project's OTHER DOF date convention (`dof-notice-detail.ts`'s URL param). The real search form uses **`DD-MM-YYYY` with hyphens** — confirmed directly from the user's own manual search on the live page (the "Desde"/"Hasta" fields and the resulting "Búsqueda realizada... desde 03-08-2026 hasta 04-09-2026" confirmation text both showed it), then confirmed again by a fresh real "Copy as cURL" capture the same day (`fechaIni=04-08-2026&fechaFin=04-09-2026`). `ImportDofSearchForm.tsx`'s `isoToDofDate()` now emits hyphens.

2. Still 0 results after fix #1 with parameters matching the confirmed-working capture exactly. Added a cookie-jar fix on suspicion (the capture's Cookie header carries several cookies beyond `ci_session`, including one with an unusual, WAF/CDN-looking name) plus a real browser `User-Agent` (Node's fetch sends none by default) — reasonable hardening, but NOT what turned out to be the actual bug.

3. **The real bug**, found only once raw-response logging was added and the user ran it again: HTTP 200, `Content-Type: text/html`, a real ~57KB body, but `recordsTotal`/`recordsFiltered` logged as `undefined` — with no thrown error, because `JSON.parse()` on a JSON-encoded response happily "succeeds" even when the parsed value doesn't have the shape you expected; property access on the wrong shape just silently returns `undefined` rather than throwing. The raw body preview revealed the actual response: `{"messageCode":200,"response":"OK","totalRegistros":86,"Notas":[...]}` — the exact same shape `dof-search-file.ts` (the locally-saved-capture reader, built earlier from real fixture data) already used. `dof-search-live.ts` had invented an entirely different, generic-DataTables-shaped response type (`{draw, recordsTotal, recordsFiltered, data}`) — a plausible-sounding but wrong guess, since the real endpoint accepts a DataTables-*formatted request* but replies with its own custom envelope, not real DataTables server-side-processing output. Fixed by reusing the confirmed-real `{messageCode, totalRegistros, Notas}` shape (matching `DofSearchResponse` in `dof-search-file.ts`) instead of a second, wrong, independently-invented type. This resolves the long-standing "these two connectors' response shapes were never reconciled" gap noted earlier in this file (see the PEMEX live-connector section above) — `dof-search-file.ts`'s shape was correct all along.

Everything else in the captures (idOrg's `PE,PL,PJ,OA,EPEM,EF,OD,AV,CV,VG,TODOS`, the DataTables column/order boilerplate on the REQUEST side, the date format, the cookie jar) was already correct — this response-shape mismatch was the sole remaining reason real search hits (86 of them, confirmed) were reading back as zero. Confirmed via the user's own live run's raw-body log line, not yet re-confirmed end-to-end (mapped tenders actually landing in Supabase) — worth one more live-run check.

One dead end ruled out along the way: `sidof.segob.gob.mx`'s own `/apiStatus` page (a real, public uptime dashboard listing dozens of SIDOF API endpoints) surfaced `/buscarNotas/titulo/{query}/{page}/{pageSize}/fecha/asc` as a promising plain-GET alternative — tested directly by the user and it 404s when hit as a bare path off the site origin, so it's not a working shortcut (possibly needs a different base path/prefix, or belongs to an unrelated internal caller). Not worth pursuing further without a real successful capture of it in context.

### Eighth pass — vehicle-fleet purchases restored to the FLAGSHIP_INDUSTRY_KEYWORDS whitelist (2026-09-04)

The user asked to widen the whitelist to cover government vehicle purchases (buses, trucks, SUVs) while explicitly flagging the risk of also matching routine vehicle services (fuel, maintenance) — the exact false-positive class the Seventh pass's narrowing was designed to avoid elsewhere. `FLAGSHIP_INDUSTRY_KEYWORDS` gained one new pattern, anchored to a purchase/acquisition verb (`adquisición`/`adqs.`/`compra`/`suministro`) immediately followed by a vehicle noun (`vehículo`/`autobús`/`camión`/`camioneta`/`pick up`/`SUV`/`furgoneta`) within 40 characters — not a bare mention of the noun anywhere in the title. That anchoring matters because `EXCLUDE_KEYWORDS` runs *before* this whitelist check in `classifyRelevance()`: a maintenance job ("servicio de mantenimiento..."), a fuel contract ("combustible para el parque vehicular"), a rental ("arrendamiento de vehículos"), or tires ("neumáticos para vehículos") already get excluded on those existing, more specific patterns and never reach the vehicle-purchase check at all — confirmed with three new regression fixtures exercising exactly those cases (maintenance/fuel/rental titles that also happen to be about vehicles) plus three positive ones (bus/truck/SUV purchases). `lib/industry.ts`'s `vehicles` tag was separately widened to recognize camioneta/pick up/SUV/furgoneta too — it previously only matched vehículo/camión/autobús/maquinaria pesada, so an SUV purchase wouldn't even get tagged for the industry filter UI, independent of the relevance-tier question.

Initially did NOT restore "ADQUISICIÓN DE MAQUINARIA PESADA" (heavy machinery) to the whitelist, since the user's ask was specifically vehicles — but the user then explicitly asked for it too in a same-day follow-up ("'maquinaria pesada' 也加回白名单"), so it was added as one more noun alternative in the SAME anchored purchase-verb pattern (not a separate rule) — a genuine machinery *purchase* promotes to significant, while "arrendamiento/renta de maquinaria pesada" (rental) still falls through to the bottom exclusion since "arrendamiento" isn't one of the purchase verbs the pattern anchors on, exactly like vehicle rental.

**Existing production rows won't reflect this until reclassified** — same as every other relevance-rule change in this file: `npm run reclassify:tenders -- --write` re-runs `classifyRelevance()` against every already-ingested tender and updates (or, for anything now landing "excluded", deletes — see "'excluded' (routine-service) tenders no longer stored at all" above) rows whose tier changed. A vehicle-purchase tender ingested before this pass is still sitting as "excluded" (or, if ingested before the "excluded" no-store change, simply hidden) in Supabase until that script runs.

### Manual admin overrides now survive re-ingestion (2026-09-04)

Two related gaps the user flagged the same day: an admin's manual relevance-tier edit (`AdminTenderForm.tsx`'s "相关度分级" dropdown, always available on `isEdit`) and an admin's manual delete (`AdminTenderList.tsx`'s delete button) both used to be silently reversible — a later re-ingest of the same tender from its original source (same slug scheme, see the connector sections above) would either recompute and overwrite `relevance_tier`/`label`/`reason` right back to whatever `classifyRelevance()` says today, or simply re-insert a deleted row as if it had never been removed.

**Manual tier override protection**: `tenders.relevance_manually_overridden` (migration `0013`) — set from a new "🔒 锁定此分级" checkbox next to the tier dropdown, auto-checked when the admin changes the tier but independently toggleable (an admin can uncheck it to release a row back to automatic classification without also changing its current tier). `lib/ingestion/upsert-tenders.ts` checks this per-batch before writing: a protected row is upserted via a *separate* call whose row objects never carry any `relevance_*` key at all — not merely "the same value," which matters because Supabase's PostgREST-backed bulk `.upsert()` derives its `ON CONFLICT DO UPDATE SET` clause from the JSON keys present across the whole array; mixing protected and unprotected rows in one call would still list those columns in the shared SET clause and could null them out for the rows missing the key. Every other field (title, dates, buyer, ...) still updates normally for a protected row — the lock is scoped to classification only. `scripts/reclassify-tenders.ts` (the bulk re-run-the-ruleset-against-everything script) got the same protection: a protected row is left untouched even when the recomputed tier would delete or re-tag it, reported via a new `manually_protected` CSV column and a `protectedSkipped` count in its summary line — this was the more urgent half of the fix, since `--write` on that script is exactly the operation that would otherwise blow away a manual override the very next time someone runs it.

**Manual delete protection**: a new `tender_manual_deletions` tombstone table (migration `0014`, `slug` as primary key) — the admin `DELETE /api/admin/tenders/[slug]` handler writes a row here (best-effort, after the actual delete succeeds) recording the slug it just removed. `upsertTendersBatched()` checks this table in a pre-pass (chunked `.in()` lookups, same batching as the main upsert loop) and skips any tombstoned slug entirely — never even attempts to write it, not just a relevance-tier skip. No admin UI to browse or undo a tombstone yet; recovering one currently means deleting its row from `tender_manual_deletions` directly via the Supabase SQL Editor, the same manual-SQL posture this project already uses for migrations themselves.

Both protections are scoped to `upsertTendersBatched()` — the single shared write path every real ingest script and admin route routes through (see the note on this in the architecture summary above) — so they cover every realistic re-ingestion scenario without needing to touch each connector individually.
