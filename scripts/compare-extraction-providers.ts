/**
 * Runs the same real tender PDF through all three document-analysis
 * providers (Claude Sonnet 5 — the current production standard tier,
 * plus the two cheaper alternatives the user asked to evaluate,
 * 2026-09-03: Qwen3.6-Plus and Gemini 3.1 Flash-Lite) and prints a
 * side-by-side item-count summary, so extraction quality can be judged
 * before deciding whether to change scripts/extract-tender-document.ts's
 * production path.
 *
 * Read-only — never writes to Supabase, this is an evaluation tool. A
 * provider whose API key isn't configured is skipped, not treated as a
 * failure.
 *
 * IMPORTANT ASYMMETRY, not a bug: Claude and Gemini read the PDF
 * natively (real document/vision understanding — layout, tables, scanned
 * pages); Qwen gets locally-extracted plain text instead (see
 * lib/ingestion/extract-requirements-qwen.ts's header for why). A gap in
 * Qwen's results may reflect that input-fidelity gap, not just the
 * model's own extraction ability — read the comparison with that in mind.
 *
 * Usage:
 *   npm run compare:extraction -- path/to/file.pdf [tender-slug]
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { intakeDocument } from "../lib/ingestion/document-intake";
import { extractTenderRequirements, type TenderExtraction } from "../lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwen } from "../lib/ingestion/extract-requirements-qwen";
import { extractTenderRequirementsGemini } from "../lib/ingestion/extract-requirements-gemini";

type Provider = {
  name: string;
  envVar: string;
  run: (pdfPath: string, context: { tenderNumber: string; title: string; buyer: string }) => Promise<TenderExtraction>;
};

const PROVIDERS: Provider[] = [
  { name: "claude-sonnet-5 (当前生产)", envVar: "ANTHROPIC_API_KEY", run: (p, c) => extractTenderRequirements(p, c, "claude-sonnet-5") },
  { name: "qwen3.6-plus (本地提取文本)", envVar: "DASHSCOPE_API_KEY", run: extractTenderRequirementsQwen },
  { name: "gemini-3.1-flash-lite (原生 PDF)", envVar: "GEMINI_API_KEY", run: extractTenderRequirementsGemini },
];

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
  const positional = args.filter((a) => !a.startsWith("--"));
  const [pdfPath, tenderSlug] = positional;

  if (!pdfPath) {
    console.error("Usage: npm run compare:extraction -- <file.pdf> [tender-slug]");
    process.exit(1);
  }

  const intake = intakeDocument(pdfPath);
  const context = { tenderNumber: intake.tenderNumber ?? tenderSlug ?? intake.fileName, title: intake.fileName, buyer: "" };
  console.log(`Document: ${intake.fileName} (${intake.documentType}), tender number in text: ${intake.tenderNumber ?? "not found"}\n`);

  const results: Record<string, TenderExtraction | { error: string } | { skipped: true }> = {};

  for (const provider of PROVIDERS) {
    if (!process.env[provider.envVar]) {
      console.log(`[skip] ${provider.name} — ${provider.envVar} not set`);
      results[provider.name] = { skipped: true };
      continue;
    }

    const started = Date.now();
    try {
      const extraction = await provider.run(pdfPath, context);
      const elapsedMs = Date.now() - started;
      const s = summarize(extraction);
      console.log(
        `[ok]   ${provider.name} — ${elapsedMs}ms — ${s.qualifications} qualifications, ${s.experienceRequirements} experience, ${s.requiredDocuments} documents, ${s.risks} risks (${s.criticalRisks} critical)`,
      );
      results[provider.name] = extraction;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fail] ${provider.name} — ${message}`);
      results[provider.name] = { error: message };
    }
  }

  const OUT_DIR = "exports";
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `extraction-comparison-${new Date().toISOString().slice(0, 10)}-${intake.contentHash.slice(0, 8)}.json`);
  writeFileSync(outPath, JSON.stringify({ document: intake.fileName, results }, null, 2));
  console.log(`\nFull results (every extracted item, not just counts) written to ${outPath} — read that for actual quality comparison, the console summary above is only counts.`);
}

main();
