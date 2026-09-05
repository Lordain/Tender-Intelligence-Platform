/**
 * Core logic behind `npm run import:batch-analysis` (scripts/import-batch-
 * analysis.ts) and the admin "导入分析结果" page
 * (app/admin/import-analysis/) — shared so the CLI and the web form write
 * to Supabase through exactly the same path, not two copies that could
 * drift.
 *
 * Writes an already-produced `npm run analyze:batch` export (that script's
 * --export JSON — one entry per document, keyed `"<tender-slug> ::
 * <filename>"`) into tender_requirements/tender_risks. A tender commonly
 * has 2-3 source documents, so entries are grouped by the slug before the
 * " :: " and merged (mergeExtractions(), the same dedup-by-title+
 * description logic extract-requirements.ts uses for chunked-PDF results)
 * into one write per tender — writing per document the way extract-tender-
 * document.ts's writeToSupabase() does would have each later document's
 * write blow away the previous document's rows for the same tender_id.
 */
import { mergeExtractions, toTenderFields, type TenderExtraction } from "@/lib/ingestion/extract-requirements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export type ImportBatchAnalysisResult = {
  slug: string;
  documentCount: number;
  qualifications: number;
  experienceRequirements: number;
  requiredDocuments: number;
  risks: number;
  status: "written" | "dry-run" | "tender-not-found" | "skipped-opus-precision";
  message?: string;
};

/** Groups raw per-document export entries (possibly from more than one file) by tender slug. */
export function groupBatchAnalysisBySlug(raws: Record<string, TenderExtraction>[]): Map<string, TenderExtraction[]> {
  const bySlug = new Map<string, TenderExtraction[]>();
  for (const raw of raws) {
    for (const [key, extraction] of Object.entries(raw)) {
      const slug = key.split(" :: ")[0];
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push(extraction);
    }
  }
  return bySlug;
}

export async function importBatchAnalysis(
  raws: Record<string, TenderExtraction>[],
  options: { write: boolean; force: boolean },
): Promise<ImportBatchAnalysisResult[]> {
  const bySlug = groupBatchAnalysisBySlug(raws);
  const supabase = options.write ? createSupabaseAdminClient() : null;
  if (options.write && !supabase) {
    throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  const results: ImportBatchAnalysisResult[] = [];

  for (const [slug, parts] of bySlug) {
    const merged = mergeExtractions(parts);
    const fields = toTenderFields(merged, slug);
    const base = {
      slug,
      documentCount: parts.length,
      qualifications: fields.qualifications.length,
      experienceRequirements: fields.experienceRequirements.length,
      requiredDocuments: fields.requiredDocuments.length,
      risks: fields.risks.length,
    };

    if (!options.write) {
      results.push({ ...base, status: "dry-run" });
      continue;
    }

    const { data: tender, error: tenderError } = await supabase!.from("tenders").select("id").eq("slug", slug).maybeSingle();
    if (tenderError || !tender) {
      results.push({ ...base, status: "tender-not-found", message: tenderError?.message ?? "no ingested tender found for this slug" });
      continue;
    }
    const tenderId = tender.id as string;

    if (!options.force) {
      const { data: opusDoc } = await supabase!
        .from("tender_documents")
        .select("id")
        .eq("tender_id", tenderId)
        .eq("extraction_model", "claude-opus-5")
        .limit(1)
        .maybeSingle();
      if (opusDoc) {
        results.push({ ...base, status: "skipped-opus-precision", message: "already has a claude-opus-5 (精度分析) result" });
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

    results.push({ ...base, status: "written" });
  }

  return results;
}
