/**
 * Writes an already-produced `npm run analyze:batch` export (the JSON file
 * from that script's --export flag) into Supabase, so the results can be
 * seen rendered on a real tender page instead of only in the export file.
 *
 * analyze-batch.ts is an eval/comparison tool — its export keys are
 * `"<tender-slug> :: <filename>"`, one entry per document, and it never
 * touches Supabase itself. A tender commonly has 2-3 source documents, so
 * this script groups entries by the slug before the " :: " and merges all
 * of a tender's documents into one combined TenderExtraction
 * (mergeExtractions(), the same dedup-by-title+description logic
 * extract-requirements.ts already uses to merge chunked-PDF results) before
 * writing — writing per document with extract-tender-document.ts's
 * writeToSupabase() would have each later document's write blow away the
 * previous document's rows for the same tender_id (that script's
 * delete-then-insert is scoped to a single document's re-extraction, not
 * multiple distinct documents contributing to one tender).
 *
 * Accepts more than one export file so results from separate batch runs
 * (e.g. one document that was re-run alone later, per a slug missing from
 * an earlier run) merge into the same tender instead of one run's write
 * wiping out another's — this script always does one delete-then-insert
 * per tender using ALL documents passed to it, never per file.
 *
 * Usage:
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...]              (dry run — prints what would be written)
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...] --write
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...] --write --force  (write even over an existing claude-opus-5 result)
 */
import { readFileSync } from "node:fs";
import { mergeExtractions, toTenderFields, type TenderExtraction } from "../lib/ingestion/extract-requirements";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const force = args.includes("--force");
  const exportPaths = args.filter((a) => !a.startsWith("--"));

  if (exportPaths.length === 0) {
    console.error("Usage: npm run import:batch-analysis -- <export.json> [<export2.json> ...] [--write] [--force]");
    process.exit(1);
  }

  const raw: Record<string, TenderExtraction> = {};
  for (const exportPath of exportPaths) {
    Object.assign(raw, JSON.parse(readFileSync(exportPath, "utf-8")) as Record<string, TenderExtraction>);
  }

  const bySlug = new Map<string, TenderExtraction[]>();
  for (const [key, extraction] of Object.entries(raw)) {
    const slug = key.split(" :: ")[0];
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(extraction);
  }

  console.log(`${exportPaths.length} file(s), ${Object.keys(raw).length} document result(s) across ${bySlug.size} tender(s).\n`);

  const supabase = shouldWrite ? createSupabaseAdminClient() : null;
  if (shouldWrite && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  for (const [slug, parts] of bySlug) {
    const merged = mergeExtractions(parts);
    const fields = toTenderFields(merged, slug);
    console.log(
      `${slug}: ${parts.length} document(s) -> ${fields.qualifications.length} qualifications, ${fields.experienceRequirements.length} experience, ${fields.requiredDocuments.length} documents, ${fields.risks.length} risks (merged/deduped)`,
    );

    if (!shouldWrite) continue;

    const { data: tender, error: tenderError } = await supabase!.from("tenders").select("id").eq("slug", slug).maybeSingle();
    if (tenderError || !tender) {
      console.error(`  skipped — no ingested tender found for slug "${slug}": ${tenderError?.message ?? "not found"}`);
      continue;
    }
    const tenderId = tender.id as string;

    if (!force) {
      const { data: opusDoc } = await supabase!
        .from("tender_documents")
        .select("id")
        .eq("tender_id", tenderId)
        .eq("extraction_model", "claude-opus-5")
        .limit(1)
        .maybeSingle();
      if (opusDoc) {
        console.error(`  skipped — this tender already has a claude-opus-5 (精度分析) result. Pass --force to overwrite it.`);
        continue;
      }
    }

    for (const kind of ["qualification", "experience", "document"] as const) {
      await supabase!.from("tender_requirements").delete().eq("tender_id", tenderId).eq("kind", kind);
    }
    await supabase!.from("tender_risks").delete().eq("tender_id", tenderId);

    const requirementRows = [
      ...fields.qualifications.map((r, i) => ({ kind: "qualification" as const, sort_order: i, ...r })),
      ...fields.experienceRequirements.map((r, i) => ({ kind: "experience" as const, sort_order: i, ...r })),
      ...fields.requiredDocuments.map((r, i) => ({ kind: "document" as const, sort_order: i, ...r })),
    ];
    if (requirementRows.length > 0) {
      await supabase!.from("tender_requirements").insert(
        requirementRows.map((r) => ({
          tender_id: tenderId,
          kind: r.kind,
          title: r.title,
          description: r.description,
          mandatory: r.mandatory,
          source_reference: r.sourceReference,
          sort_order: r.sort_order,
        })),
      );
    }

    if (fields.risks.length > 0) {
      await supabase!.from("tender_risks").insert(
        fields.risks.map((r) => ({
          tender_id: tenderId,
          level: r.level,
          title: r.title,
          description: r.description,
          source_reference: r.sourceReference,
        })),
      );
    }

    console.log(`  written.`);
  }

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to record these in Supabase) — nothing was written.");
  }
}

main();
