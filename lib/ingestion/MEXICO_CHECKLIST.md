# Mexico end-to-end checklist

Operational checklist for running the full pipeline — ingest → reclassify → translate → documents → analysis — across Mexico's three source families. This is the "what do I actually run, in order" quick-reference; the *why* behind each step, every real endpoint, and every caveat is in `lib/ingestion/README.md` (linked inline below) — read that first if something here doesn't make sense.

Strategic scope (2026-09-02, explicit user decision): focus on finishing Mexico end-to-end (data + documents + analysis, all genuinely working) before expanding to more countries. Colombia stays as-is — no active new work there for now.

None of these steps run on a schedule. Every capture is manual, on demand — re-run this whole checklist whenever you want fresh data.

---

## Part 1 — Compras MX (most mature; two verified mappers)

- [ ] **1.1 Open tenders** (still-biddable procedures)
  - Open `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/` ("Difusión de procedimientos"), filter as needed, click the page's own Excel export button.
  - `npm run ingest:comprasmx-open -- <file>.xlsx --write`
  - Re-running this later with an overlapping export is safe — upsert is keyed by the tender's real procedure number, not insert-only (see README's "Re-ingestion dedup").
- [ ] **1.2 Contracts** (awarded/historical — real peso values, used for relevance calibration + market intel, not shown to users by default anymore)
  - Open `https://comprasmx.buengobierno.gob.mx/datos-abiertos`, find "Contratos ingresados a CompraNet", pick a year, download.
  - `npm run ingest:comprasmx-contracts -- <file>.csv --write`

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

## Part 4 — Shared steps (run once, after Parts 1–3)

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
