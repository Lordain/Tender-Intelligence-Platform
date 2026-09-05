/**
 * Runs the same batch of real tender titles/summaries through all three
 * translation providers (Claude Haiku 4.5 — the current production path,
 * plus the two cheaper alternatives the user asked to evaluate,
 * 2026-09-03: Qwen3.6-Plus and Gemini 3.1 Flash-Lite) and prints them
 * side by side, so translation quality can be judged before deciding
 * whether to switch the production path in scripts/translate-tenders.ts.
 *
 * Read-only against Supabase (fetches a sample, never writes anything) —
 * this is an evaluation tool, not a production ingest path. A provider
 * whose API key isn't configured is skipped, not treated as a failure —
 * run this again once DASHSCOPE_API_KEY/GEMINI_API_KEY are added (see
 * .env.example) to bring that provider into the comparison.
 *
 * Usage:
 *   npm run compare:translation                 (5 real tenders that already have a Claude translation, from Supabase)
 *   npm run compare:translation -- --limit 10
 *   npm run compare:translation -- --fixture     (3 hardcoded examples, no Supabase needed)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { translateTenderBatch, type TenderToTranslate, type TranslatedTender } from "../lib/ingestion/translate-titles";
import { translateTenderBatchQwen } from "../lib/ingestion/translate-titles-qwen";
import { translateTenderBatchGemini } from "../lib/ingestion/translate-titles-gemini";
import type { LocalizedText } from "../types/tender";

type Provider = {
  name: string;
  envVar: string;
  run: (items: TenderToTranslate[]) => Promise<TranslatedTender[]>;
};

const PROVIDERS: Provider[] = [
  { name: "claude-haiku-4-5 (当前生产)", envVar: "ANTHROPIC_API_KEY", run: translateTenderBatch },
  { name: "qwen3.6-plus", envVar: "DASHSCOPE_API_KEY", run: translateTenderBatchQwen },
  { name: "gemini-3.1-flash-lite", envVar: "GEMINI_API_KEY", run: translateTenderBatchGemini },
];

const FIXTURE: (TenderToTranslate & { existingTitleZh?: string })[] = [
  {
    slug: "fixture-1",
    titleEs: "Rehabilitación y ampliación de la planta de tratamiento de aguas residuales",
    summaryEs: "Contratación de obra pública para la rehabilitación y ampliación de la planta de tratamiento de aguas residuales municipales, incluyendo suministro e instalación de equipo electromecánico.",
  },
  {
    slug: "fixture-2",
    titleEs: "Adquisición de equipo de cómputo y licenciamiento de software",
    summaryEs: "Adquisición de equipo de cómputo de escritorio, laptops y licenciamiento de software de oficina para las oficinas centrales de la entidad.",
  },
  {
    slug: "fixture-3",
    titleEs: "Servicio de mantenimiento preventivo y correctivo a subestaciones eléctricas",
    summaryEs: "Contratación del servicio de mantenimiento preventivo y correctivo a subestaciones eléctricas de la red de distribución, incluyendo pruebas de aislamiento y reemplazo de componentes.",
  },
];

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function fetchRealSample(limit: number): Promise<(TenderToTranslate & { existingTitleZh?: string })[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured — pass --fixture to compare without it.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("tenders")
    .select("slug, title, summary")
    .neq("relevance_tier", "excluded")
    .order("publication_date", { ascending: false })
    .limit(200);

  if (error) {
    console.error(`Failed to fetch tenders: ${error.message}`);
    process.exit(1);
  }

  const rows = data as { slug: string; title: LocalizedText; summary: LocalizedText }[];
  // Only rows that already have a real Claude translation (title.zh !==
  // title.es) — gives a known-good baseline to compare the two new
  // providers against, instead of judging all three with nothing to
  // anchor "is this actually good" to.
  const translated = rows.filter((t) => t.title.zh !== t.title.es).slice(0, limit);

  return translated.map((t) => ({
    slug: t.slug,
    titleEs: t.title.es,
    summaryEs: t.summary.es,
    existingTitleZh: t.title.zh,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const limit = Number(argValue(args, "--limit") ?? 5);

  const sample = useFixture ? FIXTURE : await fetchRealSample(limit);
  if (sample.length === 0) {
    console.error("No sample tenders found (need tenders with a real title.zh already set — run translate:tenders first, or pass --fixture).");
    process.exit(1);
  }

  console.log(`Comparing ${PROVIDERS.length} provider(s) against ${sample.length} real tender(s)...\n`);

  const results: Record<string, TranslatedTender[] | { error: string } | { skipped: true }> = {};

  for (const provider of PROVIDERS) {
    if (!process.env[provider.envVar]) {
      console.log(`[skip] ${provider.name} — ${provider.envVar} not set`);
      results[provider.name] = { skipped: true };
      continue;
    }

    const started = Date.now();
    try {
      const items = await provider.run(sample);
      const elapsedMs = Date.now() - started;
      console.log(`[ok]   ${provider.name} — ${items.length} item(s) in ${elapsedMs}ms`);
      results[provider.name] = items;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fail] ${provider.name} — ${message}`);
      results[provider.name] = { error: message };
    }
  }

  console.log("\n--- Side by side ---\n");
  for (const item of sample) {
    console.log(`slug: ${item.slug}`);
    console.log(`  ES 原文标题: ${item.titleEs}`);
    if (item.existingTitleZh) console.log(`  现有 Claude 译文（生产基线）: ${item.existingTitleZh}`);
    for (const provider of PROVIDERS) {
      const result = results[provider.name];
      if (!result || "skipped" in result || "error" in result) continue;
      const translated = result.find((r) => r.slug === item.slug);
      console.log(`  ${provider.name}: ${translated ? translated.titleZh : "(no result for this slug)"}`);
    }
    console.log("");
  }

  const OUT_DIR = "exports";
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `translation-comparison-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify({ sample, results }, null, 2));
  console.log(`Full results written to ${outPath}`);
}

main();
