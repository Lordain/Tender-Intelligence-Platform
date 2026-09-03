/**
 * Runs Layer 2 extraction (extract-requirements.ts) over several real,
 * already-ingested tender documents with ONE chosen provider, so its
 * quality can be judged across multiple real tenders before trusting it
 * at production scale — a single test PDF (compare:extraction) isn't
 * enough evidence for a decision that changes how every tender gets
 * analyzed. Meant to be run once per provider (e.g. --provider=claude-
 * haiku over 5 documents, look at the output, then --provider=gemini
 * over 5 more) rather than all providers at once.
 *
 * Read-only: prints a per-document summary and writes full results to
 * exports/ for review. Never writes to Supabase — this is an evaluation
 * tool, not scripts/extract-tender-document.ts's --write path.
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
 *   npm run analyze:batch -- path/to/folder --provider=gemini [--count=5]
 *
 * --provider: claude-haiku | claude-sonnet | claude-opus | qwen | qwen-anthropic | qwen-anthropic-3.6 | gemini
 * --count: how many DOCUMENTS to run (default 5), not tenders — takes the
 *   first N matched files in the folder, alphabetical. Real gap found
 *   2026-09-03: a folder with more than --count files can silently cut off
 *   before reaching a tender whose files sort last (e.g. "SNR-..." never
 *   ran in an 8-count pass over a folder whose other tenders' files came
 *   first alphabetically) — pass a --count at least as large as the
 *   folder's total file count to guarantee every tender gets analyzed.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { intakeDocument, extractDocumentText } from "../lib/ingestion/document-intake";
import { extractTenderRequirements, type TenderExtraction } from "../lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwen } from "../lib/ingestion/extract-requirements-qwen";
import { extractTenderRequirementsQwenAnthropic } from "../lib/ingestion/extract-requirements-qwen-anthropic";
import { extractTenderRequirementsGemini } from "../lib/ingestion/extract-requirements-gemini";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type ProviderKey = "claude-haiku" | "claude-sonnet" | "claude-opus" | "qwen" | "qwen-anthropic" | "qwen-anthropic-3.6" | "gemini";
type ExtractContext = { tenderNumber: string; title: string; buyer: string };

const PROVIDER_RUNNERS: Record<ProviderKey, (pdfPath: string, context: ExtractContext) => Promise<TenderExtraction>> = {
  "claude-haiku": (p, c) => extractTenderRequirements(p, c, "claude-haiku-4-5-20251001"),
  "claude-sonnet": (p, c) => extractTenderRequirements(p, c, "claude-sonnet-5"),
  "claude-opus": (p, c) => extractTenderRequirements(p, c, "claude-opus-5"),
  qwen: extractTenderRequirementsQwen,
  "qwen-anthropic": extractTenderRequirementsQwenAnthropic,
  "qwen-anthropic-3.6": (p, c) => extractTenderRequirementsQwenAnthropic(p, c, "qwen3.6-plus"),
  gemini: extractTenderRequirementsGemini,
};

const PROVIDER_ENV_VAR: Record<ProviderKey, string> = {
  "claude-haiku": "ANTHROPIC_API_KEY",
  "claude-sonnet": "ANTHROPIC_API_KEY",
  "claude-opus": "ANTHROPIC_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  "qwen-anthropic": "DASHSCOPE_API_KEY",
  "qwen-anthropic-3.6": "DASHSCOPE_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

function findDocuments(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && SUPPORTED_EXTENSIONS.includes(extname(path).toLowerCase()))
    .sort();
}

type ResolvedTender = { slug: string; title: string; buyer: string; tenderNumber: string; matchNote: string };
type KnownTender = { slug: string; title: string; buyer: string };

/** A recognized `<slug>__` file name prefix (e.g. `dof-5678901__bases.pdf`) looks the tender up directly by slug — see this file's header comment for the (currently theoretical) case that needs this instead of text matching. */
const SLUG_OVERRIDE_PATTERN = /^([a-z0-9-]+)__/;

/**
 * Every real tender_number currently in Supabase, fetched once per run —
 * this is the "known facts" a document's own text/file name gets checked
 * against, rather than a guessed regex shape (see header comment). Paged
 * via `.range()` since a real production count can exceed PostgREST's
 * 1000-row default cap (the PEMEX ingest alone kept 3,128 real rows).
 */
