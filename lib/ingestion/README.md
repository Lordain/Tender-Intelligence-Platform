# Data Ingestion — Phase 5

What's real, what's a verified-working architecture, and what's an
explicitly-flagged placeholder. Read this before touching anything here.

## What's real

- Mexico publishes procurement data via an official Open Contracting Data
  Standard (OCDS) platform, "Contrataciones Abiertas"
  (gob.mx/contratacionesabiertas), with a documented API and JSON/CSV
  downloads. A usage guide PDF exists at
  `transparenciapresupuestaria.gob.mx/.../Guia_uso_API_contrataciones_abiertas.pdf`.
  This matches the platform's own stated priority order for sourcing data:
  official API > open data > CSV/XML > official interface > scraping as a
  last resort.
- OCDS itself is a stable, internationally documented standard
  (standard.open-contracting.org) — the shapes in `types.ts` and the
  mapping logic in `ocds-mapper.ts` are built against that documented
  schema, not guessed.

## What's verified working (offline, no network needed)

- `ocds-mapper.ts` — maps one OCDS release to our `Tender` type. Run
  `npm run ingest:compras-mx -- --fixture` to see it work end-to-end
  against `__fixtures__/sample-ocds-release.json` (a hand-written but
  realistic release) with no network or Supabase connection required. This
  is the piece to test first if anything downstream looks wrong.
- The `SourceConnector` interface (`types.ts`) — the contract every
  source (Compras MX now, DOF/SAM.gov/TED later) implements, so the
  mapper and ingestion script don't care which portal the data came from.
- `scripts/ingest-compras-mx.ts`'s Supabase upsert logic — same
  upsert-by-slug pattern as `scripts/seed-supabase.ts`, verified against a
  real project during Phase 2.

## What's an unverified placeholder

- `connectors/compras-mx-connector.ts` — the actual `fetch()` call against
  Mexico's OCDS API. **This session had no network access to confirm the
  real base URL, query/pagination parameters, response shape (a single
  release package vs. a paginated list of release URLs), or any auth
  requirement.** Every outbound fetch in this session was blocked by the
  network egress policy (confirmed by testing against unrelated sites like
  Wikipedia — this isn't specific to Mexican government domains). Before
  running this connector for real:
  1. Read the API guide PDF linked above (or gob.mx/contratacionesabiertas
     directly).
  2. Confirm the base URL, date-range/pagination parameters, and whether a
     request returns one release package or needs to be paginated across
     multiple calls.
  3. Set `COMPRAS_MX_OCDS_API_URL` accordingly and adjust the fetch/parsing
     logic in the connector if the real response shape differs from what's
     assumed there.

## What's deliberately NOT built yet (Layer 2/3 — Phase 6)

OCDS gives us structured Layer 1 fields (buyer, dates, value, status,
procedure type) for free — that's what the mapper fills in. It does
**not** give us `qualifications`, `experienceRequirements`,
`requiredDocuments`, or `risks`: those live in attached documents
(Convocatoria, Anexo Técnico PDFs) that OCDS references by URL but
doesn't extract. Reading those requires an LLM (Layer 2 of the platform's
three-layer extraction design) — no provider is configured, so the
mapper leaves those four fields as empty arrays rather than fabricating
content. The existing UI already renders "none listed" gracefully for
empty arrays, so ingested tenders show up correctly, just without that
detail until Phase 6 exists.

## `governmentLevel` and `industry` are best-effort guesses

OCDS has no `governmentLevel` field and no equivalent to this platform's
own industry taxonomy. `ocds-mapper.ts` infers both from the buyer name /
item classification with regex heuristics — reasonable for well-known
buyers (CFE, PEMEX, "Municipio de X") but not authoritative. Treat these
as needing human review, same as the platform's original "Confidence
Checking" design intent — no `confidence_score` column exists yet to
formalize that, deliberately, to avoid a schema change before Phase 6
actually needs one.

## Why DOF isn't built yet

DOF (Diario Oficial de la Federación) also has an open-data section
(`sidof.segob.gob.mx/datos_abiertos`), but it publishes the *full text* of
official notices (laws, decrees, standards, and — among many other things
— tender announcements), not structured procurement records the way OCDS
does. A DOF connector could supply little more than title/date/URL
automatically; extracting the actual tender fields from a DOF notice's
body text needs the same Layer 2 (AI) work as OCDS's attached documents,
just for more of the record. Compras MX stays the primary source because
its structured data is mappable with zero AI cost; DOF is future work as
a secondary/cross-validation source (its original intended role per the
platform's design), not a replacement.
