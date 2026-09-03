/**
 * Translates already-ingested tenders' title/summary from Spanish to real
 * Chinese (see lib/ingestion/translate-titles.ts) — every mapper
 * currently writes untranslated() (zh mirrors es), so this is what
 * actually produces the "bilingual title, Chinese primary" experience the
 * product is designed around (TenderCard.tsx/TenderOverview.tsx already
 * branch on title.zh !== title.es; they've had nothing to show yet
 * without this).
 *
 * Skips tenders whose relevance_tier is "excluded" — no point spending
 * real API cost translating tenders the default feed never shows.
 *
 * Requires ANTHROPIC_API_KEY. NOT LIVE-TESTED — see the header comment in
 * lib/ingestion/translate-titles.ts.
 *
 * Usage:
 *   npm run translate:tenders -- --limit 50            (dry run — prints what would be translated, no API calls)
 *   npm run translate:tenders -- --limit 50 --write     (translates up to 50 and writes to Supabase)
 *   npm run translate:tenders -- --write                (translates every untranslated, non-excluded tender)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { translateTenderBatch, type TenderToTranslate, type TranslatedTender } from "../lib/ingestion/translate-titles";
import type { LocalizedText } from "../types/tender";

// Was 25 — dropped after a real run (2026-09-03) truncated a 25-item
// batch's output (max_tokens: 8000 in translate-titles.ts) when a few
// items in the batch fell back to Descripción (a long multi-paragraph
// spec, not the usual one-sentence Alias — see proyectos-mexico-mapper.ts)
// as their summary. A smaller batch keeps worst-case per-call output well
// under the cap even when several long summaries land in the same batch.
const BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

// Diagnostic only, run when an item still 400s after the sanitize fix in
// translate-titles.ts already ruled out unpaired surrogates (real case,
// 2026-09-03: proyectosmexico-1090 kept failing even alone). Flags control
// characters and other genuinely abnormal code points — NOT ordinary
// accented Spanish (é, ñ, ¡, etc., all well within normal prose) — so the
// next failure's log line names the actual character instead of needing a
// separate one-off script to go find it.
function describeSuspiciousChars(label: string, s: string): string | null {
  const found = new Set<string>();
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const isControl = cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d;
    const isDelOrC1 = cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
    const isNonCharacter = cp === 0xfffe || cp === 0xffff || (cp >= 0xfdd0 && cp <= 0xfdef);
    if (isControl || isDelOrC1 || isNonCharacter) {
      found.add(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  if (found.size === 0) return null;
  return `${label} (len ${s.length}) has suspicious code point(s): ${[...found].join(", ")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const limitArg = argValue(args, "--limit");
  const limit = limitArg ? Number(limitArg) : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // PostgREST caps an unranged select at 1000 rows — confirmed against
  // real production data by reclassify-tenders.ts (a first run silently
  // returned exactly 1000 with no error). Page with .range() so tenders
  // past the first 1000 don't silently get skipped for translation.
  const PAGE_SIZE = 1000;
  const rows: { slug: string; title: LocalizedText; summary: LocalizedText }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary")
      .neq("relevance_tier", "excluded")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Failed to fetch tenders: ${error.message}`);
      process.exit(1);
    }

    const page = data as { slug: string; title: LocalizedText; summary: LocalizedText }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  // Untranslated = exactly the untranslated() mirror every mapper writes
  // (title.zh === title.es, byte for byte) — a real translation always
  // differs from the Spanish original.
  const untranslated = rows.filter((t) => t.title.zh === t.title.es);

  console.log(`${untranslated.length} of ${rows.length} non-excluded tenders still need translation.`);

  const toTranslate = limit !== undefined ? untranslated.slice(0, limit) : untranslated;
  console.log(`Translating ${toTranslate.length}...`);

  if (!shouldWrite) {
    console.log(JSON.stringify(toTranslate.slice(0, 5).map((t) => ({ slug: t.slug, titleEs: t.title.es })), null, 2));
    if (toTranslate.length > 5) console.log(`\n...and ${toTranslate.length - 5} more.`);
    console.log("\ndry run (pass --write to actually translate and save) — no API calls made, nothing written.");
    return;
  }

  let translatedCount = 0;
  let failedCount = 0;

  for (const batch of chunk(toTranslate, BATCH_SIZE)) {
    const input: TenderToTranslate[] = batch.map((t) => ({
      slug: t.slug,
      titleEs: t.title.es,
      summaryEs: t.summary.es,
    }));

    // A single batch failing (a transient API error, e.g. a real 500 seen
    // 2026-09-03) used to crash the whole run, leaving every later batch
    // untouched. Catch and move on instead of aborting.
    let results: TranslatedTender[];
    try {
      results = await translateTenderBatch(input);
    } catch (err) {
      console.error(`  batch failed (${batch.map((t) => t.slug).join(", ")}): ${err instanceof Error ? err.message : String(err)}`);
      results = [];
    }
    const bySlug = new Map(results.map((r) => [r.slug, r]));

    // A batch can also fail *without* throwing — the model returns fewer
    // items than it was sent (seen 2026-09-03 alongside the same real
    // batch-level 400). Either way, one bad item shouldn't cost its 7
    // batch-mates their translation: retry only what's actually missing,
    // one item at a time, so a single problem row (bad/garbled source
    // text) is isolated instead of sinking the whole batch.
    const missing = batch.filter((t) => !bySlug.has(t.slug));
    for (const tender of missing) {
      try {
        const [single] = await translateTenderBatch([{ slug: tender.slug, titleEs: tender.title.es, summaryEs: tender.summary.es }]);
        if (single) bySlug.set(tender.slug, single);
      } catch (err) {
        console.error(`  retry failed for ${tender.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const tender of batch) {
      const translated = bySlug.get(tender.slug);
      if (!translated) {
        console.error(`  no translation returned for ${tender.slug}`);
        const titleFlag = describeSuspiciousChars("titleEs", tender.title.es);
        const summaryFlag = describeSuspiciousChars("summaryEs", tender.summary.es);
        if (titleFlag) console.error(`    ${titleFlag}`);
        if (summaryFlag) console.error(`    ${summaryFlag}`);
        if (!titleFlag && !summaryFlag) console.error(`    no suspicious code points found — titleEs len ${tender.title.es.length}, summaryEs len ${tender.summary.es.length}`);
        failedCount++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("tenders")
        .update({
          title: { ...tender.title, zh: translated.titleZh },
          summary: { ...tender.summary, zh: translated.summaryZh },
          updated_at: new Date().toISOString(),
        })
        .eq("slug", tender.slug);

      if (updateError) {
        console.error(`  failed to save ${tender.slug}: ${updateError.message}`);
        failedCount++;
        continue;
      }
      translatedCount++;
    }

    console.log(`Translated ${translatedCount}/${toTranslate.length}...`);
  }

  console.log(`Done. Translated ${translatedCount} of ${toTranslate.length} tenders (${failedCount} failed).`);
}

main();
