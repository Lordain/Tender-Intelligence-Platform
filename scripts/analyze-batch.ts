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
 * Matches documents to tenders by looking up the extracted procedure
 * number directly against the `tenders.tender_number` column — NOT by
 * reconstructing a `comprasmx-${slug}` (the first version of this script
 * did that, which only ever matched Compras MX-sourced tenders; PEMEX
 * tenders use a `pemex-` slug and were silently skipped even when their
 * own procedure number matched fine, since it never got looked up).
 *
 * CFE tenders (ingested via ingest:dof-search, slug `dof-<DOF codNota>`)
 * can't be matched this way at all — a DOF publication code isn't a
 * procedure number and never appears in a CFE bases/convocatoria PDF's
 * own text. For those (or any tender whose real identifier a document
 * can't carry), name the file `<slug>__anything.pdf` — a recognized
 * `<slug>__` prefix looks the tender up directly, bypassing procedure-
 * number extraction entirely. Find the real slug via Supabase
 * (`select slug from tenders where source_name ilike '%DOF%'` or the
 * admin panel) before renaming the file.
 *
 * A PDF that matches neither way is skipped, not counted toward --count.
 *
 * Usage:
 *   npm run analyze:batch -- path/to/folder --provider=claude-haiku [--count=5]
 *   npm run analyze:batch -- path/to/folder --provider=gemini [--count=5]
 *
 * --provider: claude-haiku | claude-sonnet | claude-opus | qwen | gemini
 * --count: how many documents to run (default 5) — takes the first N
 *   matching PDFs in the folder, alphabetical.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { intakeDocument } from "../lib/ingestion/document-intake";
import { extractTenderRequirements, type TenderExtraction } from "../lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwen } from "../lib/ingestion/extract-requirements-qwen";
import { extractTenderRequirementsGemini } from "../lib/ingestion/extract-requirements-gemini";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type ProviderKey = "claude-haiku" | "claude-sonnet" | "claude-opus" | "qwen" | "gemini";
type ExtractContext = { tenderNumber: string; title: string; buyer: string };

const PROVIDER_RUNNERS: Record<ProviderKey, (pdfPath: string, context: ExtractContext) => Promise<TenderExtraction>> = {
  "claude-haiku": (p, c) => extractTenderRequirements(p, c, "claude-haiku-4-5-20251001"),
  "claude-sonnet": (p, c) => extractTenderRequirements(p, c, "claude-sonnet-5"),
  "claude-opus": (p, c) => extractTenderRequirements(p, c, "claude-opus-5"),
  qwen: extractTenderRequirementsQwen,
  gemini: extractTenderRequirementsGemini,
};

const PROVIDER_ENV_VAR: Record<ProviderKey, string> = {
  "claude-haiku": "ANTHROPIC_API_KEY",
  "claude-sonnet": "ANTHROPIC_API_KEY",
  "claude-opus": "ANTHROPIC_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
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

/** A recognized `<slug>__` file name prefix (e.g. `dof-5678901__bases.pdf`) looks the tender up directly by slug — see this file's header comment for why CFE/DOF tenders need this instead of procedure-number extraction. */
const SLUG_OVERRIDE_PATTERN = /^([a-z0-9-]+)__/;

async function resolveTender(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  pdfPath: string,
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

  const intake = await intakeDocument(pdfPath);
  if (!intake.tenderNumber) {
    return {
      skip: `${intake.fileName} — no procedure number found in its file name or text (rename it "<slug>__..." to match a tender directly, e.g. for a CFE/DOF tender)`,
    };
  }

  const { data } = await supabase!.from("tenders").select("slug, title, buyer").eq("tender_number", intake.tenderNumber).maybeSingle();
  if (!data) return { skip: `${intake.fileName} — no ingested tender has tender_number ${intake.tenderNumber}` };

  const matchNote =
    intake.tenderNumberSource === "filename" ? "procedure number from file name" : `procedure number appears ${intake.tenderNumberOccurrences}x in the text`;
  return {
    tender: {
      slug: data.slug as string,
      tenderNumber: intake.tenderNumber,
      title: (data.title as { zh: string }).zh,
      buyer: data.buyer as string,
      matchNote,
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
    console.error("Usage: npm run analyze:batch -- <folder> --provider=<claude-haiku|claude-sonnet|claude-opus|qwen|gemini> [--count=5]");
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

  const results: Record<string, TenderExtraction | { error: string }> = {};
  let run = 0;

  for (const pdfPath of documents) {
    if (run >= count) break;

    const resolved = await resolveTender(supabase, pdfPath);
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
