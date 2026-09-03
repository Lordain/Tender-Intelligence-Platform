# Mexico end-to-end checklist

Operational checklist for running the full pipeline — ingest → reclassify → translate → documents → analysis — across Mexico's three source families. This is the "what do I actually run, in order" quick-reference; the *why* behind each step, every real endpoint, and every caveat is in `lib/ingestion/README.md` (linked inline below) — read that first if something here doesn't make sense.

Strategic scope (2026-09-02, explicit user decision): focus on finishing Mexico end-to-end (data + documents + analysis, all genuinely working) before expanding to more countries. Colombia stays as-is — no active new work there for now.

None of these steps run on a schedule. Every capture is manual, on demand — re-run this whole checklist whenever you want fresh data.

---

## Part 1 — Compras MX (most mature; two verified mappers)

- [ ] **1.1 Open tenders** (still-biddable procedures — this is the whole point: real, currently-biddable opportunities)
  - Open `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/` ("Difusión de procedimientos"), filter as needed, click the page's own Excel export button.
  - `npm run ingest:comprasmx-open -- <file>.xlsx --write`
  - Re-running this later with an overlapping export is safe — upsert is keyed by the tender's real procedure number, not insert-only (see README's "Re-ingestion dedup").
- [ ] **1.2 Automated discovery via LicitIA** (added 2026-09-03 — a second, independent discovery path on top of 1.1, not a replacement)
  - `npm run discover:comprasmx-vigente -- --write` — no manual export step at all; pulls LicitIA's bulk `licitaciones` corpus, keeps only `seccion === "vigente"`, skips anything already in Supabase, resolves a real deep link for each new one.
  - Real run (2026-09-03): 564 vigente total, 555 already covered by 1.1's manual exports, 9 genuinely new. Run this anytime; safe to re-run (same slug scheme as 1.1).
  - See README's "LicitIA — a third-party ComprasMX/CompraNet mirror" section for the full story, including confirmation this does NOT cover PEMEX, CFE, or Proyectos Estratégicos MX (Part 3.5 stays the only path for that one).
- [ ] **1.3 Deep-link backfill for anything still on the generic fallback URL**
  - `npm run resolve:comprasmx-links -- --write` — safe to re-run anytime; real run resolved 591/591.

