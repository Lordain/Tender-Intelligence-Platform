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

**The two dashes before `--write` are not optional.** `npm run x -- --write`
passes the flag to the script; `npm run x --write` gives it to *npm*, which
prints one grey `npm warn Unknown cli config "--write"` and then runs the
script with an empty argv — a dry run whose own footer then says, correctly,
that nothing was written. On 2026-09-18 that cost a reclassify twice over: 21
tier changes and 6 deletions were reported as pending, believed as done, and
never applied. Since then `lib/cli-write-flag.ts` catches it (npm leaks the
swallowed flag as `npm_config_write=true`) and every `--write` script stops
with the correct command instead of dry-running in silence. It refuses rather
than infers: these scripts delete rows, and a silent deletion is worse than a
visible no-op. Covered by `npm run test:cli-write-flag`.

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
| Peru — OECE OCDS, API path (`ingest:peru-live`, the default) | **Effectively current — about one day of lag.** `/recordsAfter?dataSegmentationID=YYYY-MM` queries the live index and accepts the CURRENT month, unlike the monthly files. Confirmed 2026-09-11: a `2026-09` query returned records with `datePublished` 2026-09-09 and `compiledRelease.date` 2026-09-10. Two traps worth knowing: `order=desc` sorts by tenderId-as-string, NOT by date (an unfiltered scan opens on March 2024), and the API SILENTLY IGNORES query parameters it does not recognise — `dataSegmentation=` and `year=&month=` both returned 200 with the whole unfiltered dataset. Only `dataSegmentationID`, with that capitalisation, filters; `assertSegmentHonoured()` in the connector fails the run if a future rename brings that behaviour back. A third trap, found 2026-09-11 when the admin 秘鲁 tab returned `403 Forbidden for segment 2026-09` while the identical CLI code kept working: the `.gob.pe` WAF rejects a request carrying no `User-Agent` at all, which is what Node's `fetch` sends. `fetchOece()` now sends a real product User-Agent (identifying, not impersonating a browser), sets `cache: "no-store"` (Next patches global fetch, and a replayed 403 makes a fix look like it did not work), and retries 403/429/5xx with bounded backoff. That was not the whole story: with the header in place the CLI kept working (2428 records for 2026-09) while the admin route still got `{"code":"403","message":"Forbidden","RequestId":"${http.request.id}"}` — a hand-written edge-proxy deny with its own template placeholder left unexpanded, not a WAF challenge. So the block is on egress, not on headers; `whereAmI()` appends the calling machine to every 403, and that settled it the same day: the refused request came from `iad1`. **Peru's proxy denies Vercel's datacenter range, so SEACE is a CLI-only source on a deployed instance** — not worked around (it is the operator's decision about who may call their service from where, and the data is reachable the way they allow). The admin route detects this specific failure and replies with the `ingest:peru-live` command pre-filled from the submitted settings; the 秘鲁 tab says it up front rather than offering a button that always fails. It also rules out an import cron for SEACE on Vercel entirely — OxI (investinperu.pe, not behind this proxy) is the only Peru source that could ever run on a schedule there. |
| Peru — OECE OCDS, bulk path (`ingest:peru-live -- --bulk` / `ingest:peru`) | **Batched by complete calendar month — not a rolling "current" feed.** The latest available file is always the PREVIOUS full month (confirmed: a September 2026 file request returned a real 404 on 2026-09-02). A tender published on the 1st of a month is invisible until the following month's file — up to ~30 days' real lag. Superseded as the default by the API path above on 2026-09-11; kept as an independent route to the same data. |
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

### Why the platform held one electricity project (2026-09-11)

The user asked why CFE coverage was near-empty when CFE's own micrositio
plainly listed open tenders. Two separate causes, and the smaller one is the
ingestion path:

**The classifier was dropping almost all of them.** CFE reaches this platform
only through DOF; DOF publishes **no estimated value on any notice**; Mexico
is in `UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL`. So every CFE tender needed a
whitelist term to survive — and `FLAGSHIP_INDUSTRY_KEYWORDS` had no grid
vocabulary at all. Measured against real titles: `subestación eléctrica`,
`línea de transmisión 400 kV`, `central de ciclo combinado`, `red de
distribución eléctrica` and `parque eólico` were **all excluded**, while
`industry.ts` had already tagged every one of them `power`. The 2026-09-04
pass added transformer/generator/relay/UPS patterns, but anchored to a
purchase verb — that covers buying a component, not building the grid.

Fixed by adding concrete asset nouns (substation, transmission/distribution
line, the named generation-plant types, wind farm, and a stated kV rating).
Deliberately nouns, not the bare `energía|eléctrico` signal the Seventh pass
removed for being far too broad. **`electrificación` is deliberately absent**:
Invierte.pe names small household rural-electrification programmes that way,
so including it would have flooded Peru behind a Mexican fix.

A second, separate defect surfaced with it: `suministro de materiales` was
read as a consumables purchase, but it is also half the standard Mexican
phrasing for a full works contract — "CONSTRUCCIÓN DE OBRAS DE
ELECTRIFICACIÓN (MANO DE OBRA Y SUMINISTRO DE MATERIALES)" — where it means
the contractor supplies both. That excluded a real CFE distribution build
*even with a value*, while the identical title without the parenthetical was
kept. It now only excludes when nothing around it says "works", and it also
catches a title that opens with the goods ("MATERIALES PROFAUNA PARA
SUBESTACIONES"), which `purchaseSubject()` cannot cut because there is no
purchase verb.

**How the competing platforms have CFE data.** Argos Inteligencia shows
`FUENTE: cfe_federal` with external ids shaped `CFE-MSC-CFE-0929-CSAAA-0007-2026`
— `MSC` is CFE's Micrositio de Concursos, so they are reading `msc.cfe.mx`
directly, the Imperva-protected portal this project declined to build against
(see "CFE's own portal is WAF-protected"). GlobalTenders is an aggregator of
the same kind. That is a scraping-posture difference, not a data source this
platform lacks: the convocatoria summary they display is also published in
DOF, which is the legally authoritative channel and is openly accessible.
What `msc.cfe.mx` adds over DOF is the bid documents and the per-procedure
detail — not the existence of the tender.

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

### Colombia moved to the admin backend, with bulk documents (2026-09-04)

Both scripts above were CLI-only until the user asked directly: "取2个月的哥伦比亚数据进来+附件，看看结果，看看怎么跑" (pull 2 months of Colombia data + attachments, see the results). Two real things this needed, not just a button:

1. **One combined admin action, not two** — `lib/ingestion/ingest-colombia.ts` merges what ingest-colombia-live.ts (tender list) and ingest-colombia-documents.ts (one process's documents) used to do as separate manual steps. The admin form (`ImportColombiaForm.tsx`) exposes both months + a "同时下载附件" checkbox in one run.
2. **A real bulk-fetch design constraint**: ingest-colombia-documents.ts always took `--proceso` as an explicit CLI arg — there was no "fetch documents for every tender ingested this run" loop, and the connector's own header comment explicitly warns `id_del_proceso` (needed for the documents dataset's `proceso` filter) is NOT guaranteed to equal a stored tender's `tenderNumber` (which prefers the human-readable `referencia_del_proceso` when present — a different id namespace). `ingestColombia()` avoids this trap by keeping each `SecopProcesoRow` in memory alongside its mapped `Tender` through the whole run, so the document-fetch step always uses the row's own real `id_del_proceso`, never a value re-derived from what got stored.

Which tenders documents actually get fetched for is decided by re-querying Supabase for `id`s of the candidate slugs AFTER the upsert, rather than trying to reconstruct that from `upsertTendersBatched()`'s aggregate counts — a slug that was skipped (excluded tier, or a `tender_manual_deletions` tombstone) simply doesn't come back from that query, so it's correctly never fetched for either, with no separate bookkeeping needed.

Documents are downloaded and recorded (`extraction_status: "pending"` for PDFs) but **not automatically analyzed** — that stays the existing separate, cost-aware step (`npm run extract:document`, or the admin "标书附件分析" upload form once the file's been retrieved locally), same as every other document-analysis path in this project. Bulk-downloading is deterministic and free; running the LLM extraction on each one is a real, per-document cost the admin should trigger deliberately, not something a bulk-import button should do silently.

Still true as of this pass: the live connector has never been confirmed reachable from outside this sandbox's blocked egress (see "SECOP II tender list" above) — the first real `--write`/"写入" run from the admin's own machine should be spot-checked (row count, a few sample rows, and that a downloaded document's file size matches its `tender_documents` metadata) before trusting it at scale, the same posture every other newly-automated source in this project gets.

### First real bulk run downloaded 0 attachments — diagnosed, not yet confirmed (2026-09-04)

The spot-check above happened: a real "拉取并写入" run from the admin's own
machine wrote 220 tenders and attempted documents for 499 candidate slugs
(candidates include tenders already in Supabase from earlier runs, not just
the 220 written this time — `documentCandidates` is built from a fresh
Supabase lookup by slug, not from `upsertedCount`). Result: 0 downloaded, 0
already-on-file, 0 failed. Since `documentsFailed` was 0, every one of the
499 `fetchSecopDocumentsForProcess()` calls returned a real 200 — the
archivos-metadata dataset (`dmgg-8hin`) itself came back with **zero
matching rows** for every single candidate's `id_del_proceso`, before the
`isPreAwardDocument()` filter even ran. That's not a download failure; it's
the exact assumption this connector's header comment already flagged as
unverified (`proceso` in `dmgg-8hin` is "the same shape as `id_del_proceso`
in the main `p6dx-8zbt` dataset... not verified either way yet") coming up
empty at scale.

Two real (non-exclusive) explanations, neither confirmable from this
sandbox (still no egress to `datos.gov.co` — a direct `curl` here gets the
same policy-level `403` at the proxy, not a real API response):

1. **Coverage lag, not a bug.** The original 5-row sample of `dmgg-8hin`
   was 4/5 post-award paperwork (payment receipts, insurance certs — all
   carrying a `n_mero_de_contrato`) and only 1/5 genuine pre-award. This
   platform only ingests recently-*published, still-open* tenders (2-month
   window) — if Colombia only archives a process's documents into this
   dataset once it's further along its lifecycle (award, contract setup),
   a freshly-published open tender may simply have no rows there yet,
   which would produce exactly this "0 for all 499, no errors" result.
2. **`id_del_proceso` != `proceso`.** The two datasets' id columns were
   never actually cross-checked against each other with a real matching
   pair — only that both looked like the same shape in isolation. If the
   `dmgg-8hin` dataset's `proceso` column uses a different real-world id
   (e.g., a contract-level id rather than the process-level one), the
   equality filter would legitimately return nothing for any process id
   from `p6dx-8zbt`, regardless of lifecycle stage.

Added instrumentation (`documentsMetadataRowsFound`, the raw row count
across all candidates before the pre-award filter, and
`documentsSkippedPostAward`) to `ingestColombia()`'s result and the admin
form's summary line, so the *next* real run tells these apart without
guessing: nonzero `documentsMetadataRowsFound` on a later run (especially
if isolated to older/already-awarded tenders) points at (1); still zero
across the board — including when manually pointed at a known-old, likely-
awarded `id_del_proceso` — would confirm (2).

### (2) confirmed real — a THIRD id namespace, and a fix (2026-09-04)

A second real run added a diagnostic log printing real `proceso` values
from `dmgg-8hin` next to this run's own real `id_del_proceso` values
side-by-side. Confirmed explanation (2), not (1): `id_del_proceso` for
this batch was consistently `CO1.REQ.*` while `dmgg-8hin`'s `proceso`
sample was consistently `CO1.BDOS.*` — genuinely different id
namespaces, not a coverage-lag question.

The user then manually opened one tender's own `sourceUrl` (the real
`community.secop.gov.co` tendering-detail page) and found two more real
things:

1. That page is itself **CAPTCHA-gated** ("Por favor, complete la
   validación para acceder a la página") — the same anti-bot posture as
   Compras MX. Its internal AJAX endpoints (company business card,
   category loader) run on a `PublicSessionCookie` only a human passing
   the CAPTCHA can obtain — not something this project automates around,
   same standing posture as every other anti-bot-gated source here.
2. Once past the CAPTCHA, the page really does show a real
   "Documentación" section with real downloadable PDFs (user manually
   confirmed one downloads) — and the page's own URL carries a **third**
   id namespace: `noticeUID=CO1.NTC.*`, in the address bar's query string.

The useful part: `urlproceso.url` (stored verbatim as every Colombia
tender's `sourceUrl` by `colombia-mapper.ts`) already carries this exact
`noticeUID` for every tender the connector ever sees — no extra request
needed to get it, and no CAPTCHA involved in reading a field already in
hand from the original (CAPTCHA-free) process-list fetch. `ingest-
colombia.ts` now parses `noticeUID` out of `urlproceso.url`
(`extractNoticeUidFromUrl()`) and tries it against the (still genuinely
open, Socrata) `dmgg-8hin` dataset FIRST, falling back to the old
`id_del_proceso` only if that comes back empty — strictly a "try harder,"
since a wrong id was already just another empty array, never an error.
`documentsFoundViaNoticeUid`/`documentsFoundViaIdDelProceso` in the
result (and the admin form's summary line) report which path actually
matched on the next real run. Not yet confirmed whether `dmgg-8hin`'s
`proceso` column actually accepts `NTC`-namespace ids at all (the 5-row
sample seen so far was 100% `BDOS`) — that's what the next real run with
this change will show.

**Result of that next real run**: still 0/0 via both paths
(`documentsFoundViaNoticeUid` and `documentsFoundViaIdDelProceso` both
0 across 339 candidates) — the `NTC` namespace doesn't match `dmgg-8hin`'s
`proceso` column either. `dmgg-8hin` genuinely appears to only index
`BDOS`-namespace processes; whatever real-world distinction that
corresponds to (regime/modality?) hasn't been identified yet, and no
further automatic path has been found for this batch's `REQ`/`NTC`-style
processes. Attachment auto-download for Colombia stays effectively
inert for now — the tender list itself, and manual per-tender document
retrieval (open `sourceUrl`, pass the CAPTCHA, download by hand) are
unaffected.

### OCDS API confirmed unreachable — all three attachment-automation paths now dead (2026-09-04)

The user ran `npm run ingest:colombia-ocds -- --months 2` for real (from
their own machine, not this sandbox): `ConnectTimeoutError` connecting to
`api.colombiacompra.gov.co:443`. Then opened
`https://api.colombiacompra.gov.co/releases/?name=...` directly in a
browser — also `ERR_CONNECTION_TIMED_OUT`. Two independent real vantage
points (Node `fetch`, and a browser on a different network path) both
can't reach the host at all — not a firewall/proxy/sandbox-egress
question, the domain itself doesn't respond. CCE's own manual documents
this API, but it's not actually live/reachable as of this pass (wrong
subdomain, IP-allowlisted, or simply down — undetermined, and not worth
guessing further without a working request to inspect).

This closes out all three attachment-automation paths investigated this
session for Colombia:
1. `dmgg-8hin` Socrata dataset — real id-namespace mismatch (`REQ`/`NTC`
   vs `BDOS`), confirmed via live diagnostic logging (see above).
2. `community.secop.gov.co` tender detail page — real CAPTCHA gate,
   confirmed by the user manually.
3. `api.colombiacompra.gov.co` OCDS API — host unreachable, confirmed
   from two independent real network paths just now.

**Conclusion: Colombia attachment auto-download is not currently viable
by any path found so far.** Not pursuing further without a new, concrete
lead. `colombia-ocds-live.ts`/`ingest-colombia-ocds.ts` are left in place
(harmless, real code, just currently unusable) in case the host comes
back up or a corrected URL surfaces later — no code changes needed if so,
just re-run the same diagnostic script. Manual per-tender document
retrieval (open `sourceUrl`, pass the CAPTCHA, download by hand) remains
the only working path for Colombia attachments.

### Real flagship-tag bug found via this same investigation (2026-09-04)

While chasing the attachment-id mismatch above, the user opened one of
the affected tenders' edit page directly and spotted something
unrelated but worse: **"ANDERSON DAVID PACHECO COLINA"** — a real
Colombia tender whose title is literally a contractor's own name (a
direct individual-services contract), estimated value ≈US$476
(1,999,200 COP) — was tagged **flagship** (旗舰大标) in the admin
tenders list. Any value floor should have excluded this outright.

Root cause: the real summary text is "PRESTACIÓN DE SERVICIOS DE APOYO
A LA GESTIÓN PARA EL DESARROLLO DE ACTIVIDADES DE CONSERJERÍA, CONTROL
DE ACCESO, APOYO LOGÍSTICO Y MANTENIMIENTO BÁSICO DE LAS INSTALACIONES
DE LA E.S.E. HOSPITAL LOCAL DE SITIONUEVO" — a bundled janitorial/
reception-desk staffing contract for one small hospital. The bare
phrase `control de acceso` in `INCLUDE_OVERRIDE_KEYWORDS`
(`lib/relevance.ts`) matched it, and `hasIncludeOverride` unconditionally
bypasses EVERY exclude check — including `EXCLUDE_KEYWORDS`' own
`conserjería` term, which is *also* present in this exact same text —
and the value floor, landing straight on flagship. Same category of bug
already fixed twice this session for `seguridad perimetral`/`nube
privada` (a bare INCLUDE_OVERRIDE_KEYWORDS phrase matching a routine
staffing/ops-support service instead of the genuine
equipment/infrastructure purchase it was meant to catch) — Colombia's
free-text `descripci_n_del_procedimiento` field makes this kind of
false positive more likely than Mexico's terse titles, same risk
already flagged in the earlier "0 attachments" investigation above.

Fixed the same way as those two: `control de acceso` now requires an
equipment/system qualifier nearby (`sistema`/`equipo`/`dispositivo`/
`torniquete`/`lector`/`biométrico`/`electrónico`/`vehicular`, either
side, within 40 chars) rather than matching bare. Confirmed via
`lib/relevance-fixtures.ts`: the real bad example now returns `excluded`
(value-floor path), and a genuine `"ADQUISICIÓN DE SISTEMA DE CONTROL DE
ACCESO BIOMÉTRICO..."` still returns `flagship` — 77/77 fixtures pass
(up from 75).

This was found by manually inspecting ONE flagged example — the
existing `ReclassifyButton` (写入 mode) should be run after this fix
ships to recompute every already-stored tender's tier under the
corrected rule; anything that comes back `excluded` gets deleted
automatically by that same action (see its own header comment). Not run
from this sandbox (no live Supabase access) — needs the user's own
"重新分类并写入" click.

### "重新分类" never re-tagged industries — real gap found, now fixed (2026-09-04)

The user ran "重新分类" for real, confirmed it correctly purged the
below-value-floor Colombia tenders, but reported two Mexico examples
whose industry tag ("综合"/general) stayed wrong afterward — a school
infrastructure project that should tag "教育" (education), a port
dredging job that should tag "水务" (water). Root cause: `reclassifyTenders()`
(`lib/ingestion/reclassify-tenders.ts`) only ever recomputed
`relevance_tier` via `classifyRelevance()`, using each row's STALE stored
`industries` array as an input — it never called `classifyIndustries()`
again. So once a tender was ingested with a wrong/outdated industry tag,
nothing would ever fix it short of a full re-import.

Fixed: `reclassifyTenders()` now also re-runs `classifyIndustries(title,
summary, buyer)` for every row (same buyer-inclusive convention most
mappers use at ingest time) and writes the result back to `industries`
whenever it changed — including for rows with `relevance_manually_overridden`
(the lock is specifically about a human-corrected relevance TIER, not
about freezing industry tags too). The fresh industries also feed into
the relevance recomputation itself, since a stale buyer-inclusive
industries value could otherwise skew a `FLAGSHIP_INDUSTRY_KEYWORDS`
match via the haystack. New `industriesChangedCount` in the result,
admin button, and CLI script summaries.

### "subestación" bare match — same false-positive pattern, third real example (2026-09-04)

Same investigation surfaced a third real example of the
`INCLUDE_OVERRIDE_KEYWORDS` bare-word trap already fixed twice for
`control de acceso`/`refinería`: a real CFE (Mexico) tender, **"MATERIALES
PROFAUNA PARA SUBESTACIONES"** (wildlife-protection fittings for
substations — anti-perching mesh, a routine materials purchase), was
promoted straight to flagship because the bare `subestaci[óo]n` phrase
matched regardless of value or what was actually being procured.
Narrowed the same way: now requires a construction/equipment/expansion
qualifier nearby (`construcción`/`ampliación`/`modernización`/
`rehabilitación`/`equipamiento`/`equipo(s)`/`obra`). A genuine
`"CONSTRUCCIÓN DE SUBESTACIÓN ELÉCTRICA DE POTENCIA"` still promotes to
flagship. Two new `lib/relevance-fixtures.ts` cases; 81/81 pass.

Given this is now the third real instance of the exact same
false-positive shape, worth flagging for a future pass: every remaining
bare (non-anchored) `INCLUDE_OVERRIDE_KEYWORDS` entry (`ciberseguridad`,
`datacenter`, `fibra óptica`, `\b5g\b`, `\bepc\b`, `transmisión
eléctrica`, `videovigilancia`, ...) is a candidate for the same kind of
false positive — none have a confirmed real counter-example YET, so none
were touched pre-emptively (this project's "confirmed real, not guessed"
bar), but the next one found should get the same fix rather than being
treated as a one-off surprise.

### The next batch confirmed it — systemic fix, not another one-off (2026-09-04)

The user came back with ~28 more real confirmed "应排除" examples in one
batch (Colombia + Mexico live browse-page titles). Testing all 28 against
the code at the time found 12 wrongly promoted to flagship/significant —
every single one was the exact same shape flagged as a risk above, just
with a different bare keyword each time: `videovigilancia`, `seguridad
electrónica`, `fibra óptica` (×2), `\b5g\b`, `sistema de alarma...incendio`,
and even a bare `ferrocarril` (`MAJOR_PROJECT_KEYWORDS`, not
`INCLUDE_OVERRIDE_KEYWORDS`) from a passing "Ferrocarril (FFCC)" mention
naming what KIND of scale was being maintained, not a railway project.
Narrowing one keyword at a time (the `control de acceso`/`refinería`/
`subestación` approach) clearly wasn't going to scale — with 5+ confirmed
instances of the identical root cause, this needed a structural fix
instead of another point patch.

**Fix**: added `MAINTENANCE_ONLY_KEYWORDS` — a single check for "this
title is fundamentally a maintenance/support SERVICE contract," evaluated
BEFORE, and deliberately NOT gated by, `hasIncludeOverride` or
`MAJOR_PROJECT_KEYWORDS` (the one exception to every other exclude check
in this file, which those can always bypass). Only `isNationalPriorityProject`
(a real government-verified major-project designation) still rescues a
match — never a keyword-based override. The pattern itself is a single
bare `\bmantenimiento\b` (plus `servicio técnico preventivo/correctivo`),
replacing the old narrower, bypassable `EXCLUDE_KEYWORDS` "mantenimiento"
entry — that entry's own comment had already documented this exact
accepted trade-off ("a genuinely large maintenance-only contract is
excluded too"); this just makes it stick even when an override keyword is
also present. The bare form also closed real coverage gaps the batch
surfaced that the old, more specific pattern missed: abbreviated "MANT.
PREV.", "mantenimiento integral", and bare "mantenimiento equipo" with no
preventivo/correctivo qualifier at all — each of which fell through to a
`FLAGSHIP_INDUSTRY_KEYWORDS` medical-equipment match and landed on
`significant` instead of `excluded`.

Also broadened the existing spare-parts/tools/materials `EXCLUDE_KEYWORDS`
entry (`suministro de partes/herramientas/material(es)`) to accept
"suministro" without a following "de" (a real gap — "Suministro
Herramientas Menores" has no "de") and to also catch bare "materiales y
artículos de..." consumables purchases (a real example: "OTROS MATERIALES
Y ARTÍCULOS DE CONSTRUCCIÓN Y REPARACIÓN").

All 28 titles from the batch now correctly return `excluded`. Added 8 new
permanent `lib/relevance-fixtures.ts` cases covering a representative
sample (not the full batch) plus the `ferrocarril`-via-`MAJOR_PROJECT_KEYWORDS`
edge case specifically, since that one confirms the fix isn't scoped to
`INCLUDE_OVERRIDE_KEYWORDS` alone; 89/89 fixtures pass, zero regressions
against every prior confirmed-real case in the file (including the two
flagship regression checks for `seguridad perimetral`/`subestación` that
this same batch could easily have broken had the new check been too
broad).

### The value floor itself was still bypassable — closed the gap for good (2026-09-04)

After re-running "重新分类" for real (44 rows correctly purged by the
`mantenimiento` fix above), several more tiny-value Colombia tenders kept
showing as flagship: **"SERVICIO DE INTERNET"** (US$571), **"QPAR S.A.S"**
(US$8,185, another bare-company-name title in the "ANDERSON DAVID PACHECO
COLINA" shape), **"CPS INFRAESTRUCTURA TI"** (US$5,145). None of these
match a `mantenimiento` pattern, so the fix above didn't touch them — the
real title text alone doesn't show an obvious override keyword either
(the actual trigger is presumably buried in each tender's `summary` text,
which isn't visible from the admin list view, and re-fetching every one
individually wasn't practical at this volume).

Rather than chase each one's hidden summary keyword individually, the
user gave a direct, general rule: **"如有金额，金额过了再用关键字，没有
金额的直接用关键字"** (if a value is disclosed, it must clear the floor
before any keyword signal matters — an undisclosed value is the only
case where keyword-only logic should decide). This exposed the real
remaining gap: the value-floor exclude check (line ~837) was still
gated by `!hasIncludeOverride`, same as literally every other exclude
check in the file except the just-added `MAINTENANCE_ONLY_KEYWORDS` —
meaning ANY bare `INCLUDE_OVERRIDE_KEYWORDS` match anywhere in the
haystack (title, summary, OR stored industries) could bypass the value
floor entirely, regardless of how small the disclosed value was.

Fixed by removing that gate — the value floor now only respects
`isNationalPriorityProject` (a real government-verified designation) as
an escape valve, the same posture `MAINTENANCE_ONLY_KEYWORDS` already
established. Verified synthetically (the real summaries weren't
available) with two shape-matched cases — a low-value tender whose
summary mentions "fibra óptica"/"5G", another mentioning
"videovigilancia"/"control de acceso" — both now correctly excluded;
91/91 fixtures pass, zero regressions (no existing confirmed-real
fixture relies on a low value + override-keyword combination staying
flagship). This is the last of three concentric fixes to the same root
issue this session: narrow the specific keyword (`control de acceso`/
`refinería`/`subestación`) → add an unconditional check for one whole
signal (`mantenimiento`) → remove the bypass from the value floor
itself, which no future keyword addition can silently reopen.

### Colombia's real key dates are incomplete — two real gaps fixed, one bigger option surfaced (2026-09-04)

The user flagged this directly ("哥伦比亚招标信息目前并不完整，很多关键日期缺失") after
opening one real tender's government detail page and seeing several real
date fields (fecha de firma del contrato, fecha de inicio de ejecución,
plazo de ejecución) that this platform's Colombia tenders don't show at
all. Two real, immediately-fixable causes found in `colombia-mapper.ts`,
both just wiring already-fetched data that was going unused — no new
network access needed:

1. **`submissionDeadline` was computed but never added to `keyDates`.**
   The field was set on the `Tender` itself, but `keyDates` only ever
   carried a single hardcoded `publication` entry — the exact same
   "computed a value, never pushed it into keyDates" trap already
   documented in `licitia-vigente-mapper.ts`'s header comment (the tender
   detail page's timeline only ever renders `keyDates`, never the raw
   `Tender` fields directly). Fixed: a `submission` entry is now added
   whenever `submissionDeadline` is present.
2. **`duracion`/`unidad_de_duracion` were captured in `SecopProcesoRow`
   from day one but never read anywhere.** These are real fields (part of
   the original 5-row sample this connector was built from) that
   `relevance.ts`'s duration-based signal (`SHORT_DURATION_DAYS`/
   `LONG_DURATION_DAYS`, task #10 in the standing backlog) could have used
   from the start — except that signal only ever read a Spanish text
   phrase (`DURATION_ANCHOR`, "plazo de ejecución: N días") out of
   title/summary, which Colombia's real text never contains. So Colombia
   tenders could never trigger this signal at all, real duration or not.
   Fixed: `classifyRelevance()` now accepts an optional
   `structuredDurationDays` input that takes precedence over the text
   scan; `colombia-mapper.ts` normalizes `duracion`+`unidad_de_duracion`
   into days and passes it through. **Caveat, same posture as
   `DURATION_ANCHOR`'s own header comment**: the unit words
   (`normalizeDurationDays()` in `colombia-mapper.ts` — día/semana/mes/año)
   are the common Spanish terms, NOT yet confirmed against a real
   `unidad_de_duracion` value (none has ever been recorded in this file);
   an unrecognized unit falls back to not firing rather than guessing a
   conversion. Added two synthetic `lib/relevance-fixtures.ts` cases
   (45-day -> excluded, 400-day -> flagship) confirming the plumbing
   itself works; 79/79 fixtures pass. Still needs a real run to confirm
   the actual unit words match — this is the mechanism now existing where
   it didn't before, not full confirmation of task #10.

**A bigger, not-yet-pursued option surfaced in the same conversation**:
the user separately found Colombia Compra Eficiente's own official OCDS
(Open Contracting Data Standard) API manual
(`operaciones.colombiacompra.gov.co/.../cce_manual_datos_abiertos.pdf`,
`api.colombiacompra.gov.co/releases/`) — a properly documented,
standards-based endpoint distinct from the two Socrata datasets this
connector currently chains together. This project already has full,
confirmed-real OCDS plumbing built for Mexico (`ocds-mapper.ts` +
`types.ts`'s `OcdsRelease`/`OcdsDocument`/`OcdsPeriod` types — see
`README.md`'s Mexico OCDS section), which already reads
`tender.tenderPeriod`/`tender.enquiryPeriod`/`awards[].date` into
`keyDates` AND `tender.documents[].url` — i.e., the OCDS route could
plausibly solve BOTH the missing-key-dates problem here AND the
attachment-id-mismatch problem investigated earlier in this same file, in
one integration, since OCDS is a single standardized schema rather than
three separately-namespaced ids. Deliberately NOT built this pass:
standing up a Colombia OCDS connector is a bigger scope change (new
connector, pagination strategy, and a real de-dup risk against the
already-ingested Socrata-sourced tenders under a different slug
namespace) that deserves a deliberate go/no-go from the user rather than
a silent addition mid-investigation — flagged back to them, not resolved.

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

**Retried 2026-09-18 (`npm run probe:brazil-pncp`, user's machine, 6-row
matrix). PNCP works. Everything above about it being down is retracted.**

```
modalidades (control)            200    1,398ms   19 rows
proposta   mod=6                 200   63,101ms   totalRegistros=1457, 146 pages
proposta   mod=6 uf=SP           500   54,135ms   "Failed to obtain JDBC Connection ... Hikari"
proposta   mod=6 uf=SP size=1    400      628ms   "deve ser maior que ou igual à 10"
proposta   mod=6 + dataInicial   500   30,449ms   "Erro na comunicação com o banco de dados."
proposta   mod=4 uf=SP           500   61,448ms   Hikari
publicacao mod=6 uf=SP           500   47,000ms   Hikari
```

Three findings, two of them the opposite of what the matrix was built to
test:

1. **It is slow, not broken.** 63 seconds is acceptable for a nightly import
   that pages through once. Every earlier "504 / timeout" was our own 60s
   cutoff, so the note above ("the scope is every `contratacoes` endpoint")
   was wrong. Raising the cutoff to 120s is what distinguished the two.
2. **Narrowing the query is what kills it.** `uf` never helped; it turned a
   working call into a 500 three times out of three, across two modalities
   and two endpoints, while the one call that omitted it succeeded. Hikari
   is a JDBC connection *pool*, so the 500 means "no database connection was
   free", not "your query was too broad". **The connector must therefore
   send the BROAD query and filter on our side** — backwards from every
   other source in this project, and the thing most likely to get
   re-litigated by someone later trying to "optimise" the request.
3. **`dataInicial` is poison too** (500). The working call sent `dataFinal`
   alone.

So the proven shape is:

```
GET /api/consulta/v1/contratacoes/proposta
    ?dataFinal=YYYYMMDD&codigoModalidadeContratacao=N&pagina=N&tamanhoPagina=>=10
```

`tamanhoPagina` has a floor of 10 (the 400 says so); the ceiling is still
unmeasured.

**What is still missing before a connector can be written.** The probe
printed top-level field names only, and a name is not a contract:
`orgaoEntidade` and `unidadeOrgao` are nested objects nobody here has seen
inside, and they are where the buyer, the UF, the municipality and the
federal/state/municipal split have to come from. No date, money or status
field has had a real value looked at either. Writing a mapper from a field
list is the shortcut that cost a bulk run matching 0 of 440 Colombian
candidates, so `npm run dump:brazil-pncp` (scripts/dump-brazil-pncp-rows.ts)
exists to close that gap in one run: it prints the first row as complete raw
JSON, and exports 30–50 real `objetoCompra` titles to
`exports/brazil-pncp-titles-<date>.csv`.

It also fills the one cell the matrix left empty. Both `mod=4` attempts
carried `uf` — now known to be the failing ingredient — so Concorrência
Eletrônica, the modality carrying the large public works this platform
actually sells, has never been tried in the shape that works. The script
sweeps every modality without it.

**First `dump:brazil-pncp` run, hours later the same day: the whole service
was down.** One `fetch failed` at 9.7s, then nineteen straight 503s — "No
server is available to handle this request" — each answered in under 250ms.
`/modalidades` replied in 5.3s in the same run, so the domain, the network
and this machine were all fine; that endpoint lives on `/api/pncp/`, a
different service from the `/api/consulta/` one that was down. A sub-250ms
503 from a load balancer with no healthy backend is not our query shape, and
it is not "nothing is open for bidding today" — the modality codes are
confirmed real and complete (all 19 listed by that same control call, with
`4` = Concorrência Eletrônica and `6` = Pregão Eletrônico).

So the real operating picture is: PNCP's consultas service alternates between
slow-but-working (63s) and hard-down, within the same day. Three consequences
for the connector, all of them things to build in from the start rather than
discover in production:

- Retry transient failures (502/503/504, connection errors) with backoff.
  A 400 is our parameters and a 500 is their database; neither improves on a
  second ask. `dump-brazil-pncp-rows.ts` now does exactly this.
- **A failed run must never be recorded as an empty one.** An import that
  reads "0 tenders" from a dead service and acts on it is how a feed silently
  empties out. The dump script reports those two outcomes as different
  findings in different words, and the connector must too.
- Give up early. Three hard failures in a row is the service being down, not
  three unlucky modalities — the sweep stops there instead of spending twenty
  minutes collecting sixteen more copies of the same 503.

**Third run, same day: healthy, and it answered in under a second.** Counts of
what is open for bidding, by modality (`dataFinal=20260918`):

| code | modality | open | latency |
|---|---|---|---|
| 8 | Dispensa | 362 | 493ms |
| 6 | Pregão - Eletrônico | 314 | 672ms |
| 4 | **Concorrência - Eletrônica** | **60** | 418ms |
| 7 | Pregão - Presencial | 8 | 622ms |
| 5 | Concorrência - Presencial | 6 | 241ms |
| 1 / 3 | Leilão - Eletrônico / Concurso | 2 each | <1s |
| 10 / 11 | Manifestação de Interesse / Pré-qualificação | 1 each | <1s |
| 2 / 9 | Diálogo Competitivo / Inexigibilidade | 204 — none open | <1s |

So the 63s measured earlier was a degraded service, not its normal speed, and
the cell the matrix left empty is now filled: **Concorrência Eletrônica works
and carries 60 open procurements** — that is the modality for large public
works, and it was only ever failing because every previous attempt at it
carried `uf`. Dispensa (direct award, 362) is the largest bucket and is
mostly noise for this platform, which excludes direct awards outright.

That run also produced two findings the script was reporting wrongly, both
now fixed:

- **204 No Content is an answer, not a failure.** It is how `/proposta` says
  a modality has nothing open. `JSON.parse("")` throws, so the script called
  PNCP's correct empty answer `FAIL 204 返回的不是 JSON` — dressing a real
  result up as a fault, the exact confusion the point above is about.
- **PNCP rate-limits, and it is our request rate that trips it.** Fourteen
  counts in roughly five seconds of wall clock earned `429 Limite de
  requisições excedido` from the twelfth on. The script paces itself now
  (1.5s between calls, `--pace` to change it) and waits 15s/45s on a 429
  rather than the 5s/20s used for a 5xx. Its early-abort message used to
  blame PNCP for being down when the last three failures were 429s; a
  limiter and an outage call for opposite responses, so it says which.

### Brazil — the other doors (surveyed 2026-09-18, `probe:brazil-alt`)

`/api/consulta` has now failed three different ways in two days, so what else
exists is worth knowing before a connector is built on it. None of this is
verified from here — every `.gov.br` host is blocked from this sandbox — so
`scripts/probe-brazil-alt-apis.ts` exists for the user to run, and the field
lists it prints are what decides between them.

- **`pncp.gov.br/api/search` — the one to beat.** What the PNCP website's own
  search box calls (`pncp.gov.br/app/editais`), and what several third-party
  collectors use directly: `?q=<termo>&tipos_documento=edital&ordenacao=-data
  &pagina=1&tam_pagina=100`, plus `municipios=` / `ufs=`. It matters for
  three reasons, not one: it is almost certainly a search index rather than
  the relational database whose Hikari pool produces `/api/consulta`'s 500s,
  so the two should fail independently; `tam_pagina=100` is a quarter of the
  requests for the same coverage, which is the direct answer to the rate
  limiter; and `q=` is server-side keyword filtering, which no other source
  in this project offers. The open question is whether it returns whole
  records or search summaries — if `valorTotalEstimado` and the cronograma
  are absent it is a discovery endpoint that still needs `/api/consulta` for
  the money, which is a usable design but a different one.
- **`dadosabertos.compras.gov.br`** — Compras.gov.br / SIASG open data, its
  own Swagger, no auth. **Federal only**: no state or municipal procurement,
  which PNCP does carry. A complement and a cross-check, never a replacement.
- **`contratos.comprasnet.gov.br/api`** — federal contracts already signed.
  Wrong half of the lifecycle for the main feed; relevant later for award
  outcomes.
- **`api.queridodiario.ok.org.br`** — municipal official gazettes, full text,
  open, self-declared ~60 req/min. The Brazilian analogue of the DOF
  connector: it reaches municipalities that never publish to PNCP at all, but
  it returns gazette prose rather than structured tenders, so it carries the
  same extraction problem the DOF mapper solves — in Portuguese.
- **`pncp.gov.br/api/pncp`** is *not* an alternative read path. It is the
  maintenance/integration API (insert, correct, delete) and needs credentials;
  the one part of it we use is `/v1/modalidades`, the unauthenticated
  reference-data call that has served as the control group throughout.

**First `probe:brazil-alt` run (2026-09-18): five of five failed, and three of
those were bad questions rather than findings.** Worth recording in that shape,
because a table of five FAILs reads like "Brazil has no usable API" and that
is not what happened.

```
A1/A2  /api/search      连接失败  fetch failed   1,137ms / 577ms
A3     /api/consulta    504                     70,762ms
B      dadosabertos     404                      1,202ms  "Resource not found"
D      Querido Diário   520                     31,802ms  Cloudflare
```

- **Only A3 was a finding** — `/api/consulta` timing out again, consistent
  with everything above.
- **B's 404 arrived in 1.2 seconds**, which means the host is up and
  answering; the PATH was wrong, and it was a path this repo guessed. The
  probe now reads the service's own OpenAPI document (`/v3/api-docs`) and
  prints its real contract/licitação paths before calling one. Same rule as
  mappers: take it from what the service publishes, not from recall.
  The one real path third-party documentation shows is
  `/modulo-legado/1_consultarLicitacao?pagina=1&tamanhoPagina=10`.
- **D used the front-end host.** The API is `api.queridodiario.ok.org.br/gazettes`,
  not `queridodiario.ok.org.br/api/gazettes`; the 520 was Cloudflare on a host
  that does not serve that path.
- **A1/A2's `fetch failed` said nothing**, and that is the one worth keeping.
  Node reports DNS failure, TLS rejection, connection reset, refused
  connection and connect timeout with the same five characters, and puts the
  real reason in `err.cause` — which nothing prints unless asked. It matters
  most precisely here: A3 reached the SAME HOST in the same run and got an
  HTTP response, so whatever stopped A1 was specific to that path or that
  connection. `lib/fetch-failure.ts` now unwraps the whole chain (including
  `AggregateError`, one entry per address tried) and both PNCP scripts print
  it. This is the same lesson as the earlier `UnhandledPromiseRejection` that
  turned out to be "Host not in allowlist": an error generalised before it is
  printed is worse than no error, because it looks like a finding.

The re-run also isolates one variable deliberately: `A5` sends browser
headers to `/api/search`. The standing posture is still to identify honestly
rather than impersonate a browser — but a WAF closing the connection on an
unfamiliar User-Agent is a live candidate for A1/A2, and if that turns out to
be what decides it, that is a finding to discuss rather than a header to
quietly ship.

### Brazil — `/api/search` is the connector's path (settled 2026-09-18)

Second `probe:brazil-alt` run, same host, same run:

```
A1/A2  /api/search    200    2,372ms / 949ms    205,272 条
A4     /api/consulta  502   45,705ms
```

The returned row says why they fail independently: `"index": "catalog2"`,
`"doc_type": "_doc"`. **`/api/search` is Elasticsearch, not a second view of
the relational database whose Hikari pool produces `/api/consulta`'s 500s.**
It was up and sub-second while `/api/consulta` was failing for the fourth
distinct reason in two days. It also takes `tam_pagina` well beyond
`/consulta`'s 50, and supports `q=` server-side keyword filtering, which no
other source in this project offers.

It is close to a full record. One row carries `orgao_nome` / `unidade_nome`
(buyer), `esfera_nome` ("Municipal" — the government level, which every other
source makes us infer), `municipio_nome` + `uf`, `modalidade_licitacao_nome`,
`situacao_nome`, `numero_controle_pncp`, `item_url`, `data_publicacao_pncp`,
and a `description` holding the whole object text in Portuguese. Two gaps
against `/api/consulta`, both measured rather than assumed by
`npm run dump:brazil-search`:

- `valor_global` was null on the one row seen. Null on a single *revoked*
  edital proves nothing about live ones. If it is null in general, the money
  must come from `/api/consulta` or the detail page, and `/api/search` becomes
  a discovery endpoint rather than a replacement.
- There is no `dataEncerramentoProposta`, but there is `data_inicio_vigencia`
  / `data_fim_vigencia` — on that row 2026-03-11 17:00 → 2026-03-30 08:00,
  exactly the shape of a proposal window. Plausible is not confirmed.

**Two traps in that single row, both of which would have shipped silently:**

- **`situacao_nome` was "Revogada".** The index holds revoked and expired
  notices, not just live ones, so an import that simply pages through would
  fill the feed with dead tenders. `status` is the filter for that, and A5
  established it is MANDATORY when `q` is absent — `400 "O filtro status é
  obrigatório"`. Its accepted values are documented nowhere we could find, so
  `dump:brazil-search` measures them by asking the server: a wrong value
  answers 400 with its own message, a right one answers 200 with a count.
- **`ordenacao=-data` sorts by UPDATE time, not publication.** The first
  result was published 2026-03-11 and sorted first because
  `data_atualizacao_pncp` was that same day. An incremental import keyed on
  that would re-pull old tenders forever and could mistake a touched old
  record for a new one.

  That same property turns out to be what makes coverage PROVABLE, which no
  date parameter could (five names were tried; all ignored). Sorting is
  strictly descending on `data_atualizacao_pncp`, and a record cannot be
  updated before it is published — so once a page's last row was updated
  before the publication cutoff, no later page can hold anything published
  inside the window. `ingestBrazilPncp` stops there and reports which
  condition ended each modality's sweep; a run stopped by `--max` instead has
  covered an unknown fraction, and every number under it is a floor.

  **Measured 2026-09-18, a 3-day window:** modality 4 needed **14 pages
  (1,400 rows)** and modality 5 **1 page (100 rows)**, both ending on the
  window. 1,496 unique rows yielded 802 published inside the 3 days — the gap
  is old tenders that were merely touched recently, which is the same
  UPDATE-time property seen from the cost side. The defaults follow that
  measurement: a 3-day window, and `--max 3000` purely as a runaway guard
  rather than as the thing that ends the sweep. The earlier 600 silently
  truncated modality 4 at page 6.

**`/itens` caps at 10, and `/arquivos` hands over the documents.**

Both measured 2026-09-18, on the first 3-day sweep and a probe against a real
municipal works notice.

The cap announced itself only because the run was made to count: 73 tenders
returned exactly 10 items and none returned more. Two notices opened by hand
the same day then measured the damage exactly, and it is worse than "a bit
low":

| tender | summed from `/itens` | portal's VALOR TOTAL ESTIMADO |
|---|---|---|
| Tianguá, rural road (`07735178000120/2026/120`) | R$ 1,641,242.81 | R$ 1,641,242.81 |
| Elói Mendes, education building (`20347225000126/2026/200`) | R$ 372,530.47 | **R$ 2,812,092.09** |

One exact, one 7.5× low, and the only difference between them is how many
line items the procurement has. Nothing in the first case would have hinted
that the second was wrong. `/itens` truncates in
silence, so a registro de preços with hundreds of lines summed to its first
ten — a confident, smaller, wrong number. With Brazil's floor at $2,000,000
that is the failure that deletes the largest procurements: understated, under
the floor, excluded, never written, no row to audit. `fetchPncpItems` now
pages, ending on a short page rather than on a page smaller than requested
(so a server keeping its own limit is still walked correctly), and
fingerprints each page's first item so that a `pagina` parameter that turns
out to be ignored leaves the sum incomplete rather than double-counted.

Attachments are better than any other source here. `GET
/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos` returns a list with
`titulo`, `tipoDocumentoNome` ("Edital", …) and a direct `url`, and that URL
downloads without a session: 200, `application/octet-stream`, 930 KB of
`Edital_CE15.pdf`. Colombia and Peru both needed workarounds here; Brazil can
feed `ingest-tender-documents.ts` directly.

`valor_global` on the search row would make all of this unnecessary and does
not: it was null on 200 of 200 rows across two samples. The portal renders its
total from the compra record, which lives on the service that spent the week
returning 500s. Summing `/itens` remains the only route we have measured
working — correctly, now that it pages.

**The public link is `/app/editais/`, not `/compras/`.** `item_url` in the
search index is an API path and 404s in a browser. The portal serves a notice
at `/app/editais/{cnpj}/{ano}/{seq}` — same three components, confirmed
against a live page whose "Id contratação PNCP: 35842428000166-1-000008/2026"
is served at `/app/editais/35842428000166/2026/8`.

**Key dates come in the search row**, unlike Peru: publication, and the
submission deadline from `data_fim_vigencia`, which the portal labels "Data
fim de recebimento de propostas" in horário de Brasília. `data_inicio_vigencia`
is in the feed and deliberately unstored — `TenderKeyDate` has no type meaning
"proposal receipt opens", and the nearest, `clarification`, would show a
reader 「采购方召开的澄清会议」.

**A three-band scheme, per country (2026-09-18).**

| | 常规 | 中型 | 大型 |
|---|---|---|---|
| Brazil | $2M – $5M | $5M – $10M | $10M+ |
| Mexico / Colombia / Peru | $1M – $5M | $5M – $10M | $10M+ |

Set by the user after a measured Brazil sweep. At the old $800,000 floor PNCP
produced 117 tenders in three days (~39/day) against a target of 每天20条左右;
the kept rows fell in bands of 35 ($0.8M–$1.5M), 28 ($1.5M–$3M), 17 ($3M–$6M),
23 ($6M+) and 14 with no amount. Brazil's $2M floor lands around 24/day.

Why Brazil needs a different floor: PNCP carries direct-administration
procurement for 5,570 municipalities, so R$4.13M was an ordinary small-town
contract there in a way it is not in Peru or Colombia.

`MIN_VALUE_USD_BY_COUNTRY` is reintroduced for it (removed in September when
Mexico's floor was unified with Colombia's), resolved through one
`minValueUsdFor()` so the threshold cannot differ between an import and a
reclassify — the failure that produced the 193 → 486 jump on 2026-09-08.

**One rule had to be uncoupled first.** The municipal-amenity value exception
(`isLargeWorksBuild`) read `FLAGSHIP_VALUE_USD`, because when the user made
that call on 2026-09-11 the two numbers were both $6,000,000. Raising the
flagship band to $10M would have carried the exception with it and put the
COP 28bn ≈ USD 8.9M high-performance sports centre back into the excluded
pile — reversing an explicit decision as a side effect of an unrelated one. It
now has its own constant, `LARGE_WORKS_BUILD_USD`, still $6,000,000.

**Ten of 319 fixtures changed tier**, every one a band shift rather than a
rule fault, each updated with the arithmetic in its own note. Two are worth
knowing: the Colombian $802,548 road row and the Peruvian $973,907 sports
IOARR both fall under the new $1M floor and are now excluded outright — the
second being the row the user had queried for being 中型. And the tender this
Brazilian connector was built against, MT-020/251 at R$7,494,680.99 ≈ US$1.45M,
no longer qualifies either; `test:relevance-pt` pins it excluded as the
reference for how big is big enough in Brazil.


Two smaller corrections from the same run:

- `/modulo-legado/1_consultarLicitacao` is a real path — it is in
  dadosabertos' own api-docs, along with
  `/modulo-contratacoes/1_consultarContratacoes_PNCP_14133` and 12 others —
  and it still 404s with only `pagina`/`tamanhoPagina`. A 404 on a documented
  path usually means mandatory filters are missing, so the probe now prints
  each path's required query parameters straight out of the document instead
  of guessing a third time.
- Querido Diário's `api.queridodiario.ok.org.br` failed TLS handshake
  (alert 40), meaning the name resolves but the server will not negotiate for
  it — typically a certificate that does not cover it. Its own tooling has
  been migrating to `api.queridodiario.org.br`, so both are now tried.

#### What `dump:brazil-search` actually measured (2026-09-18, 100 real rows)

Everything below is from one run against live data, not inference.

**`status` is mandatory and inert.** Three mutually exclusive states each
returned essentially the whole index:

```
status=em_recebimento_de_proposta   4,081,735
status=em_julgamento                4,081,733
status=encerrada                    4,081,733
```

Those differences are rows indexed between requests. Omit `status` without a
`q` and the request is rejected (`"O filtro status é obrigatório"`); supply it
and nothing is filtered. The rows confirm it from the other side — one of the
100 fetched under `em_recebimento_de_proposta` came back `situacao_nome:
"Revogada"`. **So "open for bidding" has to be decided on our side**, from
`situacao_nome`, `cancelado` and the dates.

**An invalid parameter value is answered with a connection reset, not a 400.**
`status=todos`, `status=encerradas`, `status=recebendo_proposta` and
`tam_pagina=500` all came back `ECONNRESET`. A reset from this endpoint is a
finding about the value, not about the network — the opposite of how a reset
normally reads, and the reason `probe:brazil-search-filters` reports it as
`值被拒(RST)`.

**`tam_pagina` maxes at 100** (500 resets; 100 returns exactly 100). Rows
arrive under the `items` key.

**`ordenacao=-data` sorts by update time, confirmed.** Across 100 rows
`data_atualizacao_pncp` was strictly descending and `data_publicacao_pncp` was
not — the third row was published 2026-09-01 and sat above one published
2026-09-17. An incremental import keyed on this re-reads old tenders, and must
never treat "arrived at the top" as "new".

**`valor_global` is empty on 100 of 100 rows.** That settles the design
question: **`/api/search` is a discovery endpoint, not a replacement for
`/api/consulta`.** Every tier this platform assigns runs off the amount
(`MIN_VALUE_USD`, `SIGNIFICANT_VALUE_USD`, `FLAGSHIP_VALUE_USD`), so the money
has to come from `/api/consulta` or the notice detail, per tender, after
discovery.

Coverage of everything else is what a mapper needs: `orgao_nome`,
`unidade_nome`, `municipio_nome`, `uf`, `esfera_nome`,
`modalidade_licitacao_nome`, `situacao_nome`, `description` and `item_url` at
100%; `data_inicio_vigencia` / `data_fim_vigencia` at 58%, of which 42 of 58
are in the future — consistent with that pair being the proposal window, with
the past ones being what the inert `status` let through.

**The feed's real composition is the problem to solve next.** Of 100
consecutive rows:

| | |
|---|---|
| Dispensa 46, Inexigibilidade 15 | **61% direct award / no-bid — excluded outright by `classifyRelevance`** |
| Pregão Eletrônico 28 | mixed |
| Concorrência Eletrônica 4, Presencial 2 | the large works this platform sells |
| Municipal 70, Estadual 16, Federal 11 | |

And the titles are the long tail of municipal micro-procurement: *CANETA
SALIENTADORA ROSA*, *MATERIAL DE COPA E COZINHA*, vehicle parts by licence
plate, artistic performances, course registrations. Against ~4.08 million
documents, paging the unfiltered index is a crawl, not an import.

`q=` is the only filter proven to narrow (`q=obra` → 205,272, a twentieth of
the index) and it matches text, not modality or money.
`probe:brazil-search-filters` measures whether any of the site's other filter
parameters (`ufs`, `esferas`, `modalidades`, `municipios`, date bounds, in
both singular and plural spellings) actually change the count — with `q=obra`
as a positive control and a deliberately fake parameter as a negative one,
because an ignored parameter returns 200 and looks exactly like a working one.
That is the lesson `status` taught: **ask whether a parameter FILTERS, not
whether it is ACCEPTED.**

**First filter-probe run (2026-09-18): the controls failed, correctly, and
the report refused itself.** It had printed `uf=SP` as "✅ 有效 — 4,081,820
条（基准的 100.0%）", which is self-contradictory on its face. Three faults,
all in the probe, all fixed — and one real finding that survived:

1. **The index is written to continuously.** Totals drifted by dozens between
   consecutive identical requests, and the deliberately fake parameter came
   back *higher* than the baseline (4,081,830 vs 4,081,821). A bare
   `total < baseline` test therefore reads ordinary drift as filtering, and
   the negative control's exact-equality test can never pass. The probe now
   samples the baseline three times to MEASURE the drift and requires a
   candidate to remove more than ten times that band (floor: 0.5% of the
   index) before calling it a filter.
2. **`q` and `status` are mutually exclusive.** `q=obra` answered normally in
   `probe:brazil-alt` and was reset here — the difference being that here it
   was sent alongside `status`. So the rule is not "status is mandatory", it
   is "exactly one of `q` / `status`". There is no single baseline, and the
   probe now measures every candidate against both.
3. ~~A reset means the server KNOWS the parameter name.~~ **Retracted by the
   second run — see below.**

The one finding that survived: **`tipos_documento` genuinely filters** —
`edital` → 4.08M, `ata` → 1,170,148 (28.7%). It is now the probe's positive
control, since a control has to be something measured rather than assumed.

#### Second filter-probe run — what actually filters, and a retraction

**ECONNRESET on `/api/search` is intermittent. It is a connection throttle,
not a verdict on the request.** The theory above — that a reset identified a
parameter the server recognised — is wrong, and the second run killed it
three ways: `tipos_documento=ata`, which had answered 200 in 292ms, came back
reset; `zzz_nao_existe`, a parameter invented for this file, came back reset;
and `ufs`, `esferas`, `modalidades` and `orgaos`, all "rejected" in run one,
all answered and filtered properly in run two. An entire earlier invocation
failed at both baselines and then succeeded a moment later. So a reset has to
be RETRIED, not recorded — anything else turns PNCP's rate limiting into
fabricated findings about our own parameters, which is what run one published.

With that corrected, the measurement stands on its own. Baseline 4,081,903
with **zero drift across three samples** (the index is quiet at some hours and
busy at others, which is exactly why the drift is measured per run rather than
assumed):

| parameter | rows | share of index |
|---|---|---|
| `esferas=M` | 2,795,508 | 68.5% |
| `ufs=SP` | 819,310 | 20.1% |
| **`modalidades=4`** | **143,719** | **3.5%** |
| `orgaos=40314` | 383 | 0.0% |

`modalidades` is what makes a Brazil connector viable: a **bare numeric id**,
matching `modalidade_licitacao_id` in the returned rows, taking 4.08 million
documents down to 143 thousand for Concorrência Eletrônica. Date bounds under
both names tried (`dataPublicacaoInicial`, `data_inicial`) were silently
ignored.

Two questions decide the connector's request count, and the probe now spends
its requests on them instead of re-confirming the four above: whether
`modalidades` accepts **more than one value** (repeated key, comma, semicolon,
JSON array, `[]` suffix — the pipe form reset in run one, which no longer
means anything), and whether **any** date lower bound exists. Without a date
bound, a daily import has to sweep the modality and decide what is new from
`data_atualizacao_pncp` itself.

#### Third filter-probe run — controls passed, and the query shape is settled

Both baselines measured cleanly this time (`status` 4,081,976 with 6 rows of
drift; `q=obra` 205,301 with 1), the positive control narrowed, the fake
parameter did not, so the table below is readable.

| parameter | on `status` baseline | on `q=obra` baseline |
|---|---|---|
| `modalidades=4` | 143,720 (3.5%) | 47,430 (23.1%) |
| `ufs=SP` | 819,319 (20.1%) | 36,749 (17.9%) |
| `esferas=M` | 2,795,583 (68.5%) | 163,760 (79.8%) |
| `modalidades=4` + `ufs=SP` | 15,714 (0.4%) | 5,147 (2.5%) |
| `tipos_documento=ata` | reset ×4 | 10,472 (5.1%) |

Filters **combine as AND** (`modalidades=4&ufs=SP` lands below either alone),
and **no date lower bound exists** — `dataPublicacaoPncpInicial`,
`data_publicacao_pncp_inicial`, `dataInicial`, `data_inicio` and
`modalidades[]=` were all accepted and ignored. So a daily import sweeps by
modality ordered on `-data` (update time) and stops at its own watermark;
there is nothing server-side to bound the window with.

**`0 条` is not a filter, and the probe said it was.** `modalidades=4,6`,
`4;6` and `[4,6]` each returned ZERO rows, and the verdict logic called all
three "✅ 有效" because zero is fewer than the baseline. A comma-separated
list read as one literal string matches no modality at all — a rejected
encoding wearing a filter's clothes, and the most expensive kind of wrong
available here, because a connector built on it would query happily, import
nothing, and report success. Zero is now its own verdict.

**The repeated-key result was ambiguous, and the fourth run settled it — badly.**

| | `status` baseline | `q` baseline |
|---|---|---|
| `modalidades=4` | 143,723 | 47,431 |
| `modalidades=6` | 1,063,519 | 46,636 |
| `modalidades=4&modalidades=6` | 1,063,522 | 46,636 |

`4&6` equals `6` alone on both baselines, to three rows in a million. **It is
not a union: the server keeps the last value and silently drops the first.**
A two-modality query looks like it worked while returning half the intended
scope — which is exactly why it was worth measuring the third number instead
of reading the first two as a union. Comma, semicolon and JSON-array
spellings return zero rows; `modalidades[]=` is ignored. **One bare numeric
id per request is the only working spelling, so the connector queries one
modality at a time.**

**The control gate blocked that run, and it should not have.**
`tipos_documento=ata` was reset on both baselines by the intermittent
throttle, after measuring cleanly in the two runs before it — and the gate
reported "对照组不成立", i.e. a broken measurement, for data that was fine.
A control that is itself flaky turns the gate into a coin toss, and
"could not be measured" is not "failed" — the same conflation this file keeps
having to correct elsewhere. There are now two positive controls
(`tipos_documento=ata` and `modalidades=4`), one narrowing is enough, and a
control lost to a reset is reported as unmeasured rather than as a failure.

#### The settled query shape

```
GET https://pncp.gov.br/api/search
    ?tipos_documento=edital
    &status=em_recebimento_de_proposta   # exactly one of status / q
    &modalidades=<one numeric id>        # repeated keys drop all but the last
    &ordenacao=-data                     # = update time, not publication
    &pagina=<n>&tam_pagina=100           # 100 is the ceiling
```

Rows arrive under `items`. Filters AND together (`modalidades=4&ufs=SP` →
15,714). There is no date lower bound, so a daily import sweeps each modality
it cares about, newest-updated first, and stops at its own watermark on
`data_atualizacao_pncp`. Reset the connection on any request and retry — a
reset is a throttle, never a verdict. `valor_global` is always null, so the
amount still has to be resolved per tender elsewhere, and open-versus-closed
is decided on our side from `situacao_nome`, `cancelado` and
`data_fim_vigencia`.

**A missing retry produced a wrong answer, not a slow run.** `dump:brazil-search`
kept its status sweep without the reset retries the filter probe had gained,
and the next run reported `recebendo_propostas` and `divulgada` as the
accepted values while `em_recebimento_de_proposta` — which had answered 200 in
the two runs before — "failed". The throttle was deciding which values looked
valid, and the script published that as a finding. It retries now, on the same
2s/5s/12s backoff.

The deeper fix is to stop asking. The status sweep and the `tam_pagina`
ceiling are settled, and each request spent re-confirming them is a request
against an endpoint that throttles by resetting — the sweep was fifteen calls
before a single row was harvested, which is what provoked the resets that then
corrupted it. Both are skipped by default and re-measurable with
`--probe-status` / `--probe-page-size`. A harvest that loses a page mid-way now
keeps the pages it already has instead of discarding the run.

#### `modalidades=4` changes the data, not just its size

100 rows of Concorrência Eletrônica, against the same 100 rows unfiltered:

| | unfiltered | `modalidades=4` |
|---|---|---|
| `data_inicio_vigencia` / `data_fim_vigencia` | 58% | **100%** |
| government level | Municipal 70, Estadual 16, Federal 11 | Municipal 81, Estadual 16, none federal |
| `situacao_nome` | Divulgada 99, Revogada 1 | Divulgada 89, **Suspensa 7**, Revogada 4 |
| what the titles are | pink highlighter pens, vehicle parts, artistic performances | roads, pavement, drainage, bridges, schools, health units, parks |

Three things follow.

**The modality filter does most of the work the Portuguese exclusion rules
would have had to do.** Dispensa and Inexigibilidade are 61% of the index and
are direct awards, which `classifyRelevance` excludes anyway — but excluding
them by not querying them is free, and it removes exactly the micro-purchase
long tail the README worried Portuguese rules would mishandle "in the
dangerous direction". Scope worth deciding before the connector is written:
Concorrência Eletrônica (4) and Presencial (5) are unambiguously this
platform's market; Pregão Eletrônico (6) is 1,063,519 rows of mostly goods
and services, and is where Portuguese exclusion rules would actually earn
their keep.

**`Suspensa` exists and the unfiltered sample never showed it.** Open-versus-
closed is decided on our side, so the set of `situacao_nome` values matters,
and it was measured on a sample that happened to contain only two of them. A
suspended procurement is not accepting bids.

#### Where the amount comes from (measured 2026-09-18, `probe:brazil-amount`)

```
A  /api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}        500  35.0s  (JDBC pool)
B  /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}            301  → A
C  /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens      200   3.7s  ✅
D  /api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens  404
```

The compra RECORD was moved off `/api/pncp` onto `/api/consulta` — B says so
in its own 301 body — and `/api/consulta` is the service that keeps failing
with Hikari JDBC pool errors, so that record is effectively unreachable. The
ITEM LIST was **not** moved, still lives on `/api/pncp`, and answered in 3.7
seconds. The money is in the items, so the one path that works is the one this
needs. The search row's `item_url` (`/compras/{cnpj}/{ano}/{seq}`) supplies all
three path segments.

`valorTotal` on the MT-020/251 road contract's single item: **7,494,680.99**
— reais. `lib/currency.ts` had no BRL row, so `convertToUsd()` would have
returned null and `lib/relevance.ts` would have read a real R$7.5M contract as
"no value published", exactly what that table's EUR/GBP note exists to
prevent. BRL was added as a 5.4 placeholder flagged UNVERIFIED, then
**corrected to 1 USD = 5.16 BRL on 2026-09-18** from a rate the user supplied
— this sandbox reaches no FX host, so unlike every other row in that table it
was not cross-checked here. The placeholder was ~4.5% off. That margin matters
because `MIN_VALUE_USD` 800k, `SIGNIFICANT` 3M and `FLAGSHIP` 6M are cliffs:
at 5.4 this contract read as US$1.39M and at 5.16 it reads as US$1.45M — both
standard, but a row sitting near a threshold would have crossed it.

The item record carries three fields that matter to the mapper as much as the
amount:

- **`orcamentoSigiloso`** — Brazilian law allows a sealed estimate. When true
  the amount is withheld *by design*, which is a different thing from a failed
  lookup, and must not be retried or reported as an error.
- **`situacaoCompraItemNome`** (`"Homologado"`) and **`temResultado`** — the
  procurement is already decided. With rule 6 in `lib/tender-status.ts`, this
  is what a Brazil mapper sets status from.
- **`descricao`** — the object text again, often fuller than the search row's,
  and a second source for the Portuguese ruleset.

**Still unmeasured: whether `/itens` paginates.** The probed tender had one
item. A registro de preços can carry hundreds, and a silently truncated item
list understates the tender's value rather than failing — which lands the row
in the wrong tier, the quietest way to be wrong here. The probe now prints the
item count and flags a suspiciously round one; point it at a multi-item
procurement before trusting a sum.

#### The Brazil connector as built (2026-09-18)

```
npm run ingest:brazil-live                       dry run, Concorrência 4+5, 2 months
npm run ingest:brazil-live -- --write
npm run ingest:brazil-live -- --skip-amounts     shape only, half the requests
```

`lib/ingestion/ingest-brazil.ts` sweeps one modality at a time (repeated
`modalidades` keys drop all but the last), pages `ordenacao=-data` at 100 rows
with a 1.2s pace, de-dupes on `numero_controle_pncp` — the index is written to
while we page it, so the same notice can appear twice and two rows sharing a
slug in one upsert is the "ON CONFLICT DO UPDATE command cannot affect row a
second time" error Colombia already hit — then filters by publication date
**before** the amount lookup, because each lookup is a request against
infrastructure that has been unreliable all week and the cheapest one is the
one not sent.

Portuguese rules live in `lib/relevance-pt.ts`, gated on `country === "Brazil"`
so they cannot change a Mexican, Colombian or Peruvian verdict by
construction. They cover exclusions (routine services that reach a
Concorrência) and industry tags (`rodovia`, `paralelepípedo`, `bloquete`,
`esgoto`, `bueiro` — none of which have Spanish equivalents in
`lib/industry.ts`, so without them a Brazilian road contract carried no
transport tag at all). `npm run test:relevance-pt` runs both against the real
corpus; its keep list is the regression net, since an excluded tender is never
written and a rule broader than its own name loses real work permanently.

Two bugs that test caught and review had not: a bare `\bobras?\b` read
"MÃO DE OBRA" (Portuguese for *labour*) as a public work, so the works guard
fired on every service contract containing it and refused to exclude any; and
a first fix for the registration rule put the alternation around the whole
pattern instead of inside the word, leaving a bare "inscrição" that would have
swallowed "inscrição imobiliária".

**Where Brazilian tenders land.** The MT-020/251 road contract is
R$7,494,680.99 ≈ US$1.39M at the placeholder rate — above `MIN_VALUE_USD`
(800k), below `SIGNIFICANT_VALUE_USD` (3M), so **standard (常规), not
significant**. Worth knowing before the first import: a typical Brazilian
municipal works contract is not going to arrive in the default feed, because
the default feed shows flagship + significant only.

**One request per tender, against a service that has been down all week.** The
cost is as much the finding as the path: discovery is cheap and reliable on
the search index, and every amount costs a second call to infrastructure that
has produced 500s, 502s, 503s, 504s and 63-second responses over two days. A
Brazil connector has to treat a missing amount as an ordinary outcome to retry
later, not as a failed import.

**`tem_resultado` marks an already-decided tender.** The very first row —
top of `ordenacao=-data` because it was updated today — was published
2026-04-07, closed its window 2026-05-18, and carries `tem_resultado: true`.
That is the incremental-import trap in one row: newest-updated is not newest,
and the feed contains finished procurements. Combined with rule 6 in
`lib/tender-status.ts` (nobody is awarded a contract that is still taking
bids), `tem_resultado` plus `data_fim_vigencia` is what a Brazil mapper
should set status from.

Portuguese, measured before any of this is built: the existing Spanish
rules do NOT carry over. Real Spanish titles this platform handles, against
the same procurement written the Brazilian way, agreed on tier 6/10 and on
tags 6/10 — and every failure was in the dangerous direction, with office
cleaning, a pickup truck and school meals each excluded in Spanish and
landing on 中型项目 in Portuguese. The cause is morphological (Spanish
`-ción` vs Portuguese `-ção`): 238 occurrences of the `ci[óo]n` word form
across 160 pattern lines, none of which fire. Whole words differ too —
carretera/rodovia, alcantarillado/esgoto, camión/caminhão,
aeropuerto/aeroporto. Rules must land before the first import, because an
excluded tender is never written to Supabase: getting it wrong fills the
database with rows that then have to be removed by hand.

### Brazil's other market — PPI concessions and ANEEL transmission auctions (surveyed 2026-09-18)

Everything the Brazil connector reads today is PNCP: Lei 14.133 procurement,
where a government body buys a work or a service and pays for it. The user
asked for two sources that are a different animal.

- **PPI** (ppi.gov.br, *Programa de Parcerias de Investimentos*) — the federal
  concession/PPP pipeline: highways, ports, airports, railways. A project
  enters it when the Conselho do PPI qualifies it, which is typically **one to
  three years before any edital exists**.
- **ANEEL's *leilões de transmissão*** — auctions for the right to build, own
  and operate a transmission line for 30 years. One lot runs to billions of
  reais against the single-digit millions the municipal PNCP feed carries, and
  this is the arena the large Chinese utilities actually compete in. Not in
  PNCP: a concession under Lei 8.987/11.079 is not a Lei 14.133 contratação.

#### This is not a new problem — Mexico hit it first

The two Mexican pipeline sources above (Proyectos México, then Proyectos
Estratégicos MX) already answered most of the design, and their answers carry
over unchanged:

1. **Filter to the bidding stage inside the mapper.** Proyectos México lists
   every lifecycle stage and the mapper keeps only `Etapa === "Licitación"`.
   PPI's own status field is the analogue. A project in *em estruturação* has
   no edital, no deadline and no contract value; pushed into `tenders` it
   would fail every gate and arrive as noise.
2. **Do not derive `status` from the stage label.** That was a real, user-
   caught bug: `Etapa === "Licitación"` means the project's current stage is
   procurement, *not* that a bidding window is open right now. Status comes
   from the real dates or not at all.
3. **Store the native-currency figure**, never the portal's own USD
   conversion — unknown rate, unknown as-of date. `convertToUsd()` normalises.
4. **`isNationalPriorityProject: true`.** Appearing in PPI's portfolio is
   itself the flagship signal, stronger than any keyword or value proxy —
   exactly the reasoning both Mexican sources use.
5. **No shared key, so duplicates are accepted rather than fuzzy-merged.** A
   PPI project, the sector agency's edital and any PNCP row for the same work
   have no identifier in common. Same documented limitation as Mexico's.

#### Three traps that are new, and the first one changes displayed numbers

1. **"The amount" is two different quantities, and the wrong one is the
   easier one to reach.** A transmission lot is bid on **RAP** (*Receita
   Anual Permitida*) — the annual revenue cap the winner may collect for 30
   years, awarded to whoever bids it **lowest**. What a Chinese EPC or
   investor is sizing the opportunity by is the **estimated investment
   (CAPEX)**, a separate figure in the same edital. They are not the same
   number and not the same order of magnitude. Putting RAP into
   `estimatedValue` would print an annual revenue cap next to municipal
   contract values on the same list, under the same label, and nothing on the
   page would say they mean different things. **Settled with the user
   2026-09-18: `estimatedValue` = estimated investment (CAPEX); RAP belongs
   in the summary text where it can be named.**
2. **There is no buyer paying us.** In a concession the winner *receives*
   revenue (from tariffs or from the transmission charge) rather than being
   paid by the granting authority. Mapping ANEEL into `buyer` is defensible —
   it is the *poder concedente* and it is who publishes the edital — but the
   commercial relationship the field implies everywhere else on the platform
   is inverted, and that is worth one line of copy on the tender page rather
   than a silent reuse of the field.
3. **The deadline is not the auction date.** Two dates matter: the deadline
   for submitting proposals and the *garantia de proposta*, and the auction
   session itself, held at B3. `submissionDeadline` must be the first. Using
   the auction date would leave a lot showing as open for weeks after it
   stopped being biddable — the same class of error as the award-before-
   deadline bug, and invisible without checking.

One thing already **confirmed safe**: `isPriceOnlyAuction()` matches
`subasta inversa` only, so a `procedureType` of "Leilão de Transmissão" is not
caught by the price-only-auction exclusion. Worth having checked — a rule
written for Peru's reverse auctions would have silently excluded the single
largest class of tender on the platform. (PNCP's own modalities 1 and 13,
*Leilão*, are asset disposal — selling government property — and are a
different thing that should stay out of the sweep.)

#### Where the doors might be (`npm run probe:brazil-concessions`, not yet run)

Nothing below is verified: every `.gov.br` host answers 403 at this sandbox's
gateway, so the probe exists for the user to run and its output is what the
mappers get written against. The last time this repo guessed a path instead of
measuring one, a live host returned 404 in 1.2 seconds and the "finding" was
that our URL was wrong (see "Brazil — the other doors" above).

- **PPI** — the single question is whether a machine-readable portfolio exists
  at all. The probe tests the three possibilities in order: server-rendered
  HTML (scrapeable), a JavaScript shell (not scrapeable without a browser),
  or Plone with `plone.restapi` enabled (the same URL returns JSON just for
  sending `Accept: application/json` — many gov.br portals are Plone). A
  sitemap read follows, because if the answer is "scrape it" then pagination
  is the next obstacle and the sitemap goes around it.
- **The sector agencies may matter more than PPI itself.** PPI publishes the
  pipeline; the edital for a highway is ANTT's, a port ANTAQ's, an airport
  ANAC's. An open-data portal at one of those is a better door than scraping a
  portfolio page.
- **DNS is not blocked here even though HTTP is**, so every hostname in the
  probe was at least resolved before being written down — weaker than a 200,
  stronger than recall, and it caught three of the hostnames this file would
  otherwise have shipped. `dados.antt.gov.br`, `dadosabertos.aneel.gov.br`,
  `dadosabertos.ccee.org.br`, `dados.gov.br`, `ppi.gov.br` and
  `portal.antaq.gov.br` all exist; `web3.antaq.gov.br`, `dados.antaq.gov.br`
  and `dados.anac.gov.br` are NXDOMAIN. So ANTAQ is probed at its portal page
  instead, and **ANAC is given no guessed host at all** — it is searched for in
  the national catalogue, because a step spent on a hostname that does not
  exist produces a FAIL that says nothing, which is exactly the failure mode
  recorded in "Brazil — the other doors".
- **The DOU is the door that does not depend on any agency's website.** An
  *aviso de licitação* for a federal concession must be published in the
  Diário Oficial da União by law, whatever the granting agency's portal looks
  like — and this repo already runs a connector of that exact shape for
  Mexico's DOF. Probed last, one step, not asked for but cheap.
- **ANEEL** — the question is which portal is CKAN and what the real column
  names are. `status_show` confirms the platform instead of assuming it,
  `package_search` finds the datasets, and `datastore_search` returns the
  **column contract**, which is the only thing a mapper should be written
  from. The auction PDFs still come from ANEEL's own pages.
- **CCEE runs the generation auctions, not the transmission ones.** Worth
  having — the same Chinese firms bid solar, wind and storage — but it does
  not answer the question that was asked. Probed last, and labelled.

#### First real run (2026-09-18, user's machine): 11 FAIL, 1 OK — and none of them says "no data"

```
P1–P4  ppi.gov.br            ECONNRESET ×4, ~700ms   edge resets us after connect
P5     dados.gov.br          401                     the path EXISTS and wants a credential
P6     dados.antt.gov.br     200 "Request Rejected"  F5 BIG-IP ASM block page — host alive
P7     portal.antaq.gov.br   403 Cloudflare          bot challenge
P8     in.gov.br             socket closed mid-read
E1     dadosabertos.aneel    connect timeout 10s     never completed a TCP handshake
E2     www.aneel.gov.br      403 "Just a moment…"    Cloudflare JS challenge
E3     dadosabertos.ccee     403 "Acesso bloqueado"  a deliberate, hand-written block page
E4     b3.com.br             200                     answered — but see 3 below
```

Read as a table of FAILs this looks like "Brazil has no usable open data",
and that is not what happened. **Every one of the eleven is an access answer,
in five distinct flavours**, and the flavours are the finding:

1. **PNCP works from that same machine**, so this is not a China-to-Brazil
   routing problem. What separates the hosts that answer from the ones that
   do not is that PNCP's is an API while these are CMS/portal hosts sitting
   behind Cloudflare, F5 and one hand-rolled block page. That makes the
   User-Agent the single live variable, so **every failing step now retries
   once with browser headers automatically and prints both results**. Same
   posture the PNCP probe's A5 step established: if the UA is what decides
   it, that is a finding to put in front of the user, not a header to quietly
   ship in a connector.
2. **E1's "timeout" was not our timeout.** `--timeout 90` sets an
   AbortController; undici abandons the TCP CONNECT after 10s on its own, and
   that is what fired. Reporting it as `network` invited exactly the wrong
   conclusion — that the host is down. There is now a **TCP reachability pass
   before any HTTP**, on a plain socket with its own timeout, because "cannot
   reach the host" and "the host rejects this request" need completely
   different next moves and only a socket can tell them apart. (Caveat found
   by running it: behind an intercepting proxy the handshake is with the
   proxy, so everything reads reachable. True on an ordinary connection,
   which is where the script runs.)
3. **E4's verdict was wrong, and the heuristic was mine.** 11KB, 271
   characters of body text and ONE link was reported as 「服务端渲染，可抓」
   because the page carried no framework marker — but absence of a marker is
   not presence of content, and that verdict is the single line the user was
   told decides whether PPI is feasible. It now reads text volume and link
   count first.

**`dados.gov.br`'s 401 is the most actionable result of the run**: a 401,
unlike a 404, means the path is real and the service recognises it — the
national catalogue issues free API keys on registration. One key there covers
ANTT, ANTAQ, ANAC and ANEEL datasets in one place, which is the door the
per-agency hostnames were only approximating. The probe reads
`DADOS_GOV_BR_API_KEY` and sends it; the header name comes from documentation
and is **not** verified against the live service, so `ckanAction` now carries
the response headers on its error and the probe prints `www-authenticate`,
`server` and `cf-ray` — that is how the next run corrects the guess rather
than repeating it.

#### Run two (2026-09-18, same machine, after the three fixes): the retry answered, and mostly with "no"

- **`www-authenticate: Bearer`.** dados.gov.br stated in a header exactly what
  it wants, and it is not the `chave-api-dados-abertos` this repo had guessed
  from documentation. Corrected to `Authorization: Bearer <key>`, with the
  documented spelling kept as a one-shot fallback (the catalogue has more than
  one API generation behind the same hostname) and the probe reporting which
  one was accepted. That single line is what printing response headers was
  for: run one's 401 had an empty body and would have produced a second guess.
- **The ★ mechanism overstated its own result, and the bug was mine.** ANTT's
  F5 appliance serves `Request Rejected` as **HTTP 200**, so a retry judged by
  status code alone printed "browser headers got us in" for a block notice —
  three of run two's four ★ were that. The retry now checks the body against a
  list of block-page signatures before calling anything a pass, and prints the
  page's `<title>` and first 300 characters so a reader can see the page
  rather than trust a verdict. A tool that overstates its findings is worse
  than one that fails.
- **PPI answers a browser User-Agent and there is nothing in the page.** 16KB,
  266 characters of text, zero links — and the *same body for all four URLs*,
  `sitemap.xml` included. That is either a single-page-app shell or an
  interstitial; the probe could not tell which, which is the other reason the
  body is now printed. Either way P1's question is answered in the negative:
  **the portfolio is not scrapeable from plain HTML.**
- **`dadosabertos.aneel.gov.br` is genuinely unreachable from that network**,
  confirmed at the socket — ETIMEDOUT after 21 seconds with no handshake,
  while eight other hosts connected in under 400ms in the same pass. The one
  failure that is a network fact rather than a policy, and the TCP pass added
  after run one is what established it.
- **A Cloudflare JS challenge is not a header problem.** ANEEL's and ANTAQ's
  403s are unchanged by a browser UA, as they should be: those want a browser
  that runs the challenge, not a string claiming to be one. So the honest
  reading of run two is that the User-Agent was *not* the answer — which is
  worth stating as plainly as a pass would have been.

**Where that leaves the two connectors**: `dados.gov.br` with a key is the one
door that is a credential away, and it is the national catalogue, so it covers
ANTT, ANTAQ, ANAC and ANEEL datasets without depending on any single agency's
WAF. Everything else on that list needs either a real browser or a different
network path, and neither is a thing to build blind.

#### dados.gov.br needs a CPF, so the question changed (2026-09-18)

The one door that was only a credential away turned out to require a Brazilian
identity: `dados.gov.br` issues its API key through **Acesso gov.br**, the
federal single sign-on, and the user has no CPF. That closes it — not a
"try again later", a dead end for this account.

With it closed, every remaining door fails for a reason that plausibly depends
on **where the request comes from**: a socket-level ETIMEDOUT to
`dadosabertos.aneel.gov.br`, Cloudflare challenges at ANEEL and ANTAQ, F5 at
ANTT, a hand-written block page at CCEE. So the open question is no longer
"does a machine-readable source exist" — it is **"can anything we control
reach it"**, and this platform already owns a second network with a different
egress that demonstrably reaches PNCP.

`GET /api/admin/probe-brazil-doors` (admin-only, read-only, plain text) knocks
on the same eight doors from the deployment and prints the same verdicts. It
costs one route to answer, and the answer decides between two very different
next steps:

- **Something opens from there** → the connector runs on a schedule in the
  deployment and the laptop's network stops mattering at all.
- **Nothing opens** → the refusal is not about geography, and the honest path
  is the one this repo has already used three times (Compras MX, Ecopetrol,
  Proyectos México): the user exports the file from a real browser by hand and
  a `-file.ts` mapper is written against the real capture. A headless browser
  would be a lot of machinery to reach the same place, on sites whose
  anti-bot rules change without notice.

`lib/ingestion/block-page.ts` holds the signatures both probes share, with
`scripts/test-block-page.ts` pinning the three real bodies that caused the
false ★ — F5's rejection page above all, because it arrives as HTTP 200.

#### The edital does not exist yet — which is the product, not a problem (2026-09-18)

Opening the two document links found the opposite of what they were opened
for. `documentos_editais.cfm?IdProgramaEdital=220`, for Leilão 001/2026, holds
exactly one file under "Edital":

> **Despacho 3.323, de 11/11/2025** — Autorização de envio da minuta do Edital
> do Leilão nº 1/2026 para apreciação do TCU e abertura de prazo para visitas
> técnicas

Anexos, Comunicado, Impugnações e Recursos, and Relatórios/Atas/Resultados are
all *"Não existe nenhum arquivo"*. Adendos holds one: the list of substations
and contacts for scheduling visits to the existing installations, updated
16/12/2025.

So the **edital has not been published**. What exists is an order authorising
the *draft* to go to the TCU — the federal audit court — for review, with the
site-visit window opened in the same act. Two consequences:

1. **There is no RAP ceiling and no investment figure to find for this
   auction, anywhere.** Not hidden behind the other link — not yet written. A
   mapper that treats a missing `estimatedValue` here as a fetch failure will
   retry forever against a number that does not exist.
2. **This is the earliest formal signal a bidder can get**, months before the
   edital, and lead time is exactly what a foreign consortium needs: partner
   selection, local incorporation, equipment planning. Marking it 招标中 would
   put something nobody can bid on into the feed; dropping it for having no
   amount would throw away the reason to watch ANEEL at all. It is `planned`.

`lib/ingestion/aneel-auction-stage.ts` reads the stage from the document list,
and the trap it exists for is that **the "Edital" section is not empty**. Any
rule that counts files calls this auction open. The file's own title is what
separates a despacho about a draft from a published edital, so the function
reads titles: *minuta*, *despacho* and *autorização* mark a draft, and a real
edital names itself without them. `npm run test:aneel-stage` pins that against
the verbatim strings, including that a published edital must still win once
the older despacho is sitting beside it in the same section — the two coexist
on ANEEL's page for the rest of the auction.

**The R1–R5 link is gated, mildly.** `frmcdt.cfm?leilao=1&ano=2026` asks for a
company name before continuing — *"Para dar continuidade é necesario informar
sua empresa, caso nao tenha empresa favor 'pessoa física'"* — a free-text
field with a submit button, no account and no validation. It is a
self-declaration for ANEEL's own statistics, so the honest way through is the
real company name; there is nothing to work around and nothing that would be
improved by inventing one.

#### The saved page, read (2026-09-18) — and where the money actually is

The user saved `edital_transmissao.cfm` for Leilão 001/2026 and it is now
`__fixtures__/aneel-edital-transmissao-2026.html`, with
`lib/ingestion/connectors/aneel-editais-file.ts` reading it and
`npm run test:aneel-edital` pinning 25 assertions against it.

**The encoding is the assertion that matters most.** The file is Windows-1252
ColdFusion output with no charset declaration — `file(1)` says "ISO-8859 text",
and a UTF-8 decode throws on the first `ç`. The danger is not the throw: a
*lenient* UTF-8 decode succeeds and turns every accent into U+FFFD, so
"Leilão", "São Paulo" and "Ceará" become strings that still look like text,
still pass every truthiness check, and match nothing. It is decoded as
windows-1252 explicitly and a test asserts no U+FFFD survives.

**Three things the page carries that the pasted text did not:**

1. **Identity** — "LEILÃO DE TRANSMISSÃO ANEEL Nº 001/2026" at the top,
   "Leilão nº 1/2026-ANEEL" in the Objeto. Zero-padded in one place, not the
   other; normalised to an integer so the two spellings cannot become two
   auctions.
2. **A year selector, 1999–2026, posting back to the same URL.** That is the
   entire pagination story: every past auction is one POST away, so history is
   enumerable rather than scattered — 28 auctions' worth.
3. **Document links, which is where the money is.** The page carries **no RAP
   ceiling and no investment estimate**. Two links do:
   `documentos_editais.cfm?IdProgramaEdital=220` (the edital and its annexes)
   and `frmcdt.cfm?leilao=1&ano=2026` (reports **R1–R5**, ANEEL's per-lot
   technical and economic studies). `estimatedValue` — the CAPEX figure the
   user chose — has to come from one of those, so their ids are extracted
   rather than left in the prose.

One honest gap the reader surfaces rather than papers over: only **lot 1**
carries the explicit `Continuidade` / `Novas instalações` headings. Lots 2–10
say neither, so `hasNewInstallations` and `hasContinuity` are both false for
them and the dump prints 未标注. Defaulting them to "new" would be a guess
about the single fact that decides whether a lot is an EPC opportunity or an
income stream; the answer is in the edital.

`npm run dump:aneel-edital -- <saved>.html` prints the whole reading — lots,
UFs, kV, installations and the document links — for any year's page.

#### Run six: one door opens in a browser, and the lots are parsed

`www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm`
answers Cloudflare's challenge to a script — and lets the **user's own browser
straight through**. The ten lots of a live transmission auction came back in
full. So the two ANEEL hosts behind Cloudflare are configured differently and
the difference is the whole outcome:

| host | to a script | to a real browser |
|---|---|---|
| `git.aneel.gov.br` | "Just a moment…" | **hard block** — "Sorry, you have been blocked" |
| `www2.aneel.gov.br` | "Just a moment…" | **passes** |

`portalrelatorios.aneel.gov.br` joined `dadosabertos.aneel` and `leilao.aneel`
in the TCP-timeout column, from both machines. Three ANEEL subdomains now
answer nothing at the socket, which is consistent enough to look like one
routing or firewall rule rather than three coincidences.

So the **opportunity side is obtainable today**, by hand, and
`lib/ingestion/aneel-lote-parser.ts` turns what comes back into rows.

**A lot is a row, not an auction.** One auction is bid lot by lot; each lot is
a separate concession contract with its own RAP ceiling, its own investment
estimate and its own winner, and a bidder takes lot 3 while ignoring the other
nine. Storing the auction as one tender would merge ten unrelated
opportunities into an unreadable row.

**The flag that decides whether a lot is interesting at all** is in the text:
`Continuidade da prestação de serviço` means existing lines whose concession is
expiring — you are buying an income stream and an O&M obligation, with almost
no construction — while `Novas instalações de transmissão` is greenfield. For a
Chinese EPC or equipment maker those are opposite propositions, and lot 1 of
this auction is both at once, so the parser carries `hasContinuity` and
`hasNewInstallations` separately rather than guessing one scope type.

Two traps in the real text, both pinned by `npm run test:aneel-lotes` (24
assertions, all against the captured fixture):

1. **Lot 2 keeps its only installation on the header line**, after the colon. A
   header-then-bullets parser returns zero installations for it, and zero
   reads like missing data rather than a parsing bug.
2. **Lot 10 says "nos Estado do Mato Grosso"** — plural preposition, singular
   noun, a typo in the source. A state pattern anchored on "no Estado de" /
   "nos Estados de" drops that lot's states entirely. The pattern accepts
   either ending on either form, because the page is typed by hand.

Also pinned: `SE 500/230/138 kV` is three voltages behind one unit, so reading
the number adjacent to `kV` would file a 500 kV lot as a 138 kV one; and
"Mato Grosso do Sul" must not match as "Mato Grosso" — different UF, 1,500 km
apart, and the longer name contains the shorter.

Still missing from the capture, and the reason the page itself is wanted
rather than the pasted text: the auction number and date, the RAP ceiling and
the estimated investment per lot, and the edital PDF links. Those are
elsewhere on the same page.

#### Run five: a real browser does not get in either, and the fix is a network not a client

I said a real browser would pass git.aneel's challenge. It does not. The user
opened the transmission URL in their own Chrome and got Cloudflare's **hard
block** — "Sorry, you have been blocked. You are unable to access
aneel.gov.br" — not the "Just a moment…" interstitial a script sees. That is
the 1020-class rule: decided on the caller's IP or ASN, not a bot check that
running JavaScript satisfies.

The distinction is the whole difference in what fixes it. **A challenge is
answered by a better client; a block of that class is answered only by a
different network.** So "download it in a browser" was wrong advice on its
own — it has to be a browser on an egress that host will talk to. Worth
noting: the deployment saw the *challenge* page, not the block, so its address
is not on the same list, which makes it the machine with a chance here.

Two ANEEL hosts nothing had knocked on, found while looking for a way around
it, now in both probes. **Cloudflare rules are configured per host, not per
agency**, so these are not long shots by association:

- **`www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm`**
  — a standalone Liferay application holding the transmission *editais*, i.e.
  the upcoming side. `www2` completed a TCP handshake from the laptop, and it
  is not the host git.aneel's rule applies to.
- **`portalrelatorios.aneel.gov.br/resultadosLeiloes/leiloesTransmissao`** —
  ANEEL's own reports portal, a *third* copy of the same results data. The
  first two are unreachable in two different ways (open-data portal: TCP
  timeout; GitLab: hard block), and this subdomain has never been tried.

If either answers, no VPN is needed for that half of the problem.

#### Run four (2026-09-18): the URLs are exact, and every automated path to them is refused

The link printer's wider limit paid off immediately — the three spreadsheets
came back in full, and the guessed filename in run three's probe turned out to
be exactly right:

```
https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/
    Resultado_leiloes_transmissao.xlsx
    Resultado_leiloes_geracao.xlsx
    Resultado_leiloes_sistemas_isolados.xlsx
```

`gov.br/aneel/pt-br/empreendedores/leiloes` — the page written for bidders
rather than for statistics — gave the other half, the **upcoming** side:

```
https://leilao.aneel.gov.br/editalTransmissao      （还有 editalGeracao / editalDistribuicao）
https://leilao.aneel.gov.br/inscricao/             报名
https://leilao.aneel.gov.br/esclarecimento/        澄清问答
```

**And both of those hosts are unreachable.** `git.aneel.gov.br` answers 403
"Just a moment…" — Cloudflare's JS challenge — from the laptop and the
deployment alike, and a browser User-Agent does not move it, as it should not:
that challenge wants a browser that runs JavaScript, not a string claiming to
be one. `leilao.aneel.gov.br` times out at the TCP layer from two continents,
same as `dadosabertos.aneel.gov.br`.

So the position is now precise rather than merely bad: **the data is public,
the URLs are exact, and every unattended path to them is refused.** That is
the same shape as Compras MX, Ecopetrol and Proyectos México, and it has the
same answer — a person opens the URL in a real browser, the challenge passes,
and a mapper is written against the real capture.

`npm run dump:aneel-leiloes -- <file>.xlsx` is that step. It prints the sheet
names, the real column headers with the type read from the first DATA row (a
column called "Data" holding a string is a different mapping job from one
holding a real date), and the first rows as records. It also finds the header
row rather than assuming row 1 — government spreadsheets routinely open with a
title banner and a blank line, and taking row 1 on faith produces a mapper
keyed on `""` and `Column2` that fails in a way that looks like the file being
wrong.

**Confirmed this round, and left undecided on purpose:** CCEE's portal is
**CKAN 2.10.0, "Dados CCEE"**, and it opens to a browser User-Agent while
refusing an honest one (the JSON fix above is what finally surfaced this —
run three had the same result and reported it as an empty page). That is a
posture question for the user, not a header to ship, and nothing in the
connectors has been changed on account of it.

**What is left on each side of the ANEEL problem:**

- *Results* (who won, at what RAP, with what investment) — three spreadsheets,
  download by hand, mapper from the dump. Feeds `awardedValue`, the winning
  supplier and the Chinese-bidder reports.
- *Opportunities* (what is being auctioned next) — `leilao.aneel.gov.br`'s
  edital pages, also by hand, and the edital PDF then goes through the same
  document-extraction pipeline every other source uses. `estimatedValue` takes
  the estimated investment, never RAP.

#### Run three (2026-09-18): two networks, and the door was inside a page we could already read

The probe ran from the laptop and, for the first time, from the deployment.
Reading the two together is what produced the answer, and the answer was not
on the list of doors either run set out to knock on.

**`www.gov.br/aneel/…/leiloes` answers from BOTH machines** — 212KB,
~22,000 characters, 777 links, genuinely server-rendered. Three of those links
are labelled *Planilha em Excel* and point at **`git.aneel.gov.br`**:

```
https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/
    relatorioseindicadores/leiloes/Resultado_leiloes_{g,t,s}…
```

That is a **GitLab instance serving raw files**, and it beats the CKAN portal
on every axis that matters here: a different host from the one that times out,
static paths, versioned content, and a folder listing available through
GitLab's own API with no credential (`/api/v4/projects/publico%2Fcentralconteudo
/repository/tree?path=relatorioseindicadores/leiloes&ref=main`). The project
path is read out of the raw URL, not recalled. Both probes now go there first.

It also nearly slipped past: the run-three output truncated hrefs at 110
characters, which cut the filenames off. The link printer now allows 240 and
shows 12 links instead of 8. A probe that hides the thing it found is the same
class of bug as one that overstates a finding.

**The CKAN portal is off the table regardless of network.**
`dadosabertos.aneel.gov.br` and `leilao.aneel.gov.br` both time out at the TCP
layer from the laptop (ETIMEDOUT at 21–22s) *and* from the deployment
(UND_ERR_CONNECT_TIMEOUT). Two networks on two continents, no handshake — so
this is not geography and not a WAF, and the resource ids search handed us are
unusable until it comes back. That is exactly why the GitLab copy matters: it
is the same data by another road.

**Two corrections to my own reporting, both found in this run's output:**

1. **CCEE is CKAN, and browser headers open it — I reported the opposite.**
   The retry came back with real CKAN JSON (`"success": true`,
   `"site_title": "Dados CCEE"`), and `browserRetry`, being HTML-shaped,
   described it as "answered, but almost nothing on the page". That buried the
   round's second-best finding under a wrong verdict. JSON is now checked
   before the HTML description, as `probeHtml` already did.
2. **PPI's English edital is not reachable; it is "Acesso Negado!" at HTTP 200.**
   1KB, 364 characters, from both machines. Without a signature for that
   string it read as "answered but nearly empty", which is a different
   diagnosis leading to a different, wrong next step. Added to
   `lib/ingestion/block-page.ts` and pinned in its test.

**Where each door now stands:**

| door | laptop | deployment | reading |
|---|---|---|---|
| `www.gov.br/aneel/…` | 200, 777 links | 200, 804 links | **open from both — and it links the GitLab files** |
| `git.aneel.gov.br` | untested | untested | the next thing to test, and the likely data path |
| ArcGIS Hub mirror | 200 JSON | 200 JSON | open, but its DCAT feed is BDGD distribution geodata — probably the wrong dataset family |
| `dadosabertos.aneel.gov.br` | TCP timeout | TCP timeout | unreachable from two continents |
| `leilao.aneel.gov.br` | TCP timeout | TCP timeout | same |
| CCEE open data | opens with browser headers | 403 honest UA | CKAN, confirmed; the UA question is live and unresolved |
| ANTT | F5 block page (200) | F5 block page (200) | closed |
| ANTAQ | Cloudflare 403 | Cloudflare 403 | closed |
| PPI (ppi.gov.br) | F5 "Your support ID is" | ECONNRESET | closed — and it was the wrong host; see 2026-09-19 below |
| `dadosabertos.presidencia.gov.br` | F5 "Your support ID is" | untested | **measured 2026-09-19 — same F5 policy as ppi.gov.br; closed** |
| dados.gov.br | 401 Bearer | 401 | closed — needs a CPF |

So the shape of the work changed. The transmission-results connector is no
longer blocked on a portal nobody can reach: it reads a page that answers, and
follows the spreadsheet links that page publishes. What is still open is the
*opportunity* side — an upcoming auction's edital — for which
`gov.br/aneel/pt-br/empreendedores/leiloes` is the next candidate, added to
both probes.

One thing that has NOT been decided, and should not be decided quietly: CCEE
opens to a browser User-Agent and refuses an honest one. That is a finding to
weigh, not a header to ship.

#### What the third parties actually do (web search, 2026-09-18)

The user's question — *do the aggregator sites read this data, or not?* — has a
different answer for each of the two sources, and the difference is the whole
commercial picture.

**PNCP is a solved, commoditised feed.** There is an off-the-shelf Apify actor
("Brazil Procurement & Tenders Scraper") reading the same endpoint this
project reads, with the same reasoning written on the tin: publication moved
to PNCP under Lei 14.133/2021, so PNCP gives the broadest coverage and some
legacy-only procedures remain on ComprasNet. It exports CSV/XLSX/JSON. Useful
confirmation that the Brazil connector's architecture is the normal one rather
than a workaround — and it notes the licence, **CC BY 4.0**, which matters for
republishing records commercially.

**ANEEL's transmission auctions are, essentially, not scraped by anybody.**
The outfits that track them — ESI's policy-intelligence pages, Enerdata, Canal
Solar, Brazil Stock Guide — publish *analyst write-ups*: a human reads the
edital and the MME/ANEEL announcement and summarises the lots, the RAP ceiling
and the investment figure. No open-source collector for it surfaced at all.
That is worth stating plainly because it cuts both ways: there is no library
to borrow, and there is also no commodity feed competing with what this
platform would offer a Chinese bidder.

**What ANEEL does publish in structured form is the RESULTS**, and search
found the exact identifiers, which removes the discovery half of the problem:

```
dataset   resultado-de-leiloes        （1999 年至今的发电 + 输电拍卖结果）
resource  453cb742-8089-4c16-aaf2-42088b5553dc   resultado-leiloes-transmissao.csv
resource  a1328fc1-f06b-437d-8893-57ac2c8103df   resultado-leiloes-geracao.csv
字典      dm-resultados-dos-leiloes-de-transmissao.pdf  （ANEEL 自己发的数据字典）
标签      leilão · RAP · preço teto · deságio · energia vendida ·
          investimento · empreendimento · garantia física · potência instalada
```

Two things follow. First, `datastore_search` against a known resource id is
one request, so the column contract is one reachable call away rather than
three — both probes now go straight at it. Second, `investimento` is in the
tag list, which means **the CAPEX the user chose for `estimatedValue` is a
column in the data** and does not have to be derived from RAP.

But note what the dataset is: **results, not opportunities.** It feeds the
award side of this platform — `awardedValue`, the winning supplier, and the
"which Brazilian contracts have Chinese firms won" reports — not the feed of
things still open. An upcoming auction lives in its edital, and the edital
lives on ANEEL's own site and, for the larger lots, on PPI's.

**PPI is WordPress, not Plone, and my earlier probe asked the wrong CMS.** The
proof came from a URL on PPI's own site:
`ppi.gov.br/wp-content/uploads/2025/02/Edital_LT_4-2025_ingles.pdf` —
`/wp-content/uploads/` is WordPress's upload path and nothing else's. So the
`@@search` step was testing a CMS that is not there, and it has been replaced
with `/wp-json/` (WordPress ships a REST API enabled by default) plus a look
at whatever routes PPI's own plugin registered — the portfolio pages use a
query-string action, `?acao=exibeficha`, which is a custom plugin rather than
WordPress routing.

That same URL is the most useful single find of the round for a different
reason: **PPI republishes the larger ANEEL transmission editais in English**,
as static PDFs with no session and no challenge in front of them. If anything
on this list is reachable, that is the one — and it skips a translation step
for the document-analysis pipeline as well.

Four doors nobody had knocked on, now in both probes:

- **`dadosabertos-aneel.opendata.arcgis.com`** — ANEEL's open data mirrored on
  Esri's ArcGIS Hub. **Not a `.gov.br` host**: a commercial CDN on AWS, so if
  the refusals are geographic this has the best odds of any door on the list.
- **`leilao.aneel.gov.br`** — ANEEL's actual auction system, where the
  upcoming and finished sessions live. The open-data portal only has results.
- **`www.gov.br/aneel/...`** — ANEEL's site moved onto the gov.br platform;
  `www.aneel.gov.br` is the old address, which is what Cloudflare was
  challenging. "The page moved" and "the page is defended" look identical from
  a single 403, so both are tried.
- **`hubdeprojetos.bndes.gov.br`** — BNDES structures and finances these
  concessions and keeps its own project hub, with an English edition.

One more lead, not yet probed: PPI has been moving its portfolio onto
**SOURCE**, the multilateral project-preparation platform, to put its pipeline
"in a single place". If that migration is real and public, it is a non-
Brazilian host holding the same data, which would make the whole PPI scraping
question moot.

`lib/ingestion/connectors/ckan.ts` was written ahead of the probe because
CKAN's Action API is a published standard identical across installs, so it is
not a guess; it deliberately contains **no hostnames and no dataset ids**,
which are exactly the parts that have to be measured. Two shape facts it
enforces, both of which quietly break naive clients: every response is wrapped
in `{ success, result }` and a failed call can still arrive as HTTP 200 with
`success: false`; and `package_search` returns `{ count, results }` while
`datastore_search` returns `{ total, fields, records }` — different envelopes
from the same API.

#### PPI: I closed it on two hosts, and there is a third (2026-09-19)

Four probe rounds put PPI in the table as **closed**, and the evidence for
that was real: `ppi.gov.br` serves an F5 `Request Rejected` page (HTTP 200,
"Your support ID is…") from one machine and ECONNRESETs from the other; a
browser User-Agent gets 16KB with 266 characters of text and zero links — the
*same body for all four URLs including `sitemap.xml`* — so the portfolio is
genuinely not in the HTML; and `dados.gov.br` answers 401 with
`www-authenticate: Bearer` and issues keys only against a CPF.

All of that still holds. **It was also the wrong question**, because both
rounds knocked on the same two hostnames, and the PPI portfolio is published
on a third:

```
dadosabertos.presidencia.gov.br/dataset/ppi-projetos-qualificados
dadosabertos.presidencia.gov.br/dataset/ppi-projetos-concluidos
resource  bfe11dee-119e-4790-a980-3fde61035b96   （projetos qualificados）
mirrored  dados.gov.br/dataset/ppi-projetos-qualificados
```

The Presidency runs its own CKAN install. The dataset's own description says
it holds every project qualified into the PPI since May 2016 with **winning
company, investment value, sector, modality, and auction/bidding dates** —
which is most of the `Tender` shape, and includes the one field ANEEL never
publishes per lot.

**Not verified, and the probe exists to verify it** (`P5b` in
`scripts/probe-brazil-concessions.ts`, plus the host in the TCP pass). Three
things decide whether this is a connector or a dead end, in this order:

1. **Does it answer without a credential?** It is a different CKAN install
   from `dados.gov.br`, so its 401 does not transfer — but neither does its
   absence. `status_show` settles it in one request.
2. **Is `metadata_modified` recent?** The dataset page itself notes that the
   Casa Civil stopped overseeing SPPI data after Decreto 10.366/2020. If the
   file stopped updating in 2021 this is a **history table**, not a feed: good
   for the award side (which Chinese firms won what), useless for the
   opportunity side, which is what the user actually asked for.
3. **Is the resource datastore-backed or a bare XLSX?** `datastore_active`
   decides whether the column contract is one query away or a download-and-
   guess job. The probe reads it either way; only the first is worth a mapper
   written blind.

**What PPI would add that PNCP and ANEEL do not.** PPI is the pipeline for
federal concessions — highways, ports, airports, railways — and those do not
appear on PNCP at all (a concession is not a `contratação` under Lei
14.133/2021) and are outside ANEEL's remit entirely. Press reporting for the
2026 calendar puts **~100 federal assets at ~R$247bn**: 13 highway auctions,
19 port terminal leases, 21 airport auctions (20 of them regional), 8 rail
projects, 5 energy. That is the largest single block of Brazilian
opportunity this platform currently cannot see.

**What it would not add**: the edital. PPI publishes the portfolio; the bid
documents come from the sector regulator — ANTT (highways, rail), ANTAQ
(ports), ANAC (airports) — and of those three, ANTT is an F5 block page and
ANTAQ is a Cloudflare 403 from both machines tried. So even a working PPI
connector lands in the same posture as ANEEL: **early warning with dates and
investment figures, no attachments, no document analysis.** Worth saying
before building it, because it is the same limitation the user already
pushed back on for ANEEL.

**The SOURCE lead is real but not a shortcut.** PPI has publicly joined
SOURCE (the Sustainable Infrastructure Foundation's platform, backed by the
World Bank, IDB, ADB, EIB and EBRD, with AFD funding) to host its pipeline —
a non-Brazilian host holding the same data, which would make the WAF question
moot. The announced migration runs **15 months**, so it is a 2027 door, not a
2026 one.

#### Run four (2026-09-19, user's machine): the third host is the same appliance

P5b was the whole point of the round, and it came back **closed**:

```
dadosabertos.presidencia.gov.br   TCP 通 675ms
  honest UA   ECONNRESET
  browser UA  HTTP 200, body = F5 「Your support ID is」
```

Byte-for-byte the response `ppi.gov.br` gives. The Presidency's open data
portal is behind the same F5 appliance as PPI itself, so **the hope that a
third hostname would route around the first two is dead** — and it was my
hope, stated here one commit earlier. PPI is closed, and it is closed for one
reason rather than three: not "the portfolio is not published in machine-
readable form" (it is — `ppi-projetos-qualificados`, with winning company,
investment value, sector, modality and auction dates) but **this network is
refused by the federal F5 policy.** Same verdict, better diagnosis, and a
different next move: nothing about a connector changes this, only an egress.

The three doors that share it, so far: `ppi.gov.br`,
`dadosabertos.presidencia.gov.br`, `dados.antt.gov.br`. `dados.gov.br` is
*not* in that family — it answers 401 `www-authenticate: Bearer` and needs a
CPF, which is a credential problem, not a WAF one.

**A probe bug found by the same run, and it is the mistake this file already
records fixing — in the wrong place.** Run two added
`lib/ingestion/block-page.ts` because ANTT's F5 page is HTTP 200 and a
status-code verdict called it a pass. The signature check went into
`browserRetry` only. `probeHtml`'s **first** attempt never ran it, so a
refusal served as 200 fell through to `describeHtml`, which has no notion of
a block page and reported exactly what it saw:

```
E3b. PPI 上的英文版 ANEEL 输电拍卖 edital
   OK  200  1KB · 正文 364 字 · ⚠ 答了，但页面上几乎没东西 —— 内容多半是 JS 后填的
```

That body is `Acesso Negado!`, whose signature has been in `block-page.ts`
since run three. The two diagnoses lead to opposite next moves — an SPA shell
wants a real browser, a refusal wants a different egress — so the check now
runs on the first attempt too. Worth noting that `E3c` (BNDES, 559 chars) and
`E4` (B3, 271 chars) carry the same verdict string and are, as far as this
run can tell, genuine SPA shells; only the check distinguishes them.

**What run four leaves open, in order of what it would buy:**

1. **`git.aneel.gov.br` — three exact xlsx URLs, hard-blocked.** Cloudflare
   1020-class on this IP; a real browser gets "Sorry, you have been blocked"
   too, so no client change helps. A different egress downloads them in a
   click, and `npm run dump:aneel-leiloes` then prints the real column names.
2. **`leilao.aneel.gov.br` — the live auctions, TCP timeout from two
   continents.** Not a policy, a route.
3. **CCEE, still undecided.** `dadosabertos.ccee.org.br` is confirmed CKAN
   2.10.0 and opens to a browser User-Agent while refusing an honest one.
   That is a posture question for the user, not a header to ship.

And what is confirmed open from that network, unchanged: `www.gov.br/aneel`
(both auction pages, ~22k characters, 777/778 links, server-rendered) and the
ArcGIS mirror (DCAT JSON, but BDGD distribution geodata — the wrong dataset
family).

#### The edital was never on PPI, and the regulators moved (2026-09-19)

Two corrections, both of the same shape, and the second one reopens PPI as a
source after four rounds of closing it.

**ANEEL: the participation pages on gov.br are signposts, not data.** One
commit earlier this file said the consultation stage was "the one part of the
auction lifecycle reachable without changing network egress", on the strength
of three URLs in ANEEL's homepage navigation. A capture of one of them settles
it the other way:

```
www.gov.br/aneel/…/participacao-social/tomada-de-subsidios
  Atualizado em 17/03/2022
  body: one paragraph of definition, and one link —
  「Consulte aqui as Tomadas de Subsídios abertas」 → antigo.aneel.gov.br/tomadas-de-subsidios
```

`antigo.aneel.gov.br` is the Cloudflare 403 from the probe's E2b. The same
pattern holds on the generation page, whose per-auction *Consulta Pública*
links point at `antigo.aneel.gov.br/web/guest/consultas-publicas?…&ideParticipacaoPublica=3970`.
So every ANEEL road to consultation data ends on a host that refuses this
network, and the claim above was wrong. (The geração capture itself was
byte-identical to the stored fixture — 6009 bytes both — so nothing on
ANEEL's side had changed.)

Note for whenever access does come back: those consulta URLs carry
`p_auth=AjLhe87I`, a Liferay CSRF token. It is session-bound and will not
survive being replayed, so the durable identifier is `ideParticipacaoPublica`,
not the URL.

**PPI: I kept probing the wrong hostnames, and the edital was never there
anyway.** `ppi.gov.br` is an F5 block page,
`dadosabertos.presidencia.gov.br` is the same appliance, `dados.gov.br` wants
a CPF — all measured, all still true. But the probe asked
`dados.antt.gov.br` (F5) and `portal.antaq.gov.br` (Cloudflare 403), which
are both **legacy** hosts, and skipped ANAC entirely for want of a hostname.
ANEEL had already demonstrated exactly this trap: `www.aneel.gov.br` is
defended, `www.gov.br/aneel` answers 200 with 777 links, because the agency
moved and the old address is what carries the WAF rule.

All three sector regulators are on gov.br now:

```
gov.br/antt/pt-br/assuntos/…           concession editais under rodovias › novos projetos
gov.br/antaq/pt-br/assuntos/leiloes    the auction index
gov.br/anac/pt-br/assuntos/concessoes  the concession rounds
```

That reframes the whole question. **PPI publishes the pipeline; the regulator
publishes the edital.** PPI's own host being shut costs the portfolio view —
useful, not essential — while the documents a bidder actually needs belong to
ANTT, ANTAQ and ANAC, and those appear to sit on the one Brazilian host this
network can read. Probed as P9–P11.

**P12 is the step that decides how much this is worth**, and it is a PDF on
purpose. ANEEL's lesson was that reading an index and downloading a document
are separate questions: `www.gov.br/aneel` answers and
`download.aneel.gov.br` times out from two continents, which is why ANEEL
rows can never carry an attachment. P12 fetches a real ANTAQ *minuta de
edital* served from `gov.br` itself. If it downloads, ports (and probably
highways and airports) are a **full** source — index, documents, and the
existing document-analysis pipeline — rather than the signal-only shape ANEEL
is stuck in. If it does not, the sectors land exactly where ANEEL did.

P13 adds the DOU at the address the National Press's own reader uses:
`in.gov.br/leiturajornal?secao=do3` embeds each section in a
`<script type="application/json">`, which is a shape rather than a page. P8's
HTML search UI died with the socket closed mid-read; this is a different
question, not a retry.

**2026's federal calendar, for scale**: ~100 assets at ~R$247bn — 21 airport
auctions (20 regional), 19 port terminal leases, 13 highways, 8 rail, 5
energy. None of it reaches PNCP, because a concession is not a *contratação*
under Lei 14.133/2021.

#### Run four's answer: the regulators are open, and the document downloads

P9-P12 all came back 200 from the user's machine, with an honest
User-Agent and no browser tricks:

```
P9   gov.br/antt/…/rodovias        195KB · 17518 字 · 614 链接（命中 43，PDF 4）· 服务端渲染
P10  gov.br/antaq/…/leiloes        208KB · 36288 字 · 650 链接（命中 88，PDF 0）· 服务端渲染
P11  gov.br/anac/…/concessoes      145KB · 12700 字 · 418 链接（PDF 10）· 服务端渲染
P12  gov.br/antaq/…/minuta-de-edital.pdf   659KB
```

**P12 is the one that mattered and it downloaded.** 659 KB of real PDF, from
`gov.br` itself, unauthenticated. That is the thing ANEEL can never do:
`download.aneel.gov.br` times out from two continents, so ANEEL rows are
signal-only by construction. Ports — and on this evidence highways and
airports — are a **full** source: index, documents, and the existing
document-analysis pipeline.

**The probe reported that success as a failure, and it is the third wrong
verdict from the same function.** `describeHtml` printed
「答了，但页面上几乎没东西 —— 内容多半是 JS 后填的」 for a 659KB PDF, because
its thin test counts `<a>` tags and a PDF has none. Run one called a
271-character page server-rendered for want of a framework marker; run three
read `Acesso Negado!` as an empty page; this one called a downloaded document
an unscrapeable shell. Same root every time: the function assumes whatever it
is handed is a page. It now checks for `%PDF-` first and reports the file, its
version and its size. On the single step the whole round existed to answer,
the verdict was the exact opposite of the truth.

**What run four says about each sector:**

- **ANTAQ (ports)** — the index printed real, current auctions with ids:
  `leilao.antaq.gov.br/default.aspx?audiencia=175` is Leilão 01/2026 (MCP01,
  Santana/AP), 176 is NAT01, 177 is TMP-Recife. All 88 matching links point at
  `leilao.antaq.gov.br`, **a host nobody has tested** — so P10b now fetches
  one. The index is reachable; whether the per-auction document list is, is
  the open question.
- **ANTT (highways)** — the page named its own next layer,
  `/assuntos/rodovias/novos-projetos-em-rodovias`, which is where the 13
  auctions should be. Added as P9b.
- **ANAC (airports)** — 10 PDFs on the landing page alone, and it was skipped
  entirely in every earlier round for want of a hostname.
- **DOU** — `in.gov.br` still closes the socket mid-read on both paths, HTML
  and JSON alike. Not a User-Agent problem.

**PPI itself stays closed and now says so in words.** With the block-page
check running on first attempts, E3B's refusal came back readable:

```
Acesso Negado! Esta requisição foi bloqueada. Em caso de dúvida, por favor
envie o código 13376840596295746456 … para bloqueio.de.aplicacoes@presidencia.gov.br
```

That is the **Presidency's** application blocker — the same family as
`dadosabertos.presidencia.gov.br`, which is consistent with PPI's own host
being an F5 page. It also names an appeals channel, which is a different kind
of lead than a WAF usually leaves: a real address, a real reference code.

So the shape of the Brazil concession work has changed. It does not need PPI,
and it does not need a different network egress. It needs a connector per
regulator, starting with whichever of P9b/P10b comes back with a document
list.

#### Run five: the auction system is shut, the consultation area is not

The `%PDF-` fix confirmed run four's reading in the probe's own words:

```
P12   ★ 这是一个真的 PDF（v1.4，659KB）—— 文件下下来了，不是页面
P9b   gov.br/antt/…/novos-projetos-em-rodovias   204KB · 19578 字 · 614 链接（命中 21，PDF 4）
P10b  leilao.antaq.gov.br/default.aspx?audiencia=175   403 Cloudflare（浏览器头无效）
```

**P10b's failure is the useful result of the round**, because it splits the
ports question in two and the half that works is the half this project was
originally asked for.

ANTAQ's index on `gov.br` is open and lists real current auctions, but every
one of its 88 links points at `leilao.antaq.gov.br`, which is a Cloudflare 403
— TCP fine at 470ms, browser headers no help. Exactly the shape of
`leilao.aneel.gov.br`. **The auction system is shut.**

But P12's PDF is not on that host. Look at where it lives:

```
gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/
   audiencias-e-consultas-publicas/audiencias/…/minuta-de-edital.pdf
```

**The consultation area is on gov.br, and it carries the draft edital.** So
for ANTAQ the split is: final edital unreachable, *minuta* reachable — and the
minuta is the document the original brief asked for, the one published while a
technical spec (efficiency floors, standalone operation, local content) can
still be argued with. P10c now fetches the index that PDF hangs under.

This is the same lifecycle position as ANEEL's consulta pública, with the
opposite access answer. ANEEL's consultation content sits on
`antigo.aneel.gov.br` behind Cloudflare; ANTAQ's sits on gov.br and downloads.
Same stage, same kind of document, different host, and the host is the whole
difference.

Two more doors, both taken from links the pages themselves printed rather than
guessed: **rail** (`gov.br/antt/…/ferrovias/novos-projetos-ferroviarios`, 8
projects in the 2026 calendar and a sector this probe had never looked at) and
**ANAC's next layer** (`gov.br/anac/…/concessoes/concessoes`, whose landing
page already carries 10 PDFs — the highest PDF count of any index here).

**Where Brazil's concession sectors stand after five rounds:**

| sector | index | documents |
|---|---|---|
| ports (ANTAQ) | **open** on gov.br | minuta **downloads**; final edital on a blocked host |
| highways (ANTT) | **open**, two layers deep | 4 PDFs on the index; not yet fetched |
| airports (ANAC) | **open** | 10 PDFs on the index; not yet fetched |
| rail (ANTT) | untested until P11b | — |
| PPI portfolio | F5 refusal, with an appeals code | — |
| DOU | socket closed on both paths | — |

#### Run six: three OKs, and two of them were worth nothing

```
P10c  …/audiencias-e-consultas-publicas   OK  168KB · 568 链接（命中 6，PDF 0）
P11b  …/ferrovias/novos-projetos-ferroviarios   OK  194KB · 614 链接（命中 66，PDF 4）
P11c  …/concessoes/concessoes             OK  145KB · 418 链接 — 和 P11 一模一样
```

Counting OKs would call that three wins. Two of them are not.

**P11c fetched the same page twice.** `concessoes/concessoes` is byte-identical
to `concessoes` — same 145KB, same 12700 characters, same 418 links. It came
from P11's own printed link list, which is normally the right instinct, but a
menu entry that points back at its own section is not a next layer. Replaced
with a real round page, `…/concessoes/andamento/setima-rodada`, which is an
address search returned rather than a pattern invented here.

**P10c answered and told us nothing**: 6 matches out of 568 links, all six
navigation, zero PDFs. The reason is written in P12's own working path:

```
…/audiencias-e-consultas-publicas/audiencias/teste/04-2026-vdc04/minuta-de-edital.pdf
                                  ^^^^^^^^^^
```

The hearings are in an `/audiencias` **folder** and P10c fetched its parent.
That is the legacy-hostname mistake again, one directory level down. P10d
fetches the folder.

**The probe's own reporting was hiding the answer, and that is the fix that
matters most this round.** Every gov.br Plone site ships the same ~600-link
mega-menu. So a page with 614 links and **66 matches** spent all twelve
printed slots on menu entries — Rodovias, Ferrovias, SUFER, Compor — and
showed none of its content. The one page that did print real rows (ANTAQ's
auction index) managed it only because its auctions sit on a different
hostname and sorted to the front by accident.

A content link is distinguishable without knowing the site: it ends in a
document extension, or it carries a number — an auction number, a year, an id.
Menu entries are bare slugs. Links are now deduped, scored on exactly that,
and 25 are printed instead of 12. Run six's 66 rail matches and 43 highway
matches were real findings that the printer threw away.

**Still dead after six rounds**: `leilao.antaq.gov.br` and
`leilao.aneel.gov.br` (the auction systems), `in.gov.br` on both paths, PPI
everywhere, and the three ANEEL hosts that time out at the socket.

#### Run seven: the link ranking paid, and it is time to stop probing

Sorting content links above the mega-menu turned P10 from twelve menu entries
into the actual feed:

```
Leilão N° 03/2026-ANTAQ - TMP - Recife      audiencia=177
Leilão N° 02/2026-ANTAQ - NAT01             audiencia=176
Leilão N° 01/2026-ANTAQ - MCP01             audiencia=175
Leilão Nº 05/2025-ANTAQ - Canal de acesso…  audiencia=173
…25 rows, back through 2023
```

Auction number, year, terminal code, port, and a stable id, in server-rendered
HTML. **That is a scrapeable index** — and it was there in every run since
four, hidden behind twelve slots of navigation.

**Two things run seven settled that the earlier rounds had left me
over-optimistic about.**

*P12's PDF is in a `teste` folder.* Its path reads
`…/audiencias-e-consultas-publicas/audiencias/teste/04-2026-vdc04/minuta-de-edital.pdf`.
The generalizable fact still holds and is the important one: **gov.br serves
PDFs to an honest client, unauthenticated, and ANEEL's file host does not.**
But that particular URL is a staging artifact, so it says nothing about where
production hearing documents live — and P10c (parent) and P10d (the
`/audiencias` folder itself, 52KB, 90 links, zero matches) did not find them.

*ANAC's 12 PDFs are boilerplate.* P11c's round page carries 12 PDFs, and
reading them shows what they are: Rol de Responsáveis, Cadeia de Valor,
Diretrizes Regulatórias, Modelo de Governança — the institutional footer every
gov.br page carries. Not the edital.

**The one genuinely new lead came from ANAC's own page**, not from a search:

```
Estudos de Viabilidade Técnica, Econômica e Ambiental (EVTEA)
  → sistemas.anac.gov.br/dadosabertos/AeroportosConcedidos/SETIMA_RODADA/
```

A per-round directory on an untouched host. P11d fetches it; the host joins
the TCP pass.

**Recommendation, after seven rounds: stop probing and decide.** The access
map is no longer changing — the same hosts answer and the same hosts refuse,
run after run. What is left is a choice, not another probe:

1. **Build the ANTAQ index connector on what is proven.** It yields auction
   number, terminal, port, year and a deep link per row, with no value, no
   deadline and no documents, because those live on `leilao.antaq.gov.br`.
   Signal-only, like ANEEL — honest, and the rows are real and current.
2. **Get a different network egress.** One change opens `leilao.antaq`,
   `leilao.aneel`, `git.aneel`'s three xlsx, PPI, ANTT's F5 hosts and
   `in.gov.br`. Every remaining blocker on this list is the same kind of
   blocker, and no amount of connector code addresses any of them.

P11d is the last probe worth running before that choice, because a directory
listing of per-round documents would move airports from column one to a full
source on its own.

#### Run eight: ANAC publishes the edital in an open directory

P11d hit, and it is the best result of the whole survey:

```
sistemas.anac.gov.br/dadosabertos/AeroportosConcedidos/SETIMA_RODADA/
  DADOS_036_20210921_EVTEA_pre_AP/
  DADOS_041_20211221_EVTEA_pos_AP/
  DADOS_047_20220223_EVTEA_pos_AP_novos_blocos/
  DADOS_063_20220603_EVTEA_pos_TCU/
  DADOS_067_20220713_EDITAL_E_CONTRATO_INGLES_ENGLISH/   ←
```

An Apache directory index, on a host that answers an honest client, holding
the **edital and the contract in English**, plus the feasibility studies at
four stages (pre-hearing, post-hearing, post-new-blocks, post-TCU). No
credential, no challenge, no session. P11e descends into it.

This is the thing ANEEL cannot do at any price: `download.aneel.gov.br` and
`git.aneel.gov.br` refuse every client from every network tried. **Airports
are a full source** — index on gov.br, documents here, and the
document-analysis pipeline already exists.

**Answering the two questions the user asked with this run:**

*How many port auctions a year?* From P10's own rows: 2023 had 10, 2024 had
9, 2025 had 5, 2026 has 3 so far (MCP01, NAT01, TMP-Recife). So **roughly
5–10 ANTAQ auctions a year**, with the press's "19 terminals in 2026" mostly
bundled inside those numbers rather than added to them. Small, and each one is
large.

*Are the port documents unreachable by hand too?* **No — and the distinction
is one this file has drawn before.** `leilao.antaq.gov.br` returns
「Attention Required! | Cloudflare」, which is the JS challenge: a real browser
solves it and gets in. `git.aneel.gov.br` returns 「Sorry, you have been
blocked」, which is a 1020-class rule against the IP and which a real browser
does **not** pass — the user confirmed that one by hand. So ports are
manually downloadable today; only the automation is blocked.

**And the deployment route is option B, already built.**
`/api/admin/probe-brazil-doors` was written in an earlier round for exactly
this question and knocks from a second egress. It now carries the four hosts
the laptop cannot open (`leilao.antaq`, `leilao.aneel`, `git.aneel`,
`in.gov.br`) marked ★, plus three controls the laptop *can* open, so a
difference is attributable to the egress rather than to the host. If the
deployment reaches them, the connectors run there on a schedule and the
laptop's network stops mattering.

#### P11e came back empty, and the probe got quiet (2026-09-19)

```
P11e  …/DADOS_067_20220713_EDITAL_E_CONTRATO_INGLES_ENGLISH/
      OK 200 · 1KB · 302 字 · 3 个链接（命中 0，PDF 0）
```

**Not the confirmation the previous entry expected.** 302 characters and three
links is a near-empty directory, not a folder of editais — so
`sistemas.anac.gov.br` is browsable and the round-level listing is real, but
the English edital and contract were NOT demonstrated. What P11d proved is
that ANAC keeps per-round open directories on a reachable host; what the
directory NAMES promise has not been checked, and the name is not the
evidence.

**And the probe could not tell an empty directory from a full one**, which is
the underlying defect. `describeHtml` prints only links that match the step's
pattern, so zero matches printed zero lines, and a folder of `.p7s` or
extensionless files would look exactly like this one. On a small page there is
no mega-menu to drown anything out, so when nothing matches and the body is
under 5,000 characters, every link is printed now.

**The report itself was the other problem, and the user named it.** Eight
rounds in it had grown to roughly 700 lines, of which the findings were maybe
twenty. The repeats: a two-to-four-line rationale per step across thirty
steps, a 40-line JSON dump, a 小结 block restating every line already printed
beside its own result, and a closing page of standing advice that had not
changed in four rounds.

Compact is now the default. `--verbose` restores the rationales, the full
FAIL detail and the ANEEL to-do URLs. The compact run prints each step's
verdict and its content links, then a tally and the list of doors that opened
— which is what a reader acts on.

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

### Round 2 built (2026-09-04) — the model judges directly, not a Chinese-keyword mirror of round 1

Two designs were on the table: (a) feed the document-extracted text back through classifyRelevance()'s existing Spanish-keyword regexes, or (b) build a second, Chinese-language keyword ruleset to match the extracted content, or (c) have the extraction model itself assess relevance, grounded in the same document it just read. **(a) turns out to be a dead end, not just a worse option**: the extracted `qualifications`/`experienceRequirements`/`risks` text is Chinese-only by deliberate design (see extract-requirements.ts's header comment on the zh-only cost cut) — feeding Chinese text into Spanish regex patterns (`/adquisici[óo]n/i`, `/construcci[óo]n/i`, etc.) would never match anything, a "round 2" that silently does nothing while looking implemented. The user picked (c) over (b) explicitly (a second keyword ruleset was the higher-maintenance option, and the extraction call already happens per-document, so its cost floor is already paid).

**What was built**: `extract-requirements.ts`'s `ExtractionSchema` gained an optional `relevanceAssessment` field — `participationScope` (national/international_treaty/international_open, grounded in the document's real "Carácter del procedimiento", the same field the live-test's "carácter NACIONAL" finding above called out as currently only guessed at) and `suggestedTier` (the model's own flagship/significant/standard/excluded judgment, now having read the real document, with Chinese `reasoning` grounded in concrete document content — same "cite it or don't include it" evidentiary bar as every other field in this schema). `.optional()` since the manual-JSON-parse path (qwen3.5-plus, the default model for text-layer documents in the admin upload flow) doesn't reliably return every field — an absent assessment is tolerated, not an extraction failure.

`analyze-uploaded-document.ts` applies it after writing requirements/risks: `participationScope` is written whenever the model returns one; `suggestedTier` updates `relevance_tier`/`relevance_label`/`relevance_reason` only when it differs from the stored tier AND the tender isn't `relevance_manually_overridden` (an admin's manual lock still wins — same protection `upsertTendersBatched()`/`reclassify-tenders.ts` already respect, see "Manual admin overrides" above). A suggested `"excluded"` tier is written as-is (not an automatic delete) — the "excluded tenders aren't stored" policy is an ingestion-time decision for a firehose of new rows; a single already-reviewed, document-analyzed tender being downgraded is rare and deliberate enough to leave the row in place (just hidden from the default feed by the existing tier filter, still visible via TenderExplorer's "全部" quick-clear or the admin panel) rather than hard-deleted. The admin upload form (`AnalyzeDocumentForm.tsx`) surfaces what changed — participationScope set, tier change with reasoning, or a note that a tier suggestion was skipped because the tender is locked.

Deliberately NOT built alongside this: re-deriving the `industries` array from document content (still round-1-only, from `classifyIndustries()` at ingest). The industry tags mainly drive the browse-page filter UI, where a title-level signal is usually good enough; `suggestedTier`/`participationScope` were the two fields with a real, demonstrated cost to being wrong (the live-tested "carácter NACIONAL" case above).

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

### LicitIA maintenance scripts and reclassify moved to the admin backend (2026-09-04)

Per the user's explicit ask ("增加后台按钮和排期") — the three LicitIA maintenance scripts (`discover:comprasmx-vigente`, `resolve:comprasmx-links`, `fix:licitia-buyer-names`) and `reclassify:tenders` were all still terminal-only. Same shared-function architecture as every other "move CLI to web" feature this session: each script's real logic moved into its own `lib/ingestion/*.ts` file (`discover-comprasmx-vigente.ts`, `resolve-comprasmx-links.ts`, `fix-licitia-buyer-names.ts`, `reclassify-tenders.ts`), the CLI scripts became thin wrappers around those, and four new admin routes (`app/api/admin/licitia/discover`, `.../resolve-links`, `.../fix-buyer-names`, `app/api/admin/reclassify`) expose them to two new UI components — `LicitiaRefreshPanel.tsx` (three sections, one per LicitIA script) and `ReclassifyButton.tsx` — both added to `/admin/import-tenders`.

**"排期" (scheduling) was NOT built** — these stay manual, on-demand buttons, same as every other admin operation in this app. There is no cron/scheduled-task infrastructure in this project (no `vercel.json`, no GitHub Actions workflow, no background job runner) and this app's whole operating model is "runs on the admin's own machine via `next dev`/`next start`," not a deployed always-on server — a real automatic-refresh scheduler would need either a external cron hitting a new endpoint while the admin's machine happens to be running, or a Next.js `instrumentation.ts` + in-process interval loop that only "ticks" while that same process is alive. Punted as a separate, larger decision (what interval, whether it should ever run unattended and write straight to Supabase without a human previewing first) rather than guessed at — revisit if the user still wants it once the manual buttons prove the workflow.

`ReclassifyButton.tsx` deliberately defaults its "写入 Supabase" checkbox to **unchecked** — unlike every import form's checkbox (which the user asked to default checked the same day) — since a reclassify write can bulk-delete tenders project-wide, a meaningfully different risk profile from an import form that only ever adds rows.

### Ninth pass — a real anchor false positive, plus power-grid equipment and hemodiálisis/hemodinamia service fixes (2026-09-04)

Right after shipping the LicitIA backend-buttons feature, the user (testing the platform in parallel) reported four more real titles that classify wrong, plus a new whitelist ask.

**Real bug found**: "ADQUISICIÓN DE COMBUSTIBLES Y LUBRICANTES PARA VEHÍCULOS Y EQUIPOS TERRESTRES" — a fuel/lubricant purchase, not a vehicle purchase — matched the Eighth pass's vehicle-purchase whitelist pattern anyway, because "vehículos" appears only 32 characters after "adquisición de" as a "para X" trailing modifier, well inside that pattern's old `[^.\n]{0,40}` gap (any text at all, up to 40 chars). Fixed by tightening the gap to `[\d'"\s]{0,15}` (only digits/quotes/whitespace — a real quantity/quote prefix, like the "ADQS. DE 22 VEHS." real example already documented) so the vehicle/machinery noun has to be the immediate object of the purchase, not a modifier buried later in the sentence. Also added an explicit `combustibles? y lubricantes? para veh[íi]culos` EXCLUDE_KEYWORDS pattern as a belt-and-suspenders fix. Every existing vehicle/machinery fixture still passes with the tightened gap.

**Three real hemodiálisis/hemodinamia titles** — "ADQUISICIÓN Y/O SUMINISTRO DE INSUMOS PARA EL SERVICIO DE HEMODINAMIA, 2026" (consumables, not equipment), "SERVICIOS MEDICO DE HEMODIALISIS SUBROGADA" and "SERVICIO DE HEMODIÁLISIS EXTRAMUROS" (outsourced/off-site medical services) — all hit the bare `hemodiálisis|hemodinamia` FLAGSHIP_INDUSTRY_KEYWORDS term meant for genuine equipment purchases, the same class of bug as the earlier osteosíntesis/reactivo/medicamento fixes. The existing "servicio médico subrogado" EXCLUDE_KEYWORDS pattern didn't catch the SUBROGADA title because of word order (`servicio(s) ... de hemodialisis ... subrogada` — "subrogada" separated from "medico" by "de hemodialisis"). Added two new patterns: `servicio(s)? (médico )?de hemodiálisis|hemodiálisis (subrogada|extramuros)` and `insumos? (para|de) (el )?servicio de (hemodiálisis|hemodinamia)`.

**Power-grid key equipment whitelisted**: per the user's explicit request ("白名单加入电力相关的关键设备：变压器、发电机、继电保护器等" then "还有UPS") — transformador(es)/generador(es)/relé(s) de protección/relevador(es) de protección/UPS, via the SAME anchored purchase-verb pattern (and tightened gap) as vehicles: `(adquisición|adqs.|compra|suministro) de [quantity] (noun)`. This reverses the ADQUISICIÓN DE TRANSFORMADORES DE POTENCIA fixture from "excluded" (a real gap left by the Seventh pass removing the old bare "energía|eléctrico|power" signal, with nothing replacing it for power equipment specifically) to "significant" — power equipment maintenance/rental still falls through to the existing broad exclude patterns exactly like vehicle maintenance/rental does, confirmed with a new regression fixture (`MANTENIMIENTO PREVENTIVO A TRANSFORMADORES DE POTENCIA` → excluded).

55/55 relevance fixtures pass (up from 47). Two synthetic test titles for the new power-equipment patterns initially failed — not real bugs, just poorly-chosen test titles that also happened to contain "subestación"/"centro de datos", each an existing, stronger, unrelated flagship signal (INCLUDE_OVERRIDE_KEYWORDS / MAJOR_PROJECT_KEYWORDS) — reworded to isolate the pattern actually being tested.

## Batch #4 — a real annotated review of live browse-page screenshots (2026-09-04)

The user marked up 6 screenshots of the live `/tenders` browse page directly (yellow-highlighted notes on each real title), covering both missing industry tags and titles that should be excluded but weren't. Went through all ~35 annotated items; the ones with a clear, real title visible (not cut off mid-word by the card's own truncation) each got a scoped fix — see the EXCLUDE_KEYWORDS/INDUSTRY_KEYWORDS comments themselves for the per-title reasoning, not repeated here.

**Two real, previously-confirmed INCLUDE_OVERRIDE_KEYWORDS entries turned out to be too broad**, each with a genuine counter-example this batch surfaced:
- `seguridad perimetral` — matched a plain "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL" for SHF (a mortgage/housing-finance buyer), a routine outsourced guard/fencing service, not the critical-infrastructure security system the original confirmed example ("...PARA INSTALACIONES ESTRATÉGICAS") actually was. Narrowed to require that qualifier.
- `nube privada` — matched "SERVICIO ADMINISTRADO DE VIRTUALIZACIÓN EN NUBE PRIVADA Y COMPLEMENTOS OPERATIVO", routine ongoing IT-ops support, not the infrastructure backup/recovery service the original confirmed example ("Servicio de respaldo y recuperación para la Nube Privada") actually was. Narrowed to require "respaldo"/"recuperación"/"infraestructura" nearby.

Neither narrowing regressed its own original confirmed example — both still promote to flagship, confirmed by fixtures.

**New numeric-scale check, mirroring DURATION_ANCHOR**: `BRIDGE_LENGTH_ANCHOR`/`SHORT_BRIDGE_METERS` — a bare "puente"/"puentes" mention in MAJOR_PROJECT_KEYWORDS promotes to flagship regardless of actual size; real title "CONSTRUCCION DE PUENTE TUBULAR DE 18.00 MTS. DE LARGO X 4.00 MTS." is an 18-meter culvert, not a bridge project. Only fires on an explicit "puente ... de N mts/metros de largo" phrase (never a bare number scan), excludes if under 30m. A genuinely large bridge ("PUENTE VEHICULAR DE 120 METROS") still promotes normally — confirmed by a regression fixture.

**Two real regex bugs found and fixed in industry.ts while chasing a single false positive** (both the same class of bug as the already-documented `\bducto\b`-inside-`acueDUCTO` fix):
- `puerto\b` had no LEADING boundary, so it matched as a bare substring inside "aero**PUERTO**" too — this silently defeated the very fix meant to narrow "aeropuerto" (real false positive: "ADQUISICIÓN DE EQUIPOS DE SEGURIDAD PARA REVISIÓN DE EQUIPAJE EN EL AEROPUERTO" was tagging "construction" for a baggage-screening equipment purchase). Only caught by re-running the exact false-positive title through `classifyIndustries()` directly after the fix and seeing it still tag construction — a reminder that a "fix" isn't confirmed until re-tested end-to-end, not just read back.
- `puente\b` (construction tag) had no plural handling, missing real titles that use "PUENTES" (plural) — matches relevance.ts's own MAJOR_PROJECT_KEYWORDS `puentes?` pattern, which already had this right.

**Several items in the annotated batch needed NO code change** — either already fixed by an earlier pass this session (e.g. "ELABORACIÓN DE ESTUDIOS Y PROYECTOS PARA LA MODERNIZACIÓN CARRETERA FEDERAL", "SERVICIOS MEDICO DE HEMODIALISIS SUBROGADA", "ADQUISICIÓN Y/O SUMINISTRO DE INSUMOS PARA EL SERVICIO DE HEMODINAMIA" — just needs a "重新分类" run to apply to the already-stored rows) or a raw-code buyer name ("073R96") already covered by the "修复采购单位名称" admin button.

**Follow-up, fixed after the user confirmed it (2026-09-04, "好几个 PEMEX 买家的车辆/设备采购（挖掘机、油罐车）可以改")**: the PEMEX-buyer energy-tag over-inflation flagged above turned out to be two separate causes, both fixed:
1. `\bpemex\b|petr[óo]leos mexicanos` removed from the energy `INDUSTRY_KEYWORDS` pattern entirely — a bare buyer-org name says nothing about what's being procured (real genuine energy content is already covered by every other term in the pattern). Confirmed via a real routine-service title ("SERVICIO DE CALIBRACIÓN A EQUIPOS PATRONES...") that used to tag "energy" purely from the Pemex buyer name now correctly returning `["general"]`.
2. That alone didn't fully fix the two titles the user pointed at, because both ALSO independently mention "refinería" in the title text itself — but only as a DELIVERY LOCATION for a vehicle purchase ("...PARA USARSE EN LA REFINERÍA MADERO", "...PARA LA REFINERÍA MINATITLÁN"), not as the subject of the work. Fixed by narrowing `refiner[íi]a` with a negative lookbehind that excludes only the exact "para (uso/usarse en )?(la/el )?refinería" phrase shape — genuine refinery construction/modernization/maintenance titles ("CONSTRUCCIÓN DE NUEVA REFINERÍA...", "MODERNIZACIÓN DE LA REFINERÍA DE TULA...", "SERVICIOS DE MANTENIMIENTO INDUSTRIAL EN LA REFINERÍA...") aren't preceded by that narrow shape and still tag "energy" normally — confirmed via an ad hoc sanity check (no formal fixture harness exists for `classifyIndustries()`).

Both examples now correctly return `["vehicles"]` only.

## Non-procurement records: bare inter-administrative agreements, unions, loans (2026-09-05)

The user flagged a batch of real Colombia SECOP II records that aren't tender opportunities at all, despite looking like ordinary tenders in the feed. Added `NON_PROCUREMENT_RECORD_KEYWORDS` + `isBareInteradministrativeTitle()`, checked unconditionally (same position/rationale as `MAINTENANCE_ONLY_KEYWORDS` — no keyword should be able to rescue a record that was never procurable content in the first place):

- **"CONTRATO INTERADMINISTRATIVO DE MANDATO SIN REPRESENTACIÓN PARA LA OPERACIÓN LOGÍSTICA..."** ($0.8M, clears the Colombia value floor) — a "mandato sin representación" contract is a legal structure where the named entity administers funds/logistics on another's behalf, never the one actually executing the work. Caught by a dedicated `mandato sin representación` pattern.
- **"CONVENIO INTERADMINISTRATIVO TRANSMILENIO"**, **"CONTRATO INTERADMINISTRATIVO"** (×2, different buyers) — titles that are essentially JUST the legal-instrument name, no words describing what's being procured. Caught by `isBareInteradministrativeTitle()`: title starts with "convenio/contrato interadministrativo" AND is ≤8 words total. Deliberately NOT a bare "interadministrativo" keyword scan — real substantial infrastructure projects are legitimately funded this way too (confirmed via a synthetic regression fixture: a long, content-bearing "CONSTRUCCIÓN DE PUENTE VEHICULAR EN EL MARCO DEL CONVENIO INTERADMINISTRATIVO..." title still correctly promotes to flagship, since the word-count gate only fires on a short, content-free title).
- **"SINDICATO DE PROFESIONALES DE LA SALUD PROSALUD"** — a labor union's name as the record's title, not a procurement.
- **"EMPRÉSTITO"** — a loan/borrowing instrument, not a procurement.

98/98 fixtures pass (up from 91), including the new counter-example guard.

## "standard" tier reactivated + value bands raised (2026-09-05)

The front-end's "常规项目" filter chip had been permanently empty since the 2026-09-02 "standard eliminated" decision (see that entry above) — `classifyRelevance()` never produced that tier, only the type/schema and UI still listed it. The user asked directly why it was empty, then gave an explicit three-band value scheme to revive it with, applied uniformly to Mexico and Colombia (confirmed via follow-up: not Colombia-only, and the existing per-country value floors — `MIN_VALUE_USD` $100k for Mexico, `MIN_VALUE_USD_BY_COUNTRY` $500k for Colombia — stay as-is beneath these bands, they weren't asked to change):

- Under $1,000,000 → **standard** (常规项目)
- $1,000,000–$5,000,000 → **significant** (重点项目)
- Over $5,000,000 → **flagship** (旗舰项目)

Two changes:
1. `FLAGSHIP_VALUE_USD` raised 1,000,000 → 5,000,000, `SIGNIFICANT_VALUE_USD` raised 250,000 → 1,000,000. A keyword-based promotion (`MAJOR_PROJECT_KEYWORDS`/`FLAGSHIP_INDUSTRY_KEYWORDS`/`INCLUDE_OVERRIDE_KEYWORDS`) still promotes independent of value exactly as before — these bands only govern what a disclosed value alone is worth.
2. The final fallback in `classifyRelevance()` — everything that clears the country value floor (or carries a real industry tag with no disclosed value) but doesn't clear `SIGNIFICANT_VALUE_USD` or any keyword signal — now returns `standard` instead of `excluded`. Reverses the 2026-09-02 policy for the exact same case; `reasonFor()`'s "standard" branch text was untouched by that removal and needed no changes to support this. The now-unused `below_threshold` excluded-reason (keyword/type entry, `EXCLUDED_REASON_BY_SIGNAL` record entry, the one call site) was removed rather than left dead.

Four fixtures that were deliberately kept as "was standard, now excluded" markers of the 2026-09-02 removal flipped back to `expectedTier: "standard"` (calibration service with real hydrocarbon-facility content, heavy-machinery rental, IT-ops virtualization support, fauna-protection substation materials) — each already had a real industry tag or scopeType signal, just not enough to clear the new $1M significant bar. 98/98 fixtures still pass.

Not yet reflected in already-stored production rows — needs a `npm run reclassify:tenders -- --write` (or the admin "重新分类" button) to apply against the live database; expect a real, potentially large number of previously-`excluded` rows across both countries to resurface as `standard` (visible only once a user manually toggles that filter chip on — `DEFAULT_RELEVANCE_TIERS` in `TenderExplorer.tsx` still defaults to flagship+significant only, so the default feed's shape doesn't change), and some previously-`significant` rows in the $250k–$1,000,000 band to demote to `standard`, and previously-`flagship` rows in the $1,000,000–$5,000,000 band to demote to `significant`.

### Follow-up, same day: unified value floor + no-value keyword matches capped at "standard"

Two more real gaps surfaced once the user asked directly why Mexico still had almost no `standard` tenders even after the reactivation above.

**1. `MIN_VALUE_USD_BY_COUNTRY` removed — Mexico's floor raised to Colombia's $500,000.** Per the user's explicit ask ("墨西哥$100K 也改成跟哥伦比亚一样的金额要求"): `MIN_VALUE_USD` raised 100,000 → 500,000 platform-wide, and the now-redundant Colombia-only override map deleted entirely (it matched the new unified floor exactly, so keeping it would just be dead config). `input.country` stays on `classifyRelevance()`'s input type — callers still pass it and every mapper's `Tender.country` field still needs it for other purposes — but it's genuinely unused inside the function now; left as-is rather than ripping it out of every one of the ~15 call sites for zero behavior change.

**2. The real root cause of Mexico's empty "standard" tier**: `FLAGSHIP_INDUSTRY_KEYWORDS` (construcción/equipo médico/vehicle-purchase/power-equipment-purchase patterns) promoted straight to `significant` on a bare keyword match, completely independent of whether any value was disclosed. Since most Mexico open-tenders rows carry no value at all (see the ingestion-source coverage table below) but very commonly mention construction/medical/vehicle terms, almost everything that survived the exclude gauntlet skipped `standard` entirely and landed on `significant` — the tier was empty not because nothing qualified, but because the keyword signal alone was already enough to jump past it. Fixed (per explicit user confirmation) by requiring `normalizedValue !== undefined` alongside a `matchesFlagshipIndustry` match to reach `significant`; a matching title with a completely undisclosed value now falls through to `standard` instead (assuming it clears the industry-tag-or-value gate just above the final fallback — see that gate's own comment). `MAJOR_PROJECT_KEYWORDS`/`INCLUDE_OVERRIDE_KEYWORDS`/`isNationalPriorityProject` (the flagship-tier, value-independent signals) are untouched — this only narrows the significant-tier keyword path.

**Two real `classifyIndustries()` (industry.ts) gaps found applying this**, both because `FLAGSHIP_INDUSTRY_KEYWORDS`'s own anchored purchase patterns had already whitelisted a term that `industry.ts`'s separate keyword list never learned:
- `hospital\b` had no plural handling — never matched "HOSPITALES" (real title: "ADQUISICIÓN DE GENERADORES DE EMERGENCIA PARA HOSPITALES"), same class of bug as the earlier `unidad médica` plural fix. Fixed to `hospital(es)?\b`.
- `generador(es)?`, `\bups\b`, `relevador(es)?`, `rel[ée]s? de protecci[óo]n`, and bare `l[íi]neas? de transmisi[óo]n` were never in the `power` pattern at all — `relevance.ts` already recognized all of these via its own anchored purchase-verb pattern (2026-09-04: "白名单加入电力相关的关键设备...还有UPS"), but `industry.ts` had never been updated to match. Without a real industry tag, a no-value tender matching one of these terms fell into `excluded` (no industry + no value) instead of `standard` — the exact opposite of the fix's intent. Added all five to `industry.ts`'s `power` pattern.

101/101 fixtures pass (up from 98) — 21 fixtures that were `significant` with no disclosed value flipped to `standard`, one obsolete per-country-floor regression fixture repurposed to test the new "any disclosed value + keyword match still promotes" behavior instead, and 3 new fixtures added for the two `industry.ts` gaps above.

## Duration-based signal: confirmed against real data (2026-09-05)

Both `DURATION_ANCHOR` (relevance.ts's Spanish text-phrase scan) and Colombia's `structuredDurationDays` (colombia-mapper.ts's `normalizeDurationDays()`) had shipped defensively, explicitly flagged as "not yet confirmed against real data — revisit if it never fires." Checked both directly:

**Colombia: a real, confirmed bug, now fixed.** Every row (5/5) of the real captured `lib/ingestion/__fixtures__/sample-colombia-secop.json` carries `unidad_de_duracion` as literally `"día(s)"` — parentheses included. `normalizeDurationDays()`'s header comment had already *guessed* this exact "Día(s)" shape when it was written, but the `DAYS_PER_UNIT` lookup itself never actually accounted for the `"(s)"` suffix, so `DAYS_PER_UNIT["día(s)"]` was always `undefined` and the function silently returned `undefined` for every single Colombia row ever mapped — `structuredDurationDays` had never once reached `classifyRelevance()` with a real value, so `SHORT_DURATION_DAYS`/`LONG_DURATION_DAYS` could never fire for Colombia at all, confirming the exact risk the comment had already named. Fixed by stripping any parenthesized suffix before the lookup (`"día(s)"` → `"día"`). Re-running `mapSecopRowToTender()` against the real fixture directly confirms the fix: two of its five rows (5 and 104 real days) now correctly produce the `short_duration` exclude reason instead of silently skipping straight to the value-floor check — same end tier for these two specific rows (both are also below the value floor), but the reason is now accurate, and a real row with a disclosed value ≥ the Colombia floor AND a short/long duration would previously have been mis-tiered entirely. `"Semana(s)"/"Mes(es)"/"Año(s)"` are inferred to follow the identical SECOP II dropdown convention (the same fix handles them once one is actually captured) but — same defensive posture as before — aren't yet confirmed real themselves; only `"día(s)"` is.

**Mexico: confirmed NOT to fire from any currently-ingested source, and structurally can't.** Grepped every real captured fixture in this directory for `DURATION_ANCHOR`'s phrase set ("plazo de ejecución"/"plazo de entrega"/"plazo contractual"/"vigencia del contrato"/"duración del contrato") — zero matches anywhere. This isn't a bug to fix: that kind of legal/contractual phrasing lives in the full Convocatoria/pliego document text, not the short title/summary fields any Mexican Layer 1 bulk-export source actually carries — `classifyRelevance()` only ever sees `title`/`summary`. `DURATION_ANCHOR` stays in place (harmless, and Layer 2's full-document extraction could plausibly feed it a real phrase from an actual PDF some day), but it should be understood as currently dead code for every real Mexican source this project ingests today, not a signal that's simply "waiting for the right title."

## Batch #5: ~47-title Colombia SECOP exclusion review + a value-band bypass bug (2026-09-05)

The user hand-reviewed a real batch of ~47 live Colombia tender titles/summaries that were still surfacing as `standard` and should have been excluded, plus 6 real "标签变化" (tag-change) corrections. Verified with a throwaway script running `classifyRelevance()` against every title (with a simulated $600K disclosed value — the no-value case wrongly makes almost anything without an industry-tag match "excluded" via the industry-allowlist gate, which would have hidden the real gap): confirmed all ~47 titles genuinely still landed on `standard` before this batch, not a false alarm.

Added ~35 new `EXCLUDE_KEYWORDS` patterns grouped by theme, each scoped to the real title(s)/summary text it targets (see the "Batch #5" comment block in `relevance.ts` for the full list with per-pattern title citations): outsourced/capitated health-service contracts (Colombia's public-health-insurance model routes a lot of routine medical-service delivery through third parties — "modalidad cápita", "régimen subsidiado", "subsistema de salud de la policía nacional", bundled "intramural y extramural" service lists), routine materiel (ammunition, lab chemicals, pipe-fitting valves), bare "interventoría integral" oversight-only contracts, real-estate leasing/purchase/`comodato` (loan-for-use grants aren't purchases), the Colombian "aunar esfuerzos" inter-institutional cooperation-agreement legal instrument (same non-procurement class as `convenio/contrato interadministrativo`, confirmed real across 5 separate titles), a real gap in the existing bare `^empréstito` pattern (anchored to the START of the whole title+summary haystack, so a real reference-number title prefix like "EP 0057-2026" defeated it — added an unanchored `contrato de empréstito` phrase alongside it), branded congress-giveaway items, and a handful of narrower one-off matches (tires as "llantas" not "neumáticos", travel-ticket reimbursement, an association's own name as a bare title). All 47 confirmed excluded after the change; 101/101 fixtures still pass (unaffected — none of the new patterns touch existing fixture titles).

**Real structural bug found while checking two of the 6 tag-change items** ("AMPLIACIÓN Y MODERNIZACIÓN DE LA INFRAESTRUCTURA TECNOLÓGICA DEL SISTEMA DE VIDEOVIGILANCIA..." at $773K, "Modernización datacenter" at $713K — both flagged "金额太小，应改成常规类"): both were forced straight to `flagship` regardless of their real, disclosed value, well under even `SIGNIFICANT_VALUE_USD`. Two independent causes:
1. `hasIncludeOverride` (an `INCLUDE_OVERRIDE_KEYWORDS` match — "videovigilancia"/"datacenter" here) unconditionally forced `flagship` in the tier-promotion condition, with no value check at all. Fixed: `hasIncludeOverride` now only forces `flagship` when the value is **undisclosed** — once a real number is known, it governs the tier like every other signal in this file. An override keyword still guarantees the tender is never *excluded* (unchanged); it just no longer bypasses the value bands. `matchesMajorProject` stays value-independent on purpose — genuine major-project categories (railway, dam, power plant, a real national-network/new-datacenter build) are inherently large-scale regardless of one procurement notice's disclosed line-item value.
2. Bare "infraestructura" in `FLAGSHIP_INDUSTRY_KEYWORDS` (a generic phrase — "infraestructura tecnológica"/"educativa"/"hospitalaria" all over this file's own EXCLUDE_KEYWORDS comments) was also independently promoting the videovigilancia title to `significant` via `matchesFlagshipIndustry`. Dropped it, keeping the concrete construction/works nouns (construcción/carretera/puente/ferrocarril/puerto/aeropuerto) that actually denote large projects on their own.
3. Also narrowed `MAJOR_PROJECT_KEYWORDS`'s bare `centros? de datos|datacenter` (used to force flagship on its own, independent of value, meant for a genuine new-build) to require a construction/new-build qualifier nearby — an upgrade of an *existing* datacenter isn't the same category as building one. Still protected from exclusion via `INCLUDE_OVERRIDE_KEYWORDS` (unchanged) and still tagged `ict_telecom`.

Both real examples now correctly land on `standard` at their real value; 101/101 fixtures unaffected.

**Three real `classifyIndustries()` (industry.ts) tag gaps**, the other tag-change items: a vehicle-MONITORING/tracking-system title was tagged only `vehicles` (from the bare word "vehículos", the same trap the file's own "vehicles" pattern comment already warns about for other terms); a signal-jammer ("material inhibidor de señal") equipment purchase fell through to `general` with no ICT signal at all; a video-wall LED display system for a military school was tagged only `education` (from "escuela militar"). Added `monitoreo (de )?vehículos`, `inhibidor(es)? de señal`, and `video ?wall` to `industry.ts`'s `ict_telecom` pattern — all three now correctly also carry `ict_telecom` (kept alongside their existing tag rather than replacing it, since e.g. the video-wall system genuinely is being installed at a school).

The 6th tag-change item ("COMPRA DE TORRE PARA EL PROYECTO MEJORAS UNIDAD HIDROTRATAMIENTO U-107 DE LA REFINERIA DE CARTAGENA", flagged "增加综合标签") was left unchanged — it's currently tagged `energy` only (via the bare "REFINERIA" mention), and it's genuinely ambiguous whether the user wants that *replaced* with `general` (same "buyer/location-only, not real content" false-positive class already fixed once for PEMEX excavator/tanker-truck titles) or `general` added *alongside* `energy` (which `classifyIndustries()`'s design doesn't currently support — `general` is defined as the exclusive zero-match fallback, never combined with a real tag). Revisit once that's confirmed; not guessed at.

## Exchange-rate disclosure + monthly auto-refresh (2026-09-05)

Two real follow-ups after shipping `exchangeRateNote()` (the "converted at 1 USD ≈ X CURRENCY" disclosure line on the tender detail page): the user asked whether `USD_RATES` (lib/currency.ts) could refresh monthly, saying it felt noticeably stale.

**Confirmed the drift was real, not a hunch.** `WebFetch`/direct `curl` to any live FX API (frankfurter.app, etc.) are blocked from this sandbox's network egress — same constraint already documented elsewhere in this file — but `WebSearch` isn't (it doesn't hit the target host directly). Cross-checked USD/MXN, USD/COP, USD/PEN across Investing.com, XE.com, and Wise: the stored rates (MXN 1:20, COP 1:4200, PEN 1:3.7) had drifted ~16%, ~25-34%, and ~9% respectively from real current rates. Updated to MXN 1:16.9, COP 1:3140, PEN 1:3.35 — see the commit for the two `relevance-fixtures.ts` fixtures whose `estimatedValue` had to be adjusted (their raw COP figures were reverse-engineered from the old rate to land on a specific side of a value-band threshold; the new rate moved one of them across $500,000).

**Why this isn't a Vercel Cron job hitting a live FX API in production**, even though that's the mechanism the user's own new-tender email digest (`/api/cron/tender-digest`) uses and the user's first instinct for this too: that pattern writes to the database and sends email — normal things a deployed serverless function does. Auto-*updating source code and pushing a git commit* is a different class of action; doing it from the deployed app itself would mean baking a GitHub write token into the production environment so the live app can rewrite and push its own source — a real, avoidable security/architecture risk for what's fundamentally a monthly file edit.

**What was actually built instead**: a monthly Claude Code Routine (`trig_01X6NWykoDLTHhB8rXN1mSox`, "Monthly FX rate refresh (Tender Intelligence Platform)", 1st of each month, self-bound to this coding session) that fires the same review a human would do — check real current rates via `WebSearch`, compare to `USD_RATES`, and if any currency has drifted >~5%, update `lib/currency.ts`, adjust any fixture whose `estimatedValue` was calibrated to the old rate, run `tsc`/`lint`/`test:relevance`, and commit+push — per the user's explicit confirmation (2026-09-05) that automatic update-and-push is the desired behavior once drift is real. No code changes (and no push) when everything's still within ~5%. This achieves the exact "monthly refresh, auto-fix if it's off" outcome the user asked for, just executed by the coding agent (which can reason about the diff and run the test suite before pushing) rather than the production server (which shouldn't have git-write credentials).

## Batch #6: second Colombia review — ~45 new excludes, 2 place-name false positives, an equipment-scale tier cap (2026-09-05)

A second real ~45-title Colombia SECOP exclusion review, same posture as batch #5. All 45 confirmed excluded via a throwaway script (simulated $600K disclosed value, same reasoning as batch #5's script — the no-value case is a poor test since almost anything without an industry tag gets excluded on that signal alone regardless of the real gap). New patterns cover: real-estate leasing (the VERB form "arrendar...inmueble", batch #5 only covered the noun "arrendamiento de..."), military/institutional routine materiel (munición, materia prima for medals/insignias, material de intendencia), a strong recurring Colombian outsourced-clinical-service signal ("procesos (y subprocesos) asistenciales" — appeared 5+ times), insurance policies, a labor-union collective contract, several company/entity names used as bare tender titles (CORPOINSA, FIDUCOLDEX), a broadened `\binterventoría\b` (previously only "interventoría integral"), and a handful of narrower one-offs (motores y repuestos, aulas tipo contenedor, jardines infantiles). One real encoding variant kept as-is rather than "fixed": "IMPRESIÒN" with a grave accent (Ò) is the real character in this SECOP row, not a typo to normalize away.

**Two real place-name false positives, both bare-word MAJOR_PROJECT_KEYWORDS/FLAGSHIP_INDUSTRY_KEYWORDS matches on Colombian municipality/sector names**: "PUERTO BOYACÁ" (a SENA campus-building interventoría, unrelated to seaports) and "PUERTO LÓPEZ" (an indigenous-reservation fund, matched via bare "puerto") both promoted to `flagship` purely because of the city name; "PUENTE OSPINA" (a neighborhood name in Cáchira, not an actual bridge) did the same via bare `\bpuentes?\b`. Real Colombian titles are routinely ALL CAPS, so capitalization can't distinguish "Puerto/Puente as a place name" from the same words meaning "seaport"/"bridge" the way it might elsewhere — fixed with an explicit, named-place-list strip (`stripKnownFalsePositivePlaceNames`, industry.ts, exported and applied to both `classifyIndustries()`'s own haystack and `classifyRelevance()`'s) rather than guessing a broader heuristic. More Colombian "Puerto X"/"Puente X" place names should be added here as they're found for real.

**A real value-bypass bug in `hasIncludeOverride`, narrower than the one batch #5 already fixed**: two more real examples — a substation-modernization title and a bare CCTV/camera purchase, both with **no disclosed value** — were still forced straight to `flagship` via the "undisclosed value" branch that fix left in place. The user's call: a substation UPGRADE and a camera/CCTV PURCHASE are inherently smaller-scope categories than the datacenter/national-network/EPC-scale signals the rest of `INCLUDE_OVERRIDE_KEYWORDS` protects (which genuinely are major regardless of any one procurement notice's disclosed value) — explicit: "如果是摄像头建议最多放重点项目" (cameras cap at `significant` at most). Added `EQUIPMENT_SCALE_CAPPED_KEYWORDS`, a narrower subset that still gets full exclude/value-floor protection via `hasIncludeOverride` but no longer auto-promotes to `flagship` when the value is undisclosed — it caps at `significant` instead. Real regression caught by the fixture suite while building this: the substation qualifier list had to stay narrower than `INCLUDE_OVERRIDE_KEYWORDS`'s own (modernización/rehabilitación/equipamiento only, NOT construcción/ampliación/obra) — a genuine NEW substation BUILD ("CONSTRUCCIÓN DE SUBESTACIÓN ELÉCTRICA DE POTENCIA") is still a major project regardless of value and must keep the uncapped treatment; only an UPGRADE of an existing one is the smaller-scope category the user meant.

**A real "company name as title" case, not a value-threshold policy question**: "CONSTRUCCION Y CONSULTORIAS DE OBRAS DE INGENIERÍA URBANISMO Y ARQUITECTURA CONTINUAR S.A.S." (flagged "金额太小，不应该是重点项目", content "No definido") looked at first like it might mean `matchesFlagshipIndustry`'s existing "any disclosed value ≥ the country floor + a flagship-industry keyword ⇒ significant" rule (confirmed intentional via two passing fixtures, e.g. a $500K-$1M range construcción/equipo-médico title) needed narrowing — but that rule is real and tested, and narrowing it would have contradicted those two fixtures. The real explanation here is different: "S.A.S." is the standard Colombian company-registration suffix, and "No definido" content confirms there's no real procurement description at all — this is the awarded CONTRACTOR'S OWN NAME being used as the record's title (the bare word "construcción" only appears because it's a construction company's name), same class as the association/union/corporación-name-as-title patterns already excluded. Added as a specific excluded pattern rather than touching the value-band design.

**Six industry-tag additions** (`classifyIndustries()`): IA/Bigdata equipment → `ict_telecom`; solar-PV installations → also `power` (alongside their existing `energy` tag, since a PV system is fundamentally an electricity-generation asset); the adjective form "hospitalari[oa]s?" → `healthcare` (real gap: `hospital(es)?\b`'s word-boundary requirement never matched this form, same class of bug as the earlier "unidad médica" plural fix); "obras de reparación y rehabilitación"/"infraestructura hospitalaria" phrasing → `construction`; CCTV/circuito cerrado de televisión, a hospital information-system/ERP project, and a smart-transport camera system → `ict_telecom`; "vías terciarias"/"placa huella" (Colombian tertiary-road terms) → `transportation`.

One item ("COMPRAVENTA DEL PARQUE AUTOMOTOR PARA LOS CUERPOS OPERATIVOS...GESTIÓN DEL RIESGO DE DESASTRES") was left unresolved and flagged back to the user: it's a vehicle-fleet purchase, which contradicts the platform's own explicit earlier decision to keep vehicle purchases as a positive signal — not clear why this specific one should be excluded, so not guessed at.

Also unresolved, same "general can't coexist with a real tag" design limitation as batch #5's refinery-torre item: "INVITACION A COTIZAR No. OC0146-2026" was flagged "增加ICT、综合" — the ICT half is done, but `classifyIndustries()` still can't tag something both a real category (here `healthcare`+`ict_telecom`) and the exclusive zero-match fallback `general` at the same time.

101/101 fixtures pass (one real regression caught and fixed mid-batch, per the substation note above).

## Documents-needed worklist: dismiss action + key-dates editor same-day note (2026-09-05)

Two small follow-ups after auditing `/admin/documents-needed`'s status (a long-standing "clarify status" backlog item): the page itself has no bugs — the manual download → upload → LLM-extract flow works as designed, confirmed by tracing `AnalyzeDocumentForm` → `POST /api/admin/analyze-document`. The one real gap: sources with no automated attachment path at all (Colombia's SECOP II detail page is CAPTCHA-gated, Compras MX's live search API is anti-bot-gated — see this file's own earlier sections) have no way to be marked "not obtainable" distinct from "not yet attempted", so a tender from those sources sits in the worklist forever.

Added a `documents_unavailable` boolean column (`supabase/migrations/0021_tender_documents_unavailable.sql`) and a dedicated toggle route (`app/api/admin/tenders/[slug]/documents-unavailable/route.ts`, same pattern as the existing `homepage-featured` toggle — deliberately separate from the full tender-edit PATCH). `fetchTendersNeedingDocumentsFromDb()` now also filters `.eq("documents_unavailable", false)`. `DocumentsNeededView.tsx` gets a small "🚫" dismiss button per row (with a confirm dialog) that calls the toggle and removes the row from local state immediately, no full page reload needed. The confirm dialog promises the admin can reverse this from the project-management edit form — backed up for real: `documentsUnavailable` is now also a field on `Tender`/`AdminTenderForm`'s `FormState`, with its own checkbox in the "来源信息" section, wired through the existing full-edit PATCH route.

Separately, a real user question about `KeyDatesEditor.tsx` (the admin's per-tender key-dates CRUD): should it also merge same-day submission/opening entries the way `KeyDatesTimeline.tsx` (the public tender page) does? Answer: no, deliberately — the editor's whole job is granular per-row CRUD over the real `tender_key_dates` rows, and merging the display there would make it ambiguous which underlying row an edit applies to. Instead added a small inline badge ("与开标同日 · 前台合并显示") on both rows when they share a date, using the identical detection `KeyDatesTimeline.tsx` already has — visual parity without changing edit semantics.

## Real bug: admin edit form silently "confirmed" estimated publication dates (2026-09-05)

The user compared a Compras MX tender's admin edit view ("发布日期 2026/09/04") against the real official Compras MX detail page for the same procedure ("Fecha y hora de publicación: 02/09/2026") and found a 2-day gap. Root cause traced, and it's two separate things:

1. **Not a bug — a documented, honest limitation.** `compras-mx-open-tenders-mapper.ts`'s source row type (the "Difusión de procedimientos" browser export) has no publication-date column at all — only a clarification-meeting date and a submission/opening date. The mapper sets `publicationDate: now` (the ingestion timestamp) with `publicationDateIsEstimated: true`, and the public tender page already handles this correctly: `TenderOverview.tsx` shows "收录日期" (date added) instead of "发布日期" whenever that flag is true, so a reader isn't misled there. The 2-day gap the user found is simply this platform's periodic bulk-import lag behind the real publication — inherent to this source's export format, not fixable without the anti-bot-gated live API this project deliberately doesn't try to defeat (see the mapper's own header comment).

2. **A real bug, now fixed.** Both admin tender-save routes (`app/api/admin/tenders/route.ts` POST, `app/api/admin/tenders/[slug]/route.ts` PATCH) unconditionally wrote `publication_date_is_estimated: false` on every save — so the moment an admin edited *any* field on a tender that started with an honest, flagged estimate (like this one), the flag silently flipped to "confirmed real date" even if the admin never touched the date itself or had no idea it was ever an estimate. From then on the public page would show "发布日期" (implying a real, sourced date) for what's still just an ingestion timestamp — and `AdminTenderForm.tsx` never even exposed this distinction, so an admin had no way to notice or preserve it.

Fixed: `publicationDateIsEstimated` is now a real field on `FormState`/both request bodies, with its own checkbox right under the 发布日期 input ("该日期是估算值...已核实真实日期请取消勾选") — pre-filled from the tender's actual stored value, only changed when an admin deliberately (un)checks it. Both routes now write `body.publicationDateIsEstimated === true` instead of a hardcoded `false`.

## Site-wide tier-name rename: 重点项目→中型项目, 旗舰(大标/项目)→大型项目 (2026-09-05)

Per explicit user request: `standard`("常规项目") unchanged; `significant` zh renamed 重点项目→中型项目; `flagship` zh renamed 旗舰大标/旗舰项目→大型项目. Two independent places carry this text and behave differently:

- `lib/tender-labels.ts`'s `RELEVANCE_TIER_LABELS` (filter chips/dropdowns across TenderExplorer/AdminTenderForm/AdminTenderList/DocumentsNeededView — looked up live by tier key, never stored) — takes effect immediately, no reclassify needed.
- `lib/relevance.ts`'s `LABELS` (the "旗舰项目 · 建议中资企业重点关注" style sentence written into each tender's own `relevance_label` column at classify time) — existing rows keep the OLD zh text until a "重新分类" run recomputes them.

Also updated: `AdminAnalyticsDashboard.tsx`'s value-label map, `DocumentsNeededView.tsx`'s stat label, the site's `<meta name="description">` (`app/layout.tsx`), both pricing-page "旗舰标标签筛选" feature bullets, the (currently unused/dead — no import site found) `lib/pricing.ts` `PRICING_TIERS`, and `ValuePropositions.tsx`'s homepage feature-card detail sentence that explicitly paired "大型及重点项目". Left alone as NOT literal tier-badge references (generic "your important/priority projects" marketing language, not the renamed labels themselves): `ValuePropositions.tsx`'s card title "重点项目优选" and both "重点项目" mentions in `SavedView.tsx` ("我的收藏" page copy).

101/101 fixtures unaffected (they assert against the tier KEY, e.g. `expectedTier: "significant"`, never the display label text).

## Two more Mexico flagship-cap refinements, same day (2026-09-05)

Two more real examples the user flagged as wrongly `flagship`:

1. **"IMPLEMENTACIÓN DE SOLUCIÓN DE SISTEMAS DE SEGURIDAD ELECTRÓNICA TIPO VIDEOVIGILANCIA"** (no disclosed value) — a full video-surveillance/electronic-security SYSTEM implementation, not just a bare camera purchase, but the user's explicit "也" (also/same category) made clear the whole videovigilancia/seguridad-electrónica theme belongs in the same bucket as the camera-purchase cap added earlier today. Moved the bare `videovigilancia`/`seguridad electrónica` terms from the flagship-forcing half of `INCLUDE_OVERRIDE_KEYWORDS`'s treatment into `EQUIPMENT_SCALE_CAPPED_KEYWORDS` — now caps at `significant` when undisclosed, same as substation-modernization/cameras.
2. **"CONSTRUCCIÓN PUENTE PEATONAL ESTACIÓN 3 SIST.INTERCONECTADO ELECTROMOVILIDAD L-5"** — explicit call: "Puente Peatonal" (pedestrian bridge/overpass) should never count as `MAJOR_PROJECT_KEYWORDS`'s bare 建桥 signal at all — a pedestrian bridge is inherently smaller-scale than a vehicular/railway bridge. Narrowed the bare `\bpuentes?\b` entry with `(?!\s+peatonal(es)?)`. Still counts toward `FLAGSHIP_INDUSTRY_KEYWORDS`'s own bare "puente" (unchanged) — a disclosed value still promotes it to `significant` normally, just never straight to `flagship` regardless of value. Verified: no value → `standard`; a disclosed value → `significant`; never `flagship` either way. The existing "CONSTRUCCIÓN DE PUENTE VEHICULAR..." fixture (a real vehicular bridge, correctly `flagship`) is unaffected since "vehicular" ≠ "peatonal".

101/101 fixtures unaffected.

## Bulk-delete for already-awarded, no-analysis tenders (2026-09-05)

Real pain point: the user was manually deleting, one row at a time, every "已中标" (awarded) tender that never got a document analysis — a real, recurring cleanup ("这些我都要人工删除了，对现阶段来说没有意义"). Explicit scope: "已中标+无标书分析" only, never "已中标+有标书分析" ("未来已中标，有标书分析的我不会动") — same criteria the earlier awarded-tender public-visibility fix already uses.

Added:
- `hasAnalysis` on `AdminTenderListRow` — reuses the existing `fetchAwardedSlugsWithAnalysis()` helper (built for the public-feed fix) rather than a new join; only ever computed for `status === "awarded"` rows, so it stays cheap on a list that already documents its own "1000+ rows, no extra joins" performance constraint.
- A "标书分析（仅限已中标）" filter (不限/无标书分析/已有标书分析) in `AdminTenderList.tsx`, combinable with the existing 状态 filter.
- Row checkboxes + a header "select all filtered" checkbox + a bulk-action bar (shown once ≥1 row is selected) with a single "批量删除" button.
- `POST /api/admin/tenders/bulk-delete` (chunked at 200 slugs per Supabase call) — same two effects as the existing single-tender DELETE route (cascade-delete + tombstone in `tender_manual_deletions`), just batched.

Workflow: filter 状态=已中标 + 标书分析=无标书分析 → select-all → 批量删除. Table layout kept compact per explicit request ("保持好当前的排版，不要过宽") — the new checkbox column takes 4% width, taken from 标题(25→22%) and 操作(17→16%), min-width bumped 980px→1020px only.

## Front-end search never matched a tender's own slug (2026-09-05)

Real gap: the user pasted a tender's exact slug (visible on its `/admin/tenders/[slug]` edit page) into the public `/tenders` search box and got 0 results. `filterTenders()`'s search haystack was `[title, buyer, tenderNumber]` only — never the slug itself, which doesn't necessarily share any substring with those three fields (e.g. Proyectos Estratégicos MX's slug is a slugified transform of its own reference number, not identical to the stored `tenderNumber`'s real formatting). Added `tender.slug` to the haystack.

Also worth checking for this specific tender: the front-end's relevance-tier chips default to `flagship`+`significant` only (`DEFAULT_RELEVANCE_TIERS` in `TenderExplorer.tsx`) — a `standard`("常规项目") tender is invisible in search results until that chip (or "全部") is explicitly selected, independent of the slug-search bug above. Both are real, independent reasons a search could return 0 results for an existing tender.

## Front-end default filters all changed to "全部" (2026-09-05)

Same underlying problem as the slug-search gap above, generalized: the user asked to remove every non-"全部" default across the public tender explorer, so an existing tender is never invisible-by-default again regardless of its status or scale tier. Grepping `TenderExplorer.tsx`'s filter constants found exactly two dimensions with a restrictive default (国家/行业/项目类型 have no `DEFAULT_*` constants at all — already unrestricted):

- `DEFAULT_STATUSES` was `["planned", "open", "clarification", "submission_closed"]`, excluding `awarded`/`cancelled` — now `[]`.
- `DEFAULT_RELEVANCE_TIERS` was `["flagship", "significant"]`, excluding `standard` — now `[]`.

`InlineTogglePills`'s "全部" chip is already defined as `active` exactly when `selected.length === 0`, and clicking it calls `onChange([])` — so this change is byte-for-byte equivalent to every visitor manually clicking "全部" on both filter groups on first load, not a new code path. The existing "none" URL-sentinel handling (`tier=none`/`status=none` meaning "user explicitly cleared this, independent of whatever the app's current default is") is untouched — it only ever mattered for distinguishing a deliberate empty selection from an absent param, and an absent param now also resolves to empty.

101/101 fixtures unaffected (pure front-end display-filter defaults, no `lib/relevance.ts`/classification logic touched). `tsc --noEmit` and `npm run lint` both clean.

## Admin key-dates editor: initial list never sorted by date (2026-09-05)

Real report with a screenshot: the admin's `KeyDatesEditor.tsx` showed rows in an order like 澄清会议(8/26) → 提交截止(9/21) → 开标(9/21) → 现场踏勘(8/25) → 提问截止(8/25) → 中标结果(10/5) → 合同签署(10/12) — not chronological at all. Root cause: `handleAdd`/`handleSaveEdit` already re-sort the full array after any add/edit, but the initial `useState(initialKeyDates)` never did — a tender whose `tender_key_dates` rows were written by an ingestion mapper in a fixed type order (e.g. clarification, then submission, then opening, then site_visit...) rather than date order stayed visibly out of order on every page load until an admin happened to touch one. Fixed by sorting on the initial state (`useState(() => [...initialKeyDates].sort(byDateAsc))`), factored the three call sites (initial state, add, edit) onto one shared `byDateAsc` comparator. Same date-string comparison the public `KeyDatesTimeline.tsx` already uses (`localeCompare` on the ISO date string), so this is now consistent everywhere the same list is rendered.

Also answered a related question about a different CFE tender's 来源链接 pointing at DOF (`dof.gob.mx/nota_detalle.php`) instead of CFE's own site: not a bug — see "CFE's own portal is WAF-protected; PEMEX's is not" above. `msc.cfe.mx` gates both its search and per-procedure detail endpoints behind a commercial WAF (Imperva) plus a session-bound anti-forgery token that only exists after a real browser has loaded the page — confirmed real 2026-09-03, consistent with this project's standing policy of not building connectors against anti-automation gates. DOF's own notice-detail page is the only real, non-gated source for CFE tender content, so that's what `sourceUrl` correctly points at.

## CFE tenders now link to CFE's own micrositio, not DOF (2026-09-05)

Explicit follow-up to the question above: the user asked for CFE tenders' 来源链接 to go to CFE's own tender micrositio (`msc.cfe.mx/Aplicaciones/NCFE/Concursos/`) instead of DOF's notice detail page, even though — per the WAF finding right above — no URL this codebase can construct reaches one specific CFE procedure; the micrositio link is a general Concursos search/landing page, not a deep link. Added `CFE_BUYER_PATTERN` (matches "COMISION/COMISIÓN FEDERAL DE ELECTRICIDAD" including real trailing text like "... A RUEGO Y ENCARGO") and `CFE_MICROSITIO_URL` to `heuristics.ts`; both `dof-mapper.ts` (daily-edition) and `dof-search-mapper.ts` (advanced-search — the confirmed-real CFE path) now route a CFE-buyer row's `sourceUrl` there instead of building a DOF link. Every other DOF-sourced buyer (PEMEX, IMP, IMSS, ISSSTE, etc.) is unaffected — still gets the DOF deep link, which does work for those.

Only takes effect for tenders ingested from here on — `upsertTendersBatched()`'s upsert-by-slug always overwrites `source_url` on every field it writes (see its own comment), so re-running `npm run ingest:dof-search -- <captured file>.json --write` (or `ingest:dof`) against the same already-captured source data will backfill the existing CFE rows' `source_url` too, no new capture needed.

101/101 fixtures unaffected (no relevance-classification logic touched). `tsc --noEmit`, `npm run lint` clean.

## CFE award status was never detected — DOF actually publishes it (2026-09-05)

User question: how does this codebase tell whether a CFE or PEMEX tender is already awarded? Checked both — different answers:

**CFE (via `dof-search-mapper.ts`)**: a real, fixable gap, now fixed. The notice's own detail page (`dof-notice-detail.ts`) sometimes carries a real "Fallo" field with a real date — `buildDofDetailFields()` already captured that as a `keyDates` entry of type `"award"`, but the tender's own `status` was hardcoded `"open"` regardless, unlike every other source in this codebase (`peru-oece-mapper.ts`'s `hasAwards`, `colombia-mapper.ts`'s `Adjudicado === "Sí"`, `compras-mx-open-tenders-mapper.ts`'s `ADJUDICA`, `compras-mx-contracts-mapper.ts`'s `FORMALIZADO` — all derive `"awarded"` from a real published signal). Fixed: `status` is now `"awarded"` whenever `detailKeyDates` contains an `"award"` entry, `"open"` otherwise — same convention as those other sources. Only applies when a detail page was actually fetched (`detail` present) — a bare search-stub row with no detail page still can't know either way, same honest-degradation posture as everything else in this mapper.

**PEMEX (via `pemex-mapper.ts`)**: genuinely can't, right now — not fixed, a real structural gap. `PemexConcursoItem`'s real fields (confirmed from the actual captured SharePoint list shape) are `Id/Title/descripcion/inicio/vencimiento/tipoevento/tiposuministro/areacontratante/Created/Modified/Attachments` — no result/fallo/adjudicación field exists on this list at all. `inferStatus()` only ever compares `vencimiento` (submission deadline) against now: `"open"` before it, `"submission_closed"` after — and stays `"submission_closed"` forever once the deadline passes, since nothing re-evaluates it later. The list this mapper reads (`concursosabiertos`, "open contests") is PEMEX's inherently-forward-looking view; whether a real separate PEMEX list/endpoint publishes award results at all hasn't been checked yet — would need the same kind of direct-request check this file already did for CFE's WAF ("checked both directly" above) before concluding either way.

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean.

## CFE micrositio fix needed a backfill script too (2026-09-05)

The mapper-level fix above only takes effect for tenders ingested from here on — the user checked an already-ingested CFE row's edit form and its 来源链接 still showed the old DOF URL, as expected (nothing re-ingests existing rows automatically). Since re-running the ingest scripts needs the same originally-captured source file (not available in this sandbox), added `scripts/fix-cfe-source-urls.ts` — same one-off backfill pattern as `fix-pemex-source-urls.ts`: queries `tenders` scoped to the two DOF mappers' own `source_name` values (deliberately not "any row with a CFE-like buyer" — a different source, e.g. Proyectos Estratégicos MX, could carry CFE as a buyer with its own genuinely different, working sourceUrl that shouldn't be clobbered; CFE doesn't currently appear as a buyer anywhere else in this codebase, so this scoping covers every real CFE row today), matches `buyer` against the same `CFE_BUYER_PATTERN`, and updates `source_url` to `CFE_MICROSITIO_URL` directly. `npm run fix:cfe-source-urls` (dry run) / `-- --write` (applies), added to package.json.

Tried running it directly from this sandbox first — blocked: `Host not in allowlist: <project>.supabase.co`, the same network-egress restriction that's blocked every other live *.gob.mx/pemex.com fetch this session. The user needs to run this one themselves.

`tsc --noEmit`, `npm run lint` clean (couldn't execute the script itself here to verify against real data, only compile it).

Confirmed backfilled the same day: the user ran `npm run fix:cfe-source-urls -- --write` themselves — 2 fixed (both existing CFE rows), 0 skipped.

## Colombia exclude: bus-operator staff training (2026-09-05)

Real title flagged for exclusion: "Formación y desarrollo de estrategias académicas necesarias para la operación y movimiento de los buses en las líneas comerciales, patios y talleres." — a transit operator's staff-training/curriculum-development program, same "no real goods/works content" class as the existing `articulación con la educación media|formación del talento humano` line (the SENA workforce-training pattern) right above it in `EXCLUDE_KEYWORDS`. Added `/formaci[óo]n y desarrollo de estrategias acad[ée]micas/i` next to it. Verified directly (not just by inspection): `classifyRelevance()` on this exact title now returns `tier: "excluded"`. 101/101 fixtures unaffected.

Also answered a real question about a different Colombia tender: why a SECOP II process's "Fecha de publicación" can be LATER than its own "Fecha de inicio de ejecución del contrato" (a live SECOP II opportunity page the user screenshotted showed publicación 31/08/2026 after execution start 25/08/2026 and even after contract signing 25/06/2026). Not a bug in SECOP or this platform: the same row cited "Decreto 248 de 2021" (food purchases from small producers) and "Sentencia T-302 de 2017" (a constitutional-court order on Wayúu children's rights) — both real legal grounds Colombian entities cite specifically to justify "Contratación Directa" (direct/sole-source contracting, no competitive bidding). Under that modality an entity can select a contractor, sign, and even start executing a contract before completing SECOP's own publication step — Colombian regulation requires the process record to be published, but not strictly before execution begins, especially for urgent/court-mandated programs; entities commonly publish a few days after the fact. `colombia-mapper.ts`'s `publicationDate` is sourced directly from this same real `fecha_de_publicacion_del` Socrata column (`p6dx-8zbt` — "SECOP II - Procesos de Contratación"), so our own 发布日期 for a Contratación Directa tender can show this same after-the-fact registration timestamp — accurate to the real source, just confusing-looking for this specific procedure type.

The user's follow-up: "这类晚发布的项目对我们来说就没有任何意义" (a tender that's already effectively decided by the time it's published has zero value for the platform's purpose). Gave two scoping options via AskUserQuestion — narrow (mark any row with a real named provider as awarded, regardless of `adjudicado`) vs. broad (exclude every `Contratación Directa` row outright, since that modality never has real competitive bidding at all) — user picked the narrower one.

**Real gap fixed**: `colombia-mapper.ts` already computed `awardedTo`/`providerName` from `nombre_del_proveedor` (filtering out the literal "No Definido" placeholder) but never fed it into `inferStatus()` at all — status was decided purely from `adjudicado` (documented as unreliable: the 5-row sample already showed `adjudicado: "No"` on rows in a `estado_del_procedimiento: "Seleccionado"` phase) and `estado_de_apertura_del_proceso`. `inferStatus()` now checks `providerName` FIRST — a real named provider means the opportunity is already decided regardless of what the other two fields say (both fields can lag/misreport, especially for `Contratación Directa`, but a real provider name is unambiguous). This slots straight into the existing awarded-tender handling (hidden from the public feed unless it has document analysis, excluded from 待补文件, eligible for admin bulk-delete) — no separate new pipeline needed. 101/101 fixtures unaffected (Colombia mapper logic, not relevance classification). `tsc --noEmit`, `npm run lint` clean.

Confirmed this ISN'T a data-freshness problem: Colombia's connector (`ingest:colombia-live`) is this project's only source explicitly documented as zero-lag/genuinely live (see the source-freshness table near the top of this file) — a "late" publication date on a specific tender reflects the ENTITY's own late registration on SECOP itself (real, present in the live data at query time), not a stale pull on this platform's side.

## Colombia: real dataset fields we weren't using, and a stored-snapshot staleness gap (2026-09-05)

The user pulled the real SODA API field dictionary for this dataset directly (`p6dx-8zbt`'s own docs page) and found several real, confirmed columns `colombia-mapper.ts` never captured — plus, separately, found two concrete tenders that expose a genuine gap in how the connector is used, not in the mapping code itself.

**New fields added to `SecopProcesoRow`, now used**:
- `estado_del_procedimiento` — already captured but never used for status (the header comment's own caution: the small 5-row sample only showed "Seleccionado" on non-awarded rows). The user cross-checked a live SECOP II process page directly and found this field reading literally **"Proceso adjudicado y celebrado"** ("process awarded and executed") for a tender our own admin edit page still showed as `招标中`/open. `inferStatus()` now also checks `/adjudicad/i` against this field — safe against the earlier "Seleccionado" trap (that word never contains "adjudicad").
- `fecha_adjudicacion`/`valor_total_adjudicacion` ("Fecha Adjudicacion"/"Valor Total Adjudicacion") — real award date/value columns, never captured despite `awardDate`/`awardedValue` already being real `Tender` fields other mappers populate (`compranet5-mapper.ts`, `compras-mx-contracts-mapper.ts`, `ocds-mapper.ts`). Now wired through, plus a real `award`-type `keyDates` entry when present — Colombia tenders can now show a real 中标结果 date the way other sources' already do.
- `estado_resumen` — captured for future use, not yet acted on (no real value sample to build confident logic from yet).
- Deliberately NOT using `nombre_del_adjudicador` as an awarded-provider signal — the same field dictionary confirms it's a DIFFERENT field from `nombre_del_proveedor` ("Nombre del Proveedor Adjudicado"): the adjudicador is the awarding body/committee, not the winning contractor.

**The real, separate gap — a stored-snapshot never gets refreshed**: the user found a genuinely open `Licitación Pública` (`secop-sdm-lp-80-2026`, "ADQUISICION Y PUESTA EN MARCHA DE CAMARAS PARA EL SIT") whose live SECOP listing shows a real "Fecha de presentación de ofertas" (16/10/2026) that our own admin edit page shows as a blank 投标截止日期. Root cause: `ingest-colombia-live.ts` fetches by a `fecha_de_publicacion_del`-based recency window (`--months`, default 6) and upserts by slug — genuinely live AT THE MOMENT IT RUNS, exactly as documented above, but it is only ever run when someone (the admin panel or a script invocation) triggers it. A field that fills in or changes on SECOP's side AFTER a tender was first ingested — a submission deadline getting set, `adjudicado` flipping, a provider name appearing — never reaches our database unless the SAME process gets re-fetched and re-upserted later. This is the same root cause behind the "已内定但显示招标中" cases investigated above: not a mapping bug, a refresh-cadence gap.

**First considered, then ruled out**: a weekly Claude Code Routine mirroring the existing monthly FX-rate-refresh Routine. Doesn't work here — checked directly (spawned a sibling session in the same environment to test) and confirmed this account's cloud sandboxes can't reach either `datos.gov.co` or Supabase (`Host not in allowlist`), the same restriction that's blocked every live *.gob.mx/pemex.com fetch this session. The FX-rate Routine only ever needs `WebSearch` (Anthropic-hosted, bypasses this restriction) + a `git push` — no live fetch, no live write — which is why THAT one works and this one can't be built the same way.

**Actual fix shipped**: the admin "SECOP II — 哥伦比亚标书 + 附件" panel (`ImportColombiaForm.tsx`) already called `ingestColombia()` with a recency-window pull, and `upsertTendersBatched()` already overwrites every mapped field on a matching slug — so re-running the SAME pull against the SAME window already refreshes any already-tracked tender's dynamic fields (deadline/status/provider/award), no new backend logic needed. The gap was purely that nothing prompted the user (who already re-runs this panel daily by hand) to think of it that way. Added a second, clearly-labeled button, "刷新已有标书状态" — identical underlying call, `fetchDocuments` forced off (a status refresh doesn't need attachments), positioned as its own daily habit distinct from "拉取并写入" (discover + write new tenders). Real network access lives on whichever machine loads this admin page (the deployed server, not this sandbox), so this sidesteps the cloud-session network restriction entirely.

## Colombia: no submission deadline hides a tender from the public feed (2026-09-05)

Follow-up after the refresh-button fix above: the user tested it against a real already-decided tender (`secop-101147`, live SECOP `Estado: Proceso adjudicado y celebrado`) and reported it still didn't flip to `已中标` — most likely because that tender's `fecha_de_publicacion_del` is older than the refresh button's recency window, so it was never re-pulled at all (a separate, not-yet-revisited limitation of reusing the same `months` filter for "refresh" as for "discover new"). The user's response, generalized rather than chasing that one case further: many Colombia tenders with no `fecha_de_recepcion_de` ("Fecha de presentación de ofertas") are exactly this kind of already-decided/no-real-opportunity row, and seeing them in the public feed looking like open opportunities hurts trust.

Explicit rule from the user (Colombia only): no submission deadline → hide from the public feed; once a refresh syncs a real deadline, un-hide automatically. Flagged one real tension before implementing: the same missing-deadline signal also covers `secop-sdm-lp-80-2026`, a confirmed-real, currently-open `Licitación pública` whose deadline (16/10/2026) exists on the live SECOP site but hadn't synced into `datos.gov.co` yet — hiding it is a false negative, not correctly targeted. User's call: accept that cost since it self-corrects the moment the deadline syncs (exactly what the new "刷新已有标书状态" button is for) rather than try to build a more precise (and less certain) rule from fields we don't reliably have.

Implemented the same way as the existing "awarded with no analysis" visibility rule right above it in `fetchAllTendersFromDb()` (`lib/db/tenders.ts`) — a plain filter over already-fetched rows, re-evaluated on every call, no new flag/column: `row.country !== "Colombia" || !!row.submission_deadline`. Scoped to `country === "Colombia"` only — no other source's "no disclosed deadline yet" carries the same meaning. Same precedent as the awarded rule: only the list-backed public surfaces (`/tenders`, homepage teaser, notification digest) are gated; a direct link to the tender's own detail page (`fetchTenderBySlugFromDb`) is untouched, and the admin list stays fully unfiltered.

101/101 fixtures unaffected (this is a DB-query filter, not `lib/relevance.ts` classification — an already-hidden tender keeps whatever relevance tier it had). `tsc --noEmit`, `npm run lint` clean.

## "刷新已有标书状态" didn't actually reach either test tender — real design bug (2026-09-05)

The user tested the refresh button (added earlier the same day) against exactly the two real tenders it was built for — `secop-101147` (expected to flip to `已中标`) and `secop-sdm-lp-80-2026` (expected to pick up its real 16/10/2026 deadline) — and reported neither changed.

**Root cause**: the button reused `ingestColombia()`, whose `sinceDate` cutoff (from the "保留最近几个月发布的" input, default 2) is applied SERVER-SIDE in the Socrata `$where` clause itself (`fetchSecopProcesos()`) — not a client-side post-filter. A tender published outside that window is never fetched back from SECOP at all, so no amount of re-clicking (or of the `estado_del_procedimiento` matching logic added earlier) could ever reach it. Both test tenders are older than 2 months. The user then asked directly: make the button unbounded — "能刷新所有已入库的哥伦比亚标".

**Real fix, not a wider window**: a truly unbounded date filter isn't viable against this 9M+-row dataset (`fetchSecopProcesos()`'s own header comment already explains why a full dump was never on the table). Built a genuinely different operation instead: `refreshColombiaTenders()` (`ingest-colombia.ts`) queries our OWN `tenders` table first for every already-tracked Colombia `tender_number` (slug prefix `secop-`), then fetches exactly those specific processes back from SECOP by reference — a new `fetchSecopProcesosByReference()` (`colombia-secop-live.ts`) that filters on `referencia_del_proceso in (...) OR id_del_proceso in (...)` (batched at 50 references per request, no date filter at all) instead of a publication-date `$where` clause. This reaches every already-ingested tender regardless of how old it is, cheaply, without touching the other ~9M unrelated rows.

Wired through: `POST /api/admin/import-colombia` now takes a `mode: "pull" | "refresh"` body field (`"pull"` is the existing behavior, default) routing to `ingestColombia()` or `refreshColombiaTenders()`. `ImportColombiaForm.tsx`'s "刷新已有标书状态" button now calls this new mode — no months/maxPages involved at all, always full-scope. Its result shape is genuinely different from a pull's (`trackedCount`/no recency-window fields) so the UI renders it separately rather than force-fitting one result type.

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean. Not yet re-tested by the user against the same two real tenders — that's the next real verification step.

## Admin date edits never synced the separate tender_key_dates table (2026-09-05)

The user found `secop-sdm-lp-80-2026`'s overview card correctly showing the real submission deadline (2026年10月16日, presumably synced by a refresh or by datos.gov.co finally catching up) — but the 关键日期 timeline right below it still showed only the old 发布 entry, no matching 提交截止 card. "两者应该是同样的日期" (these two should show the same date).

**Root cause, more general than this one tender**: `publicationDate`/`submissionDeadline`/`awardDate` each live in their own top-level `tenders` column AND can independently have a matching row in the separate `tender_key_dates` child table (rendered on both the public detail page's 关键日期 timeline and the admin's own `KeyDatesEditor`). The ingestion path (`upsertTendersBatched`) already keeps these in sync — it deletes and re-inserts the tender's whole `keyDates` array on every upsert. But `AdminTenderForm.tsx`'s own date inputs save through the admin tender create/update routes (`app/api/admin/tenders/route.ts` POST, `[slug]/route.ts` PATCH), and neither ever touched `tender_key_dates` at all — a manual edit to any of these three fields (or even creating a brand-new manual tender) could silently leave the two displays disagreeing, with no way to notice except comparing them side by side like the user just did.

**Fix**: `lib/db/key-dates-sync.ts`'s `syncKeyDatesForTopLevelFields()` — deletes any existing `publication`/`submission`/`award`-type `tender_key_dates` rows for a tender and re-inserts fresh ones matching whatever was just saved on the three top-level columns (or inserts nothing for a field that's now empty). Called from both admin tender routes right after their own `tenders` table write succeeds. Every OTHER key-date type (clarification/site_visit/questions_deadline/opening/contract_signing) has no top-level column counterpart and is left completely untouched — those stay purely admin/ingestion-managed via `KeyDatesEditor`'s own CRUD, same as before.

Only fixes the write path going forward — doesn't retroactively repair rows that already drifted before this fix (like `secop-sdm-lp-80-2026`'s own timeline, still stale until its next re-ingest/refresh actually runs the delete-then-insert this same way).

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean.

**Follow-up, same conversation**: the user asked for the admin UI itself to stop showing the same date editable in two different places — `AdminTenderForm.tsx`'s "时间与预算" section (发布日期/投标截止日期/中标日期) and the separate "关键日期" `KeyDatesEditor` list right below it (which, before this fix, could independently show a "发布"/"提交截止"/"中标结果" row for the exact same underlying date). `KeyDatesEditor.tsx` now filters `publication`/`submission`/`award` out of both its rendered list and its "类型" add/edit dropdown (`HANDLED_ELSEWHERE`) — those three are edited ONLY via the quick fields above, which `syncKeyDatesForTopLevelFields()` (added above) keeps mirrored into `tender_key_dates` automatically. The section was retitled "其他关键日期" (clarification/site visit/questions deadline/opening/contract signing only) with copy pointing back to where the other three now live. `sameDaySubmissionOpeningIds()` still computes off the FULL `keyDates` state (submission included) so an `opening` row's "与提交截止同日" badge keeps working even though the submission row itself is no longer rendered here.

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean.

**Re-tested by the user, still not fixed for `secop-sdm-lp-80-2026` specifically** — after clicking "刷新已有标书状态" again, the public detail page's 关键日期 timeline still shows only 发布, even though the overview card correctly shows 计划交标 2026年10月16日. Given `upsertTendersBatched()`'s keyDates delete-then-insert has been correct all along (predates today), the most likely explanations, neither confirmed: (a) the deployed server hasn't picked up the day's commits yet, so the refresh button the user clicked was still the old window-limited version that never actually re-fetched this tender, and 10/16 reached the top-level column some earlier way (most likely a direct manual edit via the admin form's 投标截止日期 field, which — before `syncKeyDatesForTopLevelFields()` existed — would explain the exact stale-keyDates symptom on its own); or (b) `fetchSecopProcesosByReference()`'s lookup didn't actually match this tender's stored `tender_number` against Socrata's `referencia_del_proceso`/`id_del_proceso` for some reason, so the refresh silently no-op'd on this specific row. Most direct next troubleshooting step handed to the user: open this tender in the admin edit form and re-save it (even with no changes) — `syncKeyDatesForTopLevelFields()` fires unconditionally on every save now, so this should produce the correct 提交截止 entry regardless of which of the two causes above actually happened, PROVIDED the deployment is current. Not yet confirmed working.

**New data point, points at (b) — or rather, a third cause**: the user separately re-tested `secop-101147` (running the app locally, `localhost:3001`, so deployment lag stops being a plausible explanation for THIS case) after refreshing. Two real, distinct findings on the same screenshot:

1. The no-deadline hide rule is confirmed working exactly as designed: `secop-101147`'s 计划交标 correctly shows `—` (this really is a "Contratación régimen especial" with no public bidding phase at all, per the live SECOP page's own "Información de la selección" section naming a direct awardee) — visible here only because a direct link to the detail page isn't gated, same as the existing awarded-with-no-analysis precedent.
2. `status` is still `招标中`, not `已中标`, even after a local refresh with current code — the `estado_del_procedimiento`-matching fix genuinely didn't fire for this row.

**Confirmed**: the user hit the raw diagnostic URL directly and got back real, current data for this exact process (`id_del_proceso: "CO1.REQ.10952979"`, `urlproceso.url` carrying the same `noticeUID=CO1.NTC.10807502` as the live-page screenshot earlier in this same investigation — genuinely the same record): `estado_del_procedimiento: "Seleccionado"`, `adjudicado: "No"`, `nombre_del_proveedor: "No Definido"`, `estado_de_apertura_del_proceso: "Abierto"` — none of our three awarded signals have anything to match yet. `datos.gov.co`'s open-data mirror of SECOP II genuinely lags behind the live `community.secop.gov.co` site for this process's award info specifically (its `fase`/`estado_resumen` — "Presentación de oferta" — already agree with the live page, so it's not globally stale, just this one set of award fields). Not a code bug; nothing left to fix here. `refreshColombiaTenders()`/"刷新已有标书状态" will pick up the real status automatically once `datos.gov.co`'s own sync catches up — no code change can make that happen sooner.

## No-deadline hide rule extended to admin surfaces that cost real money (2026-09-05)

Follow-up to the no-submission-deadline hide rule above: the user confirmed it works correctly on the public feed, then asked for the same hide to also apply in the admin "项目管理" (tender management) list — the reasoning being that translating a hidden tender's title or running document analysis on it spends real money (Anthropic API calls) on something that might turn out to have no real opportunity left at all; better to hold off until it either resolves a real deadline or gets cleaned up.

Extracted the existing inline check into an exported `isHiddenColombiaNoDeadline(country, submissionDeadline)` (`lib/db/tenders.ts`) so `fetchAllTendersFromDb()` (public) and `fetchAdminTenderListFromDb()` (admin "项目管理") now share the exact same rule — `fetchAdminTenderListFromDb()` previously had NO filters at all by design ("every tender, regardless of relevance tier — this is the admin's full inventory"), so this is a deliberate, explicit exception to that. Also applied to `translateAllTenders()` (`lib/ingestion/translate-all-tenders.ts`, backing both `npm run translate:tenders` and the admin "翻译所有标题" button) — its candidate query now also excludes these rows, so a hidden Colombia tender never gets a real, billed translation call spent on it.

Still open, needs the user's input before implementing:
- The user also named "导入分析结果页" as a second surface to gate — `app/admin/import-analysis/page.tsx` matches that literal title, but it's a JSON-upload-and-merge tool with no DB-side candidate query to filter (an admin decides which tenders to analyze entirely offline, before uploading the resulting JSON here) — there's no natural hook to exclude anything at that page. Need to confirm whether the user actually means that page, or the "待补文件" worklist (`fetchTendersNeedingDocumentsFromDb`/`DocumentsNeededView.tsx`), which DOES have a real candidate query and would actually stop surfacing these tenders as needing document attention.
- The user also asked for auto-delete after "2 个月" for a Colombia tender that never gets a real deadline — genuinely ambiguous which date this counts from (publication date — matching `scripts/purge-old-tenders.ts`'s own existing "N months since publication" convention — vs. some "first observed with no deadline" timestamp this schema doesn't currently track at all). Deletion is destructive; not building it until this is confirmed.

**Both open questions answered, both implemented**:

1. "导入分析结果页" meant the "待补文件" worklist (`fetchTendersNeedingDocumentsFromDb`/`DocumentsNeededView.tsx`), not the JSON-merge page — added the same `isHiddenColombiaNoDeadline()` filter there too, right alongside the existing awarded/cancelled exclusion (same "已经决定了，别浪费功夫" reasoning, added the same day for a different signal).
2. The 2-month auto-delete counts from `publication_date` — matching `scripts/purge-old-tenders.ts`'s own existing convention rather than introducing a new "first observed with no deadline" column this schema doesn't have.

New route: `app/api/cron/purge-stale-colombia/route.ts` — same `Bearer CRON_SECRET` auth as the existing `app/api/cron/tender-digest/route.ts`, same tombstone-on-delete pattern as the admin bulk-delete route (so a future re-ingest of the same process doesn't silently resurrect it), chunked at 200. Deletes for real once authorized by default; `?dryRun=true` reports candidates without touching anything, mirroring `purge-old-tenders.ts`'s own default-dry-run posture. **Not yet wired to an actual schedule** — this repo has no `vercel.json` `crons` entry for `tender-digest` either, so that cron's schedule must already be configured directly in the Vercel dashboard; the user needs to add a second Vercel Cron Job pointing at this new route the same way (daily is plenty, given the cutoff itself is 2 months wide).

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean.

## Batch backfill for the key-dates-sync fix (2026-09-05)

`syncKeyDatesForTopLevelFields()` (added earlier the same day) only fires when an admin tender route actually runs — it doesn't retroactively repair a tender whose `tender_key_dates` already drifted from its `publication_date`/`submission_deadline`/`award_date` before the fix landed. Real report: the user has "很多" (many) Colombia tenders showing this exact symptom and can't click "保存修改" on each one by hand.

Added `scripts/backfill-key-dates-sync.ts` (`npm run backfill:key-dates-sync` dry run / `-- --write` to apply) — lists every tender (not scoped to Colombia; the underlying bug applied to any admin-edited tender's dates regardless of country/source) and re-runs the exact same `syncKeyDatesForTopLevelFields()` call the admin routes use, one tender at a time. Safe to run repeatedly — a tender whose key dates already match just gets the same values deleted and re-inserted.

`tsc --noEmit`, `npm run lint` clean (couldn't execute the script itself here — no Supabase network access from this sandbox, same limitation as every other backfill script this session).

## Admin form date fields still felt split across the page (2026-09-05)

The earlier "stop editing the same date in two places" fix (`ae30be7`) confirmed working — but the user's real complaint was broader than just deduplication: 发布日期/投标截止日期 lived up in "时间与预算" while every other key date lived in its own section further down, with an entire unrelated "相关度设置" section sandwiched between them. Checking a tender's dates meant looking in two places split across the page, not one.

Moved 发布日期/投标截止日期/中标信息 (中标日期/中标单位/中标金额) out of "时间与预算" into the "关键日期" `FormSection` — same section that already hosts `KeyDatesEditor`'s other key-date types — so every date-shaped field now lives in one place, in page order, with nothing else between them. "相关度设置" now comes AFTER this merged section instead of between the two date groups. "时间与预算" keeps 状态/预估金额/币种/地点 only.

`发布日期`/`投标截止日期`/中标信息 stay visible even when creating a brand-new tender (`isEdit` false) — `publicationDate` is required there too, and these are plain form fields bound to `form`/`update()`, not `KeyDatesEditor`'s own API calls. `KeyDatesEditor` itself still only renders in edit mode, now nested inside the same `FormSection` (below a divider) instead of being its own separate section — it needs a real tender id to call its own CRUD API against, which a new, unsaved tender doesn't have yet.

101/101 fixtures unaffected (pure form layout, no logic touched). `tsc --noEmit`, `npm run lint` clean.

Follow-up, same conversation: the 中标信息 block (中标日期/中标单位/中标金额) was still conditionally rendered — only shown once `status === "awarded"` or one of the three fields already had a value — so an admin who wanted to manually record a real award result for a tender not yet marked awarded had nowhere to type it at all, a real gap the user hit immediately on a Mexico Proyectos Estratégicos tender. Made it unconditionally visible, same as 发布日期/投标截止日期 right above it — filling it in doesn't itself flip 状态 (still a separate dropdown), it's just no longer hidden behind it.

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint` clean.

## "添加新项目" was missing whole sections that "编辑项目" had (2026-09-06)

Real complaint after the date-consolidation work above: the create form (`isEdit === false`) cut off after "采购与分类"/关键日期, looking incomplete compared to the edit form — three whole `FormSection`s (相关度设置, 标书分析结果, and the `documentsUnavailable` checkbox inside 来源信息) were unconditionally hidden behind `{isEdit && (...)}`.

Split these into two groups rather than blanket-removing the gate:

- **相关度设置** and the `documentsUnavailable` checkbox are plain columns with no dependency on a persisted tender id — un-gated outright, now shown on both create and edit. `app/api/admin/tenders/route.ts` (POST) previously ignored any `relevanceTier`/`relevanceManuallyOverridden` the client sent and always used `classifyRelevance()`'s own guess — extended it to mirror the PATCH route's existing behavior: when an admin manually picks a tier at creation time, honor it (writing the same `MANUAL_OVERRIDE_REASON` the edit route already uses) instead of silently overwriting it a moment later; `documentsUnavailable` is now also persisted on insert (previously dropped).
- **标书分析结果** (RequirementsEditor/RisksEditor) and `KeyDatesEditor`'s "其他关键日期" list have a real, unavoidable dependency — they save directly to `/api/admin/tenders/{slug}/requirements|risks|key-dates`, which needs an id that doesn't exist until the row is inserted. Rather than hide the whole "标书分析结果" section (which was the actual complaint — it looked missing, not "intentionally absent"), it now always renders with an explanatory placeholder in create mode instead of the editors themselves, so the block is visibly present and an admin knows why it isn't interactive yet.

Also changed `handleSubmit`'s post-create redirect from `/admin/tenders` (the list) to `/admin/tenders/${slug}` (the new tender's own edit page) — since 标书分析结果/其他关键日期 only become usable in edit mode, sending the admin straight there means those sections are live immediately after clicking "创建项目", with no extra manual navigation back in. Editing an existing tender is unchanged (still returns to the list after "保存修改").

101/101 fixtures unaffected (pure form/route wiring, no relevance logic touched). `tsc --noEmit`, `npm run lint` clean.

## Added `oneLineSummary` — a one-line "what is this tender" summary from document analysis (2026-09-06)

Explicit user request: alongside qualifications/experienceRequirements/requiredDocuments/risks, Layer 2 document analysis (`lib/ingestion/extract-requirements.ts`) now also produces `oneLineSummary` — one Chinese sentence, at most 30 characters, stating what the tender concretely IS (e.g. "为地铁3号线采购120台安检机"), not a category label or a boilerplate opener. Shown on the public tender page (`TenderDetailView.tsx`) directly above 资质要求, and editable in the admin form (`AdminTenderForm.tsx`'s "标书分析结果" section, same position — right above the 资质要求 sub-block) since it's a plain `tenders.one_line_summary` column, distinct from the existing `summary` column (a longer, source-derived paraphrase populated at ingest time, before any document has been analyzed).

Threaded through every extraction path that shares `ExtractionSchema`/`SYSTEM_PROMPT` (`extract-requirements.ts` itself, and `extract-requirements-qwen-anthropic.ts` which reuses it unchanged) via the schema/prompt/`JSON_SHAPE_INSTRUCTIONS` update; the two providers with their own hand-rolled prompt/schema (`extract-requirements-qwen.ts`'s OpenAI-compat system message, `extract-requirements-gemini.ts`'s `RESPONSE_SCHEMA`) were updated to match so a provider comparison still asks every provider the same question. `mergeExtractions()` (chunked-PDF/multi-document merge) takes the first chunk/document with a non-empty `oneLineSummary` rather than concatenating one per chunk — a document's front matter is the likeliest place to actually state what it is.

Migration `0022_tender_one_line_summary.sql` adds the nullable `tenders.one_line_summary` column. All three write paths that persist an extraction's `qualifications`/`risks` today (`analyzeUploadedDocument()` behind the admin upload page, `scripts/extract-tender-document.ts`'s CLI, `importBatchAnalysis()` behind `npm run import:batch-analysis`/the admin JSON-merge page) now also write it — only when non-empty, so a degraded extraction (e.g. a scanned page falling back to text-only) can't blank out a good summary a previous run already wrote for the same tender. `lib/db/tenders.ts` selects/maps the new column for every tender fetch (it's cheap — a short text column, no reason to special-case it out of the existing list select the way qualifications/keyDates/risks are).

101/101 fixtures unaffected (extraction-schema/UI/DB wiring only, no relevance logic touched). `tsc --noEmit`, `npm run lint` clean. NOT live-tested against a real document — same sandbox network limitation as every other extraction change this session (no ANTHROPIC_API_KEY/network access here); run `npm run extract:document` against a real PDF to confirm the model actually respects the ≤30-character instruction in practice, not just that the schema validates.

Separate, unrelated bug found and fixed while touching `app/api/admin/tenders/[slug]/route.ts` for the above: `UpdateTenderBody` has accepted `awardedValue` since the awarded_value column was added, but the PATCH handler's `row` object never actually included `awarded_value` — every 中标金额 edit from the admin form was silently dropped, and only 中标日期/中标单位 were ever actually saved. Fixed alongside `one_line_summary` in the same `row` object edit.

## 一句话总结 section now always renders on the public page (2026-09-06)

Follow-up to the `oneLineSummary` feature above: the user pointed out the public detail page hid the whole section when a tender hadn't been analyzed yet, which is inconsistent with 资质要求/经验要求/所需文件 — those three always render, showing the shared "本项目未列出相关内容。" placeholder (`uiText.noneListed`) instead of disappearing. `TenderDetailView.tsx` now does the same: the section always renders via `DetailSectionHeading` (added `uiText.oneLineSummary` for its title), showing the highlighted summary card when `tender.oneLineSummary` is set, or the placeholder otherwise.

## Batch document analysis — select up to 5 tenders at once (2026-09-06)

`/admin/documents-needed` only let an admin analyze one tender's document at a time — expand a row, pick a file, submit, repeat. User asked for the ability to select several projects and upload/analyze them together instead of one-by-one.

Added a checkbox column to the worklist table (`DocumentsNeededView.tsx`), capped at 5 selections at once (`MAX_BATCH_SELECTION`, exported from the new `BatchAnalyzeDocumentForm.tsx` so the cap lives in one place) — trying to check a 6th shows an alert instead of silently no-opping. Once ≥1 tender is selected, a batch panel renders above the table: one file input per selected tender (tenders without a chosen file are skipped, not blocked — no need to have all 5 files ready before starting), a shared "写入 Supabase" checkbox, and one submit button that calls the existing single-file `/api/admin/analyze-document` endpoint once per tender **sequentially** (not `Promise.all`) — each call is a real LLM spend and can take up to a couple of minutes on a large/scanned doc, so firing them one at a time keeps per-tender progress ("分析中…" → "已写入 — <summary>" / error) legible in the UI rather than looking frozen. A tender is dropped from both the worklist and the selection the moment its analysis is actually written (`status === "written"`), without waiting on `router.refresh()` to re-fetch — same UX the single-tender flow's `onDone` was already going for, just made to actually happen client-side immediately.

The original per-row "上传分析" single-file flow (`AnalyzeDocumentForm.tsx`, expand-in-place) is unchanged and still there for the common one-off case — the batch panel is additive, not a replacement.

Also removed, per explicit user request: the "即使已有精度分析（claude-opus-5）结果，也强制覆盖" checkbox from `AnalyzeDocumentForm.tsx` (and never added it to the new batch form). `force` is no longer sent from either UI form — `/api/admin/analyze-document`'s `form.get("force") === "true"` already defaults to `false` when the field is absent, so this only removes the *admin's* ability to force an overwrite from the browser; `npm run extract:document -- ... --write --force` (CLI) still supports it for the rare case someone genuinely needs to downgrade an existing Opus-5 precision result.

101/101 fixtures unaffected (admin UI only, no relevance/extraction logic touched). `tsc --noEmit`, `npm run lint`, `npm run build` clean. Not live-tested against a real multi-tender upload — same sandbox network limitation as every other change this session.

Follow-up, same day: the per-row "上传分析" button still opened its own single-tender `AnalyzeDocumentForm` inline (controlled by a single `openSlug` string), independent of the new checkbox column — so opening a second row's form silently collapsed and discarded the first row's file selection, which is exactly the "one project at a time" behavior the batch feature above was meant to replace. Removed `openSlug` and the inline single-row form entirely; the row button now just calls the same `toggleSelected()` the checkbox does (label switches between "选择上传"/"取消选择"), so there is exactly one selection mechanism and both the checkbox and the button drive the same `selectedSlugs` state that opens `BatchAnalyzeDocumentForm`. `AnalyzeDocumentForm` itself is unchanged and still used for the standalone "手动上传分析（任意项目）" section at the bottom of the page.

Follow-up, same day — the batch feature above still didn't match what the user actually wanted: one file input per selected project meant re-opening the native file dialog once per project, and the earlier per-row inline `AnalyzeDocumentForm` (independent of the checkbox selection) was still there too, confusingly reproducing the "pick one, the other resets" complaint from a *different* code path (a single `openSlug` string, so opening a second row's inline form silently closed the first one — already fixed in the previous commit, but the user was still bumping into leftover per-row-first-open confusion while testing).

Two real changes:
- `BatchAnalyzeDocumentForm` now has one combined `<input type="file" multiple>` at the top of the panel — ctrl/shift-click every document at once in a single native dialog, and they're assigned down the tender list in order (`tenders[0]` gets the first picked file, etc.). Each tender still keeps its own individual file input below for fixing a wrong auto-assignment, but the common case no longer needs the dialog opened once per project.
- Moved the batch panel to render **after** the table (previously above it) and made the standalone "手动上传分析" section at the bottom batch-capable too, since it was pointless on its own once the checkbox flow could already do more — replaced its single-slug `AnalyzeDocumentForm` with an "add up to 5 slugs by hand" input feeding the same `BatchAnalyzeDocumentForm` (now generalized to accept `{slug, title?}` — title is only shown when known, i.e. for tenders picked from the worklist table; manually-typed slugs just show the slug, since there's no local title to display for a tender that might not even be in this page's list). `AnalyzeDocumentForm.tsx` had zero remaining consumers after this and was deleted.

101/101 fixtures unaffected (admin UI only). `tsc --noEmit`, `npm run lint`, `npm run build` clean.

Follow-up, same day — the real workflow the user was testing turned out to be different from what the last two commits built: `dof-5797664`'s own document package is actually two separate PDFs (the main Pliego de Requisitos plus an Anexo 2 with technical specs) for the SAME tender, not two different tenders. The "distribute N files across N selected tenders in order" bulk picker was solving the wrong problem — and having both that global picker AND a per-tender single-file input was confusing on top of that (the user's own words: 有多选，又有单选，这两个重复).

Real fix, in both layers:
- **Backend** (`analyze-uploaded-document.ts`): `analyzeUploadedDocument()` now takes an array of files instead of one. Each file is intake+extracted independently (a scanned Anexo and a text-layer Pliego can legitimately route to different models), then merged with the same `mergeExtractions()` chunked-PDF extraction already uses, and written ONCE — calling the old single-file version twice for the same tender would have the second call's delete-then-insert silently replace the first's results instead of combining them, which is exactly the bug this replaces. `relevanceAssessment` isn't one of the five fields `mergeExtractions()` merges, so it's picked separately (first file whose own extraction returned one). `/api/admin/analyze-document/route.ts` now reads `form.getAll("file")` instead of `form.get("file")`, validating every file individually; the pre-parse content-length cap became `MAX_UPLOAD_BYTES * 5` (still `MAX_UPLOAD_BYTES` per individual file after parsing).
- **Frontend** (`BatchAnalyzeDocumentForm.tsx`): removed the global cross-tender bulk picker entirely. Each tender row now has its own single "上传（可多选）" button — a `<input type="file" multiple>` scoped to just that tender — and the chosen files render as a removable chip list read from React state (`files: Record<string, File[]>`), not from the native input's own single-filename display, which was the actual cause of "看不到文件被选" (the bulk picker's assignment to a DIFFERENT input's underlying state can never update that other input's own browser-rendered filename — an uncontrolled-element ceiling, not a data bug). One input, one visible result, one project at a time or several — no more parallel multi-select/single-select mechanisms.

101/101 fixtures unaffected. `tsc --noEmit`, `npm run lint`, `npm run build` clean. Not live-tested against a real multi-document tender — same sandbox network limitation as every other change this session; worth specifically confirming that analyzing dof-5797664 with both its PDFs selected together produces a merged result (i.e. requirement counts reflecting content from both documents, not just one).

## 2026-09-06 — Hardening the multi-document upload write path

A review pass over the multi-file analysis flow (`1050a99`) found three
ways it could report success while losing data, plus three cheaper
problems. All fixed together, since they all live in the same write path.

**Every Supabase write was unchecked.** supabase-js returns `{ error }`
rather than throwing, and none of the eight writes in
`analyzeUploadedDocument()` looked at it. A failed insert still returned
`status: "written"`, and the admin UI reported 已写入 with a requirement
count for data that never landed. Every write now goes through
`assertWritten()`, which throws with the failing field named in Chinese.

**Worse, the requirements/risks write is a delete-then-insert.** Combined
with the above, one failed insert didn't just skip the update — it left
the tender with *nothing* where a good previous analysis had been, and
said it succeeded. Two changes: the insert rows are now built before the
delete runs, and an extraction that produced zero requirements AND zero
risks (a failed OCR route, a model returning 0/0/0/0 on a scanned page)
now skips the delete entirely and reports a warning, on the same
reasoning as the existing "don't blank a good `one_line_summary` with an
empty one" guard. An empty result is never worth more than what's there.

**The `tender_documents` lookup wasn't scoped to the tender.** It matched
`content_hash` across the whole table, but `content_hash` is not unique
across tenders and genuinely repeats: a buyer's standard "Anexo formatos"
boilerplate is byte-identical in every tender it appears in. The effect
was that such a file, already on record for tender A, made this upload
update *A's* row while tender B never got one — and A's opus-precision
result blocked B's entire batch. Now `.eq("tender_id", tenderId)`.
(`scripts/ingest-tender-documents.ts` and
`scripts/extract-tender-document.ts` have the same unscoped lookup, and
theirs additionally uses `.maybeSingle()` on a non-unique column, which
errors outright once two rows share a hash. Not touched here — separate
scripts, separate change.)

Also in the same pass:

- **Temp file names are `basename()`d.** They came straight from the
  multipart body's own filename; `join(tempDir, "../../…")` would have
  written, and then unlinked, outside the temp directory.
- **Duplicate files are deduped on content hash before extraction**, so
  picking the same PDF twice in one upload no longer pays for two
  identical model calls and inserts two rows for it.
- **One failed file no longer discards the whole batch.** Extractions
  already paid for in the same run are kept and written; the failure
  becomes a warning. Only an all-files-failed batch throws.
- **Warnings are a first-class part of the result.** The one that matters
  most: when the uploaded files state *different* procedure numbers, the
  admin almost certainly attached another tender's document, and nothing
  downstream would have caught it.
- `documentType` and `relevanceAssessment` no longer just take file #1.
  Types are joined; the assessment comes from the longest document, which
  in a real package is the Pliego/Convocatoria — the one that actually
  states who may participate. Upload order is meaningless here.
- The route caps files per request (`MAX_FILES_PER_REQUEST`); nothing
  else limited how many real LLM calls one request could trigger.

## 2026-09-06 — Rendering modes were never set (and the default was wrong)

Unrelated to ingestion, found in the same pass and worth recording here
because it silently undid ingestion's own results: a real `next build`
route table showed `○ /`, `○ /tenders` and `○ /admin/documents-needed` —
all three **prerendered at build time with no revalidation**. None of
them uses a request-time API (tender data is read through a service-role
client, and auth is client-side), so Next's default made them fully
static, permanently.

The consequence: every tender this pipeline ingested after a deploy was
invisible on the public list and the homepage until the next deploy,
while `/tenders/[slug]` — dynamic, because it takes a route param — showed
the fresh row. The list and the detail page disagreed, and the admin
worklist at `/admin/documents-needed` was a deploy-time snapshot that
`router.refresh()` could never update.

`/` and `/tenders` are now `export const revalidate = 300` (still cached,
which is right for an unbounded full-table query identical for every
visitor — just with a lifetime well under the real ingestion rate), and
`/admin/documents-needed` is `force-dynamic` like every other admin page.
The homepage additionally fetched full detail for its featured + ticker
picks one slug at a time — 13 separate joined queries at the default
counts, on top of the full-table read in the same render — now a single
`fetchTendersBySlugsFromDb()`.

## 2026-09-06 — One auth request per tender card

A real Network panel capture of `/tenders` (the user's, not a synthetic
one) showed the actual browsing-speed problem, and it was not payload:
the RSC document was only 40.9 kB. It was a staircase of ~30 identical
`/auth/v1/user` requests, ~1 kB each, ~80 ms apart, all attributed to
`lib/auth.ts`.

`useUser()` ran `supabase.auth.getUser()` — a real round-trip to the auth
server every call, unlike `getSession()`, which reads local storage — in
a per-instance `useEffect`. `SaveTenderButton` calls it, and renders once
per tender card; `/tenders` shows 28 per page. So every visit opened 28+
identical requests that the browser's per-host connection limit then
serialised into a multi-second stall before any bookmark button knew
whether the visitor was signed in.

Both `useUser()` and `useSavedTenderIds()`/`useSavedSearches()` now read
from one module-level store via `useSyncExternalStore`, keeping their
call-site APIs unchanged. The saved-tenders one also fixes a genuine bug:
each instance held its own copy of the list, so toggling a bookmark
updated only the button that was clicked, while the saved-reminder list
further down the same page kept showing the pre-click state until it
remounted.

### Follow-up: the same shape, one layer up

The shared-store fix took `/tenders` from ~30 `/auth/v1/user` requests to
one, and that exposed the next instance of the same pattern: three
`/api/admin/whoami` requests per page load from `AuthNav`.

Supabase reports the same signed-in user more than once by design —
`getUser()` resolves, then `onAuthStateChange` delivers
`INITIAL_SESSION`, then `TOKEN_REFRESHED` arrives roughly hourly — and
each delivery carries a **new user object**. Any consumer with a
`[user]` effect dependency therefore refetches on every delivery for a
user whose identity never changed. The store now emits only when the user
id or the loading flag actually changes, and `AuthNav` keys its effect on
`user?.id` rather than the object.

Not a bug, recorded so it isn't re-investigated: three `POST
/api/analytics/events` in one capture is `AnalyticsTracker` doing its
job. It is mounted once in the root layout and guards on pathname, so
three events means three paths were visited — client-side navigation
doesn't clear the Network log.

## 2026-09-06 — Full-codebase audit: what was fixed

A systematic pass over the whole app (code quality, performance,
responsive, security/robustness). Recording the findings that were acted
on, and the two that were not.

**The admin Supabase client was not necessarily an admin client.**
`createSupabaseAdminClient()` fell back to the anon key when
`SUPABASE_SERVICE_ROLE_KEY` was unset. All ~60 of its callers are writers
(every `/api/admin` route, both cron routes, every ingestion script), so
their writes silently ran as `anon`. Two call sites had already grown a
hand-rolled `&& process.env.SUPABASE_SERVICE_ROLE_KEY` check to work
around it, which is the tell. It is now service-role-or-null; the anon
fallback lives in a separate `createSupabaseReadClient()` used only by the
two public read paths, which preserves the "browsable with only
NEXT_PUBLIC_* vars" property that fallback actually existed for.

**Two more delete-then-insert sites had the unchecked-write shape** fixed
earlier in `analyze-uploaded-document.ts`: `import-batch-analysis.ts` and
`upsert-tenders.ts` (key dates). `assertWritten()` now lives in
`lib/db/assert-written.ts` and covers all three. The batch importer also
gained `skipped-empty` (an all-empty extraction no longer wipes a good
previous result) and `failed` (a write error reports itself per tender
instead of aborting the batch or claiming success). `app/account/page.tsx`
showed users "已保存" whether or not their profile update succeeded.

**There were no error boundaries at all.** Any throw in a Server Component
reached production users as Next's bare "Application error". Added
`app/error.tsx` (with `reset()` and the server-side digest, which is the
only handle on a stack Next withholds from the browser),
`app/global-error.tsx` (self-contained, since the root layout is what
failed), and a site-wide `app/not-found.tsx`.

**Static assets were 2.8 MB; they are now 100 KB.** `app/favicon.ico` was
361 KB — six uncompressed BMP entries up to 256×256, loaded on every page
— re-encoded as PNG-in-ICO at 16/32/48 from the same artwork (5.7 KB).
The brand mark renders at 40 CSS px but shipped as a 1254×1254 PNG per
variant (661 KB / 546 KB) → 320px WebP (11.4 KB / 10.5 KB). The hero
background: 1.59 MB PNG → 65 KB WebP.

**Dead code removed:** `lib/pricing.ts` in full (`PRICING_TIERS` had zero
references — `/pricing` hardcodes its own content), the `csv-parse`
dependency (zero references), and five unreferenced Next scaffolding SVGs.

Two things deliberately NOT changed, with reasons:

- `proxy.ts` runs `supabase.auth.getUser()` — a real round-trip — on every
  matched request. That is the standard Supabase SSR pattern and it is the
  fixed cost of every page's TTFB, but narrowing the matcher risks
  silently expiring sessions. Not worth the trade without a measurement
  showing it matters.
- `relevance_reason` is fetched for every row and rendered nowhere, but
  `toRelevance()` uses its presence as the condition for falling back to
  `classifyRelevance()`. Dropping it from the list select would silently
  change tier results, so it needs that condition rewritten first.

### Rate limiting the one unauthenticated write path

`/api/analytics/events` validated the shape of every event carefully but
never limited how many arrived — it is the only endpoint in the app that
writes to Supabase without authentication, so a loop could insert
unbounded rows into `analytics_events` and run up the project's quota.

`bot-protection.ts` already had a sliding-window limiter, scoped to
`/tenders*`. It moved to `lib/security/rate-limit.ts` and both callers now
share it (60/minute per address for events, the existing 40 for tender
pages). The events endpoint answers 202, not 429: the client is
fire-and-forget and ignores the response either way, and analytics is the
one kind of data where dropping some beats paying for all of it.

The limiter's counters are per-process, so they reset on cold start and
are not shared across serverless instances — it blunts one script from one
address, not a distributed flood. That is the seam to swap for a shared
store if real abuse ever appears.

### Gemini removed as a provider (2026-09-06)

Per the user's decision that Gemini won't be used going forward, both
implementations (`extract-requirements-gemini.ts`,
`translate-titles-gemini.ts` — 172 lines) and the `@google/genai`
dependency are gone, along with the `gemini` option in
`scripts/analyze-batch.ts` and the two `compare-*-providers.ts` scripts,
and `GEMINI_API_KEY` from `.env.example`.

Worth knowing what this cost: those comparison scripts exist to make a
provider choice defensible on real documents rather than on vendor
claims, and Gemini was the only other provider besides Claude that read
a PDF natively rather than through locally-extracted text — the
asymmetry `compare-extraction-providers.ts` documents. The remaining
comparison is Claude vs Qwen (both DashScope paths). If a native-PDF
alternative to Claude is ever needed again, this is what would have to
be rebuilt.

`@google/genai` was also the single largest dependency in the tree
(11 MB, plus 3.2 MB of protobufjs) and carried two of the four install
scripts npm warns about on a fresh `npm i`.

### xlsx upgrade verified (2026-09-06)

`xlsx` moved to 0.20.3 from the SheetJS CDN (`npm audit` had it at HIGH:
prototype pollution GHSA-4r6h-8v6p-xvw6 and ReDoS GHSA-5pgg-2g8v-p4x9,
with no fix published to npm — SheetJS stopped publishing there). The
lockfile pins it by version plus an SRI integrity hash, so installs still
verify the tarball.

Verified against the real `.xlsb` fixture
(`__fixtures__/sample-ecopetrol-contratacion.xlsb`) rather than assumed:
`npm run ingest:ecopetrol-contracts -- --fixture` produces byte-identical
mapped output on 0.20.3 and 0.18.5 — same 3/3 rows, same slugs, tender
numbers, award dates and values. The connector only uses `XLSX.read`,
`utils.sheet_to_json`, `SheetNames` and `Sheets`, none of which changed
between those versions.

One consequence to know about: `npm ci` now fetches from
cdn.sheetjs.com, so a build environment that can't reach that host fails
at install (this is not hypothetical — the sandbox this was developed in
blocks it). If that ever bites, vendor the tarball into the repo and
point package.json at a local path.

## Extraction routing now reads the tender's scale tag (2026-09-07)

**What changed**: `chooseExtractionModel()` in `lib/ingestion/extraction-routing.ts` is now the single place that decides which model reads a document, and both callers — the admin upload flow (`analyze-uploaded-document.ts`) and the CLI (`scripts/extract-tender-document.ts`) — go through it, so a dry run and the real write can no longer disagree about the model.

Two questions, in this order:

1. **Does the file have a real text layer?** No → `claude-haiku-4-5-20251001`, regardless of the tender's value. Unchanged, and deliberately not negotiable on scale: Haiku is the only provider confirmed here to read image-only pages, and routing scanned documents to it is also what sidesteps the still-unresolved DashScope chunked-PDF gap documented above (a document needing chunking never reaches the Qwen path).
2. **Only then, what is the tender's `relevance_tier`?** `flagship` (大型项目) → `qwen3.6-plus`; `significant` (中型) and `standard` (常规) → `qwen3.5-plus`, which stays the default for everything else. An absent tier routes as not-flagship — the cheaper model is the right default when the scale is unknown.

The tier read is the one stored on the tender row, which includes an admin's manual override, so the model that produced an extraction always matches the label the tender is filed under in the product.

**Migration required**: `0028_extraction_model_qwen36.sql` adds `qwen3.6-plus` to `tender_documents.extraction_model`'s CHECK constraint. Without it the first flagship analysis fails at write time — *after* the model call has been paid for. `qwen3.6-plus` itself is not new to the codebase (`translate-titles-qwen.ts` has used it since 2026-09-03, and both comparison scripts already offer it); only this constraint had never been widened for it.

**Also fixed in passing**: `analyze-uploaded-document.ts` resolved the tender *after* the dry-run return, so a mistyped slug ran every extraction in the upload and only then failed. The lookup now happens before the first model call.

**Not changed**: a flagship tender whose document is a scan still goes to Haiku (rule 1 wins). Whether a 大型项目 deserves a stronger *scanned*-document model too is a separate question and nobody has asked for it.


## Keeping ingestion and reclassify in step (2026-09-07)

Two code paths classify a tender: the mappers at ingestion, and
`reclassify-tenders.ts` re-running today's rules over what is already stored.
They must reach the same verdict for the same tender, or a re-import silently
disagrees with an export that was just reviewed and signed off.

They already had not: `reclassify-tenders.ts` was not selecting
`government_level` at all when that field became a classification input. The
guard against a repeat is the type, not vigilance — `governmentLevel` is a
REQUIRED field on `classifyRelevance`'s input, and undefined has to be written
out, so a call site that forgets it does not compile. Making it required is
what enumerated all nineteen call sites, including the admin API, the bundled
mock data and `lib/db/tenders.ts`'s own fallback. Any future classification
input should be added the same way.

`explain-kept.ts` counts as a third path and gets the same treatment: it reads
`scope_type` and `government_level` out of the export rather than assuming
them. Both were assumed once, and both times the diagnostic disagreed with the
classifier it was supposed to explain.

Three differences remain, all deliberate:

- Ingestion skips slugs in `tender_manual_deletions`; reclassify does not (it
  only ever removes, never inserts).
- Ingestion leaves `relevance_manually_overridden` rows alone, and so does
  reclassify.
- ~~`structuredDurationDays` reaches `classifyRelevance` only at ingestion.~~
  Fixed the next day — see the 2026-09-08 section below. It had no column to
  live in, which is why it read as unreachable; migration 0029 gave it one.


## One classifier entry point, and the 193 → 486 incident (2026-09-08)

The section above was right about the shape of the problem and wrong about how
far it went. `government_level` was not the only input the two paths disagreed
on, and requiring one field did not make the next one safe.

The user deleted awarded/closed/cancelled tenders down to 193 rows, imported a
day of new data, and landed on 486. Their reading was that the filters were not
running on import at all. They were running — the import log's own
`Skipping 493 excluded` says so — but on different inputs.

**Root cause: not one of the thirteen mappers passed `country`.**
`reclassify-tenders.ts` did. Several rules branch on it, the Mexico
undisclosed-value gate among them, so that gate fired when reclassify recomputed
a row and never when a mapper first classified it. `reclassify --write` deleted
623 rows on rules the next import did not apply, and the same rows came back.
Confirmed on the user's own screenshot titles: `REHABILITACIÓN DE AGUA POTABLE
EN ATOLINGA`, `PAVIMENTACIÓN CON CONCRETO HIDRÁULICO` and `REHABILITACIÓN DE LA
PTAR CHAHUÉ` were `standard` with country absent and are `excluded` with it.

Five smaller mismatches were found in the same pass, each the same kind of
mistake — classifying against something other than what the row stores:

- Three different industry haystacks. `compranet5` used title+summary,
  `compras-mx-contracts` added `Descripción Ramo`, `ocds` added the item
  classification description — while reclassify used title+summary+buyer.
- `ocds-mapper` classified `tender.description` but stored
  `description ?? title`, so a record with no description was classified on
  less text than it kept.
- `dof`, `dof-search`, `licitia-vigente`, `pemex`, `peru-oece` and both
  `ecopetrol` mappers passed no summary at all, yet all seven store one.
- `proyectos-estrategicos` set the national-priority flag itself, while
  reclassify could only infer it from `source_name` — a string written out
  in three files.
- Colombia's contract duration had no column, so reclassify read it back as
  absent and quietly demoted those rows. Duration ≥ 360 days is one of the
  disjuncts that promotes to flagship, so this was not only an exclude signal.

**The fix is one function, not eleven corrections.** `classifyStoredTender()`
in `lib/relevance.ts` takes the fields a row will actually store and returns
both the industry tags and the tier. Every mapper and `reclassify-tenders.ts`
call it. `country` joined `governmentLevel` as a required input for the reason
that section gives — the compiler enumerates the call sites, vigilance does not.
`NATIONAL_PRIORITY_SOURCE_NAME` is exported so the marker string is written
once. Migration 0029 adds `tenders.structured_duration_days`, nullable with no
backfill: the value was never stored, NULL already means "unknown" to the
classifier, so no existing row changes tier.

**And a check that does not depend on anyone remembering this.**
`upsertTendersBatched()` re-derives the classification from the fields in the
row it is about to write, compares it to what the mapper produced, and on a
mismatch takes the stored-field answer and warns with the slug and source. It
corrects rather than throws, deliberately: an aborted import helps nobody, and
the stored-field verdict is the one that survives. It runs against real data on
every import, which is what makes it worth more than another fixture.

Verified end to end on production. The three files the user re-imported
excluded 44, 203 and 40 more rows than before — 287, exactly the number
`reclassify --write` had deleted, so the import now stops precisely the set
reclassify would remove. No parity warnings fired. A dry run afterwards
reported `0 of 212 tender(s) would change tier`.

## A village called Puerto Rico (2026-09-08)

Reading the 212-row kept export the user reviewed turned up a rule bug worth
recording, because the mechanism is more general than the two rows it hit.

`PAV CAM LA ANTORCHA - PUERTO RICO` and `PAV DIVERSAS CALLES EN LA LOCALIDAD DE
PUERTO RICO` were **flagship** — the top tier, for paving a village's streets.
Puerto Rico is a village in Municipio Carmen, Campeche, and the bare `puerto`
keyword, meaning seaport, matched the village's name. The same titles in a town
with an ordinary name are excluded. `SUMINISTRO DE ALIMENTOS EN PUERTO
ESCONDIDO` — a catering contract — was flagship on the same mechanism.

`stripKnownFalsePositivePlaceNames()` already existed for exactly this (Puerto
Boyacá, Puerto López, Felipe Carrillo Puerto) and the two towns were added to
it. But that list is always one town behind: Mexico has Vallarta, Escondido,
Peñasco, Ángel and Morelos; Colombia has Boyacá, Berrío, Asís, Gaitán, Carreño,
Colombia and Tejada. Each costs a false flagship before anyone can list it, and
the Colombian corpus is the one that is growing. Per the user's decision the
keyword now asks for port CONTEXT instead:

- `portuari…` and the marine-works nouns stand on their own — no town is
  called that.
- A port NAME counts only with a works verb beside it. Both halves are
  load-bearing. Without the names, `REPARACIÓN DE JUNTAS DE CALZADA EN PSV DEL
  PUERTO ALTAMIRA` stops matching — a fixture the user had set to
  "significant" on 2026-09-07, which a rule aimed at villages would have
  overturned in silence. Without the verb, `SUMINISTRO DE ALIMENTOS EN EL
  PUERTO DE VERACRUZ` is flagship again, because that phrase is also how
  people refer to the city.

`dragado` pairs with a port name rather than standing alone. As a standalone
signal it promoted `DRAGADO DE CONSTRUCCIÓN Y CONFORMACIÓN DE LA PLATAFORMA
NORTE` from standard to flagship, which nobody asked for and which sat badly
beside the user's own call that dredging silt out of a working port is upkeep.

The same reading found `/\bpav\.?\s+cam\.?\b/` whitelisted as a flagship
signal while `PAVIMENTACIÓN CON CONCRETO HIDRÁULICO DEL CAMINO LOCAL` — the
same work spelled out, and a fixture from the user's review of a real export —
was excluded. One job cannot have two tiers depending on whether the clerk
abbreviated it, so the entry is gone. A camino is not a carretera; `carretera`
stays whitelisted and highway work is untouched.

Re-scored against all 212 kept rows, both changes together move 3 rows, all
three the road-paving rows above. 173/173 fixtures, including synthetic
port-vs-place-name controls.

## 2026-09-12 — Colombia's slug destroyed tenders, silently, for months

The user asked a narrow question: "全站有没有重复ID的项目？我刚发现一个".
It turned out to be two unrelated problems wearing the same shirt.

### Mexico: operator error, not a source overlap

26 pairs, every one an `FP-` procedure number sitting under BOTH
`comprasmx-` and `proyectosestrategicos-`. The user diagnosed it themselves —
"我之前导入时选错了数据来源" — and they were right. The two Mexican sources
export a byte-identical file read by an identical reader, so the dropdown is
the only thing that says which portal a file came from, and the two mappers
use different slug prefixes ON PURPOSE. Picking the wrong one therefore does
not update the existing row; it creates a second one, with a different tier
(the Proyectos Estratégicos copy carries `isNationalPriorityProject` and lands
flagship, the Compras MX copy lands standard). Silent and permanent.

`assertSourceMatchesFile()` (`import-new-tenders.ts`) now REFUSES the write
when the file's procedure numbers don't match the selected source —
`FP-` ⇒ Proyectos Estratégicos, `LA-/LO-/IA-/IO-/AA-/AO-` ⇒ Compras MX.
Refused rather than warned, because the person who would read a warning is
the person who just picked the wrong option. The preview is untouched, so a
dry run still shows what the file contains. `npm run purge:mis-sourced`
cleaned the 26 existing pairs (keeping the Proyectos Estratégicos side, which
carries the priority `source_name` and the Chinese title); the user ran it the
same day.

### Colombia: a structural bug in the slug itself

The slug was `secop-${slugify(referencia_del_proceso)}`. **A Colombian
process reference is an entity-local sequence** — every municipality, school
and ministry issues its own LP-001-2026, LP-002-2026, LP-003-2026. Four
collisions were visible in a single screen of real output (`secop-lp-002-2026`,
`-003-`, `-005-`, `-006-`, each carrying two different tenders from two
different buyers). Because the import upserts by slug, the second one written
DESTROYED the first — no error, no log line, no trace. It also poisoned the
slug-keyed block list: deleting one municipality's contract permanently
blocked another municipality's unrelated project from ever being imported.

An audit of all 14 slug schemes found this is Colombia ONLY. Peru
(`peru-${slugify(record.ocid)}` — OCDS ids are global; `peru-oxi-CONV20262698`
— a national serial), DOF (`dof-${codNota}` — a gazette entry id), Pemex
(`pemex-DEE-CAT-B-GCEE-302-105071-26-1` — the number embeds the buying unit)
and the Compras MX family (Mexican numbers embed ramo + unidad compradora) are
all globally unique already.

**The fix**: `buildSecopSlug()` emits `secop-<nit_entidad>-<referencia>`.
What it deliberately does NOT use is `id_del_proceso`, which is globally
unique and was the obvious candidate: the phase-variant copies of one
procurement (`JBB-LP-004-2026` and `JBB-LP-004-2026 (Presentación de oferta)`)
are separate dataset rows with separate `id_del_proceso` values, so keying on
it would have re-opened the duplicate `stripProcessPhaseSuffix()` closed on
2026-09-11. NIT + phase-stripped reference closes both at once: same entity
and same reference collapse, different entities never do. Verified on the real
fixture plus synthetic controls for each of the three properties.

**Re-keying the existing rows** is `scripts/migrate-colombia-slugs.ts`
(`npm run migrate:colombia-slugs`, dry run by default). The new slug can't be
computed from a stored row — nothing in `tenders` carries the entity's NIT —
so each stored `tender_number` is looked up at the source and the right
process picked out of the group that reference returns: tenders match on the
BUYER, block-list entries match on the TITLE (`tender_manual_deletions` keeps
`title.es`, which is the mapper's own Spanish title and compares exactly).
Anything that doesn't resolve to exactly one candidate is reported and left
alone — a wrong re-key would hand one entity's tender the identity of
another's, which is the bug being fixed. Two rows resolving to one new slug is
not an error but the phase-variant duplicate collapsing as designed; the
script keeps the edited row (else the older one) and reports the other rather
than deleting it, because merging two rows' children is a judgement call, not
a migration.

### Two adjacent bugs the same reference-lookup exposed

`fetchSecopProcesosByReference()` capped each batch at `batch.length * 2 + 10`
rows. One reference is used by dozens of entities, so that cap silently
truncated the group — and truncation is not neutral here, because the caller
picks its process out of the returned group: a missing row reads as "this
tender no longer exists at the source." Now paged with a unique `$order`.

`refreshColombiaTenders()` mapped and upserted EVERYTHING that came back from
those lookups. Asking for one tracked tender's LP-002-2026 hands back every
other entity's LP-002-2026, so "refresh what we track" was quietly ingesting
strangers' tenders from outside any discovery window — and before the slug
fix, those strangers landed on OUR slug and overwrote the very tender the
pass was meant to refresh. It now keeps only processes whose slug we already
track. Note the transition state: until the migration has run, that filter
matches nothing and the pass is a no-op (`mappedCount: 0` against a non-zero
`fetchedCount`).

### The count I got wrong

The first version of `check-duplicate-ids.ts` reported "579 条被覆盖" over 60
days. That was inflated: the feed returns the same record many times over (one
municipality's row appeared 15 times in a single 30-day window) and the script
counted those repeats as separate projects. It collapses to distinct
`id_del_proceso` before counting anything now. The real figure is smaller and
still bad. A number that overstates a real problem is still a wrong number.

### Same day, after the migration ran — the "60 collisions" that weren't

The user migrated (40/40 tenders, 100/100 block-list entries re-keyed, 1
unresolvable) and `check:duplicate-ids` immediately reported 60 slugs
"occupied by more than one real project". They were not collisions. Every one
of the 60 groups was the SAME entity, the SAME reference and the SAME title,
differing only in `id_del_proceso` — SECOP II republishes a procurement under
a new id (a new phase, a corrected notice), so `CO1.REQ.11024717` and
`CO1.REQ.10892101` are two versions of one tender, exactly what
`buildSecopSlug()` is meant to collapse.

The bug was in the check, which de-duplicated on `id_del_proceso` — the one
field guaranteed to differ between two versions of one procurement. A
procurement's identity here is its BUYER plus its TITLE, compared in full
(the console truncates titles to 60 characters; two different roads from one
governorate can share that prefix, so the comparison must not). The check
now reports genuine collisions and republished-version groups separately.

The false alarm did expose a real bug next door. `upsertTendersBatched()`
de-duplicates a batch by slug — it must, since Postgres rejects two rows
sharing a conflict key in one statement — and did it "last occurrence wins".
Harmless while one slug only ever meant one source row; wrong the moment a
slug legitimately collects several versions of one tender, because
`fetchSecopProcesos()` returns them `fecha_de_publicacion_del DESC`, so "last"
was the OLDEST version, every time. The stored row would have carried stale
data from a superseded notice. It now keeps the most recently published copy,
ties falling back to last-occurrence so verbatim repeats behave as before.

One block-list entry could not be re-keyed: `secop-lp-005-2026`, whose
reference matches 32 different entities and whose stored title matches none of
them. Left untouched and reported — guessing would block a stranger's tender.
It no longer blocks anything, so if that project reappears in an import it can
simply be deleted again.

### And the last 7 were not collisions either — SECOP truncates titles at 200

With the identity check fixed, 60 reported collisions became 7. Those 7 had a
tell the earlier output could not show: the character position where the two
titles diverge — 179, 188, 184, 158, 196, 183, 179 — and at every one of those
positions the newer copy carried a ragged fragment.

    ...DEPARTAMENTO DE AMAZONAS. (Fase de Selección (P
    ...EN SEDES URBANAS Y RURALES (Presentació
    ...DEPARTAMENTO DE ARAUCA (Fas

Every one of those rows is exactly 200 characters long, to the character.
`nombre_del_procedimiento` is capped at 200 by SECOP, and when a phase label
is what gets cut, its closing parenthesis goes with it.
`stripProcessPhaseSuffix()`'s regex requires a CLOSED parenthetical, so it
left all of them alone.

Two consequences, one of which had nothing to do with duplicate detection:
the ragged fragment was going into the public feed as part of the tender's
title, and it made a republished copy look like a different tender to anything
comparing titles.

`stripTruncatedPhaseSuffix()` now cuts from the first parenthesis that is
never closed, but only when what follows is the beginning of a known phase
label: "(Fas" goes, "(ETAPA", "(Grupo 2" and "(LOTE 3" stay, and a fragment
under three characters is never enough to lose text on. It runs BEFORE the
existing closed-parenthetical loop, since a truncated label is the only thing
that can sit after a complete one ("OBRA (Grupo 2) (Fase de Selecci").

`npm run test:colombia-titles` (22 checks) pins both directions — a phase
label must go, a meaningful parenthetical must stay. This function has now
been wrong twice in two days, both times invisibly, and both times the failure
mode was merging or splitting real tenders.

**Stored rows still carry the ragged titles** until a re-import or a refresh
re-maps them; nothing retroactively rewrites what is already in the table.

## 2026-09-12 — the first ingestion that runs without anybody clicking

Until today not one ingestion step in this project ran on its own. Every
tender in the database is there because a person clicked a button. The gap
that matters is not the clicking: **a source this platform stops reading looks
exactly like a source with no new tenders**, and Colombia's feed is thin enough
(about 11% of published licitaciones survive the relevance rules) that the
difference is invisible from the outside.

Two of the automatable sources now run on a Vercel schedule, on the pattern
`purge-stale-colombia` already established — Bearer `CRON_SECRET`,
`recordCronHeartbeat`, `reportOpsFailure`, `?dryRun=true` to see what a run
would write without waiting a day to find out.

### `/api/cron/import-colombia` — 04:00 UTC daily

Two passes, both cheap enough for one invocation:

1. **Discover** — `ingestColombia` over a ONE-MONTH publication window. The
   connector applies its own server-side `%icitaci%` filter, so a real 30-day
   window is ~550 rows: a single 1000-row page. A month rather than a day
   because datos.gov.co lags the portal by days — a daily window would miss
   exactly the tenders that arrive late, and re-reading a month costs one
   request.
2. **Refresh** — `refreshColombiaTenders`, which re-reads the tenders we
   ALREADY track, by reference, with no date filter. This is what moves a
   tender to 已中标, fills a deadline SECOP published after we first saw the
   row, and picks up an awarded provider. Discovery alone never updates a
   tender it already has.

Documents are deliberately not fetched (`fetchDocuments: false`): minutes of
work and hundreds of megabytes, against the user's own call that the document
corpus is not worth pulling wholesale. Downloading stays an explicit action on
/admin/documents-needed.

### `/api/cron/import-pemex` — 04:20 UTC daily

PEMEX publishes through seven SharePoint lists, one per subsidiary, each
costing a list fetch plus one attachment request per kept tender (four at a
time). Call it ten seconds a list — which does not fit seven times over in 60
seconds.

So the run takes a TIME BUDGET (42s) rather than a list count, and **the order
rotates by day of year**. Whatever is not reached today leads tomorrow's run,
so no list can be starved by the ones ahead of it — which a fixed order would
do silently, and which is precisely the failure this whole change exists to
prevent. Nothing is lost to a partial run: the recency window is two months
wide, far wider than the few days a full rotation takes. A skipped list is
reported as `ok`, not `failed`; it is the design, not a fault, and a job that
cries wolf daily stops being read.

### What is NOT automated, and why

- **LicitIA** runs, but not on Vercel — see below.
- **Peru OECE** — Vercel's egress IPs are blocked by the source, and this
  project does not work around deliberate blocks.
- **Compras MX export** and **CFE** — anti-automation gated, same standing
  policy.
- **DOF** — needs a session cookie captured by hand.

### Heartbeats are the point

Both jobs are registered in `CRON_JOBS` (`lib/ops/cron-heartbeat.ts`) at 30
hours. That registration is not bookkeeping: these are the first jobs whose
silence would be indistinguishable from a quiet week in the feed, so the
overdue banner on /admin is the only thing that can tell "no new Colombian
tenders" from "we stopped reading Colombia eight days ago".

### `.github/workflows/licitia-daily.yml` — 04:40 UTC daily

LicitIA discovery downloads a 15-lote, ~372k-row bulk corpus and then makes one
detail lookup per newly-discovered procedure; link resolution is one sequential
HTTP request per unresolved tender. Minutes, not seconds — it does not fit a
serverless function's request ceiling at any plan, and its own admin route says
as much ("runs on the admin's own `next dev` server, not a rate-limited
serverless function"). So it runs on a GitHub Actions runner, which has no such
ceiling, against the same Supabase database.

`scripts/licitia-daily.ts` (`npm run licitia:daily`) is the single command the
schedule calls: discovery, then link resolution, then the heartbeat. Both steps
run even if the first fails — link resolution operates on tenders ALREADY in
the database and has nothing to do with whether today's discovery worked — and
the process still exits non-zero if either did, so the run shows red.

Two deliberate details:

- **It does not import `recordCronHeartbeat`.** That module starts with
  `import "server-only"`, which throws outside a Next server runtime, and the
  guard is worth keeping. The write is three lines against a table whose shape
  is already pinned, so duplicating it costs less than weakening that boundary.
  `licitia-daily` is registered in `CRON_JOBS` like the other five, so the
  overdue banner on /admin covers a job running on entirely different infra.
- **A scheduled run always writes; a manual `workflow_dispatch` writes only
  when asked.** The workflow can be exercised end to end before it is trusted.

The excluded-tenders CSV is uploaded as a run artifact (14 days), so what the
relevance rules rejected each day stays reviewable without a local run.

**Setup, one time**: add `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` as repository secrets (Settings → Secrets and
variables → Actions). The service-role key bypasses RLS, so this is the one
place in this project where it lives outside Vercel — worth knowing when
rotating it.

### Same day again — all of it moved off Vercel

The two Vercel cron routes worked (all six schedules registered and ran). They
were removed anyway, on the user's question "能不能不依赖 Vercel，4 个都通过
GitHub?", because for THIS workload a runner beats a serverless function:

- **PEMEX now imports all seven subsidiary lists every day.** As a route it
  ran under a 42-second budget with the list order rotating, so a given
  subsidiary was reached every few days. Nothing was lost — the recency window
  is wider than a rotation — but a tender could sit unimported for days for no
  reason except a request timeout. That constraint is gone, and with it the
  budget and the rotation.
- **One schedule instead of three.** Colombia, PEMEX and LicitIA run as three
  parallel matrix jobs of `.github/workflows/daily-ingest.yml` at 04:00 UTC,
  `fail-fast: false` — a PEMEX outage is not a reason to skip Colombia.
- Logs that outlive the incident, a re-run button, a failure email, and no
  cron-count limit to plan around.

Costs, stated rather than discovered later:

- The Supabase service-role key (which bypasses RLS) now lives in the
  repository's Actions secrets as well as in Vercel. Rotating it means
  rotating it in two places, and a half-rotation shows up as a heartbeat going
  quiet, not as an error.
- GitHub's scheduler is best-effort and can start a run tens of minutes late.
  Irrelevant nightly; the 30-hour `maxAgeHours` already allows for it.
- The public list is cached five minutes and a CLI write cannot invalidate it
  (`lib/cache-tags.ts` says why), so new tenders appear up to five minutes
  after a run. At 04:00 UTC nobody is watching.

Still on Vercel, and correctly so: `tender-digest`,
`subscription-renewal-reminders` and `purge-stale-colombia`. They are short,
they already work, and the first two render and send email inside the Next
runtime — moving them would be a rewrite in exchange for nothing.

Two supporting changes this forced, both worth having on their own:

- **`lib/ops/cron-jobs.ts`** now holds the job registry and the heartbeat
  write, free of `import "server-only"`, so plain `tsx` scripts can record a
  heartbeat without weakening that guard. `lib/ops/cron-heartbeat.ts` keeps
  the guard and the admin banner's staleness query. The first version of
  `scripts/licitia-daily.ts` had duplicated the write inline; it no longer
  does.
- **The admin banner no longer tells everyone to "检查 Vercel Cron 与
  CRON_SECRET".** Each job carries where its schedule lives, and the row says
  it. A monitor that sends you to the wrong console at the moment something is
  broken is worse than one that says nothing.

### A cronograma can be checked against itself (2026-09-13)

Task #34 was "live-validate document key-date extraction", and the first thing
that had to be admitted is that it could not be done as stated. There is no
second source to validate against. For Peru's OECE the bases PDF IS the only
place a bid deadline exists — that is the entire reason the extraction reads
one (migration 0045) — so "check the extracted date against the real date"
has no second operand.

What is available is the schedule's own internal consistency, and for the
failure that actually matters that turns out to be enough.

The failure that matters is not a malformed date. `toCalendarDay()` has
rejected those since it was written, and it is the only check a key date has
ever had. The dangerous input is the date that IS a real calendar day and is
the wrong one: every country here writes `10/09/2026` for 10 September, and a
model that reads it as 9 October returns `2026-10-09` — valid, plausible, and
silently written to `submission_deadline`, which drives 已截止 on the site and
the digest. Nothing downstream can question it.

A day/month swap moves ONE row of the cronograma and leaves the rest where
they were. So it lands the deadline after the opening, or the award before the
bids are due, and `findKeyDateProblems()` (`lib/ingestion/key-date-checks.ts`)
sees it. The message names the corrected reading — "把提交截止的 2026-10-09
改成 2026-09-10 就顺了——标书里的 10/09 是「日/月」" — rather than only reporting
that two dates disagree, which would leave the admin re-reading the whole PDF.

**Consequence is scoped by which date is implicated, not by which check
fired.** An award read after the contract signing is worth saying and changes
nothing else. A submission date the schedule contradicts does not get written
to `submission_deadline` at all: the timeline rows still go in (labelled,
cited, visibly a reading of a document), and the column stays empty, which
falls back to the 45-day window rule. A wrong deadline hides a live tender or
holds an expired one open; an empty one is a guess that looks like a guess.

**Three checks were written and then deliberately deleted**, each because it
fires on correct answers:

- every row on the same day — normal for a Peruvian Adjudicación Simplificada,
  which holds presentación, apertura and otorgamiento de la buena pro together;
- `questions_deadline` after `clarification` — further consultas can be raised
  at the junta itself and answered in a second session. The same goes for
  `site_visit` against either, which is why all three share one rank and are
  never compared with each other, only against the bid deadline;
- a deadline already in the past — this platform imports closed tenders.

This is the same defect class the translation checkers hit twice the day
before (`5/A` flagged as a dropped identifier, `KM.11+420` as a dropped
chainage): a warning that fires on a right answer teaches the reader to ignore
the warning, which costs more than the warning was ever worth.

**`tender_key_dates.source_reference` (migration 0047).** The extraction schema
has always demanded a citation for every date — "página 7, Capítulo II,
Cronograma", the same bar as every requirement and risk — and this table had
nowhere to put it, so it was parsed and dropped. Key dates are where it matters
most: a requirement a customer doubts costs them a phone call, a deadline they
doubt costs them the bid, and a deadline with no citation cannot be checked at
all, only believed. It now shows in the admin 其他关键日期 list (where it also
serves as the marker for "a model read this off a page" — nothing else ever
carries one) and in the review script. Not on the public timeline: that is a
schedule, and page numbers there are noise for a buyer.

**`npm run review:key-dates`** is the instrument. It prints coverage first —
how many tenders got their deadline from a document, and how many still have
none — because that is the number saying whether the feature works, and no
list of flags can show it. Then every schedule that cannot be true, then
`--sample N` for tenders to open by hand.

That last part is not a garnish. Self-consistency is not correctness: a
cronograma read one month late in every single row is internally perfect and
entirely wrong, and no check in this file will ever catch it. Only the PDF
settles that, so the script's last act is to hand over a short list and say so.

`npm run test:key-dates` covers it, 53 checks now — and half of the new ones
assert that a check does NOT fire.

### Closed tenders were never gated at all (2026-09-13)

The user went through the admin list and found three separate piles of rows
nobody can bid on: PEMEX notices from March, April and May; Colombia rows
whose deadline had passed the week before; and Compras MX rows with 交标
dates in 2024 and 2023. They deleted them by hand and asked what happened.

Three causes, and only one of them is a window set too wide.

**1. The recency filter is structurally blind to a whole class of row.**
`filterRecentTenders()` filters on `publicationDate`, and its own comment
said every mapper guarantees a valid one. True — and not the same as every
mapper HAVING one. A source with no publication-date column falls back to
the ingestion timestamp and sets `publicationDateIsEstimated` (LicitIA's
vigente rows with no `publicacion`; Compras MX's manual export, which has no
such column at all). That date is always today, so those rows pass every
window the function will ever be given. The screenshot that made this
obvious: an entire page of rows stamped 发布 2026-09-09 估, deadlines
scattered through 2023 and 2024. **No value of `months` could have stopped
a single one of them.**

**2. A row can close between publication and import.** Colombia's deadlines
sit about a month after publication and datos.gov.co lags the portal by
days, so a nightly run on a one-month window legitimately meets rows whose
deadline was last week. Nothing was misconfigured; the schedule and the
window were both right and the result was still rows nobody can bid on.

**3. The CLI defaults were six months while every other door was one.**
The admin forms default to 1, the scheduled runs to 1 (Colombia) or 2
(PEMEX, LicitIA). But `importPemexLive`, `discoverComprasMxVigente`,
`importNewTenders` and four `scripts/ingest-*.ts` entry points all defaulted
to **6** — the value a caller gets by saying nothing. A plain
`npm run ingest:pemex-live -- --write` reached back six months, which is
exactly where the March rows come from.

**The fix is one gate in one place.** `isPastSubmissionDeadline()` lives in
`recency.ts` and is applied inside `upsertTendersBatched()` — the single
line every import path passes through, cron, CLI and admin button alike.
That placement is the user's standing rule (请一定要保障现在应用的筛选规则，
在我们导入新项目时，一样适用): a rule there cannot be missed by a path that
forgets to call it, and there is one place to read to learn what the rule
is. It is also the only gate that works on a source with no publication
date at all.

Two exemptions, both deliberate:

- **`awarded` is kept.** Its deadline has passed by definition and the award
  result is the reason it exists (the public award-result section is built
  for these). Filtering on the deadline alone would have deleted the entire
  awarded population.
- **A tender due TODAY is imported.** It compares through `platformDay()`,
  the same function `deriveTenderStatus()` uses, so the importer and the
  site agree about the same tender on the same day. An import that rejected
  a tender the site still shows as 招标中 would be its own bug.

Every default is now 1 month — the scheduled runs, the library functions and
the CLI entry points — per the user's rule: 自动跑考虑最近一个月就可以，不用
考虑好几个月. A backfill is a deliberate act and passes `--months`
explicitly. Nothing was wider than the gap between two nightly runs except
to re-read rows already seen.

`npm run purge:closed-tenders` clears what is already stored, dry-run by
default with a CSV. It reports the count **by source** first, because a
source contributing most of them is a source whose mapper or window is the
real problem rather than a pile of rows to delete again next month — and it
reports how many carry an estimated publication date, which is the number
that proves a publication-date cutoff could never have caught them.

**Not fixed here, and worth knowing:** `filterRecentTenders()` still cannot
see estimated-publication rows. That is left alone on purpose — an estimated
date is genuinely unknown rather than wrong, and treating it as old would
throw away live tenders from the two sources that publish no such column.
The deadline is the field that actually answers "can anyone still bid", so
that is what gates the write.

### The batch import path never wrote key dates at all (2026-09-13)

`npm run review:key-dates` answered its first question with **0 of 285**:
not one tender in production had a cronograma read from a document. That is
the value of building the instrument — the feature had been shipped, marked
done, and was producing nothing, and nothing on the site said so.

`analyze-uploaded-document.ts` (the admin upload flow and
`analyze-local-folder.ts`) calls `writeExtractedKeyDates()`.
`import-batch-analysis.ts` — the `analyze:batch` → `import:batch-analysis`
path and the admin 导入分析结果 page, which is how the bulk analyses were
actually run — computed `fields.keyDates` through the same
`toTenderFields()` and then never wrote them. One missing call, in the path
that did all the volume.

It now writes them through the same `writeExtractedKeyDates()`, so both
paths share the fill-never-overwrite rule, the schedule checks and the
citation. Deliberately placed OUTSIDE the "no requirements and no risks
means write nothing" guard: an export that found a cronograma but no
requirements is a real and useful result for Peru, where the deadline is the
entire reason the document is read. Treating it as nothing to write would
have kept dropping exactly the dates this path already lost once. A
key-date failure is reported and never fatal — the requirements and risks in
the same entry are a separate finding and still worth writing.

The result now carries a `keyDates` count and any warnings, and both the CLI
and the admin table show them. A count that was silently zero is a count
that was not being looked at.

### The same field then failed the other half of the pipeline (2026-09-13)

With the write path fixed, the first real run — 5 Peru bases PDFs through
`/admin/documents-needed` — came back **5 of 5 failed**, and not partially:
"没有任何文件分析成功". The requirements and risks were lost too. Two
distinct causes, both introduced by adding `keyDates` to `ExtractionSchema`
and neither caught by anything that existed at the time.

**1. A required key nobody was ever asked for.** `runExtraction()` has two
modes. Claude gets `output_config.format` (structured outputs, the schema
enforced server-side). DashScope's Anthropic-compat endpoint does not —
`useStructuredOutput: false` bypasses it and asks for the JSON shape in the
prompt instead, then parses and validates by hand. That hand path had a
literal list of keys to default to `[]` when a provider omitted them:

```ts
for (const key of ["qualifications", "experienceRequirements", "requiredDocuments", "risks"]) {
```

`keyDates` was added to the schema as a **required** array and added to
neither that list nor `JSON_SHAPE_INSTRUCTIONS`. So the model was never
told to return it, didn't, and `ExtractionSchema.safeParse()` rejected the
whole object:

```
Extraction failed schema validation for peru-ocds-dgv273-seacev3-1249120:
  path: ["keyDates"], expected array, received undefined
```

One missing key threw away a fully successful extraction of everything
else. Four of the five failures were exactly this, on every path the
document took — native PDF, chunked, and the plain-text fallback all
validate through the same function.

The fix is not "add `keyDates` to the list". The list is now **derived from
`ExtractionSchema.shape`** — every field whose Zod type is an array gets
defaulted, so the next array added to the schema cannot repeat this. That
lives in the exported `normalizeRawExtraction()`, which
`extract-requirements-qwen.ts` (the OpenAI-compat comparison path, which had
the identical hole) now also calls. `JSON_SHAPE_INSTRUCTIONS` gained a real
`keyDates` description — defaulting to `[]` only stops the crash; without
asking for the field, this provider would have gone on returning empty
schedules forever, which is the failure that looks like success.
`extract-requirements-qwen.ts` had drifted to its own paraphrase of that
prompt, so it now imports the shared constant instead of carrying a copy.

**2. A size limit the splitter was already sized for, but never saw.**
The fifth failure:

```
400 Exceeded limit on max bytes to request body : 16777216
```

`MAX_CHUNK_BYTES` in `pdf-split.ts` was set to 8MB **specifically** for this
16MB body cap — the comment there names the exact error string. But
`isPdfNativeLimitError()`, the matcher that decides whether to split at all,
tested for `/maximum of \d+ pdf pages/` and
`/request_too_large|exceeds the maximum (size|allowed)/`. DashScope words
this one "Exceeded limit on max bytes to request body", which matches
neither. So the splitter that was built for this limit never ran for it:
the document threw straight out, past the chunking fallback and past the
text fallback both. Matcher widened.

Worth stating plainly: the ceiling was known, documented, and engineered
around — and the code still didn't reach the workaround, because the
recognition step and the mitigation step were written against the error at
different times and never checked against each other.

**Regression coverage** (`npm run test:key-dates`, 61 → 68): every array
field the schema declares is defaulted (derived, so it fails if a new one
is forgotten); a schedule the model *did* return passes through untouched;
a genuinely malformed value still fails loudly rather than being repaired;
a top-level array — a real DashScope response shape — is still rejected;
and `JSON_SHAPE_INSTRUCTIONS` actually contains the key it requires.

### Why both of those cost money to find, and what now stops that

Both bugs above were fully reproducible with no network and no API key. A
provider omitting one key, and a provider wording a size limit differently,
are both just *strings* — nothing about either needed a live model. They
were found instead by a real run over five real Peru documents, which
billed five model calls and produced nothing.

Two things were missing, and both now exist.

**1. The pipeline can be run end to end offline** —
`npm run test:extraction-pipeline` (`scripts/test-extraction-pipeline.ts`).
It drives the real `extractTenderRequirements()` against a stub client that
returns scripted responses and scripted errors, over synthetic PDFs
(`scripts/fixtures/make-pdf.ts` — genuinely valid files, so poppler's
`pdfinfo`/`pdftotext`/`pdfseparate` do real work on them). 35 checks, 0
model calls, 0 cost. It covers:

- a response with no `keyDates` key (**the exact failure**), and one with no
  array keys at all;
- a schedule the model *did* return surviving parse → merge → `toTenderFields`
  with its day, note and citation intact;
- an ambiguous `10/09/2026` being dropped rather than read as October;
- a top-level array and a bad enum still being rejected;
- all three size limits — page count, base64 field length, and DashScope's
  request-body cap (**the second failure**) — reaching the splitter;
- chunking failing over into the text fallback, and that fallback
  overflowing the context window and retrying with less text;
- the per-tier page cap actually sending a smaller document;
- a duplicate cronograma row across a chunk boundary being written once.

Verified the only way a test is worth anything: both bugs were
re-introduced, and the harness named both (`1 schema defaulting`,
`4 请求体上限触发分块`) while the other 32 checks still reported.

What it deliberately does **not** claim: nothing here proves a real model
reads a real cronograma correctly. That is task #34's live check, and no
stub substitutes for it. What it proves is that a *given response* survives
the code — which is the half that was broken.

**2. A batch stops instead of confirming a verdict it already has.**
`lib/ingestion/extraction-failure.ts` splits a failure two ways:

- **systematic** — a property of the code or the account, identical for
  every document: schema/shape rejection, a bad or missing API key, an
  exhausted quota, an unknown model id, a missing poppler binary. The next
  document cannot do better. `analyzeUploadedDocument()` throws on the first
  one, which stops the surrounding batch.
- **document** — a property of *this* file: too large, too many pages,
  corrupt, a context overflow, a 429/529. The next file is a different file.
  Keep going.

Unrecognised failures count as **document**, not systematic: guessing wrong
there costs one extra call, while guessing wrong the other way silently
abandons a batch the user asked for. The gap that leaves —
genuinely-systematic failures this list doesn't name — is covered by
`shouldAbortBatch()`: two consecutive failures with nothing succeeding ends
the run. Two rather than one, because a batch whose first document happens
to be corrupt is ordinary, and stopping over it would be its own waste.

`analyzeLocalFolder()` returns `aborted: { reason, remaining }` when it
stops early, and `LocalBatchAnalysisForm` renders it as a red banner saying
how many tenders were **never attempted and never billed** — a distinction
"3 failed" alone cannot make. That form's result table also gained a 关键日期
column (count, plus the deadline when one was set), since a run that wrote
no schedule at all was previously invisible without opening each tender.

### 31 minutes, nothing to show for it (2026-09-13)

The first run after the circuit breaker landed stopped correctly — 2 tenders
failed, 3 were never attempted and never billed — but the two that ran took
**31 minutes** between them and both ended the same way:

```
「peru-ocds-dgv273-seacev3-1248966__Bases Administrativas.pdf」分析失败，已跳过：Request timed out.
```

That number is not arbitrary. The extraction calls were **non-streaming**,
and for a non-streaming request the Anthropic SDK sets its own timeout —
`_calculateNonstreamingTimeout` in `client.js`: 10 minutes at
`max_tokens: 16000` — then retries a timeout `maxRetries` (default **2**)
more times. One slow document can therefore occupy 30 minutes, and each
attempt may be billed for work the server had in fact done.

The SDK states the rule plainly in the error it raises one notch higher:

> Streaming is required for operations that may take longer than 10 minutes.

A 30-page native PDF at 16,000 max output tokens is squarely that, and this
code was not streaming. Three changes:

1. **Both call sites stream** — `client.messages.stream(...).finalMessage()`.
   Structured outputs are not sacrificed: `stream()` accepts
   `output_config.format` and `finalMessage()` still carries `parsed_output`,
   so the Claude path is unchanged in behaviour. (The DashScope path already
   ran `useStructuredOutput: false` and uses the plain branch.)
2. **`maxRetries: 1`, explicitly.** A retried *timeout* is the least useful
   retry there is: if the provider needs longer than the budget, asking again
   changes nothing and doubles the wait. One retry still covers what is worth
   retrying — 429, 529, a dropped connection.
3. **Elapsed time is printed per call** (`模型调用耗时 N s`). Nobody here knows
   how long DashScope actually needs for a 30-page PDF, and choosing a
   tighter timeout without that measurement is how a legitimate slow
   extraction gets cut off. Two real runs answer it; until then the number is
   measured, not guessed.

And a ceiling on the run itself, not just the call: `BATCH_BUDGET_MS`
(20 minutes) in `extraction-failure.ts`, checked **between** tenders in
`analyzeLocalFolder()`. Between, never mid-call — interrupting a call already
paid for throws away the result and the money both — so the true ceiling is
the budget plus however long the last tender takes, which is what the code
comment says rather than pretending otherwise. The first tender is exempt: a
run that does nothing at all is not a useful way to respect a budget.

**The harness caught this change the moment it was made**, which is the
point of having it: the stub client implements only `stream()`, and
`create()`/`parse()` throw `非流式调用` on purpose. A revert to non-streaming
fails `npm run test:extraction-pipeline` (now 39 checks) instead of being
discovered on the bill.

### 609 seconds — the number that was missing (2026-09-13)

The single-document re-run printed it:

```
peru-ocds-dgv273-seacev3-1248966: 模型调用耗时 609.0s
… 分析失败，已跳过：Request timed out.
```

**609 seconds is 10 minutes.** The model was not failing — we were hanging
up on it. Streaming fixed only half the problem: it lifts the extra
restriction the SDK puts on *non-streaming* calls, but the SDK's
**client-level** default (`opts.timeout = 10 minutes`) applies to streaming
requests just the same, and this code inherited it. `REQUEST_OPTIONS` now
sets the timeout explicitly (20 minutes).

`maxRetries` also drops from 1 to **0**. Every failure actually observed on
this path repeats on a retry — a size limit, a schema mismatch, a provider
slower than the budget — so retrying doubles the wall clock and can be
billed again for work the server already did. That is precisely what turned
one batch into 31 minutes. Transient failures are handled a level up
instead: the document is reported, the batch continues, two in a row stop
the run.

**Correction, same day.** 20 minutes was a number picked without evidence,
and it punishes exactly the documents most worth reading — a 40-page
flagship Convocatoria legitimately takes longer than a 20-page routine one.
The timeout now scales with the tier's own page cap (`requestOptions()`:
`max(20 min, maxPages × 60s)` — 20 min / 30 min / 40 min for standard /
significant / flagship), because that cap is already this platform's
statement of how much document a tender is worth reading. 60s per page is
triple the only real measurement available (30 pages was still working at
609s when the old default cut it off, i.e. more than ~20s/page) — headroom,
not a stopwatch. **Do not tighten it from a failure**: a timeout only ever
proves a lower bound on how long the work takes. Revise it when a
successful run prints a real completion time.

`BATCH_BUDGET_MS` goes from 20 minutes to **an hour** for the same reason: a
run budget that cannot fit one legitimate flagship document is not a budget,
it is a bug. What actually protects against waste is cheaper and sits
elsewhere — `maxRetries: 0` means nothing is attempted three times, and two
consecutive failures end the run. The 31-minute incident was three attempts
at one doomed call, not one call doing real work; those are different
problems and only the first is worth spending a timeout on.

**The second finding is the one that matters more,** and it is not a bug —
it is a design question the measurement exposed. This document has a real
text layer (that is *why* it routed to qwen3.5-plus at all —
`chooseExtractionModel(hasTextLayer: true, …)`), and it is nonetheless sent
as a **native PDF document block**: 30 pages of a file large enough to have
hit DashScope's 16MB request-body cap earlier the same day. Ten-plus minutes
is what uploading and processing that costs.

The contradiction is already written down elsewhere in this file. The Word
branch of `extractTenderRequirements()` reasons: *"unlike a scanned PDF page,
a real Word file is already machine-readable text, so there's nothing
meaningful for native document understanding to add here."* A PDF whose text
layer we verified with `pdftotext` — which is how the model was chosen — is
in the same position, and does not get the same treatment.

The real cost of switching it: `extractPdfText()` runs `pdftotext -q` with
no `-layout`, so a cronograma **table** can come back with its columns
interleaved — and a cronograma table is exactly what task #34 is chasing.
That is a genuine tradeoff, not a free win, so it is not being changed
unilaterally. At ~10 minutes per document, 66 Peru documents is ~11 hours,
so the current path does not scale either.

### 304.8s — Node's own ceiling, hiding under the SDK's (2026-09-13)

Third measurement, same document, SDK timeout now 30 minutes:

```
peru-ocds-dgv273-seacev3-1248966: 模型调用耗时 304.8s
… 分析失败，已跳过：Request timed out.
```

**304.8s is not 30 minutes.** Nothing in this codebase asked for it. It is
Node's built-in `fetch` (undici) hitting its own default **`headersTimeout`
of 300 seconds** — a second ceiling, underneath the SDK's, that no setting
here ever touched.

It also explains the previous number. **609.0s ≈ 2 × 304s**: the same 300s
ceiling hit twice, because `maxRetries` was still 1 at the time. Two
failures, three measurements, one cause — and the SDK timeout, which is what
both earlier commits adjusted, was never the binding constraint at all.

Fixed in `http-dispatcher.ts`, which builds an undici `Agent` whose
`headersTimeout`/`bodyTimeout` match whatever the SDK timeout is for that
call, so there is exactly **one** authority over how long a call may run —
the deliberate, page-scaled, documented one.

Two things about that file are worth stating rather than burying:

- **It reaches the `Agent` class off Node's global dispatcher** instead of
  importing `undici`, which is not a dependency here (and `npm install`
  could not add one from this sandbox anyway). That is a Node internal, so
  every step is guarded and any surprise returns `undefined`, leaving the
  old default behaviour rather than throwing. `npm run test:extraction-
  pipeline` verifies the mechanism against a local server that withholds
  headers for 1.2s: a deliberately 300ms dispatcher **must** fail (proving
  it is honoured, not ignored) and a generous one must let the slow response
  through. Without that first assertion the second proves nothing.
- **`headersTimeout` measures time to the first response HEADER**, and a
  genuinely streaming endpoint sends headers immediately. So this limit
  firing at all is evidence that DashScope's Anthropic-compatible endpoint
  **buffers the whole answer before replying** — meaning the switch to
  streaming bought nothing there. That is a finding about the provider, not
  a setting, and raising the ceiling does not change it.

So the log line now reports what a total alone cannot:

```
模型调用耗时 304.8s（响应头始终未到达（对方在缓冲，不是真流式），没有收到任何流式事件）
```

Time-to-first-header and time-to-first-stream-event. If the next run prints
a header time under a second, the endpoint does stream and the earlier
reading was wrong. If it prints 响应头始终未到达 again, the buffering is
confirmed, and the architecture question above — sending a text-layer PDF as
text rather than as a multi-megabyte native PDF — stops being optional.

### It worked — and the same log settled the architecture question (2026-09-13)

The run completed. `已写入`, with `3/2/11/4` requirements and risks and a
correct one-line summary (秘鲁扬阿万卡区河岸防御扩建改善工程). Two calls, and
the pair of them answers everything the previous three days were guessing at:

```
调用1（原生 PDF）: 734.5s（响应头始终未到达（对方在缓冲，不是真流式），没有收到任何流式事件）
                 → 400 String value length (28049408) exceeds the maximum allowed
调用2（文本兜底）: 98.9s（首个响应头 4.6s，首个流式事件 4.7s）→ 成功
```

Same document, same model, same provider, minutes apart.

- The dispatcher fix worked: 734.5s is well past the old 300s ceiling, so
  the call ran to a **real provider error** instead of a timeout. The
  failures were never the model's.
- **Native PDF: no response header for 734 seconds.** The endpoint buffers.
  Streaming bought nothing on that path, exactly as the header timeout
  implied.
- **Text: first header at 4.6s, first event at 4.7s.** It streams properly,
  finishes in 98.9s, and succeeds. Seven times faster and the difference
  between working and not.

So `extractTenderRequirementsQwenAnthropic` now passes
`preferExtractedText: true`: on that provider a PDF's text is sent, never
the PDF. This is the same branch Word documents already took, for the same
stated reason, plus one more — a provider that holds a multi-megabyte
document for twelve minutes and then rejects it on size is not one to send a
document to. The Claude path is untouched and still uses native PDF vision,
which is what scanned tenders are routed to it for.

**The one thing that did not work: 关键日期 was 无.** Everything else came
back — 3 qualifications, 2 experience, 11 documents, 4 risks — and the single
field shaped like a **table** came back empty. `extractPdfText()` was running
`pdftotext -q` with no `-layout`, and on a two-column fixture that is the
difference between:

```
Presentacion de ofertas          ← -q: label and date on separate lines,
                                    blank lines between, pairing left to
02/10/2026                          the model to guess

Presentacion de ofertas    02/10/2026    ← -layout
```

A real cronograma has three or four columns (etapa / inicio / fin / hora),
where the same loss is worse. `-layout` is now passed. Whether it is
sufficient is the next run's answer, not an assumption — if 关键日期 is still
无, the schedule is either outside the 30-page cap or printed as an image,
and both are diagnosable from the document itself rather than by spending
another call.

`npm run test:extraction-pipeline` is at 50 checks, including that the
DashScope path makes exactly one call with no document block, and that the
Claude path still sends native PDF.

### Two transliterations of one town, and a backlog that would take a day

**The name.** A tender titled 亚纳万卡区（Yanahuanca） got the one-line
summary 秘鲁**扬阿万卡**区河岸防御扩建改善工程. Same place, two Chinese
renderings, on the same page — which reads to a customer as two places.

Root cause, `analyze-uploaded-document.ts:168`:

```ts
const context = { tenderNumber: …, title: intake.fileName, buyer: "" };
```

The extraction's `title` was **the file name**
(`peru-ocds-…__Bases Administrativas.pdf`). The model never saw the tender's
own Chinese title, so it transliterated Yanahuanca from scratch with no way
to know the platform already renders it 亚纳万卡. The title translation
(task #24) and the document extraction are two unrelated model calls with no
shared vocabulary between them.

The fix is not the title alone. The title does not name every place (user,
same day: 有些地名标题没有，摘要里面有) — a river, a neighbouring district, the
buyer's own municipality routinely appear only in the summary, and each of
those is a name the extraction would still transliterate afresh.

So everything the site already displays in Chinese for that tender goes in:
`title.zh`, `summary.zh`, and any `one_line_summary` an earlier analysis
wrote. They reach the model as a labelled block after the task sentence —

```
本平台已对该项目使用的中文写法（仅供统一术语，不是提取来源）：
标题：…
摘要：…
已有一句话总结：…
```

— and SYSTEM_PROMPT requires reusing its renderings of proper nouns exactly,
never re-transliterating a name that appears in it, while transliterating
normally any name that does not. The label matters as much as the content:
this is the platform's own prior output, and without saying so it reads as
more document to extract requirements from. A tender with no established
Chinese gets no block at all rather than an empty header.

**The throughput.** One document at ~99s and a strictly sequential batch is
about six per hour; 66 Peru documents is over two hours of mostly *idle*
waiting, since nearly all of that 99s is spent waiting on the provider
rather than working the machine. (The 10-minute figure that prompted this
predates `preferExtractedText` — it included the 734.5s native-PDF attempt
that path no longer makes.)

`analyzeLocalFolder()` now runs `ANALYSIS_CONCURRENCY = 4` tenders at once,
which puts the same 66 closer to half an hour. Four rather than forty: each
worker holds a tender's files in memory and shells out to poppler, and
DashScope is a shared rate limit whose 429s would arrive as per-document
failures — a width that turns one slow provider into a thundering herd
trades a real speedup for a batch that fails.

The pool itself is extracted to `run-pool.ts` rather than left inline,
because a worker pool's bugs are all silent and all of these would cost
money or results: exceeding its width, dropping the last item, starting new
work after a stop was decided, or abandoning work already in flight. Each of
its three guarantees is asserted in `test:extraction-pipeline` (now 57
checks), including that it is genuinely concurrent rather than sequential in
disguise, and — the one that protects money — that once a stop is decided
nothing NEW starts while everything already running is awaited to
completion. A model call abandoned mid-flight is paid for and thrown away.

Two details the concurrency changed in meaning rather than mechanics: the
give-up rule counts failures *with no success yet* rather than
*consecutive* ones (with four workers in flight "consecutive" has no
definition), and "N 个项目未处理" is now computed from how many actually
finished rather than from the aborting task's index, since tenders no longer
complete in order. Results and failures are sorted back into the folder's
order before reporting.

### The document-extraction path for key dates was removed (2026-09-16)

Everything below about reading a cronograma out of a bid document is history,
kept because the findings are still true and still cost something to establish.
The code is gone: `ExtractionSchema` no longer has a `keyDates` array, the
prompts no longer ask for one, and `lib/db/extracted-key-dates.ts`,
`scripts/review-key-dates.ts`, `scripts/test-key-dates.ts` and
`scripts/measure-deadline-accuracy.ts` are deleted.

Why, in one line: it was built for Peru, Peru turned out not to publish the
schedule in the document, and everywhere else the feed already supplies the
dates — so what it added in practice was a SECOND schedule sitting beside the
real one. A Proyectos Estratégicos tender showed two 现场踏勘 and two 提问截止,
the document's pair being an earlier round of the same procedure. User,
2026-09-16: 既然现在 Peru 是我手工做、Pemex 也是我手工做，建议把全站的分析标书
提取关键日期的功能都删掉，完全用不到.

What stayed: `key-date-checks.ts` (the 粘贴日程表 tool checks a pasted schedule
with it), `extracted_from_document` and the importer's protection of those rows
(so what was already written survives), and `undo:extracted-key-dates` to remove
them where a human has since entered the real schedule.

### Peru's bid deadline: the search is over, and the answer is "nowhere" (2026-09-14)

Tasks #31 and #34 both existed to close one gap: SEACE tenders reach this
platform with 计划交标 blank while the official ficha shows a full cronograma.
The plan was to read the deadline out of the bases PDF. Three checks, run
in one afternoon, close the question in the other direction.

**1. The bid document does not print it.** Chapter 2.1 of a live *Bases
Administrativas* (ocds-dgv273-seacev3-1248966, Ley N° 32069 / DS
009-2025-EF) is titled CRONOGRAMA DEL PROCEDIMIENTO DE SELECCIÓN and reads,
in full: *"Según el cronograma de la ficha de selección de la convocatoria
publicada en el SEACE de la Pladicop."* Every other mention of
*presentación de ofertas* in its 129 pages is a rule — submission runs
00:01–23:59, not less than seven working days after the integrated bases —
never a date.

**2. The API does not carry it, in any format.** The decisive test was the
CSV rather than the JSON: `/file/seace_v3/csv/2026/08` is a **full
flattening** of the OCDS structure, one table per array — `com_awards`,
`com_contracts`, `com_parties`, `com_ten_documents`, `com_ten_items`,
`com_ten_tenderers`, `records`, `releases`. There is **no
`com_ten_milestones.csv`**. `tender.milestones` is OCDS's own field for
cronograma rows, so its table being absent means no record in the entire
month has one. `records.csv`'s complete set of date columns is four:
tenderPeriod start/end, enquiryPeriod start/end. This is a month-wide
answer, far stronger than the per-record checks that preceded it.

**3. The linked releases hold nothing back** — and this corrects a guess
made earlier the same day. A compiled release is the **merge** of every
release for an ocid, and merging preserves fields rather than dropping
them, so a milestone present in any release would appear in the compiled
one. Absent there is absent everywhere; the two linked releases on that
record did not need fetching.

A live 2026-09 record re-confirms the rest on current data: `tenderPeriod`
start and end are both `2026-09-10T00:00:00`, the publication day, not a
deadline; `enquiryPeriod` (09-11 00:01 → 09-21 23:59, `durationInDays: 10`)
is the only real window published. `GET /records?page=1` shows the same on
2024 records, so this is steady behaviour rather than one month's quirk.

**Correction to the first version of this note:** that 2026-09 record lists
exactly one document, and the note took it as "there is no second attachment
to try." That is true of the tender and false of the source. `documents[]`
grows with the procedure — a completed 2024 record in the same response
carries four (Bases Administrativas, Resumen ejecutivo, and two ZIPs for
Presentación de Propuestas and Otorgamiento de Buena Pro). A tender
published four days ago has not reached those stages, so **re-reading a
tender's document list later does yield more**.

It does not rescue the deadline, though: none of those later documents
exists yet at the moment a bidder needs one, which is *before* the bid is
due. The single document type that would arrive in time — *bases
integradas*, published after the consultas window closes — has not been
checked for whether it prints the cronograma the original bases delegates to
the ficha. Under the same Ley 32069 template it probably does not; that is a
guess, and it is the only thread left unpulled.

So: across every format, every endpoint, and the document itself, this
source publishes publication and the consultas window. **计划交标 blank on a
SEACE tender is a property of the source, not something left to find**, and
this note exists so the next person does not spend another afternoon
finding that out.

Two consequences worth stating plainly:

- **Reading Peru bid documents is still worth doing** — the one analysed
  returned 3 qualifications, 2 experience requirements, 11 required
  documents and 4 risks, all cited. It is the *deadline* that is not in
  there, not the value.
- **#34's premise was wrong, not its machinery.** The cronograma checking
  (`key-date-checks.ts`), the day/month-swap detection and the write path
  are all sound and untested against real data only because Peru turned out
  to be the wrong place to test them. Mexico's Convocatorias do print a
  cronograma; that is where this should be validated.

**Third confirmation, from the pipeline itself (2026-09-16).** The note
above rested on one bases PDF read by hand. The re-run after the two
extraction bugs were fixed (`c65d629`) put three through the live path —
1248966, 1249139 and 1249156, via 本地批量分析 — with
JSON_SHAPE_INSTRUCTIONS now explicitly asking for `keyDates`. All three
wrote their analysis (3/1/3/4, 2/2/11/4 and 2/0/3/3 qualifications /
experience / documents / risks) and all three returned an EMPTY schedule.

That combination is what makes it evidence rather than a failure: a run
that extracts eleven required documents from a PDF and no dates from the
same PDF is not a run that could not read it. The model was asked, on
three separate documents, and there was nothing to answer with. Peru's
bid deadline reaches this platform by hand or not at all, and the paste
tool plus the ficha URL capture are the whole answer, not a stopgap.

What is NOT being done, and why: deriving the submission date from the
enquiry window plus the Reglamento's minimum intervals is arithmetic on a
rule, i.e. a guess presented as a date, and a wrong deadline is worse than a
blank one. Scraping the ficha HTML is out under the project's standing rule
against building connectors for deliberately anti-automation-gated portals.
The honest options are the ones already in place — SourcePanel points the
reader at the official page — plus manual entry through the key-dates
editor for tenders worth it.

### The cronograma the ficha shows, pasted rather than scraped (2026-09-14)

The user opened the ficha for the tender above and sent the table:
Convocatoria 10/09, Registro de participantes 11/09→12/10, Consultas
11/09→21/09, Absolución 22/09, Integración 22/09, **Presentación de
propuestas 13/10/2026**, Calificación 14/10, Buena Pro 14/10 08:30. The
deadline exists, published, exact — just not anywhere reachable from the
data.

The URL settles why: `fichaSeleccion.xhtml?id=5aeb5f38-860e-424c-bfa4-…`,
while the only UUID in the OCDS record is a document download code
(`fileCode=5da1ea91-…`). Different values. The ficha URL **cannot be
constructed** from the record, so reaching it means driving SEACE's own
search — the part this project does not automate.

So the human stays in the loop for the one step that needs them, and the
machine does the rest: `lib/ingestion/seace-cronograma.ts` parses that table
pasted straight out of the browser. No model call, no request to SEACE,
exact published dates rather than an inference. Per tender it is one copy
and one paste.

What the parser has to survive, all real properties of that table:

- **Two date columns**, and the deadline is the END. Registro de
  participantes runs 11/09 → 12/10; reading the start column there would be
  a month wrong.
- **DD/MM/YYYY** — 13/10/2026 is 13 October. The dates are split by hand
  rather than given to `new Date()`, which would read several rows as a
  different month without complaint.
- **Cells wrapping onto a second line** (Integración de las Bases, then the
  municipality's name). Rows are found by looking for *dates*, not by
  assuming one row per line: a line without a date is carried forward as
  more label.
- **Ordered stage rules.** "Absolución de consultas y observaciones"
  contains "consultas y observaciones", so absolución is tested first — the
  other order would file a clarification date as the questions deadline.

Four stages are deliberately not stored and are **reported** rather than
dropped: Convocatoria (publication_date is the feed's and is protected by
migration 0030 — a paste must not overwrite it) and the three this platform
has no type for (Registro de participantes, Integración de las Bases,
Calificación y Evaluación). Someone pasting an eight-row table needs to see
why four rows are missing, or they will file a bug.

Two integration details that are easy to get wrong:

- **`submission` is never inserted as a row.** It has its own column, and
  `syncKeyDatesForTopLevelFields()` owns the row mirroring it — that
  function deletes *every* row of the type and rebuilds one from the column.
  Writing both would put two 交标截止 entries on the public timeline until
  the next admin save quietly removed one. The route sets the column and
  calls the same sync the admin form's own save calls.
- **Fill, never overwrite.** A deadline already on the tender came from
  somewhere; the paste reports the disagreement and leaves it alone, the
  same rule `writeExtractedKeyDates()` follows.

Preview is mandatory before writing — the admin sees the parsed rows, the
skipped rows with reasons, anything unparsed, and `findKeyDateProblems()`'s
verdict, before anything touches the tender. A wrong bid deadline either
hides a live tender or holds an expired one open, so it is not written from
a paste nobody looked at.

`npm run test:key-dates` is at 84 checks, fixtured on that exact real table.
One of them is worth naming: the parsed questions deadline (2026-09-21)
matches what the OCDS feed independently publishes as `enquiryPeriod.endDate`
— two unrelated sources agreeing is the check that the right column is being
read, and it is the first real-data validation the key-date machinery from
#31/#34 has ever had.

### The pipeline only spoke Spanish (2026-09-18)

Brazil is the first source that does not publish in Spanish, and both model
paths had a Spanish prompt compiled into them: `translate-titles-qwen.ts` for
titles and summaries, `extract-requirements.ts`'s `SYSTEM_PROMPT` for bid
documents.

Neither would have failed on a Brazilian row. That is the whole problem. The
translator would have returned fluent Chinese and the extractor a well-formed
extraction, and **nothing in either output carries a sign of having been read
as the wrong language** — there is no malformed field to catch, no exception
to log, no count that moves.

It is not a matter of a model coping with Portuguese anyway. Roughly half of
each Spanish prompt is rules about specific Spanish strings:

| Spanish rule | In Portuguese |
|---|---|
| `5/A.` is short for 5ª — an ordinal on the FOLLOWING noun | doesn't occur; Brazilian titles write 1ª/2ª directly |
| `OTE`/`PTE` are Oriente/Poniente — never read PTE as puente | **wrong**: "PTE" in a Brazilian title really can be ponte |
| `Ciudad Bolívar` is a Bogotá locality, not Bogotá | no counterpart |
| Extract from a Convocatoria / Anexo Técnico | **no such documents**: an Edital carries a Termo de Referência or Projeto Básico |
| `carácter`: NACIONAL / INTERNACIONAL BAJO TRATADOS / ABIERTA | no counterpart; Brazil is not a WTO GPA party |

The last two matter most for the document path: a prompt that names sections
the document does not have invites citations to sections that do not exist,
and `sourceReference` is the one field that is supposed to make an extraction
checkable.

**What decides the language.** `lib/ingestion/source-language.ts`, keyed on
`country`, used by both paths so they cannot disagree. Not by sniffing the
text: strip the accents and "CONSTRUCAO DE PONTE" and "CONSTRUCCION DE
PUENTE" are three characters apart, and a short procurement title is both the
commonest row and the one a classifier is least able to call.

`LocalizedText.es` holds the ORIGINAL, not "the Spanish" — for Brazil that is
Portuguese. Renaming the field would mean rewriting every stored JSON column,
so the language is derived instead of read off the field name. The Portuguese
translation module therefore sends its own wire keys, `titlePt`/`summaryPt`:
the model reads its input keys, and a field named `titleEs` tells it the text
is Spanish.

**Batches group by language before chunking.** One batch is one system
prompt. A plain `chunk()` over a mixed list produces a mixed batch at every
boundary — the commonest case, and invisible, since a model handed one
Portuguese row among seven Spanish ones simply translates it.

**One button, not two.** `translateAllTenders`'s whole job is "everything
still untranslated"; a per-language button would turn that into a claim two
buttons have to agree on. The result now reports the split by language,
because `葡萄牙语 0` after a Brazil import is the only visible symptom that
the routing is not working.

`npm run test:source-language` pins the routing, including the cases that
must NOT change behaviour: an unknown country stays Spanish (what every row
did before this existed), and `"Brazilia"` is not Brazil.

Still unverified: the Portuguese prompts have never run against a real row or
a real Edital. The plumbing is the path the Spanish prompts have used since
2026-09-08; the text is new. Read the first batch of five, and the first
extraction field by field against the PDF, before trusting either at scale.

### `\b` is ASCII-only, and it had been tagging accented words for months (2026-09-18)

A Brazilian tender for corporate communications and public relations came
back tagged **水工程 (water)**. The tag was the only symptom — nothing failed,
nothing logged.

The cause is one line of JavaScript semantics: `\b` is defined over `\w`,
which is `[A-Za-z0-9_]`. An accented letter is therefore a NON-word character,
and `\b` fires **in the middle of a word**. `/\br[íi]o\b/` matches the "rio"
inside `Território`, because the "ó" in front of it reads as a boundary.

In Portuguese this is not an edge case. Every word ending `-ário` or `-ório`
matches that one pattern:

```
relatório  escritório  laboratório  auditório  consultório  observatório
mobiliário  imobiliário  veterinário  diário  horário  orçamentário
necessário  complementário  Território
```

And it is one pattern of 573 `\b` uses across `lib/industry.ts`,
`lib/relevance.ts` and `lib/relevance-pt.ts`, every one of them matched
against Spanish and Portuguese text.

**The fix is `foldAccents()` (lib/text-fold.ts) on the classifier haystacks**,
not a rewrite of the boundaries. Rewriting every `\b` into
`(?<![\p{L}\p{N}_])`-style lookarounds would also work and would touch 44
declarations. Folding is one function at six call sites, and it works because
of something already true: **all 399 regex literals in those files are written
with the unaccented spelling beside the accented one** — `[áa]`, `[çc]`,
`[ñn]`, `[íi]` — so every one already matches folded text. That property is
now enforced by `npm run test:text-fold`, which scans the literals and fails
on a bare accent; without it, the day someone writes a plain `é` is the day
that pattern silently stops matching its own rows.

It corrects in both directions: a pattern no longer fires inside an accented
word, and a pattern anchored `\b` in FRONT of an accented letter now fires
where it never could (`/\b[óo]leo\b/` against a title starting "ÓLEO").

Measured blast radius on the existing corpus: **zero**. 321/321 relevance
fixtures, 18/18 industry tags and 22/22 Colombia title cases are unchanged —
Spanish accents rarely sit next to a `\b`-anchored keyword, which is why this
survived three countries and only surfaced on the first Portuguese import.

## ANEEL's real entry point is the *consulta pública*, not the edital (2026-09-19)

Everything written above about ANEEL was measured on one page — Leilão 1/2026's
document list — and it produced a conclusion that was locally true and globally
wrong:

> There is no RAP ceiling and no investment figure to find, anywhere, for this
> auction. Not hidden on another page — not yet written.

True of that auction at that moment. False as a general rule, and the
correction reverses the product judgement that followed from it.

### The stage the earlier survey missed

Before the minuta goes to the TCU, it goes to the public. ANEEL opens a
numbered **consulta pública**, publishes the draft edital with its annexes and
the draft contract, and takes written contributions for six to eight weeks.
Three consultations were open or had just closed on the day this was written:

| CP | Auction | Window | Auction date | Announced CAPEX |
|---|---|---|---|---|
| 032/2026 | Transmissão 1/2027 | 2026-09-10 → **2026-10-26** | 2027-04-30 (B3, SP) | **R$ 12,9 bi**, 12 lots |
| 022/2026 | LRCAP 5/2026 (Armazenamento Nacional) | 2026-07-30 → 2026-09-14 | 2 or 4 Dec 2026 | not announced |
| 023/2026 | LRCAP 6/2026 (Armazenamento) | 2026-07-30 → 2026-09-14 | 2 or 4 Dec 2026 | not announced |

Two things fall out of that table, and both matter more than the stage name.

**The investment figure exists at this stage.** R$ 12,9 bi was public when
CP 032/2026 opened — seven months before the auction, and long before any
edital. The "no number exists" claim was an artefact of looking only at the
document page of an auction that happened to be past its own consultation.

**"Once a year" was wrong.** 2026 alone carries transmission 1/2026, LRCAP
5/2026 and 6/2026 in December, and the consultation for transmission 1/2027.
The auctions are infrequent; the *decision points* are not.

### Why the window is the product, not the auction

A contribution sent inside the window is the only formal way to argue about a
technical specification before it becomes binding — round-trip efficiency
floors, standalone-operation requirements, local content. For a supplier whose
question is "does my equipment qualify at all", the answer is decided here and
is unappealable afterwards. Lot 5 of Transmissão 1/2027 is the first battery
storage lot in the SIN (Cruzeiro do Sul and Feijó, Acre) and runs 18 years
against the other lots' 30, because that is the life ANEEL assigns a battery —
exactly the kind of parameter a consultation is for.

So the stage model gained `consulta_publica`, below `tcu_review` and above
`announced`, and the reading distinguishes a window that is **open** (the spec
can still be argued) from one that has **closed** (the spec is now what you
build to). The two produce different sentences on purpose.

### What is still NOT set, and why

`estimatedValue` stays empty. R$ 12,9 bi is the whole auction's CAPEX across
twelve lots and ANEEL publishes no split; dividing it would put a fabricated
amount on twelve rows. It is named in the summary and nowhere else. The
standing rule is unchanged: **a per-lot amount is only ever set from a per-lot
source.**

The contribution deadline reuses the `questions_deadline` key-date type rather
than adding one. A consultation *is* the window for written questions about a
draft; a new type would need a migration for no semantic gain.

### Provenance, marked in the data

Every field in `ANEEL_CONSULTAS` was read from trade press, not from ANEEL —
the sandbox reaches no `.gov.br` host and `www2.aneel.gov.br` refuses a script.
Each record therefore carries `confirmed: false` and the URL it came from,
`npm run ingest:aneel -- --consultas` prints that warning on every line, and
the warning is repeated in the summary of any tender built from an unconfirmed
record. A capture of the consultation's own page is what clears the flag.

### The code is no longer inert

`npm run ingest:aneel` is the wiring that was missing:

```
npm run ingest:aneel -- --consultas                              # what is open, and how long is left
npm run ingest:aneel -- page.html                                # dry run
npm run ingest:aneel -- page.html --published 2025-11-11 --write # upsert
npm run ingest:aneel -- page.html --documents docs.json          # add the documentos_editais list
```

### The year selector is a POST, and this cost a capture

Choosing a year in the dropdown does nothing by itself — the form POSTs back
to the same URL. **Click "Pesquisar" and wait for the reload before saving.**
A capture taken straight after changing the dropdown came back byte-identical
to the year already on screen (`md5sum` matched the earlier file exactly), and
looked like a successful save of a different year.

### Where the battery auctions live

LRCAP is not on the transmission application. Its sibling is
`www2.aneel.gov.br/aplicacoes_liferay/editais_geracao/edital_geracao.cfm`,
the same ColdFusion shape with the same `documentos_editais.cfm?IdProgramaEdital=<id>`
popup. Unverified from here for the usual access reason; the reader is
segment-agnostic apart from its `LEILÃO DE TRANSMISSÃO` heading regex, so the
first captured generation page is what decides whether one reader serves both.

## The deployment answered, and it opened two doors (2026-09-19)

`/api/admin/probe-brazil-doors` was run for the first time, from Vercel. The
result settles the question eight rounds of laptop probing could not: **the
egress is a real variable, not an excuse.** Two doors flipped.

| door | laptop | Vercel |
|---|---|---|
| `dadosabertos.aneel.gov.br` datastore_search | TCP timeout, no handshake in 21s | **JSON in 1473ms** |
| `dados.antt.gov.br` CKAN | 200 + F5 "Request Rejected" page | **CKAN 2.8.3** |

Those two are the open-data APIs for electricity transmission and for roads +
railways — the structured half of everything this line of work was after. From
the laptop neither existed. From Vercel both answer in about a second.

### What did NOT flip, and it is the half that matters more

Every host that serves an actual *edital* is still shut from Vercel too:

    leilao.aneel.gov.br          TCP timeout      (same as laptop)
    portalrelatorios.aneel       TCP timeout      (same as laptop)
    git.aneel.gov.br             Cloudflare       (raw .xlsx and API both)
    www2.aneel.gov.br            Cloudflare       ← the connector's own source
    portal.antaq.gov.br          Cloudflare
    dadosabertos.ccee.org.br     "Acesso bloqueado"
    ppi.gov.br                   ECONNRESET / "Acesso Negado!"

So the shape of the answer is: **indexes and results, yes; bid documents, no.**
Which is the ANEEL lesson again (`www.gov.br/aneel` answers, `download.aneel`
does not), now confirmed to hold from a second network.

One distinction inside the Cloudflare column is worth keeping. From Vercel
these are `Just a moment…` — the JS challenge, which a real browser passes.
From the laptop `git.aneel` was `Sorry, you have been blocked` — the 1020 hard
block, which a real browser does not pass. Same vendor, different verdict,
decided by where the request came from. If a headless browser is ever built
for this, Vercel's egress is the one where it could work.

### The trap this creates, and what was built to avoid it

`scripts/ingest-aneel.ts` reads `www2.aneel.gov.br` — which Vercel refuses
too. So "run it on the server" does not rescue the connector that exists. What
Vercel opened is a *different* path to the same facts: `dadosabertos.aneel`'s
datastore holds the transmission auction results directly.

But the nightly ingest does not run on Vercel. It runs on a GitHub Actions
runner (`daily-ingest.yml`, and that file records why it moved off Vercel).
That is a **third** network, with no relationship to the second. Writing a
connector against `dadosabertos.aneel` because Vercel reached it would be a
guess about a machine nobody has asked.

Hence `lib/ingestion/brazil-doors.ts`: one door list, two callers — the admin
route (Vercel) and `.github/workflows/probe-brazil-doors.yml` (the runner,
manual dispatch). Whatever the runner says is what decides, because that is
where a connector would live.

Also fixed while extracting it: the JSON describer reported E1 — the one door
the whole exercise aimed at — as `JSON，外层键 help, success, result`. That is
the CKAN envelope, identical for every CKAN call ever made. It proved the host
answered and said nothing about what it answered with. `datastore_search` is
now unwrapped one level further, so the next run prints the row count and the
column names, which is the thing a mapper is actually written from.

## 43 minutes to learn nothing (2026-09-19)

A real run, `--days 1 --write`: 78 rows in the window, 2585 seconds in the
amount pass, **zero amounts resolved**. The output then reported
「没有金额：78 条」 and, in the composition, 「62 条 └ 无金额（法定保密等）」.

Both numbers were true and the sentence they formed was false. Nothing in
Brazil was sealed that day. PNCP was refusing this client for the whole run —
the search pass says so too, `modalidade 5` page 1 died on a connection reset
— and the amount pass turned 78 refusals into a claim about Brazilian
procurement law.

### The arithmetic, because it is exact

`fetchPncpItems` used the default retry chain, `RESET_BACKOFF_MS` =
`[2, 5, 12, 30, 60]` seconds = 109 seconds of sleeping before giving up.

    78 rows × 109s ÷ 4 workers = 2125s

Observed: 2585s. The rest is request time. So the run was not slow, and not
throttled in any interesting way: it was **sleeping**, on a ladder built for a
different job.

### The part worth being uncomfortable about

That ladder was already known to be wrong for this shape of call. Three hours
earlier, one pass further down the same file, `OPTIONAL_BACKOFF_MS` was added
with this reasoning: the tender is already written, so failing costs a missing
link while retrying is paid by every row in series — one retry, then move on.

Every word of that applies to the amount pass. `DOCUMENT_FAILURE_STREAK` was
added in the same commit, for the same reason, and the amount pass sitting
directly above it got neither. The fix was written, and then applied to one of
the two places that needed it.

So this round adds, to the amount pass, exactly what the document pass already
had:

- `AMOUNT_BACKOFF_MS = [2_000, 6_000]` — two retries, not eleven. Worst case
  per row drops from 109s to about 8s.
- `AMOUNT_FAILURE_STREAK = 12`, counted **across workers**, because four
  workers failing three times each is the same fact as one worker failing
  twelve times. On trip, the pass stops; rows are still written, without
  amounts, and the run says so.

Worst case for that 78-row run goes from 43 minutes to roughly 25 seconds.

### And the reporting, which is the more expensive bug

A failed lookup and a sealed estimate (`orcamentoSigiloso`) are opposite
facts. One is permanent and means the value will never be known; the other is
this afternoon's network and is fixed by re-running. The old output collapsed
them into one label, so the run's headline number pointed at the wrong
continent.

`fetchPncpItems` now takes an `onFailure` callback, the result carries
`amountLookupFailed`, `amountsStoppedEarly` and `amountFailureReasons`, and
the band label only says 法定保密 when the sealed count actually exceeds the
refusal count.

### What this does NOT settle

The same run wrote 60 tenders, all without a value, and the user asked whether
that contradicts the daily volume estimated the day before. It probably does
not: **every one of those 60 lacks a value because of the failure above**, not
because Brazil published 60 valueless notices. The value filter — the single
strongest rule this classifier has — never ran on any of them.

The policy question underneath is real and stays open: when a Brazilian tender
*genuinely* has no amount, should an industry match alone carry it into the
recommendation list? Mexico answered a version of this with a structural rule
(`governmentLevel === "municipal"` + undisclosed value + nothing but the bare
works word), and Brazil's mapper does populate `governmentLevel` from
`esfera_id`, so the same shape of answer is available.

It is deliberately not answered here. Calibrating a relevance rule against a
run whose amount data was 100% missing would be fitting rules to a network
failure. Re-run first — the upsert is keyed by slug, so the same command over
the same window backfills those 60 rows — then decide from the real
distribution.

## 已中标, no value, 交标 last October (2026-09-19)

Three Brazilian rows in 项目管理, all published 2026-09-18:

    A Contratada obriga-se a prestar Serviços …   已中标  常规项目  —  交标 2025-10-02
    CONTRATAÇÃO DE EMPRESA ESPECIALIZAD…          已中标  常规项目  —  交标 2026-03-18
    Execução de obra de melhorias, adequaçõe…     已中标  常规项目  —  交标 2026-08-26

A deadline eleven months before the publication date, and no value in the
column either way.

### How they got past the gate

`upsertTendersBatched` refuses to write any tender whose deadline has passed,
from any source, by any path — the standing rule the user set in so many words
(「请一定要保障现在应用的筛选规则，在我们导入新项目时，一样适用」). But
`isPastSubmissionDeadline` opens with:

    if (tender.status === "awarded") return false;

which is correct and deliberate: an award result necessarily arrives after the
deadline, and award intelligence is worth keeping. `purge:closed-tenders` says
the same thing in its header.

**The exemption assumes the awarded row carries the result.** Brazil's does
not. `inferStatus` reads `row.tem_resultado === true` and returns `"awarded"`,
and that is the entire transaction: `tem_resultado` is a boolean. No winner,
no awarded amount, no award date, and nothing in the PNCP search row to read
them from — grep the mapper for `awardedValue` and there is no match.

So the exemption admitted rows that are, by construction, empty of the exact
thing the exemption exists to preserve. The reader gets a tender they cannot
bid on and cannot learn anything from. Both audiences, missed, by one row.

### What changed

`ingest-brazil.ts` drops rows that arrive already awarded with the proposal
deadline behind them, counted and reported. Narrow on purpose:

- a result published while the window is still open is KEPT — unusual, real,
  and still actionable;
- a row with no parseable deadline is KEPT, because "cannot tell" is not
  "stale";
- `isPastSubmissionDeadline` itself is UNCHANGED. Ecopetrol, CompraNet and the
  Compras MX contract feeds exist to carry award results, and widening the
  platform gate on the strength of one source's shape is how a fix for one
  connector silently empties three others.

`npm run purge:awarded-closed` is the one-off cleanup for rows written before
this. Its test is "awarded, deadline passed, **and no award payload**" — a row
with `awarded_value` or `awarded_to` is kept whatever its deadline, because
that is the case the exemption is for and it is working. Dry run by default,
CSV first, `--write` to delete.

### Brazil joined the nightly matrix

Separately, and for the other half of the same day: PNCP refused the user's
laptop twice. First every amount lookup in a 78-row run; then page 1 of both
modalities, on a connection reset, before a single row was read — 0 fetched,
0 written.

`daily-ingest.yml` now runs `ingest:brazil-live` alongside Colombia, PEMEX and
LicitIA. The runner is a third egress, untested against PNCP, and that is the
point of finding out from a job with a log and a re-run button rather than
from a terminal someone is watching. Peru still has no scheduled import.

## 小型工程 (2026-09-19)

The user reviewed a day of real rows across four countries and named a class
the rules had no concept of:

> 我感觉所有国家都很多小学校(幼儿园、小型小学、乡村学校、社区学校、托儿所、
> 学前教育)、小体育场、小广场、社区广场、社区体育场、社区道路、小型道路、
> 社区医院、农村医院的标了，这些中国公司(即使已经在本地有实体了)一般不会参加…
> 特别是没有预算金额的，根本辨识不了

Measured before writing anything, against the 33 titles they listed:

    before   6 excluded, 27 kept   (Brazil: 0 of 23)
    after   33 excluded,  0 kept

### Why Brazil was 0 for 23

`classifyPortugueseExclusion()` checks `PT_REAL_WORKS_SIGNAL` and returns
"keep" the moment it sees `obra`, `construção`, `pavimentação` or
`engenharia`. That guard is right and was written on purpose: a rule broader
than its own name loses a real R$50M highway permanently and silently.

But a creche IS construction. A village football pitch IS a work. The guard
was doing its job on every one of these rows. So the verdict had to be taken
BEFORE the guard, on **what is being built** rather than on whether something
is — which is `classifyPortugueseSmallWorks()`, a new function rather than
another entry in a list the guard already protects.

The classes, each from a title in the review: daycare under all of Brazil's
names for it (creche, CMEI, CEMEI, EMEI, pré-escola, educação infantil),
village schools (the qualifier carries the size claim — bare `escola` is NOT
matched, because a federal institute is a real contract), neighbourhood health
(UBS, posto de saúde, ESF — `hospital` is NOT matched), community sport and
squares, street and rural paving, pavement upkeep, slope retaining walls,
rural water schemes.

### 街道路面不做，只做公路

Street surfacing needs all three of a paving verb, a street-or-village marker,
and the ABSENCE of a highway marker. Any two is not enough: `pavimentação`
alone is half the Brazilian corpus, and a named street appears in genuine
works as the site address.

One bug worth keeping in the record. The first highway marker was
`\b[a-z]{2}[\s-]\d{3}\b`, which matched **"de 114"** inside "com extensão de
114,00 metros" — so a 114-metre residential street rescued itself by stating
its own length. Brazilian highway designations always carry the hyphen
(BR-101, MG-050, SP-270), so requiring it costs nothing and closes the hole.

### The value exception

None of this fires at or above `LARGE_WORKS_BUILD_USD`, using the same helper
and threshold the municipal-amenity and water-network classes use. A row with
NO amount has no exception to claim, which is the user's own point about them:
an unpriced village school is exactly the row that cannot be told apart from
anything else, and a classifier that keeps it is guessing in its own favour
rather than the reader's.

### Three Spanish gaps the same review exposed

- **Plant hire** reached FLAGSHIP. "ALQUILER DE EXCAVADORA … PARA LA OBRA:
  … REPRESA SAPANCCOTA" is an excavator hired by the hour onto someone else's
  contract, and the dam that promoted it is the dam it is being hired TO.
  Reading the project as scope is reading the wrong noun in the sentence.
- **`PERU_MARGINAL_INVESTMENT` never matched anything.** The pattern was
  `/\bioa[ar]r\b/`, which demands FIVE characters — i, o, a, one of [a|r], r —
  and Peru prints the four-letter IOAR. A rule written to catch marginal
  investments had been structurally unable to fire since it was added. Both
  spellings are in the wild, so the middle letter is optional now.
- **A single pole-mounted transformer.** Narrowed on the phase qualifier,
  because electrical equipment is a priority industry here and the narrowing
  is the whole rule.

### The fibre cap

Per the user: 光纤项目除非有距离> 10000公里，不然都列常规项目. A cap, not an
exclusion — the rows stay readable. Distance-only and deliberately
value-blind, as asked. Almost every fibre tender in this feed is therefore
capped, which is the intended effect.

`12.000 KM` is twelve THOUSAND kilometres in Portuguese and Spanish. The first
parser read it as twelve and demoted a submarine cable to a campus job on a
full stop. A separator is only decimal when what follows it is not a
three-digit group.

### Two existing tests had to change, and why that is not the usual reason

`test-relevance-pt.ts` pinned two over-breadth cases — "a covered court is a
building" and "Obras comuns plus a real object is kept" — and both had picked
an **Escola Municipal** as their innocent example. The site was incidental to
what each case was pinning, and it is now an exclusion class in its own right.
So the site changed and the assertion did not, and the school version is
asserted separately as an exclusion.

Totals: 330/330 Spanish fixtures, all Portuguese cases, 33/33 of the review.

## The bidding window, and the fibre scale settled (2026-09-19)

### 少于 12 个自然日就不写

> 常规项目(没有金额的)，如果有交标日期，而且交标日期减发布日期小于12个自然日，
> 就自动被排除，也应用于所有国家的项目

The reasoning is mobilisation, not scale. A Chinese enterprise bidding in
Latin America has to read the edital in Portuguese or Spanish, price it,
arrange a bid bond, and in most of these systems register with the platform
first. Under twelve calendar days that is not a competition a foreign bidder
can enter — the same observation the `price_comparison` exclusion already
makes about Peru's abbreviated procedure.

**It lives in `upsertTendersBatched()`, not in `lib/relevance.ts`**, and that
was the whole design decision. `classifyRelevance()` has no dates, and giving
it two would mean threading them through nineteen mappers. That file states
the hazard itself: a signal a mapper forgets to pass is "right at import and
wrong forever after", and it is not hypothetical — it is the 193 → 486 jump of
2026-09-08. The upsert is the one line every import path passes through, which
is exactly why the past-deadline gate was put there, and the same reasoning
applies unchanged.

Four guards, each load-bearing:

| guard | why |
|---|---|
| tier is `standard` | the user scoped it to 常规项目; a 中型/大型 row with a tight window is still worth seeing |
| no disclosed amount | 没有金额的 — with a value the row was sized on something better than a calendar |
| publication date is REAL | `publicationDateIsEstimated` means the ingest timestamp. Measuring a window from it would reject rows for having been imported late, and would do it to whole sources at once |
| deadline parses | 如果有交标日期 — no deadline, no window, no verdict |

The boundary is the user's word 小于: twelve days exactly stays.

Dropped rows are listed, not just counted (first 10 with both dates). These
are 常规项目 with no amount, the population an admin can least reconstruct
afterwards — the same lesson the excluded CSV exists for.

### The fibre scale, in three bands

Settled over three messages:

    ≥ 30,000 km                        大型项目
    ≥ 10,000 km, or 骨干, or 海缆       中型项目
    everything else                     常规项目

A **determination, not a cap** — 非这些条件，都算常规项目. The first
implementation was a cap, and a cap can only ever lower a tier: it could not
express 骨干、海缆算中型项目, because a submarine cable with no stated length
and no amount has to be RAISED to 中型 from the 常规 the other rules give it.

Deliberately value-blind, which is unusual here and is what was asked for: a
large number attached to a short route is a large number attached to a short
route. The 12,000 km fixture at $400M is 中型, not 大型, and that is the rule
working as specified.

### Existing rows are deliberately untouched

Per the user: 库里的不动了，我手动调整，只应用于未来新导入的. So there is no
`reclassify:tenders` run behind any of this. Everything in this section and
the one above applies at import time only.

Totals: 332/332 Spanish fixtures, all Portuguese cases, 11/11 bid-window cases
(`npm run test:bid-window`).

### The rules, on the page where the button is (2026-09-19)

Per the user, when turning the scheduled Brazil import on: 请帮我在后台->新项目
清单->巴西里面写清楚现在的规则.

`ImportBrazilForm.tsx` now carries a 当前生效的规则 panel covering the schedule
(11:17 UTC daily, 3-day window, writes), slug-overwrite behaviour, what is
scanned, the Brazil-specific value floor and bands, the four categories that
are never written, the 小型工程 class with both of its exceptions, the routine
Portuguese exclusions, the fibre bands, and the fact that existing rows are
untouched.

It is on this page rather than only in this file because this is where someone
decides whether a day's import looked right. A rule they cannot see is a rule
they re-report as a bug, which has already happened twice in one day — once
for the 43-minute amount pass, once for three 已中标 rows nobody could account
for.

Maintained by hand with one exception: the bidding window renders
`SHORT_BID_WINDOW_DAYS` directly, because that number is the one most likely
to be tuned and the one whose drift would be least visible.

### The bidding window has a second home (2026-09-19)

> 这条能不能也应用到我手动补交标日期的项目？比如说秘鲁，都是我手动比的

It had to. `upsertTendersBatched()`'s gate covers every automated source, and
it cannot cover Peru at all: SEACE publishes the cronograma only on the ficha
page, so an OECE row arrives with **no deadline**, the gate has nothing to
measure, and the window only comes into existence when an admin pastes the
date. `lib/db/bid-window-gate.ts` is that second home, called from both admin
write paths — the tender edit form and the cronograma paste.

**Both directions, on purpose.** A one-way rule makes a typo permanent: enter
09-05 for 09-25, the row is excluded, fix the date and it stays excluded with
nothing to show why. So it also restores — but only a row it excluded itself,
which it recognises by the reason it wrote. A row excluded for being a routine
service, or by an admin's own hand, is never touched. Restoring to `standard`
is exact rather than a guess: the rule only ever fires on `standard`, so that
is the only tier it can have taken away.

Two things it refuses to touch: `relevance_manually_overridden` (that flag
already beats the importer and the reclassifier; a date edit is not the place
to start ignoring it), and a tier the admin is setting in the same save.

**Where the row goes.** `excluded` was already honoured by both surfaces that
matter — `filterTenders()` drops it from the public feed, and the
documents-needed query carries `.neq("relevance_tier", "excluded")`. 项目管理
still shows it, deliberately: that page is the full inventory, and hiding a
row there would make a mistyped date unrecoverable.

The save says so out loud (an `alert`, because the form redirects and a panel
would never be read). An automatic tier change nobody is told about gets
reported as a disappearing tender a week later.

One note on the stored reason. The user described the outcome as 改成日常服务
类排除, and it is NOT filed under that reason — 日常性服务采购 would be untrue
here, and this file has already recorded once that the stored reason is what
an admin reads when deciding whether an exclusion was right. It gets its own
`short_bid_window` reason naming the window, the registration requirement and
the missing value.

20/20 cases in `npm run test:bid-window`, 11 for the import gate and 9 for the
manual one.

## ANTAQ became runnable, and covers 6 of 20 (2026-09-20)

The hearing parser and the mapper were both finished on 2026-09-19 and
referenced by nothing. `lib/ingestion/connectors/antaq-live.ts` and
`scripts/ingest-antaq.ts` are the wiring — the same gap `scripts/ingest-aneel.ts`
closed for ANEEL a day earlier, and the same lesson: a mapper nothing calls is
not a source.

### The route is followed, not composed

`index → the "Audiências Públicas em andamento" link → hearing pages`. That
middle step is a link the connector FINDS. Its real address ends
`/audiencias-publicas-em-andamento`; the obvious guess,
`/audiencias-em-andamento`, 404s — and a 404 there reads as "there are no live
hearings", which is a wrong answer wearing a right one's clothes.

### Three hosts, three different problems, and only one is ours to fix

The 20 hearings that page lists are spread over three hosts. Counted from the
committed capture:

| host | hearings | what is wrong |
|---|---|---|
| `www.gov.br` | **6** | nothing — Plone, and what the parser was written for |
| `sisapinternet.antaq.gov.br` | **11** | a different ASP.NET application; never captured, so no parser |
| `leilao.antaq.gov.br` | **3** | Cloudflare challenge, measured shut from all three machines |

So this source covers under a third of what ANTAQ publishes, and every run
says so per host. The two failure modes that were available and rejected: keep
the six quietly, which makes a two-thirds gap look like the whole source; or
fetch the other fourteen and report "unparseable", which blames the pages for
a parser that was never written for them.

`sisapinternet` is deliberately **not fetched**. It has never been captured,
and this file's own rule — paid for three times, Compras MX, Ecopetrol,
Proyectos México — is that a mapper is written against a real capture. It is
also the single biggest thing that could be done for this source — but not by
as much as 11 of 20 suggests. Counted by year, only **3 of those 11** are 2025
or later (05/2026, 01/2026, 06/2025); the other eight are 2024 and 2022 and any
sane window drops them anyway. Measured against the hearings still in process,
the real numbers are **5 of 10** today and **8 of 10** with sisapinternet
captured — the remaining two are the Cloudflare ones.

`scripts/capture-antaq-sisap.ts` was written to be that follow-up, wired into
the probe workflow as `what=capture-sisap`. Its first job was not to capture
anything: it was to answer whether that host answers **at all**, since no
machine here had ever fetched it, and to name which kind of "no" it gets.

**It ran twice on 2026-09-20 and the answer is no.** Three in-window hearings,
asked from both machines:

| hearing | id | GitHub runner | laptop |
|---|---|---|---|
| AP 05/2026 | 640 | **403, Cloudflare challenge** | **403, challenge** |
| AP 01/2026 | 639 | **502 Bad Gateway** | **403, challenge** |
| AP 06/2025 | 638 | **502 Bad Gateway** | **403, challenge** |

The runner's two answers were not the same answer, which is the whole reason
the script separates them. A challenge is a decision about us and no header
has ever changed one. A 502 is the opposite: Cloudflare's edge reached ANTAQ's
own server and it did not reply — nobody blocking, their application down,
worth waiting out. On the runner's evidence alone the honest verdict was "one
block, two outages, come back tomorrow".

**The laptop settled it.** Three challenges out of three, on the machine that
opens gov.br without trouble. So the runner's 502s were the same edge having a
bad moment, and the real answer is a block. Six attempts, two machines,
nothing through — `classifyAntaqHost` moved this host from `other-system` to
`refuses-us`, the verdict `leilao.antaq` already carries, and it moved because
it was measured and not because it was assumed.

That is the third time this repo has measured that no header moves one of
these: ANEEL, leilao.antaq, and now here.

The first version of the script called it after **one attempt each**, which
cannot tell a dead origin from an app that fell over for a second, and those
have opposite next steps. It now retries the gateway class three times with
backoff and never retries a challenge, because asking a decision three times
only makes the log look like a flake. That change is what made the runner's
and the laptop's runs comparable.

So ANTAQ's coverage is final at **5 of 10** still-live hearings, not the 8 of
10 that capturing this host would have bought. The eleven behind it are not a
parser waiting to be written; they are behind a door. The script stays in the
tree so the day ANTAQ changes its WAF the answer costs one command, and so a
source that was investigated and closed says so rather than looking forgotten.

It strips `__VIEWSTATE` and friends before committing, for the day it does
answer: WebForms serialises the whole server-side control tree into base64
hidden inputs, and committing those buries the 10KB a parser reads under state
that changes on every fetch.

### "Em andamento" is the archive

Not the live list. It goes back to 2022, and one of its entries points at a URL
with `audiencias-encerradas` in the path. Every one of the five captured
hearings had a comment period that had already closed — which is not a reason
to drop them (a closed consultation is the one nearest to becoming an auction;
`antaq-mapper.ts` argues that at length) but it does mean the page will not
window anything for you. So the window lives in the CLI rather than as a
constant inside a fetch layer: how far back is worth importing is a product
call. It was `--months 12` for one day, and the next section is why it is not.

### What becomes a downloadable document, and what must not

The `Comunicados` attachments do — direct PDF URLs, 6/6/9/5/6 across the five
captured pages, measured fetchable 21 of 21. The `Documentação` buttons do
**not**, and they are the ones holding the draft edital and the EVTEA. They
are landing PAGES: writing them into `tender_document_links` would put HTML
behind a subscriber's download button. Harvesting the files behind them needs
one more fetch layer written against a real capture of such a page, and no
such capture exists — so the CLI prints those URLs where a person can follow
them, and the test asserts that not one of them reaches the links table.

### Unreachable is not empty

Every `.gov.br` host is outside the agent sandbox's egress allowlist, so
`npm run ingest:antaq` fails there with a 403 — and it says, in as many words,
that this is 够不着 rather than 没有听证, because the two need opposite fixes.
The index-link-missing case throws the same way: that is a page-structure
change, not a quiet source.

`npm run test:antaq-live` — 48 checks, none of them touching the network. The
triage runs against the committed capture instead, so the 6-of-20 ratio is a
number that fails when it moves rather than an impression somebody formed once.

## DOU 定向监控 —— a watch, not an import (2026-09-20)

Brazilian law requires every federal notice, edital and award to appear in the
Diário Oficial da União, which makes it the one Brazilian source that is
complete **by statute** rather than by an agency's choice to publish. Three
things reach it and never reach PNCP: concessions (not a *contratação* under
Lei 14.133/2021, so the portal never sees one — and 2026's federal calendar is
~100 assets at ~R$247bn), Seção 1 acts that authorise an auction weeks ahead of
any notice, and the state enterprises that run their own procurement.

### Why it reports instead of importing

`content` is cut at **403 characters**. Measured on the captured edition: 211
of 216 notices end in an ellipsis, and the median snippet length equals the
maximum. A DOU notice carries no deadline, no value and half an object
description — it is a LEAD, not a tender. Mapping one into `Tender` would
manufacture exactly the row this platform has already paid for twice, a
truncated summary with no submission date, and it would do it worst to the
highest-value rows because a concession notice is the longest.

So `npm run watch:dou` narrows the day and prints it. Importing stays a human
decision, or a second fetch of the full text, which is a separate build.

### The search is not merely noisy — it misses the target entirely

The obvious build was `consulta/-/buscar/dou?q=…`, the way the DOF connector
searches Mexico's gazette. Both captured searches were run through these rules:

| query | rows | kept | what they actually were |
|---|---|---|---|
| `concessão` | 20 | **0** | 9 ANTT `DECISÃO SUROD` rulings on concessions that *already exist*; top hit an Instrução Normativa on CSLL tax credits |
| `aviso de licitação` | 20 | 4 | 3 Petrobras spare parts, 1 real CODEVASF Concorrência |

Every row scored `0`, and the highlight markup shows why: the engine matches
the word anywhere, including inside the boilerplate every federal notice
carries. Precision is therefore no better than reading the edition — and
**recall settles it**: both captures returned exactly 20 rows, no paging
parameter was measured, and one weekday of Seção 3 alone is 2,139 notices. A
20-row answer is a sample of unknown coverage; the edition listing is the whole
day by construction.

### Four axes, and each one was measured holding something back

216 sampled notices → 3. Remove one axis at a time:

| what is removed | kept | what comes back |
|---|---|---|
| nothing (default) | **3** | the DNIT Ceará highway-duplication design-build, and two Petrobras parts |
| the stage axis | 24 | contract extracts, aditivos, homologations |
| the organ axis | 6 | other ministries' notices |
| the procurement-form axis | 8 | 20-litre bottled water, pool chemicals, an Army scrap auction |
| the organ axis *and* Prefeituras | 19 | municipal notices PNCP already carries in full |

**The fourth axis is the one PNCP never needed.** `lib/relevance-pt.ts` was
tuned against PNCP rows, and this platform only ever queries PNCP for
*Concorrência* — so the commodity long tail never reached those rules and they
were never given a reason to learn it. The DOU has no such filter in front of
it. The fix is the same one the PNCP query already makes, applied to the text
instead of to a query parameter, and it is law rather than heuristic: Lei
14.133/2021 forbids Pregão for obras and reserves it for *bens e serviços
comuns*, so the instrument names the category. `Leilão` is checked first and
separately, because the same word covers the state **selling** scrap and the
state buying thirty years of investment.

The subject axis calls `classifyPortugueseExclusion` and
`classifyPortugueseSmallWorks` rather than growing a second keyword list. Two
lists would drift within a month and then disagree about the same tender
depending on which door it came in through.

### Calibrated against a whole edition, and the answer was 37 → 5

The flattened sample said 216 → 3 and could not say more: two rows per organ
cannot reveal how many notices any one body really files. So the default was
left loose and the first full-edition run was made the calibration step. It ran
on 2026-09-20 against Friday 2026-09-18 — **2,139 notices → 37 hits**, which is
not a watch anyone reads. `__fixtures__/dou/watch-kept-2026-09-18.json` is
those 37 rows, copied out of the run's log, and it is the only fixture here
taken from a whole edition rather than a sample.

Two findings, and each has a rule:

**Petrobras alone was 27 of the 37.** Fire damper, welding rod, mechanical
seal, relay, concrete post, 75kVA transformer — and it names no instrument at
all. Its notices read `AVISO DE LICITAÇÃO Nº 70046xxxxx Objeto: Aquisição de
<part>`, so the modality axis had nothing to bite on and `unknown` let every
one through. The rule is now: **no instrument named → read the object.** A
purchase verb with no works verb anywhere is a purchase. `unknown` survives
only for a stub that names neither.

The works verbs are all ACTIONS and no PLACES, and that was learned the same
day: `porto`, `terminal` and `aeroporto` were in the first draft and had to
come out, because Transpetro's "Serviços de ensaios físico químicos … para o
Terminal de Cabiunas" is a laboratory contract that happens to mention a
terminal. In a 403-character stub a place name says where the work happens,
never what it is — and every genuine works notice in that edition carried a
verb anyway.

**Four more were registers, not competitions.** Three Operação Carro-Pipa
water-truck credenciamentos and one AGU call for research foundations. Lei
14.133/2021 files credenciamento under *inexigibilidade*: every qualified
applicant is admitted, there is no dispute, and the notice stays open
indefinitely. They had been passing as `opening` because they say "chamamento
público", which is otherwise a works signal — so `registration` is now its own
form, checked before works, and out of the default.

**37 → 5, and the five are the whole point**: DNIT's Ceará highway duplication
(Concorrência 51/2026, Contratação Integrada), DNIT's port IP4 rebuild
(307/2026), two Navy engineering works, and a Serviço Florestal Brasileiro
**forest concession** — the concession type PNCP structurally cannot carry. The
test names all five, so a later rule change that quietly drops one fails rather
than shrinking a number nobody checks.

### Reaching it

`in.gov.br` opened to the GitHub runner and to Vercel on 2026-09-19 while
closing the socket mid-read on the user's laptop, and it is outside the agent
sandbox's allowlist. So `npm run watch:dou -- --fixture` runs the entire
pipeline against the committed capture with no network at all — the rules can
be read and changed from any machine, and a fetch failure is reported as
够不着 rather than as an empty gazette.

One thing stated rather than measured: the notice permalink,
`in.gov.br/web/dou/-/<urlTitle>`. `urlTitle` exists in the payload for no other
purpose — it is a slug ending in the notice's own numeric id — but no machine
here can confirm it resolves, so every report prints the edition URL beside it,
which *is* the captured address. The first run from a machine that can reach
in.gov.br should check one.

`npm run test:dou-watch` — 74 checks, no network.

## The window was measuring Plone, not the hearing (2026-09-20)

`npm run ingest:antaq` shipped in the morning with `--months 12`, windowing on
`publicationDate`, which for this source is gov.br's byline date. The user's
first live run printed this row:

```
AP 03/2024  flagship  发布 2026-07-06  CONCESSÃO DO PORTO ORGANIZADO DE ITAJAÍ/SC
  .../audiencias-encerradas/audiencia-publica-ndeg-03-2024
```

A 2024 hearing, inside a twelve-month window, under a URL that says
`encerradas`. It was not a near miss. The byline is Plone's *effective date*
for the PAGE, and ANTAQ re-stamps it whenever the page is edited, so the
window was counting twelve months of ANTAQ's editing, not twelve months of
hearings. Two more of the five captures say the same thing without being asked:

| hearing | what the hearing says about itself | what the page says |
|---|---|---|
| AP 07/2025 SSB01 | comment period 29/12/2025 – **27/01/2026** | published **08/06/2026** — five months after it closed |
| AP 04/2026 VDC04 | comment period opened **23/04/2026** | published **25/05/2026** — a month after it opened |

That AP 03/2024 survived turned out to be lucky: its page carries a Data Room
and `Documentação revisada pós TCU`, which makes it arguably the most advanced
of the six. But it survived by having been *edited*, not by being live, and
the next re-stamped page will be a 2022 one nobody wants.

### Three sources of truth, ranked, in `lib/ingestion/antaq-window.ts`

1. **The hearing's own number.** `07/2026` carries its year, ANTAQ numbers per
   calendar year, and nothing re-stamps a number. This decides.
2. **The dates the hearing states about itself** — the cronograma cells and the
   contributions deadline (`statedDays()`). These can only **rescue**: a 2024
   consultation still running sessions in 2026 is live whatever its number
   says, and ANTAQ does keep old numbers alive for years while a project clears
   the TCU. They never drop anything the number kept.
3. **Plone's byline decides nothing.** It is read only to *warn* — when its
   year differs from the hearing's, or when it is later than every date the
   hearing states, the run prints ⚠ and says the stamp does not count. Two of
   the five captures trip it; the other three do not.

Both of (2)'s sources are needed, and each covers for the other. AP 02/2026's
`até … dia` sentence says 02/05/2026 while its cronograma runs the comment
period to 29/09/2026 — the sentence predates an extension, so reading only it
ages the hearing by four months. And AP 07/2026's schedule cell is
`29/06/2026 a 13/08/2026`: one cell, two dates, of which `parseBrazilianDate`
returns the first. A range silently becoming its start date is the quiet lie
this file has already paid for once with deadlines, so every date in the cell
is taken.

### The flag counts years now, and `--months` is refused

Because a hearing number carries a year and not a month, and a window in months
applied to a year-granular signal has to invent eleven months of precision it
does not have. `--years 2` (the default) means this year and last; `--years 0`
means no window. A command line that still says `--months` **exits 1 with the
AP 07/2025 dates in the error**, rather than quietly accepting a flag that used
to mean something different — the failure mode being avoided is a stale
workflow input silently getting a window it did not ask for.

Two years rather than one, deliberately: a port concession runs a consultation,
a TCU review and then an auction, and the whole point of reading the hearing
instead of the auction is to meet the project early enough to prepare. A
twelve-month window throws away the ones about to be tendered.

`npm run test:antaq-window` — 42 checks, no network. The rescue is asserted on
a real row (`--years 1` drops AP 07/2025 by its number and its own 2026-01-27
schedule brings it back), and the AP 03/2024 shape is asserted on a synthetic
one, built rather than captured because that page was never fetched — what is
pinned there is the rule, not that page's contents.


## ANTAQ got a button, and the panel is mostly about what it cannot get (2026-09-20)

`lib/ingestion/ingest-antaq.ts` is the work, called by both
`scripts/ingest-antaq.ts` and `app/api/admin/import-antaq/route.ts` — the rule
`ingest-brazil.ts` already states: one code path, so the page and the command
cannot drift into disagreeing about the same source.

### Why the panel spends more space on the absences than on the fields

On every other source in this admin, 无金额 means "we did not manage to read
it" and the fix is to re-run — PNCP's `amountLookupFailed` exists precisely
because a refusal and a sealed budget looked identical in one total until
2026-09-20. On ANTAQ it means the page **states no money at all**: no ceiling,
no reference price, no CAPEX, verified on all five captures. The investment
figure is inside the EVTEA PDF, behind a separate link. Re-running a hundred
times changes nothing. A panel that showed 「没有金额：5 条」 the way PNCP's does
would send someone hunting a bug that is not there.

Same for the bid deadline: there is none because bidding has not opened, so
`status` is `planned` and `submissionDeadline` stays empty — which is also the
only thing keeping `upsertTendersBatched`'s past-deadline gate from discarding
every row, the mistake that cost one commit when the contributions deadline
was briefly used for it.

### The third row is the one people will ask about

`Minutas de Edital e Contrato`, `EVTEA` and `Diretrizes do projeto` have URLs,
and the import still does not save them as document links, because those URLs
are landing PAGES. One behind a subscriber's download button hands them HTML.
They are rendered as links labelled （页）, and harvesting what sits behind them
needs one more fetch layer written against a real capture of such a page —
which does not exist, so it is not written.

### How often, and why weekly

ANTAQ opens seven or eight hearings a year on gov.br: a new one every six to
eight weeks. Daily would re-read the same six pages. But months apart is wrong
too — ANTAQ keeps adding files to a hearing page after the fact (Itajaí gained
`Documentação revisada pós TCU` and a Data Room in July 2026) and a comment
period is only six to eight weeks long. Weekly meets a new hearing within a
week of it opening, leaving five or six weeks to prepare, and refreshes the
cronograma and attachments on the ones already in. Writes are by `slug`, so
re-running is safe.

The panel's default is `--years 3`, not the CLI's 2: three keeps AP 03/2024
Itajaí, which is arguably the most advanced of the six, and the ⚠ line now
explains why an old-numbered hearing is in the list rather than leaving it
looking like a bug.

## The DOU permalink is still the one thing stated and not measured (2026-09-20)

`douNoticeUrl()` builds `https://www.in.gov.br/web/dou/-/<urlTitle>` and that
shape was **written down, never verified**. It decides what the DOU can ever
be: if the detail page carries the full text, the watch narrows a day to a
handful of hits and a handful of extra fetches turns them into real rows; if
it does not, the DOU stays a lead radar because 403 characters is not a tender.

A browser test from the laptop on 2026-09-20 returned
`ERR_HTTP2_PROTOCOL_ERROR`. That is **not** a verdict on the URL — it is
in.gov.br's known behaviour toward that network, which closes the socket
mid-read there, and it is why the DOU watch runs on the runner in the first
place. The test has to happen where in.gov.br answers.

`scripts/probe-dou-permalink.ts` (`what=dou-link`) is that test. It fetches the
first N notices' permalinks from a real edition and reports, per notice, the
status and the readable length of the article region **against the length of
the snippet it came from** — because a 200 that returns the same 403 characters
is a page that exists and does not help, and only the comparison separates
those two.

### It ran, and the URL shape is right

Runner, 2026-09-20, Seção 3:

```
── 5 / 5 条详情页打得开，其中 5 条正文明显比摘要长 ──
  AVISO DE LICITAÇÃO        200 · 正文 1044 字（摘要 403 字）
  AVISO DE SUSPENSÃO        200 · 正文 1105 字（摘要 403 字）
  AVISA DE DISPENSA …       200 · 正文 1054 字（摘要 403 字）
```

Five of five at 200, every one about 2.6× the snippet. `https://www.in.gov.br/
web/dou/-/<urlTitle>` resolves, and it stops being the one thing in this
source that was written down rather than measured.

**What it does NOT settle is what is on those pages.** The length was measured
inside a content region the script GUESSES at — `texto-dou`, then `<article>`,
then `<main>`, then the whole document — and a number produced by a guessed
selector is not a reading of the notice. The three lengths also came back
within 60 characters of each other, which is what page chrome looks like.

So the script gained `--save`, which writes the pages into
`__fixtures__/dou/detail/` for the workflow to commit, with scripts and styles
removed and **nothing else trimmed** — unlike the ANTAQ capture, which could
name `<main>` because five real pages had been seen first. Nobody here has seen
one of these, so a guessed container could remove the notice and leave no trace
that it happened, which is the same error as trusting the guessed length.

The parser gets written against those bytes and not before. Rule of this file,
paid for three times: a mapper is written against a real capture, never against
an expectation of one — and "the detail page carries the full notice" is,
until those bytes are read, exactly an expectation.


## The eight saved DOU pages, and the one that holds seven tenders (2026-09-20)

`what=dou-link --save --count 8` brought back eight real detail pages from the
2026-09-18 Seção 3 edition. They answer three things, and the third changes the
design.

### First: the number I reported the run before was wrong

That run said the detail bodies were 1044, 1054 and 1105 characters. They are
897, 1544 and 2751. The reading regex matched `texto-dou` with a lazy `</div>`
stop, which ends at the **first** closing div — inside the wrapper, not at the
end of it. Three notices of obviously different sizes landing within 60
characters of each other was the tell, and it is exactly the failure this file
keeps writing down: a number produced by a guessed selector is not a reading.

The saved pages show the real container: in.gov.br wraps every paragraph of a
notice in `<p class="dou-paragraph">`, **1 to 8 of them**. So nothing has to be
guessed about where a body ends, and `noticeText()` reads those.

### Second: the detail page carries the notice whole

Bodies measured 539 to 3763 characters against the payload's 403-character cap
— 2× to 9×. The object description is complete rather than cut mid-word. The
opening date is there, though in prose and in at least three phrasings:
`Abertura: 05/10/26 às 09h`, `dia 30 de setembro de 2026, às 08 horas`, and
`O recebimento das propostas será das 13h30min do dia 21/09/2026 até as
13h00min do dia 05/10/2026`. Where to obtain the edital is named
(`www.guarulhos.sp.gov.br`, Comprasnet, a Pregão app).

A **value** appears in exactly **one of the eight**: `Valor máximo estimado de
R$ 991.670,82`. So money is occasional here, not reliable — closer to ANTAQ
than to PNCP, and a mapper must not treat its absence as a failure.

### Third: one notice is not one tender

`02-avisos-de-licitacao-732452192.html` is a single DOU notice from Guarulhos
carrying **seven separate tenders** — CP 95034/26, CP 95035/26, CP 95036/26,
PE 90159/26, PE 90160/26, PE 90161/26 and a reprogrammed PE 90155/26 — each
with its own number, its own object and its own opening date, one per
`dou-paragraph`. A mapper written on "one notice, one tender" would keep one of
the seven and silently lose six, or worse, merge them into a row whose title
belongs to one and whose deadline belongs to another.

That is a municipal habit — a city hall publishing its week's schedule in one
notice — and `dou-watch.ts` drops Prefeituras. But **that these eight contain
none of the watch's actual hits is the point**: they are the day's first eight,
which was the right sample for "does the URL resolve" and the wrong one for
"can these become tenders". The rows a parser has to be written against are the
five the watch keeps out of 2,139 — the DNIT highway, the Navy quay, the forest
concession — and none of them is here.

So the probe gained `--kept`, which runs `watchDouEdition()` first and follows
its hits instead of the day's opening. It also now counts distinct
instrument+number pairs per notice and flags a body carrying more than one, so
the seven-in-one shape announces itself in the log rather than waiting to be
found by a mapper. The detail parser gets written once those pages are in hand,
and not before.

## 跑批机凌晨跑，问的是巴西还没到的那一天（2026-09-21）

第 13 次 workflow 失败了，退出码 1，21 秒。它报的是：

> DOU 2026-09-21 do3 页面取到了，但里面没有带 jsonArray 的 JSON 块 —— in.gov.br 多半改了页面结构

**这句话是错的，而且是我写的。** 那一刻是 UTC 周一 00:41，巴西利亚还是**周日晚上 21:41**，周一那期根本还没出版。in.gov.br 老老实实返回了一个没有内容的页面，脚本把它翻译成了「国家出版局改版了」。

日期是 `lastWeekday()` 算的，而它按 **UTC** 数日子：

```ts
const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
```

巴西是 UTC−3，所以**每天 00:00–03:00 UTC 之间跑的任何一次，问的都是巴西的明天**。周一凌晨最严重：往前退周末的逻辑看到「周一」是工作日，不退，于是要了一期不存在的报。

### 改了三处

**一、日子按巴西利亚算。** 新的 `brasiliaDay()` 用 `Intl` 加时区名，不是写死 −3 —— 巴西 2019 年取消了夏令时，写死的偏移量离「国会改一次法就悄悄错掉」只差一步。`lastWeekday()` 和 `recentWeekdays()` 都从它起算。`scripts/capture-dou.ts` 里那份**复制出来的同样有 bug 的** `lastWeekday` 删掉了，改成共用一份。

**二、「取不到」和「取到了但没内容」分成两种错。** 以前都叫 `douUnreachable`。现在是 `DouFailureKind`：

| kind | 意思 | 该做什么 |
|---|---|---|
| `unreachable` | 页面没到手：拒了、读一半断了、拦截页 | 换台能开 in.gov.br 的机器跑 |
| `no-payload` | 页面完整到手，里面没有那块 JSON | **三种可能**，见下 |

`no-payload` 单独一天**说明不了任何事**：还没出版、法定假日、改版，长得一模一样。所以它现在只陈述看见了什么，不下结论。

**三、往前走着问，直到问到真的有的那一期。** 新的 `fetchLatestDouEdition()` 从今天起往前数工作日（默认最多 3 个）：

- 任何一天有内容 → 就是它，`skipped` 里记下跳过了哪几天、为什么，节假日不会无声消失
- 每天都 `unreachable` → 网络问题，和以前一样
- 每天都取到页面、每天都没有 JSON → **到这一步才配说「in.gov.br 改版了」**

这就是那条判据：**一天空是日历问题，连着三个工作日空才是结构问题。** 结论是走出来的，不是断言出来的。

`probe:dou-link` 改用它了，不再问「今天」。`watch:dou` 一天都没读到时，会按 `unreachable` 还是 `no-payload` 说两段不同的话 —— 对着节假日喊「够不着」会把人支去查网络。

`test-dou-watch` 从 92 项加到 97 项，新的 5 项钉死了这个时刻：`brasiliaDay("2026-09-21T00:41:53Z")` 必须是 `2026-09-20`，02:59 UTC 还没跨天，03:01 才跨，而那一刻的 `lastWeekday()` 要给出 **2026-09-18**（上周五）。

### 还没被咬到的那一次

`watch-dou.ts` 有同一个 bug，只是还没排进定时任务。`daily-ingest.yml` 跑在 11:17 UTC（巴西 08:17），在出版之后，所以它一直是对的 —— 纯属运气。DOU 监控哪天排进 cron，凌晨那一档就会天天误报「改版了」。现在提前拆了。

## DOU 详情页有两种形状，发布机构决定是哪种（2026-09-21）

第 14 次跑批拿到了 watch 真正命中的那 5 条。加上上一批当天头 8 条，一共 **13 份真实详情页**，`lib/ingestion/dou-detail.ts` 是照着它们写的。

### 形状 A：Comprasnet 标签式 —— 13 份里 4 份

走 Compras.gov.br 发布的机构，一个字段一段，**机器直接能读**：

```
Modalidade: Concorrência 51/2026
Número do processo: 50603.001604/2026-08
Objeto: Contratação Integrada … duplicação … Rodovia BR-116/CE (km 75,50 ao km 114,10) …
Data de início de recebimento de propostas: 18/09/2026, 08:00
Data de Abertura: 17/12/2026, 09:30
Endereço eletrônico do Edital: https://cnetmobile.estaleiro.serpro.gov.br/…?compra=39302403000512026
```

**这就是一个项目。** `Data de Abertura` 正是那 403 字摘要里永远没有的开标日期，标书地址是带 `compra` 号的深链，不是门户首页。

### 形状 B：散文式 —— 13 份里 9 份

其他人都写成句子。日期至少三种写法，标号混在句子里，其中瓜鲁柳斯那条**一条装七个标**。

### 4 份标签式全是联邦、全是 watch 留下的那几条

这是个有用的相关性 —— **平台真正盯的那类公告，恰好是机器可读的那类** —— 但它是一天的观测，不是国家出版局公布的规则。

### 这个模块拒绝做的事

**不解析散文。** 散文公告返回 `shape: "prose"` 加一句原因，继续当线索。拿九种市政写法去猜开标日，正是这个仓库付过三次学费的「照预期写 mapper」，而且失败是无声的 —— 错的截止日和对的一样能排序、能筛选、能渲染。

**一条里有多个标号就拒绝映射**，标签式也一样。留一个丢六个比一个都不留更糟，因为没人会发现那六个。

### 写这个模块时自己踩的坑（测试抓出来的）

勘误页写的是：

> `Nova data de início de recebimento de propostas: de 16/09/2026 para 18/09/2026`

第一版把 `Data de início de recebimento de propostas` 当子串匹配进了 `Nova data de…`，再取值里第一个日期 —— 返回 **09-16，也就是被取消掉的那个日期**。这是最坏的一类错：它是个真日期、在合理范围内、排序和渲染都正常，只是会把人送到一个已经不存在的日子。

修法两条：标签匹配**锚定**在段首或 ` / ` 之后；`de X para Y` 取 `para` 后面那个，并把改之前的日期留在 `proposalsMovedFrom` 里，**让改期这件事看得见，而不是被悄悄覆盖**。

### 对「DOU 能不能抓 PNCP 没有的项目」的回答，要分开说

- **联邦工程类：能。** DNIT 的 BR-116 公路复线、Eirunepé 港口 IP4、海军两个工程 —— 标的、开标日、标书深链全有，可以直接入库。
- **特许经营：这一批没证明。** 唯一那条森林特许（Bom Futuro 国家森林，Concorrência 03/2026）是**散文**，而且它是一份 `AVISO DE RETIFICAÇÃO`（勘误），不是原始招标公告。所以它既没证明特许能自动入库，也没证明不能 —— **要抓一条特许的原始 AVISO DE LICITAÇÃO 才算数。** 而特许恰恰是 DOU 相对 PNCP 最值钱的那部分。

### 样本目录现在有点乱

`__fixtures__/dou/detail/` 里 13 份来自两批，编号前缀 01–05 各撞了一次，靠 slug 区分。暂时不动 —— 改名会让这两批各自的来源说明对不上号。

## DOU 要入库，先解决和 PNCP 撞车（2026-09-21）

### 两边的主键没有一个字段是共用的

| | 键 | 去重方式 |
|---|---|---|
| **PNCP** | `numero_controle_pncp` = `<CNPJ>-1-<顺序号>/<年>` | slug = `brazil-<它>`，`upsert onConflict: "slug"` |
| **DOU** | 标书链接里的 Comprasnet `compra` 号 = **UASG(6) + 模式(2) + 标号(5) + 年(4)** | 没有 |

`compra=39302403000512026` → UASG 393024、模式 03、Concorrência 第 51 号、2026 年。**4 份标签式页面全部验证过**，不是从一个例子推的。

**UASG 不是 CNPJ，PNCP 的顺序号也不是标书编号。** 所以今天直接导 DOU，PNCP 已有的每一条都会**多出一行**。而且这种重复不是难看而已：**同一个标会以两个不同的截止日出现两次** —— DOU 给的是 `Data de Abertura`，PNCP 给的是 `data_fim_vigencia`。

### 而且很可能撞得很厉害

能解析的那 4 条，全是**走 Compras.gov.br 发布的联邦工程** —— 而 Lei 14.133/2021 要求的就是这类必须上 PNCP。

反过来，PNCP 结构上装不下的那条（Bom Futuro 森林特许），恰恰是**散文式、解析器拒绝映射**的那条。

> 也就是说：**能读的多半是已经有的，没有的多半读不了。** 这句话目前是推理，不是测量 —— `scripts/probe-pncp-overlap.ts` 就是去把它证实或证伪的。

### 探针问两件事

1. **这 4 条 PNCP 里有没有？** 拿标的前 12 个词去 PNCP 检索，**只有返回行里带着同一个标号才算命中** —— 光靠标的文字匹配，会把巴西所有公路工程都认成同一个标。
2. **PNCP 命中行的全部字段打出来**，看有没有 UASG / 采购单位编号之类能当连接键的东西。有 → 能按号去重；没有 → 只能靠规则不让两边抓同一类。

跑法：Actions → Probe Brazil doors → `what=pncp-overlap`。它只读已提交的样本文件加 PNCP，**不碰 DOU、不写库**。

### 不管探针结果如何，有条底线先立着

DOU 导入**只导 PNCP 结构上装不下的那些**：特许经营（不是 Lei 14.133 意义上的 *contratação*）、第一节的批复、自建门户的国企。这本来就是当初要读 DOU 的理由 —— 联邦工程是 PNCP 的活，让它干。

## 重叠探针第一次跑：结论是我的 bug，但连接键找到了（2026-09-21）

第 15 次跑批打出「3 条会和 PNCP 撞车」。**这句话不成立，是匹配逻辑写错了。**

### 错在哪

判重那一句是：

```ts
JSON.stringify(row).includes(detail.number.split("/")[0])   // ← "151"
```

**这会在整行 JSON 的任何位置匹配那串数字** —— 时间戳里、内部 id 里、CNPJ 里都算。证据就在它自己打印的那一行里：号称对上海军 Concorrência 151/2025（UASG 753000，里约州阿拉亚尔杜卡布的码头）的，是

```
orgao_nome     UNIVERSIDADE TECNOLOGICA FEDERAL DO PARANA
municipio_nome Pato Branco
title          Edital nº 109/2026
unidade_codigo 153177
```

**帕拉纳州的一所大学。** 这不是「匹配得松」，是根本没匹配上。和这个仓库反复记的那条是同一件事：**用猜出来的比较算出的数字，不是测量。**

### 但这一跑拿到了真东西：连接键存在

就在那行被错认的数据里：

| | DOU 给的 | PNCP 给的 |
|---|---|---|
| 采购单位 | `compra` 号前 6 位 = **UASG** | **`unidade_codigo`**（那行是 `153177`） |
| 标号 | `compra` 号第 9–13 位 | **`title`** 里的「Edital nº 109/2026」 |
| 年份 | `compra` 号后 4 位 | `ano` |

**两边都有，能对上，不用靠标题文字猜。** 上一节写的「两边没有一个字段是共用的」，现在要改：PNCP 那个 search 端点返回的字段比 mapper 里定义的 `PncpRow` 多，`unidade_codigo` 一直在，只是没被读进来。

### 改了什么

判重改成 **UASG 对上 + 标号对上**，并且结果分三档：

- **确认 PNCP 已有** —— UASG 和标号都对上
- **说不准** —— 检索结果里没这个 UASG，或有这个单位但不是这个标
- **没问到** —— PNCP 连不上

第二档特意不叫「DOU 独有」。**全文检索找不到，不等于 PNCP 里没有** —— 这和「够不着不等于空的」是同一条规矩。这个探针能证明「有」，**证明不了「没有」**。

（另外那一跑里 Concorrência 307/2026 是 `fetch failed`，如实报成「没问到」，没被算进任何一边。）

## PNCP 会限流，而我给探针写了条没有重试的新路（2026-09-21）

第 16 次跑批：**4 条全是 `fetch failed`，一条都没问到。** 十分钟前第 15 次，同一台跑批机把 4 条里的 3 条问通了。

**PNCP 不是挂了，是在限流。** 而这是最该重试的一种失败 —— 恰好是两处都没覆盖到的那种。

### 两个洞，一个原因

**一、探针自己开了一条 `fetch()`，零重试。** 这个仓库的规矩写得很清楚（`ingest-brazil.ts` 里那句「一条代码路径」），我写探针时没守。改成走 `fetchPncpSearchByText()`，和真正的连接器同一条路、同一套退避（5 次，约 109 秒）、同一组请求头。顺带每条之间隔 3 秒，不再连着轰四发。

**二、连接器的重试判据只认 `ECONNRESET`。**

```ts
if ((current as NodeJS.ErrnoException).code === "ECONNRESET") return true;
```

而 Node 报告「连不上」用的是裸的 `TypeError: fetch failed`，真正的原因藏在 `cause.code` 里，有些 TLS 错误连 `cause` 都没有。于是它落到 `throw err`，**第一次就放弃**。

**这个洞在生产路径上也有** —— 每天那趟 PNCP 导入，碰到一次限流就直接报错退出。改成 `isTransientNetwork()`，认 `ECONNRESET / ECONNREFUSED / ENOTFOUND / EAI_AGAIN / ETIMEDOUT / EPIPE` 和 undici 那几个 `UND_ERR_*`，外加裸的 `fetch failed`。

**400 和 404 仍然不重试** —— 那是我们自己的请求写错了，重试只是花 109 秒睡到同一个 400。

`test-brazil-pncp-mapper` 加了 8 项把这条钉死，包括「裸 `fetch failed` 要重试」和「自己写错的请求不重试」这一正一反。

### 记下来

这是这个仓库第三次付同一笔学费：**一次尝试分不清「对方死了」和「对方这会儿不理你」，而这两件事的下一步是相反的。** 前两次是 sisapinternet（跑批机 1 次验证页 + 2 次 502 就下了结论）和 ANEEL。

## 量出来了：DOU 能解析的那批，PNCP 全都已经有（2026-09-21）

第 17 次跑（`2c114b9`，重试和限速进去之后）终于拿到了真数字。4 份标签式详情页：

| DOU 通告                     | UASG   | PNCP                                  |
| ---------------------------- | ------ | ------------------------------------- |
| Concorrência 51/2026（更正） | 393024 | **有** — DNIT-CE，`Edital nº 51/2026` |
| Concorrência 307/2026        | 393003 | 说不准（全文检索回了 0 条）           |
| Concorrência 133/2026        | 791181 | **有**                                |
| Concorrência 151/2025        | 753000 | **有**                                |

**3 条确认撞车，1 条说不准，0 条没问到。**

「说不准」那条是**说不准**，不是「DOU 独有」。PNCP 的全文索引没把它按这几个词捞出来，不等于库里没有 —— 跟「够不着 ≠ 空的」是同一条规矩。想坐实只能按 UASG 直查，不能靠检索落空反推。

### 比撞车更要紧的：我之前写的「重复行至少日期不一样」是错的

这句话原本躺在 `probe-pncp-overlap.ts` 的文件头，理由是「DOU 给 Data de Abertura，PNCP 给 data_fim_vigencia，两边字段不同名」。命中行一打出来就不成立了：

```
开标   DOU 2026-12-17   PNCP 2026-12-17T09:30   同一天，PNCP 还多给了时分
收件   DOU 2026-09-18   PNCP 2026-09-18T08:00   同一天
```

而且这一条恰好是**更正通告**（收件日从 09-16 改到 09-18）—— PNCP 的 `data_inicio_vigencia` 已经是 09-18。**改期 PNCP 也跟上了，DOU 连「更快」都算不上。**

所以这一类 DOU 行不是「多一个信息源」，是**同一条更差的副本**：少时分、少 `orgao_cnpj`、少 `numero_controle_pncp`、少 `valor_global`。

这句错话之所以能活到今天，是因为**没有任何东西检查它**。现在每次命中都把两边日期并排打出来，并统计「开标日和 PNCP 一致」的条数：全部一致就直说副本更差，有对不上的就点名让人去看。断言搬进了输出里。

### 去重键确实存在

PNCP 行上的 `unidade_codigo` **就是 UASG**（命中行 393024，和 DOU 的 compra 号一致），`title` 里带着 `Edital nº 51/2026`。DOU 的 compra 号给出 UASG + 标号 + 年。两边对得上，不用靠标题文字猜。

但要注意：命中行的 `numero_sequencial` 是 **15**，`numero` 是 **null**，而标号是 **51**。**PNCP 的 sequencial 不是标号**，入库用的 `numero_controle_pncp` = `04892707001697-1-000015/2026` 里那个 `000015` 也不是。所以 DOU 侧拿不到现成的 slug —— 要去重，得先拿 UASG + 标号反查一次 PNCP 换出 `numero_controle_pncp`。也就是说：**DOU 的联邦工程要入库，必须先问一次 PNCP，那还不如直接用 PNCP。**

### 结论：DOU 连接器不碰带 Comprasnet 链接的联邦工程

这一类是 Lei 14.133/2021 强制进 PNCP 的，PNCP 那边更全、更准、还能去重。DOU 只留给 PNCP 结构上装不下的：特许（不是 _contratação_）、第一节的批复、按 Lei 13.303/2016 走自家门户的国企。

**而这恰好是现在还没验证能不能解析的那一类。** 唯一抓到的特许（Flona do Bom Futuro，Concorrência 03/2026）是散文式的，`dou-detail.ts` 拒绝映射，而且它还是一份 `AVISO DE RETIFICAÇÃO` 而不是原始通告。下一步是抓一份特许的原始 `AVISO DE LICITAÇÃO` —— 在那之前，DOU 导入器该不该写都还是没答案的。

## 要抓的那一条，一天只有一条，而且那天那条是勘误（2026-09-21）

定下「DOU 只留 PNCP 装不下的那几类」之后，下一步是抓一份**特许的原始通告**。本来打算让用户跑 `dou-link --kept --save` 碰运气，先按真实数据算了一下，发现那是在掷骰子：

2026-09-18 那份**完整版面 2,139 条**（`watch-kept-2026-09-18.json`，不是样本）：

- watch 放行 **37** 条 → 收紧后 **5** 条
- 这 5 条里，命中特许词的 **只有 1 条**
- 而那 1 条是 **`AVISO DE RETIFICAÇÃO`**

`--kept` 取的是当天前 5 条命中，特许一天就这么一条，还未必是原始通告 —— 按一次按钮期望值就是 0，而 0 什么也说明不了。

### 所以加了 `--concession`，并且默认往回扫 10 个工作日

两道闸，第二道和第一道一样重要：

1. `form === "works_or_concession"` 且命中 `FORM_CONCESSION`
2. **`stage === "opening"`** —— 勘误不算

第二道是重点。勘误是对一份**这里没人见过的原始通告**的修改：它没有的字段，可能只是因为原件已经写了。**拿勘误回答「原始特许通告能不能解析」，答案是假的。**

`FORM_CONCESSION` 挪进了 `dou-watch.ts`，比 `FORM_WORKS` 里那半句**故意更宽**：`FORM_WORKS` 要求带限定词（`concessão florestal`、`concessão de serviço`），因为它的任务是别为「concessão」这个词乱叫人；这里的任务是**把候选找出来人工读**，误报只花一次抓取，漏报丢掉的是整个问题。

### 0 条是什么意思，先写清楚再跑

- **几天是 0** → 特许本来就稀疏，正常。
- **扫了十几个工作日还是 0** → 不是稀疏，是 `FORM_CONCESSION` 和 DOU 实际印的词对不上，回来改正则。
- **一期都没取到** → 「够不着」，退出码 1，不当成「没有特许」。

`test:dou-watch` 加了 5 项按真实那天钉住：37 条里特许恰好 1 条、就是 Flona、它的 stage 是 `amendment`、所以那天 `--concession` 取 0 条**是对的**、以及闸子本身没失灵。最后一项是防止正则哪天改坏了、探针悄悄变成永远返回 0。92 → 102。

顺带：存下来的文件名前面加了版面日期。原来两批都从 `01` 开始编号，一天一批还能忍，扫十个工作日就每次都撞。

### 还是没答案的

**DOU 唯一有价值的那一类，恰好是现在还没验证能不能解析的那一类。** 抓到一份原始特许通告之前，「DOU 导入器该不该写」没有答案 —— 也不该动手写。

## 特许通告抓到了，五份。答案是「能看，不能自动入库」（2026-09-21）

第 18 次跑，`dou-link --concession --save`：**扫了 9 个工作日、19,707 条公告，筛出 5 条，全部存回了分支。**

筛子是对的 —— 这 5 条里 4 条是 `AVISO DE LICITAÇÃO`，正是之前缺的**原始通告**。

| 日期  | 是什么                                                           | 形状 | 解析器读出什么 |
| ----- | ---------------------------------------------------------------- | ---- | -------------- |
| 09-16 | Infraero 五个机场的保税物流仓特许（5 个标段）                    | 散文 | **什么都没有** |
| 09-14 | 土地租赁 Concorrência 41/2026                                    | 标签 | 全部读出       |
| 09-10 | **Flona do Bom Futuro 第 2 标段森林特许**（碳信用 + 原生林木材） | 散文 | **什么都没有** |
| 09-09 | 阿尔塔米拉森林特许的**听证会**公告                               | 散文 | **什么都没有** |
| 09-08 | ICMBio 卡拉雅斯露营与便利服务特许                                | 散文 | **什么都没有** |

### 第一个结论：「PNCP 装不下」这条判断是对的

- Infraero 走 **licitacoes-e.com.br**（巴西银行的平台），不是 Comprasnet
- Flona 的标书在 **林业局自己的门户**，依据是 Lei 11.284/2006，投标信封要送到 **B3 交易所**
- ICMBio 那条引的是 Lei 14.133 + **Lei 8.987/1995（特许法）**

这三条 PNCP 里都不会有。DOU 确实是唯一的公开渠道。

而唯一那条**标签式**的（土地租赁 41/2026）带着 Comprasnet 链接 —— 按 run #17 定下的规矩，它是 PNCP 的活，不从 DOU 进。**规矩和数据对上了。**

### 第二个结论：形状还是发布机构决定的，特许全是散文

四条特许，四条散文，解析器一个字段都给不出来。之前「发布机构决定形状」的判断在特许上也成立 —— 而且**恰好全落在不利的那一边**。

### 第三个结论，也是最要紧的：这些正文里的日期会骗人

ICMBio 那份正文里有 **4 个葡文长日期**：

```
1 de abril de 2021      ← Lei nº 14.133 的颁布日
28 de agosto de 2007    ← Lei nº 11.516 的颁布日
13 de fevereiro de 1995 ← Lei nº 8.987 的颁布日
20 de outubro de 2026   ← 真正的开标日
```

**一个「取第一个长日期」的解析器，会把截标日写成 2021-04-01。** 格式没错、日期真实、排序渲染都正常 —— 完全错误，而且错得看不出来。这正是这个仓库反复付学费的那个形状。

Flona 那份也一样：`04 de novembro de 2026`（交信封）和 `18 de novembro de 2026`（开技术标和价格标）是**两个不同的日期**，哪个是「截标日」要读懂流程才知道，不是挑一个就行。

`test:dou-detail` 加了 19 项按这五份页面钉住，包括那四个长日期的顺序、以及「解析器现在不给开标日 —— 宁可没有，也不要那个 2021」。69 → 88。

### 所以：DOU 导入器现在不写

要写就得做一个**葡文散文日期解析器**，而且要能分清法条颁布日、交件日、开标日。这不是正则能干净解决的事 —— 更像该走文档抽取那条路（仓库里已经有 Qwen 抽关键日期的管线）。

在那之前，DOU 对特许的正确用法是**线索雷达**：每天把这几条推给人看，人点进 in.gov.br 读原文。这也正是 `watch:dou` 现在在做的事。

## 智利：一轮什么都没量到的测量，以及为什么它仍然是个结论（2026-09-24）

任务是开智利这个源。第一阶段只做一件事：**不写连接器，先量**。按巴西 PNCP、ANTAQ、DOU 那三次的顺序来——
先探，后写，其中两次探针把计划整个推翻了。

这一轮的结果是：**关于智利，我一个字都没量到。** 但这句话本身不是「探针失败了」，它是一个有明确下一步的结论，
下面说清楚差别在哪。

### 门一个都没敲开，而拦路的不是智利

写了 `npm run probe:chile-doors`（`lib/ingestion/chile-doors.ts` + `scripts/probe-chile-doors.ts`），
13 个智利方向的门加 3 个对照，实跑了一轮。结果：

```
C0   github.com                          通了 ★   200   319ms
C0b  pncp.gov.br（巴西，生产在用）        本机出口被拦   403   146ms
C0c  contratacionesabiertas.oece.gob.pe   本机出口被拦   403   447ms
C1   api.mercadopublico.cl                本机出口被拦   403    83ms
C3   datos.gob.cl                         本机出口被拦   403    52ms
…（其余 8 个智利方向的门，全部同样）
```

**那个 403 不是智利发的。** 是跑这段代码的容器，它自己的出口网关伪造的：

```
HTTP/1.1 403
content-type: text/plain
x-deny-reason: host_not_allowed

Host not in allowlist: api.mercadopublico.cl.
Add this host to your network egress settings to allow access.
```

到智利的 socket 从来没建立过。这一点是靠 **C0b / C0c 这两个对照**才站得住的：巴西 PNCP 和秘鲁 OECE 是这个平台
生产环境每天在跑的源，它们从这台机器也是一模一样的 403。所以这台机器对智利说的任何话都不能采信——
差别在机器，不在智利。

这正是本文件那条老规矩的第四种形态：**够不着 ≠ 空 ≠ 还没发布 ≠ 根本没问**。前三种状态在这个仓库里已经付过
学费，第四种以前没有名字，而它在状态码上和第一种长得一模一样。

### 差点就把它写成「智利的 WAF 拦了我们」

这是这一轮最该记下来的东西。`peru-oece-live.ts` 整个文件的注释都在讲一件事：`.gob.pe` 的 403 意味着什么——
User-Agent 不对，或者对方封了机房 IP 段。两个都是**关于数据源的事实**，两个都有对应的下一步。

而这次的 403 两个都不是。如果照着老经验读，这一轮的报告就会写成「智利的 API 拒绝了我们，疑似 WAF」，
然后下一个人会去调 User-Agent、换出口、甚至去想办法绕——**全部建立在一个根本没发出去的请求上**。

`lib/ingestion/egress-denial.ts` 就是为这件事单独拆出来的一个判别器，认 `x-deny-reason` 响应头，正文兜底。
它有一条反向断言钉在测试里：秘鲁 2026-09-11 那次**真的**被对方边缘代理拒绝的 403 正文
（`{"code":"403","message":"Forbidden","RequestId":"${http.request.id}"}`，连模板占位符都没展开的那份），
**不能**被判成本机出口问题。两个方向都误判不得。

**这一轮没有把它接进现有的连接器。** 秘鲁、巴西那几条是有付费用户在用的线上导入路径，在一个新源的分支上
去改它们不合规矩。但值得记一笔：`oeceError()` 现在会把这种网关 403 渲染成
「OECE /files responded 403 Forbidden — 服务端返回：Host not in allowlist…」，后面再跟上 `whereAmI()` 的
「如果同一台机器上 npm run ingest:peru-live 能跑通，问题就不在 IP」——**而那条命令会被同一个网关拦掉**。
正文至少是打出来了，仔细读能看出来，赶时间的人看不出来。建议单独开一个 PR 把 `egressDenial()` 接到
`oeceError()` 和 PNCP 的 `getJson()` 前面。

### 凭证这一问：没量到，只能说「不确定」

工作假设是 Mercado Público 的 `/servicios/v1/publico/…` 要一个 `ticket`（API key）。**这是回忆，不是测量。**
C1 那个门就是专门不带 ticket 去问的——对方的报错原文才是「要什么凭证」的答案，比任何人的记忆都可靠。
这一轮它没问成，所以：

- 智利要不要凭证 —— **不确定**
- 凭证在哪儿申请、要不要智利本地主体 —— **不确定**
- 有没有一条完全不要凭证的 OCDS / 批量文件路 —— **不确定**

探针读 `CHILE_MERCADOPUBLICO_TICKET` 这个环境变量，**只在平台所有者自己配了的情况下**才用。没配就跳过那个门，
并且明确标成「跳过」而不是「被拒」。不绕、不伪装浏览器、不自己去注册——要不要申请是所有者的决定。

### 探针本身：现在可以拿到别的机器上跑

这一轮真正的交付物是这个探针，不是结论。它在有出口的机器上能直接回答任务里那六个问题：

```
npm run probe:chile-doors                       # 敲门，打报告
npm run probe:chile-doors -- --save             # 把每一份真实响应存成 fixture
npm run probe:chile-doors -- --save "跑批机"     # 报告里写清是哪台机器敲的
```

几条设计上的选择，都是从这个仓库以前踩的坑来的：

- **每个门都标了把握程度。** 标「猜」的那些，连 URL 拼法都是回忆的——它们回 404 说明的是拼法，不是智利。
  报告里不允许把猜测印成发现。
- **对照分两组**，因为它们问的是两个不同的问题。C0（github）只证明进程有网；C0b/C0c 才证明这台机器够得着
  同类的政府开放数据主机。**第一版把这两组合并了**，于是在 C0 通、C0b/C0c 全挂的那一轮里，报告打出了
  「探针自己的网络是好的，下面的结果可以当数据读」——一句彻头彻尾的错话，而且错在最贵的方向上：
  它邀请读者把 13 个没发出去的请求当成 13 条关于智利的发现。`test:chile-doors` 里那条回归测试就是钉这个的。
- **「答了但是空的」算答了**，不算失败。一个返回零条的接口是告诉了我们真事（这个窗口没有新发布），
  把它折进失败里，是好源被写死的常见方式。
- **JSON 描述报的是字段名**，不是外层信封。巴西那轮探针把 CKAN 的信封（每次 CKAN 调用都长一样）当成发现报过一次。
  映射器是从字段名写出来的。

### fixture 目录里现在有三份，没有一份是智利数据

`lib/ingestion/__fixtures__/chile/` 存的是网关自己的字节，原样未改。留 `c0c`（秘鲁那份）是有意的：
没有它，另外两份会被读成「智利拒绝了我们」。`scripts/test-chile-doors.ts` 22 项按这些真实字节钉住。

### 顺带量到的几件仓库内部的事实（这些是真查过的）

- `lib/currency.ts` 里**没有 CLP**。没有汇率，`convertToUsd()` 会返回 null，于是一条真实的智利比索金额会被
  分级器读成「没有公布金额」——正是 EUR/GBP 和 BRL 那两条注释存在的原因。智利真要入库，这一行必须先加，
  而汇率得由所有者核一个真实数字过来（这台机器也够不着任何汇率源）。
- `lib/ingestion/source-language.ts` 已经把智利路由到 `es`（默认值就是 `es`，只有 `Brazil` 走 `pt`）。
  **不需要**新的翻译或抽取 prompt。
- `lib/ingestion/connectors/ckan.ts` 是不带主机名的、照 CKAN 官方 Action API 写的。如果 `datos.gob.cl` 真是
  CKAN（C3 那个门就是问这个），这条读取路径基本是现成的。
- `lib/ingestion/ocds-mapper.ts` 同理，它吃的是 `OcdsRelease`，跟国家无关。智利若有 OCDS 出口，映射成本很低。
- `Chile` 已经在 `lib/tender-labels.ts` 的 `ALL_COUNTRIES` 里（后台下拉框能选），但**不在**
  `lib/tender-list-page.ts` 的 `AVAILABLE_COUNTRIES` 里，而且 `scripts/test-list-facets.ts:110` 主动钉住了
  它不出现。这一轮两处都没动。

### 所以：现在需要所有者决定的是什么

1. **给不给这个容器出网权限**（环境设置里的 Network access → 允许的域名）。至少要放行
   `api.mercadopublico.cl`、`datos.gob.cl`、`www.chilecompra.cl`。或者——更省事——把
   `npm run probe:chile-doors -- --save` 挪到跑夜间导入的那台机器上跑一次，把 fixture 带回来。
   **这一步不做，第二阶段就没法开始**：字段名、字段含义、每天多少条，一个都没测到。
2. **要不要去申请 Mercado Público 的 ticket。** 等探针跑通、对方把要求用自己的话说出来之后再决定，
   不用现在拍板。
3. 智利的前台可见性（`AVAILABLE_COUNTRIES`）和后台导入按钮，都还在门后面，等真有数据了再说。

### 这一轮没做的事，以及为什么

没写 `chile-*-live.ts`、没写映射器、没写 `ingest-chile.ts`、没写 `ingest:chile-live`。
不是没时间，是**没有可写的依据**：字段名一个没见过，fixture 一份没有，
按仓库的规矩「用猜的选择器或猜的比较算出来的数字，不是测量」。
照假设写出来的映射器会编译、会通过自己编的测试、会看着挺像那么回事——然后在第一次真实数据上全线错开。
这是这个仓库反复付学费的那个形状，这次不再付一遍。

## 智利（第二轮）：门开了，是一个不要凭证的 OCDS 出口 —— 但它 2026-07-29 就停更了（2026-09-24）

上一节是网络没放开时写的，**那一节的结论一个字都不用改**：它说的是「这台机器什么都没量到」，
那是当时的事实，而那个判别器（本机 403 vs 对方 403）是一条会反复用到的教训，不是脚手架。

这一节是同一天、网络改成 Full 之后重跑的结果。**这一次量到了真东西。**

### 对照先立住

```
C0   github.com                          通了 ★   200    307ms
C0b  pncp.gov.br（巴西，生产在用）        通了 ★   200   1246ms   ← 这条让下面的结果可以当数据读
C0c  contratacionesabiertas.oece.gob.pe   对方拒绝  403    667ms
```

C0b 通了，所以「同类政府开放数据主机这台机器够得着」成立，智利那几行才有意义。

C0c 那个 403 **不是**本机出口拦的——正文是
`{"code":"403","message":"Forbidden","RequestId":"${http.request.id}"}`，连模板占位符都没展开，
正是 `egress-denial.ts` 里那条反向断言钉住的、秘鲁边缘代理**真的**在拒人的那份。秘鲁封机房 IP 段，
这是早就知道的事（见 `peru-oece-live.ts` 的 `whereAmI()`），跟智利无关。**两批 403 这回同时出现在一份
报告里，而判别器把它们分开了**——这正是上一轮留下那个东西的用处。

### 门在哪：`apis.mercadopublico.cl` 的 OCDS 出口，**不要凭证**

```
GET https://apis.mercadopublico.cl/OCDS/data/listaAñoMes/{年}/{月}/{offset}/{limit}   → 月度索引
GET https://api.mercadopublico.cl/APISOCDS/OCDS/tender/{编号}                          → 单条记录（OCDS 1.1）
```

两个主机名只差一个 `s`，**不是同一台**，拼错就是 404。路由名里的 `ñ` 是必须的：`listaAnoMes`（ASCII）
实测 404。索引的 `limit` 上限 1000，`total` 是诚实的（offset 8000 / 共 8004，回了 4 条）。

这两条路径**全程没有用任何 ticket、key，也没有伪装浏览器**。这一点值得说清楚，因为它绕开了下面那个凭证问题。

倒过来说：三个 OCDS 路径的拼法猜测里有两个回的是 `{"statusCode":404,"message":"Resource not found"}`
（路由不存在），另一个回的是 **HTTP 200** + `{"status":404,"detail":"No se encontraron resultados."}`
（路由存在，参数没命中）。**这两个 404 只差一个键名，意思完全相反**，是它把路找出来的。

### 凭证这一问：有确定答案了，而且是对方自己说的

不带 ticket 问 `/servicios/v1/publico/licitaciones.json`：

```
HTTP/1.1 203
{"Codigo":203,"Mensaje":"Ticket no válido."}
```

**注意状态码是 203 —— 一个 2xx。** `response.ok` 是 `true`。按状态码判断成败的连接器会把这句拒绝当成数据。
（这一轮探针第一次问的时候还撞上过 500 和 429「Hemos detectado que existen peticiones simultáneas」的并发限流，
同一个接口不同时刻回三种东西——所以结论是从**重复问**里来的，不是从一次响应里来的。）

`api.mercadopublico.cl/` 会 302 到 `www.chilecompra.cl/api/`，那页写得很清楚（原文）：

- ticket 是 **免费的**：「Gracias a esta herramienta **gratuita y de uso público**」
- 怎么拿：「Obtén tu ticket con **Clave Única** … Acepta los Términos de Uso e inicia sesión con Clave Única
  para solicitar tu ticket vía formulario. El código se generará de manera automática y llegará a tu correo」
- 申请入口：`https://api.mercadopublico.cl/modules/IniciarSesion.aspx`

**卡点是 Clave Única**——智利的全国数字身份，要智利的 RUN/RUT 才能开。也就是说这个 ticket 实际上需要一个
智利本地主体。**这是所有者的决定，不是我的。** 没去注册、没绕、没伪装浏览器。
那页的示例 URL 里印着一个 ticket（`F8537A18-…`），**没有用它**，也不建议用——那是人家文档里的示例，不是发给我们的。

好消息是：**上面那条 OCDS 路不需要这个 ticket**，所以这个决定不挡第一版连接器。ticket 买到的是
**实时**数据（「datos en tiempo real」+ `estado=activas` 这类查询），而 OCDS 那条路买不到——见下一段。

### 最要命的一条：这个源 2026-07-29 就停更了

索引按月份问，从 2025-06 一路问到 2026-09：

```
2026-05  total=8247      2026-07  total=8004
2026-06  total=9302      2026-08  （空）      2026-09  （空）
```

**今天是 2026-09-24。** 最新一个有数据的月份是 2026-07。

这看着像「两个月延迟」，但不是。把 2026-07 索引的**末尾**几条拉出来看 `publishedDate`：

```
324-39-L126      release.date=2026-07-29T17:13:28Z   publishedDate=2026-07-29T17:17:30Z   （4 分钟）
867990-64-L126   release.date=2026-07-29T17:21:36Z   publishedDate=2026-07-29T17:22:34Z   （1 分钟）
4105-6-LE26      release.date=2026-07-29T17:02:10Z   publishedDate=2026-07-29T17:02:15Z   （5 秒）
```

**发布延迟是分钟级的。** 整个数据集里最新的 `publishedDate` 是 `2026-07-29T18:48Z`。
所以这是一个**近实时的源在 2026-07-29 停了**，不是一个有两个月延迟的源。

这个区别决定了连接器的形状，所以它被写进了代码而不是只写在这里：
`describeIndexFreshness()` 在所有请求的月份都空的时候会打一段警告，
`ingest:chile-live` 把它印在条数**前面**。因为一个读停更源的导入器，会永远报告「成功导入 0 条」——
这就是本文件那条老规矩再往前走一步：**够不着 ≠ 空 ≠ 还没发布 ≠ 根本没问 ≠ 源停了但没人发现。**

停更是暂时的还是永久的，**从外面看不出来** —— 这个「不确定」没法消除，只能等着重测。

### 一条真实记录长什么样

`lib/ingestion/__fixtures__/chile/ocds-tender-priced.json`，完整 56KB，这里只摘骨架：

```json
{ "uri": "...", "version": "1.1", "publishedDate": "2026-07-09T17:56:11Z",
  "publisher": { "name": "Dirección de Compras y Contratación Pública" },
  "license": "https://creativecommons.org/publicdomain/zero/1.0/",
  "releases": [ { "ocid": "ocds-70d2nz-1211839-44-LE26", "date": "2026-07-03T14:56:43Z",
    "parties": [ { "name": "CORP MUNIC EDUC SALUD Y ATENCION | CORP MUNIC EDUC SALUD Y ATENCION",
                   "identifier": { "id": "708564001", "legalName": "CORP MUNIC EDUC SALUD Y ATENCION", "scheme": "CL-RUT" },
                   "address": { "region": "Región Metropolitana de Santiago", "countryName": "Chile" },
                   "roles": ["procuringEntity", "buyer"] } ],
    "tender": { "id": "1211839-44-LE26", "title": "MAQUINARIAS DE ASEO CLÍNICO",
      "status": "active", "statusDetails": "5-Publicada",
      "value": { "amount": 50000000.0, "currency": "CLP" },
      "procurementMethodDetails": "Licitación Pública Entre 100 y 1000 UTM (LE)",
      "tenderPeriod": { "startDate": "2026-07-03T14:56:43Z", "endDate": "2026-07-08T16:00:00Z" },
      "enquiryPeriod": { ... }, "awardPeriod": { ... },
      "items": [ { "classification": { "id": "47121602", "scheme": "UNSPSC" } } ] } } ] }
```

许可证是 **CC0**，写在每一份应答里。

### 字段映射（120 条真实记录量出来的，2026-05/06/07 各 40 条，按等距取样）

| 要的东西     | 在哪                                   | 覆盖率   | 备注                                                |
| ------------ | -------------------------------------- | -------- | --------------------------------------------------- |
| 稳定 id      | `tender.id` / `ocid` 去前缀            | 120/120  | `1211839-44-LE26`，ficha 链接也用它                 |
| 标题         | `tender.title`                         | 120/120  |                                                     |
| 采购单位     | `parties[].identifier.legalName`       | 120/120  | **不能用 `name`**，见下                             |
| 发布日期     | `releases[].date`                      | 120/120  |                                                     |
| **交标截止** | `tender.tenderPeriod.endDate`          | 119/120  |                                                     |
| 金额         | `tender.value.amount`                  | **63/120** | **一半没有**                                      |
| 币种         | `tender.value.currency`                | 62/120   | CLP 为主，**实测也出现过 USD**                      |
| 地区         | `parties[].address.region`             | 120/120  | 58/120 带尾随空格，必须 trim                        |
| 公开链接     | 用编号拼                               | 120/120  | 见下，有陷阱                                        |
| 答疑截止     | `tender.enquiryPeriod.endDate`         | 高       |                                                     |

**缺的字段，一条条说清楚（这些是发现，不是可以抹平的东西）：**

- **`mainProcurementCategory`：0/120，根本没有。** OCDS 自己的 goods/services/works 信号智利不发。
  所以 `scopeType` 现在**全部落到 `services` 这个默认值**——实跑 60 条的输出里
  「采购类型：services 60」就是这么来的，它不是测出来的，是没测到。`tender.items[].classification`
  倒是有 UNSPSC 编码（`47121602` 这种），能拿来做真映射，但那要 UNSPSC 的段表，**凭记忆编一张出来不算测量**，
  所以没做。要做的话这是现成的下一步。
- **`tender.documents`：0/120，一个标书链接都没有。** 秘鲁那条线的 `批量下载标书` 对智利没有任何东西可下。
- **`tender.status`：120/120 都是 `active`**，而这 119 条有截止日的里面 119 条截止日**都已经过了**（最迟 2026-08-21）。
  这个字段是发布那一刻的快照，不是生命周期。**通用的 `ocds-mapper.ts` 会把 `active` 映成 `open`，
  于是每一条智利记录都会永远显示「招标中」**——这是这次单写一个 `chile-ocds-mapper.ts` 的头号原因。
  状态只能从截止日推。`statusDetails` 有「5-Publicada」119 次、「6-Cerrada」1 次，
  那串数字是智利自己的 estado 码表，**码表没量过，所以一个字都没读**。
- **采购单位名有个 `" | "`。** 120/120 条的 `parties[].name`（和 `tender.procuringEntity.name`，两者永远相同）
  长这样：`"CORP MUNIC EDUC SALUD Y ATENCION | CORP MUNIC EDUC SALUD Y ATENCION"`。
  **其中只有 64/120 两半是一样的**——所以「切开去重」这个看着对的规则，在另外 56 条上是在悄悄二选一。
  两半各是什么含义**没查清**。`identifier.legalName` 是干净的，120/120，还配一个 `CL-RUT`。用那个。
- **金额有、币种没有**，实测出现过 1 条（`2273-36-LE26`，24,000,000 没有 currency）。默认成 CLP 是对钱的猜测，没做。

### 公开链接：一个 200 的空壳页

- ✅ `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=<编号>`
  对方自己 302 到加密的 `?qs=<token>` 并渲染真页面。两个编号各验一次，
  `lblNombreLicitacion` 分别是「MAQUINARIAS DE ASEO CLÍNICO」和「COMPRA DE MOTOR PEQUEÑOS FRAGMENTOS BATERIA」——
  **各是各的**，不是同一页。
- ❌ `…DetailsAcquisition.aspx?qs=<编号>`（把编号直接当 qs）
  **也回 200，也是 121KB 真 HTML，正文里也有那个招标编号**（因为编号被回显进了 query string 和 viewstate）。
  而 `lblNombreLicitacion` 是个**空 span**。两个不同编号抓下来 121,624B 和 121,625B——只差编号那一个字符。

第二条正是「用猜的选择器算出来的数字不是测量」的那个形状：一个「页面回来了吗、里面提到这个标了吗」的校验
会放行它。`qs` 的 token 是服务端加密签发的，离线拼不出来——所以我们发 `idlicitacion`，让对方自己去签。
这份空壳页存成了 fixture，测试里钉着。

### 量：每月 8000–10000 条，能过 10 万美元线的是少数

| 月份    | 条数  |
| ------- | ----- |
| 2026-05 | 8,247 |
| 2026-06 | 9,302 |
| 2026-07 | 8,004 |
| 2025-06 | 9,667 |

≈ **每天 270–330 条，每周 1,900–2,300 条**（停更之前）。

按 120 条样本：

- **52% 有金额**（63/120），CLP 中位数 2,000 万，p90 约 1.8 亿，最大 6.9 亿
- 按 **900–1000 CLP/USD 这个仅供估算、未被采纳的比值**，有金额的里面 **11–14% 能到 10 万美元**
  → 折算成全量约 **6–8%**，即每月 500–800 条、每天 20–27 条
- 另外 48% 没有金额，**没法按金额筛**——这半边只能靠关键词和行业标签

采购方式分布（120 条）：`LE`（100–1000 UTM）67 条、`LP`（>1000 UTM）20 条、`L1`（<100 UTM）20 条，
其余是 `LR`/MOP/私标零星几条。**主体是中小额市政采购**，`LP`+`LR` 这种大额的占 20%。
`procurementMethodDetails` 里的 UTM 档位其实是个比金额更全的规模代理（120/120 都有），
但 UTM 折成比索要一个真实数字，**没编**。

### 这一轮建的东西

```
lib/ingestion/connectors/chile-ocds-live.ts   只管抓：诚实 UA、有界重试、三种「状态码不是它的意思」的应答
lib/ingestion/chile-ocds-mapper.ts            纯函数、不联网、country 写死 "Chile"
lib/ingestion/ingest-chile.ts                 CLI 和（将来的）后台按钮共用的唯一路径
scripts/ingest-chile-live.ts                  薄 CLI，默认 dry run，--write 必须跟在 -- 后面
scripts/capture-chile-ocds.ts                 npm run capture:chile-ocds —— fixture 的来源，可重跑
scripts/test-chile-ocds-mapper.ts             npm run test:chile-ocds —— 53 项，全部打在真实字节上
```

`egressDenial()` 这次**接进**新连接器了（上一轮说的那个建议）。只接了智利这一条新路径——
秘鲁、巴西那两条是有付费用户在跑的线上导入，在一个新源的分支上改它们仍然不合规矩，
那个单独的 PR 还是该开。

**实跑一次的结果**（`npm run ingest:chile-live -- --month 2026-07 --max 60`）：

```
Mapped 60 tender(s) from 60 record(s).
  flagship 1 · significant 1 · standard 18 · excluded 40  → 进入推荐 20
金额覆盖率：29 条有金额（48.3%）  币种：CLP 28、USD 1
```

**注意每一条都显示「无金额」**，哪怕其中 28 条带着真实的 CLP 数字——因为 `lib/currency.ts` 里没有 CLP，
`convertToUsd()` 返回 null。上一轮预判的那件事，这一轮在真实数据上看到了。

顺带在这次实跑里逮到一个自己写的 bug：`--month 2026-07` 抓了 60 条、保留了 **0** 条——
默认那个两个月的 recency 窗口在一个已经指名道姓的月份上又叠了一层，而且智利最新的月份本来就已经两个月前了，
**指名去取正是唯一能看到智利数据的方式**，偏偏被这个过滤吃掉。已修：显式 `--month` 就是窗口本身。

### 所以现在需要所有者决定的

1. **CLP 汇率。** `lib/currency.ts` 里必须加一行，**汇率得是个真实数字，由所有者核过来**——
   这台机器够不着任何汇率源，上面那个 900–1000 是为了给出量级的估算，**不是可以写进代码的值**。
   没有它，智利一半的行情报价在分级器眼里是「未披露金额」。
2. **要不要去申请 ticket。** 现在有确定信息了：免费，但要 **Clave Única**（需要智利 RUN/RUT）。
   买到的是实时数据。**不申请也能跑**——OCDS 那条路不要凭证，只是它现在停更着。
   如果 OCDS 迟迟不恢复，这就从「可选」变成「唯一」。
3. **等 OCDS 恢复，还是就此接受这是个历史数据源。** 现在的 `ingest:chile-live` 跑默认窗口会打停更警告并导入 0 条，
   这是对的行为。恢复了它自己就会有数据，不用改代码。
4. **智利的前台可见性**（`AVAILABLE_COUNTRIES`）和后台导入按钮——**这一轮两处都没动**，
   `scripts/test-list-facets.ts:110` 那条「智利不出现」的断言也原样保留。等真有数据、且汇率加上之后再说。

### 这一轮没做的事，以及为什么

- **没动 `AVAILABLE_COUNTRIES`、没加后台按钮。** 那是所有者的闸，不是我的。
- **没加 CLP 汇率。** 编一个数字出来，比没有更坏。
- **没做 UNSPSC → scopeType 的映射。** 需要段表，凭记忆写不算测量。现在全部是 `services`，这个缺口是明写的。
- **没抓 `urlAward`。** 索引里有这个字段，但「有 urlAward」是否等于「已授标」**没验证过**，
  所以映射器永远不返回 `awarded`。从一个没验过的信号上宣称中标，比不宣称更坏。
- **没用文档页上印着的那个示例 ticket。**

### 要放行的域名（所有者要收窄成 Custom 白名单的话）

实际给出过响应的主机，一个不漏：

| 主机                            | 干什么的                                                  | 连接器要不要 |
| ------------------------------- | --------------------------------------------------------- | ------------ |
| `apis.mercadopublico.cl`        | OCDS 月度索引                                             | **必须**     |
| `api.mercadopublico.cl`         | OCDS 单条记录；`/servicios/` 凭证接口；根路径 302 到下面那个 | **必须**     |
| `www.mercadopublico.cl`         | 公开 ficha 页（连接器只**拼**链接，不抓它）               | 可选         |
| `www.chilecompra.cl`            | API 文档 / ticket 申请说明（`api.` 根路径的 302 目标）    | 可选         |
| `datos.gob.cl`                  | CKAN 2.10.4 国家开放数据门户（见下，**这条线没用上**）    | 可选         |
| `desarrolladores.mercadopublico.cl` | 回 503「upstream connect error」，主机在但服务是挂的    | 不要         |

跑连接器**只需要前两个**。重定向情况：`api.mercadopublico.cl/` → `www.chilecompra.cl/api/`；
`www.mercadopublico.cl/` → `/Home`（同主机）；ficha 的 `?idlicitacion=` → `?qs=`（同主机）。
没有出现任何第三方 CDN 主机。

（`github.com`、`pncp.gov.br`、`contratacionesabiertas.oece.gob.pe` 是探针的对照，不属于智利这条线。）

### `datos.gob.cl` 是 CKAN，但它不是这扇门

C3 那个门问成了：**CKAN 2.10.4**，「Portal de Datos Abiertos」，仓库里的 `connectors/ckan.ts` 确实能直接接。
但接了没用——搜 `licitaciones` 出来 20 个数据集，前几个是 2016 年华丘拉瓦市的 CSV、2015 年圣地亚哥大区的
2012 年 xls；搜 `chilecompra` **0 个**；273 个发布机构里没有 ChileCompra。搜 `compras publicas` 出来的是
各个市镇自己传的「Actas de Evaluación」。

**结论：datos.gob.cl 上没有全国性的招标数据集**，那些是零散的市政历史归档。CKAN 这条线不是入口，
把它写成「智利有 CKAN 可以接」会误导下一个人。

## 智利（第三轮）：第三扇门开了，不要凭证、当天的数据、而且能导出 CSV（2026-09-24）

上两节一个字都不用改。第一节说的是「这台机器什么都没量到」，第二节说的是「OCDS 这扇门开了但它停更了」，
两句在各自的时间点上都是事实。**这一节讲的是第三扇门，以及为什么它让智利重新变成一个能用的源。**

一句话结论：**`www.mercadopublico.cl/BuscarLicitacion/` 的公开搜索，不要任何凭证，导出的是真 CSV，
数据是当天的。15 个请求拿到全量 4,055 条在招项目。**

### 先回答最重要的那个问题：导出能用，而且比想象中好

任务书说「先量导出，如果它能用，整件事就从『解析 UI 的 HTML』变成『读结构化文件』」。**它能用。**

真实 URL 在 `busqueda.js` 第 138–139 行，是两步：

```
POST /BuscarLicitacion//Home/GenerarArchivo   → {"FileGuid":"…","nombreArchivo":"ListaLicitaciones.csv","estado":true}
GET  /BuscarLicitacion//Home/Descargar?fileGuid=…&nombreArchivo=…   → CSV 正文
```

那个**双斜杠不是笔误**：`rutaInicial` 是 `/BuscarLicitacion/`，而这两个控制器是按 `url + '/Home/…'` 拼的。
照抄。

回来的是什么：**UTF-8 带 BOM、`;` 分隔、CRLF 换行、11 列**。

```
IDLicitacion;NombreLicitacion;Tipo;Estado;FechaPublicacion;Descripcion;Moneda;TipoPresupuesto;TipoMonto;MontoLicitacion;Organismo
```

4,055 行实测：**0 个引号字符、0 个裸 LF、每一行正好 11 个字段**。服务端在写文件之前把自己的分隔符
从自由文本列里剔掉了。所以按 `;` 切是诚实的，不是偷懒——但「4,055 行没出过」不等于「永远不会出」，
所以 `parseChileBuscaCsv()` 里字段数不是 11 的行**进 malformed 列表被报出来，绝不猜着对齐**。
错位的后果是把描述的尾巴塞进 `Moneda`、后面每一列跟着错一格，然后产出一条看着很完整、买方和金额都是错的记录。

**1,000 条不是上限，是页大小。** UI 把 `pagina` 写死成 1 并且在界面上说「Se descargán los primeros 1.000
resultados」，所以看着像服务端限制。实测 `pagina=2` 又回了 47 条，和第 1 页**零重叠**；`pagina=3` 只回表头。
1000 + 47 = **1047**，正好等于页面自己那个 `hdnTotalPresupuestoPublico=1047`。**全量是够得着的，
只是不能按那个按钮的方式够。**

`registrosPorPagina` 在**两个接口上都被忽略**（10 / 100 / 500 / 1000 都试过：CSV 恒定 1000 行，HTML 恒定 10 张卡）。

### 两个「-1」，两种完全不同的含义 —— 这是这扇门最贵的一个坑

任务书给的那份 payload 是能跑的，但它只看到了全量的 **26%**。两个字段各埋了一个。

**`esPublicoMontoEstimado`**：`-1` 看着像「全部」，因为 `codigoRegion`、`idTipoLicitacion`、`idEstado`
的 `-1` 都是那个意思。**这里不是。** 其他条件全部不变：

| 取值 | 条数 | 关系 |
| ---- | ---- | ---- |
| `-1` | 1047 | 和 `1` **完全相同**（差集两边都是 0） |
| `1`（金额已公布） | 1047 | |
| `0`（金额未公布） | 770 | 与上面**完全不相交**（交集 0） |

**`-1` 是 `1` 的别名。**那 770 条只有显式问 `0` 才拿得到，而 `-1` 的应答里没有任何迹象表明它们存在。

**`idTipoFecha`**：这个字段是「Fecha de cierre」那组复选框（1 = 本月、2 = 下月、3 = 三个月以上），
**它是必填的，而且只能填一个值**：

```
""       → {"estado":false}     被拒
"1,2,3"  → {"estado":false}     被拒（JS 收集成数组，服务端只吃一个）
"-1"     → 200，只有表头         零行，长得和「翻过头了」一模一样
"1"/"2"/"3" → 1041 / 1197 / 9 条（金额公开那一半）
```

**没有「全部日期」这个取值。**任务书那份 payload 里的 `idTipoFecha:"1"` 意思是「本月截止的」——
所以它默默地只看了九月份到期的标。

于是覆盖全量要走 **3 个关闭月份桶 × 2 个金额可见性 = 6 组查询**：

| | 金额公开=1 | 金额公开=0 |
| --- | --- | --- |
| 本月截止 | 1041 | 768 |
| 下月截止 | 1197 | 1019 |
| 三个月以上 | 9 | 21 |

**合计 4,055 条，六组两两不相交（跨组重复 0 条），15 个请求。**

### 新鲜度：不是「比较新」，是**当天**

这是这一轮存在的理由，所以单独量了分布，不是看一条。

全量 4,055 条的 `FechaPublicacion`：**最新 2026-09-24（就是今天），最旧 2025-07-15，中位数 2026-09-15。**

```
2026-09-17  210 条
2026-09-18    1
2026-09-20    2        ← 周日
2026-09-21  388
2026-09-22  351
2026-09-23  351
2026-09-24  168        ← 今天，而且这是当天下午的快照
```

**延迟是零。**对比 OCDS 那扇门：它最新的一条是 `2026-07-29T18:48Z`，到今天已经**将近两个月**。
这扇门比 OCDS 停更的位置往前走了六周多，而且还在走。

（顺带一条旁证：同一组查询隔二十分钟跑两次，`hdnTotalPresupuestoPublico` 从 1047 变成 1041。
这是个活的源，标会在你读它的时候关掉。所以那两个 hidden input **不能当翻页的边界用**，代码里也没用。）

### 字段覆盖率（全量 4,055 条 + 120 张 HTML 卡片，不是抽样）

CSV 这 11 列**每一列都是 4,055/4,055 非空**。但「非空」不等于「有用」，所以分开说：

| 要的东西 | 在哪 | 覆盖率 | 备注 |
| -------- | ---- | ------ | ---- |
| 稳定 id | `IDLicitacion` | 4055/4055 | `NNNN-NN-<Tipo><YY>`，全部 4,055 条匹配，且后缀永远等于 `Tipo` 列 |
| 标题 | `NombreLicitacion` | 4055/4055 | |
| 描述 | `Descripcion` | 4055/4055 | 比 OCDS 的丰富 |
| 采购单位 | `Organismo` | 4055/4055 | **0 条带 `" | "`** —— OCDS 那个脏字段在这里是干净的 |
| 发布日期 | `FechaPublicacion` | 4055/4055 | `dd/mm/yyyy HH:MM:SS` |
| **状态** | `Estado` | 4055/4055 | **是活的**，不是快照，见下 |
| 采购方式 | `Tipo` | 4055/4055 | 两字母码 |
| 金额 | `MontoLicitacion` | **2247/4055** | 另外 1808 条**不是数字**，见下 |
| 币种 | `Moneda` | 4055/4055 | CLP 3918、CLF 47、USD 45、UF 37、UTM 6、EUR 2 |
| **交标截止** | **CSV 里没有** | **0/4055** | 只有 HTML 有，见下 |
| 地区 | **两边都没有** | **0/4055** | 见下 |

**缺的字段，一条条说清楚（这些是发现，不是可以抹平的东西）：**

- **交标截止日：CSV 里一列都没有。** 这是这扇门最大的缺口，而且缺的偏偏是这个产品最需要的那个字段——
  「用户要的是还能投的标」。它在 **HTML 卡片**上（`<strong>Fecha de cierre</strong>`，120/120 张卡都有），
  但 HTML 每页只有 10 条。所以补全 4,055 条要 ~406 个请求，而导出全量只要 15 个。
  取舍写在 `ingest-chile.ts` 里：**先按 recency 过滤，再只给留下来的行补截止日**，`--enrich N` 控制上限。
  没补到的行**就没有 `submissionDeadline`，不编一个** —— 在一个投标平台上编造截止日是最坏的一种错。
- **地区：这扇门根本不发。** OCDS 有 `parties[].address.region`（120/120），这里没有任何一个字段是地区。
  HTML 卡片上那行买方单位（「Subsecretaria de las Culturas y las Artes Región del Biobio」）里会**提到**
  地区，但那是自由文本不是字段，从里面正则出一个地区是猜。`codigoRegion` 这个**查询**参数倒是存在，
  理论上可以一个区一个区地问再反推——**没做，也没量**，留作下一步。所以 busca 这条线映射出来的 Tender
  **没有 `location`**，列表页的地区筛选对它是空的。**这是 OCDS 那扇门唯一还明确更强的地方。**
- **采购类别：还是 0。** OCDS 至少有 `tender.items[].classification` 的 UNSPSC 编码，这扇门连那个都没有。
  所以 `scopeType` 依旧**全部落在 `services` 这个默认值**上，实跑输出里「采购类型：services 1802」
  就是这么来的——它不是测出来的，是没测到。这个缺口比第二轮更大，不是更小。
- **答疑截止：没有。** OCDS 有 `enquiryPeriod.endDate`，这里没有。
- **标书文件链接：没有。** 和 OCDS 一样，一个都没有。

### `MontoLicitacion` 是一列**两种东西**，而 `TipoPresupuesto` 决定是哪种

这是解析上最容易安静出错的地方：

```
TipoPresupuesto = PUBLICADO      2,247 行   一个数字："100.933.572"、"70.063,00"
TipoPresupuesto = NO PUBLICADO   1,808 行   一句话："Entre 100 y 1000 UTM"、"Menor a 100 UTM"、
                                            "Igual o superior a 5.000 UTM"、"No público"…
```

两个计数和 `TipoPresupuesto` 的分布**精确吻合**，所以这条规则是干净的而不是近似的。
那 9 种档位文案自己都不自洽（「Entre 100 y 1000 UTM」和「Igual o superior a 100 UTM e inferior a 1000 UTM」
说的是同一档；「1000 UTM」和「1.000 UTM」都出现过）。

**危险在于：一个抓数字的解析器不会报错。** `Number(raw.replace(/\./g,""))` 对大部分文案返回 NaN，
但一个「把数字抠出来」的变体会从「Igual o superior a 5.000 UTM」里愉快地得到 **5000**——
于是一个大型公共工程被分级器当成五千比索的小采购。`parseChileBuscaAmount()` **按声明的类型判断，
不按「长得像不像数字」判断**，所以哪怕内容全是数字，只要声明是 NO PUBLICADO 就当档位。
UTM 折成比索需要一个真实数字，**没编**，档位原样带出来给人看。

数字格式是 es-CL：`.` 是千分位，`,` 是小数点（CLP 都是整数，USD 那些带 `,00`）。

### 状态：这扇门的 `Estado` 是活的，OCDS 的不是 —— 而且这次是**量出来的**

第二轮说 OCDS 的 `tender.status` 是发布那一刻的快照。这一轮不是推断，是直接撞上了：

**一条搜索页报「Cancelada por el organismo」（idEstado=15）的标，去 OCDS 问，回的是
`status: "active"`、`statusDetails: "5-Publicada"`。** 同一条标、同一天、两个源，只有一个是当前的。

所以 busca 这条线**读 `Estado` 文案**，但仍然**和截止日交叉**：一行可以写着「Publicada y disponible
para ofertar」而截止日已经过了（站点的 estado 按自己的节奏刷新）。截止日优先。
没见过的 estado 文案**返回 undefined，那一行被丢掉，绝不默认成 `open`**——把一个没人能投的标显示成招标中，
比少一条更坏。

### estado 码表：任务书给的那张，六个码全部对上了

第二轮明写着这个缺口没量（「码表没量过，所以一个字都没读」）。**现在闭合了，而且是两个独立来源。**

每个码都实发了一次，看回来的 `Estado` 列——每个码都只产出**一种**文案：

| 码 | `busqueda.filtros.js` 里的名字 | 服务端实际回的 `Estado` 文案 |
| -- | ------------------------------ | ---------------------------- |
| 5 | publicadas | Publicada y disponible para ofertar |
| 6 | cerradas | Cerrada a recibir más ofertas |
| 7 | desiertas | Sin ofertas recibidas |
| 8 | adjudicadas | Adjudicada a uno o varios proveedores |
| 15 | revocadas | Cancelada por el organismo |
| -1 | todos | 以上五种 + **Suspendida** |

**`5` 还额外和 OCDS 对上了**：join 上的那些记录 `statusDetails` 全是 `"5-Publicada"`。
两个独立来源在同一个码上一致。

两条附带发现：`-1` 在**这个**字段上是真的「全部」（和 `idTipoFecha` 相反），而且它翻出了第七种文案
**`Suspendida`**，这个文案**在站点自己的码表里没有对应的码**。它只出现在 `-1` 底下，
所以映射表里那一行是最弱的一行，注释里写明了。

### 两个源能不能 join：能，24/25

两边都用 `NNNN-NN-XXNN` 这个编号。拿 CSV 语料里发布日期落在 OCDS 覆盖窗口内（≤ 2026-07-29）的行，
抽 25 条去问 OCDS 单条记录接口：

**24 条命中，`tender.id` 和 `IDLicitacion` 逐字节相同**，`ocid` 就是它加 `ocds-70d2nz-` 前缀。
唯一没命中的那条（`2239-5-LR26`）发布于 **2026-07-29**——正是 OCDS 停更的那一天，
回的是 `{"status":404,"detail":"No se encontraron resultados."}`。

所以**去重是成立的**：两个映射器对同一个编号生成**同一个 `chile-<编号>` slug**，
一条被两扇门都看到的标会 upsert 到同一行，而不是进两次。测试里钉着这一条。

顺带，这个 join 还证实了 OCDS 那扇门**并没有坏**，它只是不再有新东西——老记录照样答得好好的。
所以第二轮那句「恢复了它自己就会有数据，不用改代码」仍然成立。

### HTML 有多脆，什么会弄坏它

**HTML 只用来补一个字段（交标截止日），加上两个采购方信誉计数。**其余全部走 CSV。这是有意的收窄：
解析面越小，能坏的地方越少。

**稳的（解析器钉在这些上）：**
- `<div class="lic-bloq-wrap …">` —— 服务端按标输出的结果块，切卡片只切这个前缀
- `<strong>Fecha de cierre</strong>`、`<strong>Cantidad de compras …</strong>` —— **人能看见的标签文字**
- `class="col-sm-6 id-licitacion"`、`class="lic-bloq-footer"` —— 语义化的类名
- `verFicha('…?idlicitacion=…')` —— 120/120 张卡都是这个形式，编号和卡片 id 逐字相同

**不稳的（解析器**故意不用**）：**
- `col-md-4` / `row` / `margin-bottom-md` 这类 Bootstrap 栅格类。一张卡里出现好几次，
  而且是改版第一个动的东西。**两个日期格子就是靠标签文字区分的，不是靠「本行第二个 col-md-4」**——
  截止日那格是条件渲染的，位置会动。
- **`class="monto-dis"`**。它看着像「monto disponible」的意思，实际上 120/120 张卡都是这个类，
  包括那 23 张写着「Monto estimado」的。**类名是死的，标签文字才是活的。**
  所以金额干脆不从 HTML 读——CSV 里有 `TipoMonto` 这一列，是明确分好的。

**什么会弄坏它，怎么早点知道：** 脚本包的版本号 `?v=202502171638`（`busqueda.js`、`busqueda.filtros.js`、
`resultadobusqueda.css` 全带这个）记在 `CHILE_BUSCA_SCRIPT_VERSION` 常量里。
**这个串一变，HTML 解析器就该被怀疑，fixture 该重抓。**它**没有**做成自动断言——版本号变了不等于解析坏了，
为一次版本号跳动让导入失败，比它防的漂移更糟。

另外两道保险：
- 片段里**有** `lic-bloq-wrap` 结果块却**一条都没解析出来** → **抛错**，不返回空数组。
  从导入器那边看，「今天没结果」和「标记变了所以什么都不匹配」长得一模一样。
- CSV 表头**按列名逐个核**，不按位置也不按个数。对方换了列顺序，读到的是一句能看懂的话，
  而不是 11 个悄悄错位的字段。

### 状态码不是它的意思：这扇门有四个，全是 HTTP 200

| 应答 | 真实含义 | 钉在哪 |
| ---- | -------- | ------ |
| 200 + `{"estado":false}` | **拒绝**——而且**照样给一个 FileGuid** | `busca-generar-refused.json` |
| 200 + `content-length: 0` | 下载没带会话 cookie（或 GUID 过期） | `busca-descargar-empty.bin` |
| 200 + 只有表头（131 字节） | 真的翻过头了，**也是** `idTipoFecha:"-1"` 的应答 | `busca-export-empty.csv` |
| 200 + CSV 里金额是一句话 | 对方没公布金额 | `busca-export-unpriced.csv` |

第一条值得单说：**被拒的应答里 `FileGuid` 是有的**（只是 `nombreArchivo` 退化成 `".csv"`、`estado` 是 `false`）。
一个「拿到 GUID 了吗」的校验会放行它，然后下一步下载回 0 字节，导入器报告「成功导入 0 条」。

第二条是这一轮**真的差点写错**的那个：生成的文件存在服务端会话里，`Descargar` 必须带上
`GenerarArchivo` 那一步设的 cookie（还有负载均衡器那个 `GCLB` 粘连 cookie）。不带就是 200 + 0 字节。
所以 `warmSession()` 不是可选的，`ChileBuscaSession` 是个调用方必须拿着的对象而不是全局变量。
这份 0 字节的 fixture 是**故意用一个全新会话去要另一个会话的 GUID** 抓下来的。

### 这一轮建的东西

```
lib/ingestion/connectors/chile-busca-live.ts   只管抓：诚实 UA、cookie 会话、限速、有界重试、egressDenial()
lib/ingestion/chile-busca-parser.ts            纯函数：CSV → 行、HTML → 卡片。不联网
lib/ingestion/chile-busca-mapper.ts            纯函数：行 → Tender，country 写死 "Chile"
lib/ingestion/ingest-chile.ts                  加了 door: "ocds" | "busca"，两个调用方共用的唯一路径
scripts/ingest-chile-live.ts                   加了 --door / --enrich
scripts/capture-chile-busca.ts                 npm run capture:chile-busca —— 7 份 fixture 的来源，可重跑
scripts/test-chile-busca.ts                    npm run test:chile-busca —— 86 项，全部打在真实字节上
```

**OCDS 那条线一行没动**，`test:chile-ocds` 原样通过。两扇门共用 `ingest-chile.ts`，
默认仍是 `ocds`，所以已有的调用方行为不变。

**实跑一次**（`npm run ingest:chile-live -- --door busca --max 1200 --enrich 60`）：

```
导出共 1808 条不重复招标（3 个 CSV 页），格式异常行 0 条
Mapped 1808 tender(s) from 1808 record(s).
  flagship 7 · significant 15 · standard 483 · excluded 1297  → 进入推荐 505
交标截止日：60 / 1802 条有
金额是 UTM 档位而不是数字的：762 条
金额覆盖率：1040 条有金额（57.7%）  币种：CLP 1014、USD 13、UF 12、UTM 1
```

**注意每一条仍然显示「无金额」**，哪怕其中 1,014 条带着真实的 CLP 数字——因为 `lib/currency.ts` 里
没有 CLP，`convertToUsd()` 返回 null。第二轮预判、第二轮在 28 条上看到、**这一轮在 1,014 条上看到**。
规模变了，结论没变。

### 要放行的域名（所有者要收窄成 Custom 白名单的话）

这一轮实际给出过响应的主机，一个不漏：

| 主机 | 干什么的 | 连接器要不要 |
| ---- | -------- | ------------ |
| `www.mercadopublico.cl` | 搜索落地页、`Home/GenerarArchivo`、`Home/Descargar`、`Home/Buscar`、脚本文件 | **busca 门必须** |
| `apis.mercadopublico.cl` | OCDS 月度索引 | **ocds 门必须** |
| `api.mercadopublico.cl` | OCDS 单条记录 | **ocds 门必须** |

**重定向：一次都没有。** 搜索落地页、`GenerarArchivo`、`Descargar`、`Buscar` 全是 0 次跳转的直接 200，
`num_redirects=0`。整条 busca 链路**只碰 `www.mercadopublico.cl` 一个主机，没有任何第三方 CDN**。
（页面 HTML 里引了一个 `cdnjs.cloudflare.com` 的 jQuery mask 插件，但那是给浏览器的，连接器从不加载它。）

第二轮那张表里的 `www.chilecompra.cl`、`datos.gob.cl`、`desarrolladores.mercadopublico.cl` 这一轮**一次都没碰**。

**跑两扇门只需要上面三个主机。只跑 busca 门，只需要 `www.mercadopublico.cl` 一个。**

### 这是别人的前台，不是发布出来的数据接口 —— 说清楚

这一点必须写明白，因为它决定了这条线该被怎么对待：

`/BuscarLicitacion/` 是**任何公民都能打开的公开页面**，数据本身是 CC0（ChileCompra 在 OCDS 应答里
自己声明的），抓它不需要凭证也没绕过任何东西。**但它是 ChileCompra 的 UI，不是一个公布出来的数据 API。**
它没有版本承诺、没有弃用通知、没有变更日志。**一次发版就可能让解析器失效，而且不会有人通知我们。**

所以这条线按「借用别人的前台」来写，而不是按「调用一个接口」：

- **诚实的 User-Agent**，写明产品名和一个联系 URL，**绝不伪装浏览器**——对方要限我们的流，
  应该能一眼认出是谁
- **严格串行**，请求之间固定间隔 1.5 秒，没有并发
- **有界重试**（4 次，指数退避），只对 429/5xx 重试，404 不重试
- **单独的抓取脚本**，fixture 是有意刷新的，不是靠反复捶页面攒出来的
- 全量走导出（15 个请求）而不是走 HTML（406 个请求）——**这本身就是最讲礼貌的那个理由**

OCDS 那扇门**保持原样、继续可用**，正是因为它是相反的东西：结构化、有版本、CC0、明确发布出来的。
它现在停更着，但它一恢复就自己有数据。**两扇门都留着，是因为它们的失效方式不一样。**

### 所以现在需要所有者决定的

1. **CLP 汇率，还是那一行。** 现在的代价是 1,014 条真实比索报价在分级器眼里是「未披露金额」，
   不是第二轮的 28 条。汇率**必须是所有者核过来的真实数字**，这台机器够不着任何汇率源。
   **这一轮仍然没加**，理由和上一轮一样：编一个比没有更坏。
2. **UF / CLF / UTM 这三个还要一个折算口径。** 4,055 条里 90 条用的是这三种（UF 和 CLF 是同一个东西的
   两种写法，源自己混着用）。它们是**指数化单位**，汇率每天变，比 CLP 更需要一个真实数据源。
3. **智利的前台可见性**（`AVAILABLE_COUNTRIES`）和后台导入按钮——**这一轮两处都没动**，
   `scripts/test-list-facets.ts:110` 那条「智利不出现」的断言原样保留。这是所有者的闸。
4. **要不要给 busca 门做地区。** 现在没有地区，列表页的地区筛选对智利是空的。
   可能的路子是按 `codigoRegion` 一个区一个区地问再反推——**没量过，成本未知**。
5. **ticket 那件事可以彻底放下了。** 第二轮说「如果 OCDS 迟迟不恢复，这就从可选变成唯一」——
   现在有第三条路，而且它给的是实时数据，**所以 Clave Única 这道坎不再挡任何东西。**

### 这一轮没做的事，以及为什么

- **没动 `AVAILABLE_COUNTRIES`、没加后台按钮。** 那是所有者的闸，不是我的。
- **没加 CLP（或 UF/CLF/UTM）汇率。** 编一个数字出来，比没有更坏。
- **没碰 OCDS 那条线的任何代码。** 它是有测试的、结构化的、CC0 的那条路，任务也明确要求别削弱它。
- **没做 UNSPSC / 采购类别映射。** 这扇门连 UNSPSC 都没有，比上一轮更没得做。`scopeType` 全是 `services`，明写。
- **没从买方单位的自由文本里正则地区。** 那是猜，不是测量。
- **没给全部 4,055 条补截止日。** 那要 ~406 个请求打在别人的前台上。补的是这一轮会留下的那些，`--enrich` 控制上限。
- **没用 `codigoRegion` / `rubros` / `compradores` 这些筛选器。** 它们存在，没量过，所以一个字都没读。
- **没碰那四个同源控制器**（`BuscarComprador`、`BuscarRubros`、`BuscarProveedor`、`cargaFiltro*`）。
  它们是给自动补全用的，这一轮用不上。

## Petrobras / Transpetro：Petronect 一次请求拿到全部在招项目（2026-09-25）

用户要求补电力、石油、矿业公司自己的项目（「基于你的建议做」）。先量了现有入口：
库里 Petrobras 0 条；PNCP 搜 "petrobras" 返回 301 条，采购方没有一条是 Petrobras
—— 国企按 13.303 号法采购，不上 PNCP。DOU 上有它的 AVISO DE LICITAÇÃO，但只有
403 个字符、没有截止日（见 dou-watch.ts）。

**门**：Petronect 公开页「Lista de Oportunidades Abertas para propostas」不用登录，
页面自己的脚本只发一个请求：
`/sap/opu/odata/SAP/YPCON_GET_XML_SRV/getXMLSet('01')?$format=json`。
`d.EvXml` 是一个 JSON 字符串，里面的 `TAB` 就是全部在招项目 —— 2026-09-25 共 309 个，
2.4 MB，没有分页。附件下载地址（`YPCON_PUB_ATTACHMENT_DOWNLOAD_SRV/attachmentSet('<id>')/$value`）
无会话直接拿到了 37 页的 edital PDF。没有金额：13.303 号法允许国企不公开预算，
表头服务（`YPCON_GET_HEADER_INFO_SRV`）里也没有金额字段。

**为什么单独一套规则**（lib/relevance-petronect.ts）：通用规则跑这 309 条，16 个
国际招标（Mexilhão 压缩机组、SEAP 天然气管道用管、炼厂催化剂、换热器）全部被排除
—— 没金额、也不命中行业关键词；反而差旅代理被保留。Petronect 自己给出的
「Nacional / Internacional」（只限巴西供应商 / 外国供应商可直接投）才是这里的规模证据，
写进 `procedureType`，导入和重分类读的是同一个字段。

结果（309 条）：大型 10、中型 9、常规 47、排除 243。常规里交标期不足 12 天的，按
全站规则在写入时跳过。回归样本：41 条真实项目，`npm run test:petronect`。

每日任务：`npm run cron:petronect`（daily-ingest.yml），心跳 `import-petronect`。

## 哥伦比亚 UPME 输电项目：WordPress 接口直接给，但「开放」标签不可信（2026-09-25）

UPME 按项目选投资人（设计、供货、建设、运营国家/区域电网的一段），不走 SECOP，
和 ANEEL 输电拍卖是同一类项目。upme.gov.co 是 WordPress，`convocatorias` 这个自定义
文章类型直接开放在 `/wp-json/wp/v2/convocatorias`，按 `estado_convocatoria`
（283 = Abierta oficialmente，287 = Prepublicación）过滤，一次请求全部拿到。

**标签不等于阶段**：当天标为开放/预公告的 16 条里，只有 4 条还能投。其余有的已经挂了
授标纪要（02-2025、04-2024…），有的开过投资人开标会（02-2026），有的宣布流标
（10-2021），4 条预公告还是 2018–2019 年的。所以阶段从页面上的会议纪要读
（`upmeCallStage`）：只要出现投资人侧的开标、评标、反报价、授标或流标，就不再导入。
监理（interventor）的招标是另一条更早的线，不算。

没有截止日：在 DSI 的时间表 PDF 里，补充文件还会改。DSI 和所有补充文件都存成文件链接，
留给文件关键日期提取去读。档位：`Selección de Inversionista` 加进了
`FEDERAL_CONCESSION_AUCTION_PROCEDURES`，与 ANEEL 输电拍卖同一条规则，都是大型项目。

每日任务：`npm run cron:upme`，心跳 `import-upme`；测试 `npm run test:upme`。

## Codelco：官网唯一的公开招标表，今天一条都没开着（2026-09-25）

智利国企不适用 19.886 号法，Mercado Público 当天 3,951 个在招项目里没有 Codelco、
ENAP、ENAMI。Codelco 的采购几乎都在 SAP Ariba 上定向邀请，唯一的公开出口是
codelco.com/licitaciones-en-proceso：服务端直出的表格，7 列（发布日期、货物/服务、
标的（链接到公告 PDF）、矿区、标书在哪（都是 Ariba）、标书价格、「Fecha de entrega」）。

「Fecha de entrega」是**报名（表达参与意向）截止**，不是交标截止：之后标书只发给已报名、
已注册的供应商。它有五种写法（「16 de Julio de 2026」「27-11-2025」「09.01.2025」
「19/08/2024」、没有年份的「28 de marzo.」），也可能不写（「hasta la recepción de ofertas」）。
`lastDateIn` 取文本里最后一个日期；不写日期的，发布后 30 天内算开着。报名截止存为截止日，
摘要里写明它是报名截止、标书在 Ariba。

表格不清理：51 行，最早到 2011 年；最新一条 7-01 发布、7-16 报名截止。所以今天导入 0 条
是正常的，心跳照常写 ok；只有表格一行都解析不出来才报失败。档位规则在
lib/relevance-codelco.ts：总部（Casa Matriz，全集团统一采购）的工业品 → 中型，单个矿区 →
常规，办公/活动/生活/手工具/本地建材和不含施工的服务 → 排除。

**顺带修的日期问题**：网站按墨西哥城时间（UTC-6）显示日期，所以只有日期没有时间的值
（UPME 的公告日、Petronect 的 DOU 日期）若按当地零点存，会显示成前一天。三个新来源都改为
按当地中午存。

每日任务：`npm run cron:codelco`，心跳 `import-codelco`；测试 `npm run test:codelco`。

## 新项目清单的「智利」标签（2026-09-25）

用户要求加上（「智利后台没有手动加项目的选项？请加一下」）。两个按钮：Mercado Público
和 Codelco，走 `app/api/admin/import-chile`，调用的就是每日任务用的 `ingestChile()` /
`ingestCodelco()`，所以不会跟定时任务不一致。

Mercado Público 要考虑时长：读公开搜索约 25 秒（实测 4,047 条在招，保留 49 条）；
截止日要逐条打开项目页读，每条 2.5 秒。函数上限 300 秒，所以：

- **预览不读截止日**。档位不依赖截止日，所以预览的数字和写入时一样，只要几十秒。
- **写入时读项目页，从请求开始算最多 200 秒**（`enrichUntil`）。没读到的先写入，
  截止日留给下一次每日任务补；导入永远不会把已存的截止日清成空（`NEVER_NULLED_BY_AN_IMPORT`）。

线上部署还从没连过 Mercado Público。连不上时，返回的错误里会附上能在本机跑的命令
（`npm run cron:chile -- --write`）。

## Cemig：巴西米纳斯电力公司自己的采购平台（2026-09-25）

Cemig 按 13.303 号法采购，在自己的 e-Compras 平台（app2-compras.cemig.com.br）上招标，
不在 PNCP 上。平台的公开搜索是一个 React 应用，背后的 JSON 接口不需要登录：

- `POST api-manager-compras.cemig.com.br/auction-notice/doSearchAuctionNotice`，
  过滤 `biddingStageId: 8`（「PUBLICADO」，正在收投标），每页 20 条；
- `POST …/auction-notice/getAuctionNoticeById`，每个流程一次：规则（「Pregão Eletrônico -
  Material」）、供应品类、发布日期、竞价会时间。

2026-09-25：历史上共 1,351 个流程，已发布 22 个。招标文件 zip 在
arquivos-compras.cemig.com.br 上公开下载（输电铁塔那份 79 MB，不需要登录）。没有金额。

**电子竞价的例外（用户决定）**：别的来源一律排除电子竞价（Pregão），但 Cemig 用电子竞价买电网设备：
550 kV 以下的输电铁塔、345/500 kV 支柱绝缘子、变压器。22 个里有 15 个是电子竞价。
规则在 lib/relevance-cemig.ts：
- 资格登记和预审（Credenciamento / Pré-qualificação）→ 排除；
- 服务 → 排除，除非是建电网的；
- 办公、IT、空调、手工具、仪器 → 排除；
- 输电等级（230 kV 以上或输电线路）→ 中型；
- 其余电网设备和材料 → 常规。

截止日取竞价会开始的时间：平台上这类流程的「投标截止」字段是空的，投标一直收到竞价会开始为止。

**只导入近 3 天发布的**（用户决定，`lib/ingestion/publication-window.ts`，Petronect、UPME、Codelco
也一样）。一次性补导入更早的：`npm run cron:cemig -- --days 30 --write`（`--days 0` = 不限）。

每日任务：`npm run cron:cemig`，心跳 `import-cemig`；测试 `npm run test:cemig`。

## 近 3 天发布的窗口：Petronect、UPME、Codelco、Cemig（2026-09-25）

用户决定：「我只想要最近3天发布的」。这四个来源列出的是所有还在招的项目，不管多早发布
（Petronect 有开标期五个月的），所以没有窗口时，第一次运行会把整批存量一次导入。现在每个来源
都只写入近 3 天发布的（`lib/ingestion/publication-window.ts`，按 72 小时滚动计算）。

2026-09-25 实测：
- Petronect：309 个在招，近 3 天发布 53 个，保留 7 个（都是常规）；
- UPME：仍可投标 4 个，近 3 天发布 0 个；
- Codelco：0 个；
- Cemig：已发布 22 个，近 3 天发布 1 个，保留 1 个。

代价：今天就在招、但更早发布的大项目不会进库，包括 Petronect 那 10 个大型（RNEST EPC、
各炼厂焦化改造等）和 UPME 那 4 个输电项目。要一次性补进来，用 `--days 0`（不限）或
`--days 30` 跑一次写入，例如 `npm run cron:petronect -- --days 0 --write`。

UPME 的项目在正式发布那天，发布日期会从预公告日改成正式发布日，所以预公告过的项目在正式开放时
还会再落进一次窗口。

## PEMEX 自己的规则（2026-09-25）

用户要求（「要不要给 PEMEX 单独做一套规则（和 Petronect 一样） ← 要，请做」）。起因是一次实测：
PEMEX 七个列表近一个月发布了 71 个招标，通用规则只保留 3 个。PEMEX 不公布金额，所以
「没有金额、也没命中行业关键词」这一关把最该保留的都挡掉了：MDEA 溶剂、聚乙烯装置用的烷基铝、
活性炭、阀门、管材、换热器、自升式钻井平台租赁。

规则在 lib/relevance-pemex.ts，只对来源名「PEMEX — Concursos Abiertos」生效；DOF 来的 PEMEX
公告仍走通用规则。读的是 PEMEX 自己标注的两项：
- 招标范围（tipoevento：Nacional / Internacional / Internacional bajo TLC），存在 procedureType
  末尾，重新分类时能读到；
- 供应类型（Bienes / Servicios / Obra pública / Arrendamientos），存为 scopeType。

具体规则：
- **服务** → 排除，钻井、完井、修井等井作业除外；
- **租赁** → 只保留钻井平台和船舶；
- **工程**：
  - EPC → 大型；
  - 道路、屋面、仓库等小工程和日常维护 → 排除；
  - 国际招标 → 中型；
  - 国内招标只保留新建或大修装置、管线、储罐、锅炉的；
- **货物**：
  - 钻杆、套管、油管 → 常规；
  - 实验室、工具、安全防护、备件、车辆、办公用品 → 排除；
  - 国际招标的化学品、石油制品、设备、管材、板材等工业材料 → 常规；
  - 国内招标只保留大型设备（压缩机、换热器和管束、汽轮机、变压器、锅炉、转化炉）和催化剂，
    其余算单个炼厂的零星采购，排除。按「买的是什么」判断，不看「用在哪」：
    「para mantenimiento en calderas」里的耐火混凝土不算锅炉。

材料在这里算：用户同一条消息里把「大量材料采购」列进了白名单，Cemig 批的也是「设备和材料类」。
这和 Compras MX 国际招标规则里的「材料不算」不同，那条没有改。

实测（近 120 天发布的 472 个）：保留 64 个（大型 1、中型 2、常规 61）；近一个月 72 个里保留 19 个
（原来是 3 个）。PEMEX 仍按原来的近 1 个月窗口导入，3 天窗口只用于新接入的四个来源。

库里已有的 PEMEX 行不动。它们的 procedureType 没有招标范围后缀，如果以后在后台重新分类，会按国内招标判断。

测试：`npm run test:pemex-rules`（29 条真实样本）。

## CFE（DOF 公告）的审计与专用规则（2026-09-25）

用户要求：「CFE 的项目是通过 DOF 进来的……被排除、没写进库的那些……请你也看看」。
我把 DOF 在 2026-06-26 到 09-25 发布的全部 CFE 公告（224 条）逐条跑了一遍。

**发现的问题**
- **DOF 没有「供应类型」字段，映射器把每条公告都标成了服务。** 所以采购阀门、锅炉管、输电线路
  水泥杆、电容器组、导线、电压调节器的公告，都被当成「日常性服务采购」排除了（168 条排除里有 48 条是这个原因）。
- **55 条只有「CFE - REF:编号」没有标题。** 抽查的几条大多是「AVISO MULTIPLE DE FALLOS」（多项定标公告），
  本来就不是招标，排除没错。另有一种公告把标题标成「Descripción de Concurso」，解析器只认
  「Descripción del Concurso」，已修正（`dof-notice-detail.ts`）。

**规则**：lib/relevance-cfe.ts，只作用于 DOF 来源里的 CFE 公告。CFE 的招标编号本身写明了类型：
`CFE-0001-CA A A T-…`，第三个字母 A 是采购、S 是服务、O 是工程，最后一个字母 N 是国内、T 是国际（自贸协定）、A 是国际公开。
- **服务** → 排除；标题以维修、大修、拆装开头的，不管编号是什么都按服务处理。编号是服务、但标题是「供货并安装」主设备的，按采购对待。
- **工程**：
  - 变电站、输配电线路、电厂工程 → 国际招标为中型，国内为常规；
  - 其他工程 → 国际为常规，国内排除。
- **采购**：
  - 备件、工具、安全防护、终端、纸张、车辆、仪器 → 排除；
  - 国际招标的电网或电厂设备、材料、燃料、化学品 → 常规；
  - 国内招标只保留主设备（变压器、开关柜、隔离开关、汽轮机、发电机、泵、电机、电容器、导线、电杆、绝缘子）。

**结果**：三个月 224 条里保留 61 条，原来是 56 条。构成变了：新进来的是真正的设备和材料采购，
被去掉的是原来被误留的维修服务（变压器大修、发电机拆装大修）、轴承、碳刷架、压力开关。

DOF 导入是后台手动按钮，所以只影响以后的导入；库里已有的 CFE 行不动。

测试：`npm run test:cfe-rules`（26 条真实样本）。

### Rail and metro outside Mexico — where the tenders actually are (surveyed 2026-09-26)

Asked because every 铁路/地铁 tender on the site was Mexican. The relevance
rules keep rail titles from every country (checked against sample titles),
and the 交通基建 tag gap for rolling stock and Portuguese rail words is fixed
in lib/industry.ts / lib/relevance-pt.ts. What remains is where each
country's rail buying is published, measured from this sandbox:

- **Brazil.** Metrô SP moved to compras.gov.br in 2024 (its own licitações
  page says so), so Metrô SP, CPTM and Trensurb rows are **already in PNCP**
  — a live search found 31 open Metrô SP editais. They are spare parts,
  consumables and building maintenance under pregão/dispensa, which the
  value and modality gates rightly drop. The large rail work (new lines,
  rolling stock) is procured as concessions/PPPs auctioned at B3 — PPI
  (ppi.gov.br: SPA shell, resets the connection here as in the 09-18
  survey) and state PPP programmes — i.e. the DOU concession watch, not
  PNCP. Infra S.A. (ex-VALEC) lists its pregões on its own site as HTML and
  in PNCP; its 2026 leilões are rail-yard terminal concessions.
- **Chile.** Neither Metro de Santiago nor EFE buys through Mercado Público.
  Metro's current tenders sit behind an Altcha proof-of-work challenge and
  supplier registration — not something to get around. Its **Próximas
  Licitaciones** page, though, is a plain HTML table (Proyecto / Servicio /
  Publicación month, 107 rows, updated 21/09/2026) that names the large
  items months ahead: L7 station civil works, L9 civil works, vías y
  catenarias, **material rodante y CBTC**. No amounts, no deadlines — a
  `planned` source, like ANEEL before its edital. EFE runs on SAP Ariba
  behind a login; its próximas page lists categories only.
- **Colombia.** The rail entities contract under *Contratación régimen
  especial*, which the 2026-09-11 decision (Licitación pública only)
  excludes by design. In SECOP II since 2025-07: Metro de Bogotá's largest
  rows are loan agreements with development banks, not tenders; Metro de
  Medellín (Empresa de Transporte Masivo del Valle de Aburrá) has real
  supply rows of 15–52 bn COP, e.g. "Suministro internacional de elementos
  rail-line". Widening the gate for a named list of rail entities would be
  the change; it relaxes a rule the user set, so it is theirs to make.
- **Peru.** ATU and ProInversión did not answer from this network. Lima's
  new metro lines are APP/government-to-government contracts rather than
  open tenders; ATU's ordinary purchases are in SEACE and go through the
  existing connector and its filters.

**Acted on (2026-09-26, user's choices):**

- *Chile* — `npm run cron:metro-santiago` reads Metro's programme daily and
  imports the large line-building items as 即将招标 previews
  (`lib/upcoming-tenders.ts`, `lib/relevance-metro-santiago.ts`), removing
  each once the programme stops announcing it. Only items whose planned
  month is still ahead: the table is never pruned and cannot say whether an
  item whose month has come opened on the gated portal, slipped or was
  dropped, so the preview comes down when its month arrives (user, same
  day: 不好判断). That removed the first four previews (June–August L7/L9
  items); on 2026-09-26 no line item is announced for a later month. Note from building it: from
  this sandbox's direct egress the page answered 403 from an S3 origin while
  the same request through the sandbox proxy (and from curl) was 200 with
  the platform's own User-Agent — a network-path artefact, not Metro's WAF.
- *Colombia* — *Contratación régimen especial* is admitted for three named
  sectors (`SPECIAL_REGIME_SECTORS` in colombia-mapper.ts): rail, power
  utilities, and the Ecopetrol group's works (not well services) — 大型项目
  only, never a loan or an energy/gas supply agreement, and for power and
  oil only with a disclosed amount and a works-or-equipment title. Through
  the real gate, 2026-03-01 to 2026-09-26, 7,401 candidate rows: power 7
  (substations, grid works, solar and wind parks, SCADA), oil 4 (EPC civil,
  mechanical, electrical and instrumentation works), rail 1. The first
  draft without the amount requirement also let in school fences and a
  sports ground Ecopetrol builds as community investment, an insurance
  renewal and a fiduciary arrangement; and a bare "perforación" filter
  dropped both Ecopetrol EPC contracts because they name the Vicepresidencia
  de Proyectos y Perforación.
