/**
 * Runs Layer 2 extraction (extract-requirements.ts) over several real,
 * already-ingested tender documents with ONE chosen provider, so its
 * quality can be judged across multiple real tenders before trusting it
 * at production scale — a single test PDF (compare:extraction) isn't
 * enough evidence for a decision that changes how every tender gets
 * analyzed. Meant to be run once per provider (e.g. --provider=claude-
 * haiku over 5 documents, look at the output, then --provider=qwen
 * over 5 more) rather than all providers at once.
 *
 * Read-only: prints a per-document summary and writes full results to
 * exports/ for review. Never writes to Supabase — this is an evaluation
 * tool, not scripts/extract-tender-document.ts's --write path.
 *
 * Real bug fixed 2026-09-03: exported results used to be keyed by
 * `tender.slug` alone, so when a real tender has multiple source
 * documents (common — CFE/PEMEX/Compras MX tenders here often have 2-3),
 * each later document's result silently OVERWROTE the earlier one's in
 * the exported JSON — every multi-document tender's export only ever
 * showed its LAST-processed file, with the others' extractions discarded
 * with no error or warning. Found by the user noticing an export only had
 * 7 entries for a 14-document run. Now keyed by `"<slug> :: <fileName>"`
 * so every document's own result survives.
 *
 * Matches documents to tenders primarily by checking each document's own
 * text/file name for a real, already-known `tenders.tender_number` value
 * (every tender number currently in Supabase is fetched once up front) —
 * not by guessing a source-specific ID shape via regex. This replaced an
 * earlier version that extracted a Compras MX-shaped procedure number
 * (`XX-##-XXX-XXXXXXXXX-X-#-####`) via regex and looked THAT up: it
 * silently failed for any source whose real ID doesn't fit that shape —
 * confirmed real for both PEMEX (`DAS-CAN-B-GCSS-MCHV-107475-2026-1`, a
 * structurally different, internally inconsistent format) and CFE
 * (`CFE-0001-CAAAT-0134-2026` — a 3-letter prefix, not 2). Checking
 * against known tender numbers instead needs no per-source regex at all,
 * and is MORE accurate for Compras MX-shaped numbers too (a document
 * quoting a different, unrelated procedure number more often than its own
 * would previously win on raw frequency).
 *
 * A document whose real identifier can't appear in its own text at all
 * (e.g. a source keyed on an internal id no PDF would ever quote — none
 * currently, but kept as an escape hatch) can still be named
 * `<slug>__anything.pdf` — a recognized `<slug>__` prefix looks the
 * tender up directly, bypassing text matching entirely.
 *
 * A PDF that matches neither way is skipped, not counted toward --count.
 *
 * Usage:
 *   npm run analyze:batch -- path/to/folder --provider=claude-haiku [--count=5]
 *
 * --provider: claude-haiku | claude-sonnet | claude-opus | qwen | qwen-anthropic | qwen-anthropic-3.6 | auto
 *
 * --provider=auto (2026-09-03, per the user): routes each document by
 * whether it has a real text layer, per the day's findings — Word docs
 * always do; a PDF is checked via the same `pdftotext` extraction already
 * used for tender-number matching. Scanned/image-only PDFs (no meaningful
 * text layer) go to claude-haiku, since it's the only provider confirmed
 * to read scanned pages correctly after chunking (qwen-anthropic returned
 * an empty 0/0/0/0 result on a real 33MB scanned Anexo, on BOTH
 * qwen3.5-plus and qwen3.6-plus, with suspiciously tiny per-chunk input
 * token counts suggesting the reconstructed PDF chunks weren't actually
 * being read). Everything else (has real text — most PDFs and all Word
 * docs) goes to Qwen, confirmed working well and far cheaper. This is a
 * real, live-tested cost/quality split, not a guess.
 *
 * Which Qwen depends on what the tender is worth: flagship (大型项目) gets
 * qwen3.6-plus, everything else qwen3.5-plus. That half is not decided
 * here — auto calls lib/ingestion/extraction-routing.ts, the same function
 * the single-document path (extract-tender-document.ts) and the admin
 * upload path both call, so a document gets the same model whichever way
 * it is run. Until 2026-09-08 this file asked only the text-layer half and
 * sent every readable document to qwen3.5-plus, which meant a flagship
 * tender analysed in a batch got a cheaper read than the same tender
 * analysed on its own — and scripts/import-batch-analysis.ts writes these
 * results to production.
 * --count: how many DOCUMENTS to run (default 5), not tenders — takes the
 *   first N matched files in the folder, alphabetical. Real gap found
 *   2026-09-03: a folder with more than --count files can silently cut off
 *   before reaching a tender whose files sort last (e.g. "SNR-..." never
 *   ran in an 8-count pass over a folder whose other tenders' files came
 *   first alphabetically) — pass a --count at least as large as the
 *   folder's total file count to guarantee every tender gets analyzed.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { extractTenderRequirements, type TenderExtraction } from "../lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwen } from "../lib/ingestion/extract-requirements-qwen";
import { extractTenderRequirementsQwenAnthropic } from "../lib/ingestion/extract-requirements-qwen-anthropic";
import { hasRealTextLayer } from "../lib/ingestion/text-layer";
import { findDocuments, loadKnownTenders, resolveTender } from "@/lib/ingestion/match-documents-to-tenders";
import { maxPagesForTier, chooseExtractionModel, describeExtractionRouting } from "../lib/ingestion/extraction-routing";
import type { TenderRelevanceTier } from "../types/tender";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type ProviderKey = "claude-haiku" | "claude-sonnet" | "claude-opus" | "qwen" | "qwen-anthropic" | "qwen-anthropic-3.6" | "auto";
type ExtractContext = { tenderNumber: string; title: string; buyer: string };

const PROVIDER_RUNNERS: Record<ProviderKey, (pdfPath: string, context: ExtractContext, tier: TenderRelevanceTier | null) => Promise<TenderExtraction>> = {
  // Every runner takes the tier's page cap. An evaluation run that read
  // more pages than production does would be measuring a pipeline nobody
  // ships.
  "claude-haiku": (p, c, tier) => extractTenderRequirements(p, c, "claude-haiku-4-5-20251001", undefined, true, maxPagesForTier(tier)),
  "claude-sonnet": (p, c, tier) => extractTenderRequirements(p, c, "claude-sonnet-5", undefined, true, maxPagesForTier(tier)),
  "claude-opus": (p, c, tier) => extractTenderRequirements(p, c, "claude-opus-5", undefined, true, maxPagesForTier(tier)),
  qwen: extractTenderRequirementsQwen,
  // Wrapped rather than passed by reference: this map's third argument is
  // now the tender's tier, and this function's third parameter is a model
  // id — same position, different meaning.
  "qwen-anthropic": (p, c, tier) => extractTenderRequirementsQwenAnthropic(p, c, "qwen3.5-plus", maxPagesForTier(tier)),
  "qwen-anthropic-3.6": (p, c, tier) => extractTenderRequirementsQwenAnthropic(p, c, "qwen3.6-plus", maxPagesForTier(tier)),
  // Self-referencing PROVIDER_RUNNERS here is fine — this arrow function
  // body only runs once PROVIDER_RUNNERS itself is fully assigned, since
  // it's called later, not during this object literal's construction.
  // Defers to lib/ingestion/extraction-routing.ts rather than repeating
  // the rule, so a batch run and a single-document run put the same
  // document through the same model. Until 2026-09-08 this only asked the
  // text-layer half of the question and sent every readable document to
  // qwen3.5-plus — which quietly meant a flagship tender analysed here got
  // the cheaper model than the same tender analysed one file at a time,
  // and scripts/import-batch-analysis.ts writes these results to production.
  auto: async (p, c, tier) => {
    const hasText = await hasRealTextLayer(p);
    const model = chooseExtractionModel(hasText, tier);
    const chosen: ProviderKey = !hasText
      ? "claude-haiku"
      : model === "qwen3.6-plus"
        ? "qwen-anthropic-3.6"
        : "qwen-anthropic";
    console.log(`  [auto] ${describeExtractionRouting(hasText, tier)} — routing to ${chosen}`);
    return PROVIDER_RUNNERS[chosen](p, c, tier);
  },
};

const PROVIDER_ENV_VAR: Record<ProviderKey, string[]> = {
  "claude-haiku": ["ANTHROPIC_API_KEY"],
  "claude-sonnet": ["ANTHROPIC_API_KEY"],
  "claude-opus": ["ANTHROPIC_API_KEY"],
  qwen: ["DASHSCOPE_API_KEY"],
  "qwen-anthropic": ["DASHSCOPE_API_KEY"],
  "qwen-anthropic-3.6": ["DASHSCOPE_API_KEY"],
  // Either underlying provider could get picked per document, so both
  // keys need to be set up front rather than discovered mid-run.
  auto: ["ANTHROPIC_API_KEY", "DASHSCOPE_API_KEY"],
};

function summarize(extraction: TenderExtraction) {
  return {
    qualifications: extraction.qualifications.length,
    experienceRequirements: extraction.experienceRequirements.length,
    requiredDocuments: extraction.requiredDocuments.length,
    risks: extraction.risks.length,
    criticalRisks: extraction.risks.filter((r) => r.level === "critical").length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const provider = args.find((a) => a.startsWith("--provider="))?.split("=")[1] as ProviderKey | undefined;
  const countArg = args.find((a) => a.startsWith("--count="))?.split("=")[1];
  const count = countArg ? parseInt(countArg, 10) : 5;

  if (!dir || !provider || !(provider in PROVIDER_RUNNERS)) {
    console.error("Usage: npm run analyze:batch -- <folder> --provider=<claude-haiku|claude-sonnet|claude-opus|qwen|qwen-anthropic|qwen-anthropic-3.6|auto> [--count=5]");
    process.exit(1);
  }

  const missingEnvVars = PROVIDER_ENV_VAR[provider].filter((v) => !process.env[v]);
  if (missingEnvVars.length > 0) {
    console.error(`${missingEnvVars.join(", ")} isn't set. See .env.example.`);
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const documents = findDocuments(dir);
  if (documents.length === 0) {
    console.log(`No PDF/DOCX/DOC files found in ${dir}.`);
    return;
  }

  console.log("Loading known tender numbers from Supabase...");
  const knownTenders = await loadKnownTenders(supabase);
  console.log(`${knownTenders.size} known tender number(s) loaded.\n`);

  const results: Record<string, TenderExtraction | { error: string }> = {};
  let run = 0;

  for (const pdfPath of documents) {
    if (run >= count) break;

    const resolved = await resolveTender(supabase, pdfPath, knownTenders);
    if ("skip" in resolved) {
      console.log(`[skip] ${resolved.skip}`);
      continue;
    }
    const { tender } = resolved;

    const context: ExtractContext = {
      tenderNumber: tender.tenderNumber,
      title: tender.title,
      buyer: tender.buyer,
    };

    run++;
    console.log(`\n[${run}/${count}] ${tender.slug} — ${basename(pdfPath)} (${tender.matchNote})`);
    const started = Date.now();
    try {
      const extraction = await PROVIDER_RUNNERS[provider](pdfPath, context, tender.tier);
      const elapsedMs = Date.now() - started;
      const s = summarize(extraction);
      console.log(
        `  [ok] ${elapsedMs}ms — ${s.qualifications} qualifications, ${s.experienceRequirements} experience, ${s.requiredDocuments} documents, ${s.risks} risks (${s.criticalRisks} critical)`,
      );
      results[`${tender.slug} :: ${basename(pdfPath)}`] = extraction;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [fail] ${message}`);
      results[`${tender.slug} :: ${basename(pdfPath)}`] = { error: message };
    }
  }

  if (run === 0) {
    console.log("\nNo PDFs in this folder matched an ingested tender — nothing to analyze.");
    return;
  }

  const OUT_DIR = "exports";
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `analyze-batch-${provider}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results (every extracted item, not just counts) for ${run} document(s) written to ${outPath} — read that to actually judge quality, the console summary above is only counts.`);
}

main();