**Contracts (awarded/historical) intentionally NOT in this checklist.** Corrected 2026-09-02 after the user caught the inconsistency: this data is only useful for relevance-threshold calibration and market intelligence — the thresholds are already calibrated and tested against real data from earlier this session, and market intelligence is explicitly a post-launch feature, not current priority. Awarded/cancelled tenders are also hidden from the default view now (see README's "awarded/cancelled status hidden by default"). Re-add `npm run ingest:comprasmx-contracts` here only if a real future need for fresh contract data actually shows up.

## Part 2 — PEMEX (documents are semi-automatic here — the strongest of the three)

- [ ] **2.1 Tender list** (per subsidiary: PEP/PTI/PL/PE/PF/PPS)
  - Open e.g. `https://www.pemex.com/procura/procedimientos-de-contratacion/concursosabiertos`, DevTools Console (F12), run the list-pull script (README "Technique 3").
  - `npm run ingest:pemex -- <file>.json --buyer "<subsidiary name>" --write`
- [ ] **2.2 Document references + real files** (no anti-bot gate — this is the one source where files download automatically)
  - Same Console, run the attachments-pull script (README "PEMEX document references").
  - `npm run ingest:pemex-attachments -- <file>.json --write --download`
  - `--download` fetches real PDF bytes into `downloads/pemex/<tender-slug>/` and records a real `content_hash` — skips the manual per-document download step entirely.

## Part 3 — CFE (no direct source — routed through DOF)

- [ ] **3.1 DOF advanced search for CFE tenders**
  - Open `https://sidof.segob.gob.mx/busquedaAvanzada/busqueda`, search "COMISIÓN FEDERAL DE ELECTRICIDAD".
  - DevTools (F12) → Network → find `POST .../busqueda/CargaNotasAvanzadas/` → save its Response as `.json`.
  - `npm run ingest:dof-search -- <file>.json --write`
- [ ] **3.2 Documents** — no automated path exists. DOF notices carry no document; CFE's own portal (`msc.cfe.mx`) is WAF-protected (Imperva) and not accessible. Treat CFE tenders as metadata-only for now, or manually hunt down bases/convocatoria PDFs per-tender if a specific opportunity is worth the effort.

## Part 3.5 — Proyectos Estratégicos MX (added 2026-09-03 — a new source, auto-flagship, supersedes Proyectos México)

- [x] **"Ley para el Fomento de la Inversión en Infraestructura Estratégica" project list, real bidding data with real attachments** (done 2026-09-03 — real 48-row export, 48/48 mapped)
  - Open `https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/`, filter as needed, click the page's own export button (same "Información Pública" export format as Compras MX's "Difusión de procedimientos" — no anti-bot gate, a plain browser download).
  - `npm run ingest:proyectos-estrategicos -- <file>.xlsx --write`
  - Every tender from this source is tagged `isNationalPriorityProject: true` and lands on **flagship** regardless of value/keywords — being listed under this strategic-infrastructure law IS the signal, same reasoning the retired Proyectos México source used.
  - **Supersedes Proyectos México (Banobras/SHCP)** (2026-09-02 through 2026-09-03, retired 2026-09-03 — its 57 ingested rows deleted, its mapper/ingest script removed): the user found a real Proyectos México project page ("Presa Mujer Solteca," CONAGUA) that links out to this exact portal once the project reaches actual bidding — confirming this IS the real procurement destination, not an unrelated third system, and it comes with real Convocatoria/Anexo attachments Proyectos México never had (Proyectos México only ever listed the investment-pipeline stage, no downloadable documents).
  - Unlike Proyectos México's own `participationScope` field, this source reuses Compras MX's `Carácter` vocabulary (NACIONAL / INTERNACIONAL BAJO LA COBERTURA DE TRATADOS / etc.) via the shared `compras-mx-open-tenders-mapper.ts` logic — see `lib/ingestion/proyectos-estrategicos-mapper.ts` for why this mapper is a thin wrapper reusing that file's field parsing wholesale rather than a separate implementation.
  - **Known gap, not fixed**: no ID shared with Compras MX/PEMEX/DOF (same limitation the retired Proyectos México source had), so a project appearing both here and as its own Compras MX procedure will show as two separate rows — accepted, not silently merged (see README).

## Part 4 — Shared steps (run once, after Parts 1–3.5)

- [ ] **4.1 Reclassify with the current relevance rules**
  - `npm run reclassify:tenders` (dry run — check the exported CSV looks right)
  - `npm run reclassify:tenders -- --write`
- [ ] **4.2 Translate titles/summaries** (Haiku 4.5 — cheap, run for every kept tender)
  - `npm run translate:tenders` (dry run — see what's pending)
  - `npm run translate:tenders -- --write`
- [ ] **4.3 Compras MX documents specifically** (the one source still fully manual — the site blocks automated downloads)
  - Manually download Convocatoria/Bases PDFs for the flagship/significant Compras MX tenders you care about.
  - Drop them in a folder, then `npm run ingest:documents -- <folder> --write` to file them against the right tenders.
- [ ] **4.4 Analysis — on demand only, not proactive** (per the agreed cost model: cheap translation for everyone, expensive extraction only when a subscriber actually wants it)
  - `npm run extract:document -- <file.pdf> <tender-slug>` — standard tier (Sonnet 5)
  - `npm run extract:document -- <file.pdf> <tender-slug> --precise` — precision tier (Opus 5, paid upsell)
  - Add `--write` once you're happy with the printed result. `--force` is needed to downgrade an existing Opus 5 result back to Sonnet 5.

## Known gaps, not blocking but worth knowing

- No step here runs automatically on a schedule — this is a manual checklist, every time.
- CFE has no document path at all right now (Part 3.2).
- Compras MX documents still require one-by-one manual download (Part 4.3) — the single biggest remaining manual-labor cost in the whole pipeline.
- The "on-demand paid analysis" trigger (a button in the UI, gated by subscription, calling into `extract:document`'s logic via an API route) doesn't exist yet — today this is still a CLI-only tool run by hand.