async function loadKnownTenders(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<Map<string, KnownTender>> {
  const known = new Map<string, KnownTender>();
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase!.from("tenders").select("slug, tender_number, title, buyer").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load known tender numbers: ${error.message}`);
    for (const row of data ?? []) {
      const tenderNumber = row.tender_number as string;
      if (tenderNumber) {
        known.set(tenderNumber.toUpperCase(), { slug: row.slug as string, title: (row.title as { zh: string }).zh, buyer: row.buyer as string });
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return known;
}

async function resolveTender(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  pdfPath: string,
  knownTenders: Map<string, KnownTender>,
): Promise<{ tender: ResolvedTender } | { skip: string }> {
  const fileName = basename(pdfPath);
  const slugOverride = fileName.match(SLUG_OVERRIDE_PATTERN)?.[1];

  if (slugOverride) {
    const { data } = await supabase!.from("tenders").select("slug, tender_number, title, buyer").eq("slug", slugOverride).maybeSingle();
    if (!data) return { skip: `${fileName} — filename names slug "${slugOverride}" but no tender in Supabase has it` };
    return {
      tender: {
        slug: data.slug as string,
        tenderNumber: data.tender_number as string,
        title: (data.title as { zh: string }).zh,
        buyer: data.buyer as string,
        matchNote: `filename slug override (${slugOverride})`,
      },
    };
  }

  // Check the file name first (cheap, and a human-chosen name is
  // higher-confidence than a regex frequency count), then the document's
  // own extracted text. Prefer the LONGEST matching known number if more
  // than one appears — a document naming its own procedure plus a couple
  // of others it references should still resolve to its own.
  const text = await extractDocumentText(pdfPath);
  const haystack = `${fileName}\n${text}`.toUpperCase();
  let bestMatch: string | undefined;
  for (const tenderNumber of knownTenders.keys()) {
    if (haystack.includes(tenderNumber) && (!bestMatch || tenderNumber.length > bestMatch.length)) bestMatch = tenderNumber;
  }

  if (bestMatch) {
    const known = knownTenders.get(bestMatch)!;
    return { tender: { ...known, tenderNumber: bestMatch, matchNote: `matched known tender_number ${bestMatch} in file name/text` } };
  }

  // Fall back to the old Compras MX-shaped regex extraction — still useful
  // for a document whose tender genuinely isn't in Supabase yet, or a
  // shape the known-numbers check happened to miss (e.g. OCR noise).
  const intake = await intakeDocument(pdfPath);
  if (!intake.tenderNumber) {
    return {
      skip: `${fileName} — no known tender_number found in its file name/text, and no Compras MX-shaped procedure number either (rename it "<slug>__..." if you know which tender it belongs to)`,
    };
  }
  const { data } = await supabase!.from("tenders").select("slug, title, buyer").eq("tender_number", intake.tenderNumber).maybeSingle();
  if (!data) return { skip: `${fileName} — extracted procedure number ${intake.tenderNumber}, but no ingested tender has it` };

  return {
    tender: {
      slug: data.slug as string,
      tenderNumber: intake.tenderNumber,
      title: (data.title as { zh: string }).zh,
      buyer: data.buyer as string,
      matchNote:
        intake.tenderNumberSource === "filename" ? "procedure number from file name (regex fallback)" : `procedure number appears ${intake.tenderNumberOccurrences}x in the text (regex fallback)`,
    },
  };
}

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
    console.error("Usage: npm run analyze:batch -- <folder> --provider=<claude-haiku|claude-sonnet|claude-opus|qwen|qwen-anthropic|qwen-anthropic-3.6|gemini> [--count=5]");
    process.exit(1);
  }

  const envVar = PROVIDER_ENV_VAR[provider];
  if (!process.env[envVar]) {
    console.error(`${envVar} isn't set. See .env.example.`);
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
      const extraction = await PROVIDER_RUNNERS[provider](pdfPath, context);
      const elapsedMs = Date.now() - started;
      const s = summarize(extraction);
      console.log(
        `  [ok] ${elapsedMs}ms — ${s.qualifications} qualifications, ${s.experienceRequirements} experience, ${s.requiredDocuments} documents, ${s.risks} risks (${s.criticalRisks} critical)`,
      );
      results[tender.slug] = extraction;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [fail] ${message}`);
      results[tender.slug] = { error: message };
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
