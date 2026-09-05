/**
 * Core logic behind the admin "标书附件分析" upload page
 * (app/admin/analyze-document/) — combines what's normally two separate
 * CLI steps (npm run ingest:documents to file the attachment against a
 * tender, then npm run extract:document to actually analyze it) into one
 * upload: pick a tender, upload a document, get requirements/risks
 * written in one action.
 *
 * Differs from those two scripts in one deliberate way: ingest:documents
 * derives the tender slug from the procedure number found in the
 * document's own text/file name (built for batch-processing a whole
 * folder of unsorted downloads); this function takes the tender slug
 * directly from the admin, since a single targeted upload already knows
 * which tender it's for. Not a shared refactor of those two scripts —
 * genuinely different semantics — but reuses every real building block
 * they're both built on (intakeDocument, hasRealTextLayer,
 * extractTenderRequirements/extractTenderRequirementsQwenAnthropic,
 * toTenderFields).
 *
 * The uploaded file only ever exists as a temp file on this machine's
 * disk for the duration of intake+extraction — this platform has no
 * Supabase Storage bucket wired up (tender_documents.storage_url is a
 * placeholder column, never written anywhere — see lib/ingestion/
 * README.md) and per the user's explicit request (2026-09-04), the temp
 * file is deleted as soon as analysis finishes, success or failure alike
 * (a `finally` block below) — there is no persisted copy to schedule a
 * later cleanup for.
 */
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeDocument } from "@/lib/ingestion/document-intake";
import { hasRealTextLayer } from "@/lib/ingestion/text-layer";
import { extractTenderRequirements, toTenderFields, type ExtractionModel, type TenderExtraction } from "@/lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwenAnthropic } from "@/lib/ingestion/extract-requirements-qwen-anthropic";
import { untranslated } from "@/lib/ingestion/text-utils";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";

export type AnalyzeUploadedDocumentResult = {
  fileName: string;
  documentType: string;
  tenderNumberInText?: string;
  model: ExtractionModel;
  qualifications: number;
  experienceRequirements: number;
  requiredDocuments: number;
  risks: number;
  status: "written" | "dry-run" | "skipped-opus-precision";
  message?: string;
  /**
   * Round 2 re-tagging outcome (see extract-requirements.ts's
   * RelevanceAssessmentSchema) — undefined when the model didn't return an
   * assessment at all (tolerated, not an error). relevanceTierChanged is
   * undefined both when the model agreed with the existing tier AND when
   * the tender's tier is manually locked (relevance_manually_overridden) —
   * skippedLockedTier distinguishes the second case for the admin UI.
   */
  participationScopeSet?: string;
  relevanceTierChanged?: { from: string; to: string; reasoning: string };
  skippedLockedTier?: boolean;
};

export async function analyzeUploadedDocument(
  supabase: SupabaseClient,
  tenderSlug: string,
  file: { buffer: Buffer; fileName: string },
  options: { write: boolean; force: boolean },
): Promise<AnalyzeUploadedDocumentResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "tender-doc-"));
  const tempPath = join(tempDir, file.fileName || `upload${extname(file.fileName) || ".pdf"}`);

  try {
    writeFileSync(tempPath, file.buffer);

    const intake = await intakeDocument(tempPath);
    const context = { tenderNumber: intake.tenderNumber ?? tenderSlug, title: intake.fileName, buyer: "" };

    // Always auto-routed (text-layer -> qwen3.5-plus / scanned -> claude-
    // haiku) — the "精度分析" (force claude-opus-5) option was removed
    // from this upload flow per the user's explicit request (2026-09-04).
    // extract-tender-document.ts's CLI --precise flag is a separate code
    // path and is unaffected.
    const hasText = await hasRealTextLayer(tempPath);
    const model: ExtractionModel = hasText ? "qwen3.5-plus" : "claude-haiku-4-5-20251001";
    const extraction: TenderExtraction = hasText
      ? await extractTenderRequirementsQwenAnthropic(tempPath, context)
      : await extractTenderRequirements(tempPath, context, model);
    const fields = toTenderFields(extraction, tenderSlug);

    const base = {
      fileName: intake.fileName,
      documentType: intake.documentType,
      tenderNumberInText: intake.tenderNumber,
      model,
      qualifications: fields.qualifications.length,
      experienceRequirements: fields.experienceRequirements.length,
      requiredDocuments: fields.requiredDocuments.length,
      risks: fields.risks.length,
    };

    if (!options.write) return { ...base, status: "dry-run" };

    const { data: tender, error: tenderError } = await supabase
      .from("tenders")
      .select("id, relevance_tier, relevance_manually_overridden")
      .eq("slug", tenderSlug)
      .maybeSingle();
    if (tenderError || !tender) {
      throw new Error(`No ingested tender found for slug "${tenderSlug}": ${tenderError?.message ?? "not found"}`);
    }
    const tenderId = tender.id as string;

    const { data: existingDoc } = await supabase
      .from("tender_documents")
      .select("id, extraction_model")
      .eq("content_hash", intake.contentHash)
      .maybeSingle();

    // This upload flow always auto-routes (never opus) — so any existing
    // claude-opus-5 result (from extract-tender-document.ts's CLI
    // --precise flag) would always be a downgrade here unless forced.
    if (existingDoc?.extraction_model === "claude-opus-5" && !options.force) {
      return { ...base, status: "skipped-opus-precision", message: "已有精度分析（claude-opus-5）结果" };
    }

    for (const kind of ["qualification", "experience", "document"] as const) {
      await supabase.from("tender_requirements").delete().eq("tender_id", tenderId).eq("kind", kind);
    }
    await supabase.from("tender_risks").delete().eq("tender_id", tenderId);

    const requirementRows = [
      ...fields.qualifications.map((r, i) => ({ kind: "qualification" as const, sort_order: i, ...r })),
      ...fields.experienceRequirements.map((r, i) => ({ kind: "experience" as const, sort_order: i, ...r })),
      ...fields.requiredDocuments.map((r, i) => ({ kind: "document" as const, sort_order: i, ...r })),
    ];
    if (requirementRows.length > 0) {
      await supabase.from("tender_requirements").insert(
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
      await supabase.from("tender_risks").insert(
        fields.risks.map((r) => ({
          tender_id: tenderId,
          level: r.level,
          title: r.title,
          description: r.description,
          source_reference: r.sourceReference,
        })),
      );
    }

    if (existingDoc) {
      await supabase
        .from("tender_documents")
        .update({ extraction_status: "extracted", extracted_at: new Date().toISOString(), extraction_model: model })
        .eq("id", existingDoc.id);
    } else {
      await supabase.from("tender_documents").insert({
        tender_id: tenderId,
        file_name: intake.fileName,
        document_type: intake.documentType,
        content_hash: intake.contentHash,
        extraction_status: "extracted",
        extracted_at: new Date().toISOString(),
        extraction_model: model,
      });
    }

    // Round 2 re-tagging (see extract-requirements.ts's
    // RelevanceAssessmentSchema header comment) — apply the model's own
    // assessment of THIS document, now that it's been read, instead of
    // leaving relevance/participationScope permanently fixed at whatever
    // Round 1's title-only classifyRelevance() decided at ingest time.
    let participationScopeSet: string | undefined;
    let relevanceTierChanged: { from: string; to: string; reasoning: string } | undefined;
    let skippedLockedTier: boolean | undefined;

    const assessment = extraction.relevanceAssessment;
    if (assessment) {
      if (assessment.participationScope) {
        await supabase.from("tenders").update({ participation_scope: assessment.participationScope }).eq("id", tenderId);
        participationScopeSet = assessment.participationScope;
      }

      const currentTier = tender.relevance_tier as string | null;
      if (tender.relevance_manually_overridden) {
        if (assessment.suggestedTier !== currentTier) skippedLockedTier = true;
      } else if (assessment.suggestedTier !== currentTier) {
        await supabase
          .from("tenders")
          .update({
            relevance_tier: assessment.suggestedTier,
            relevance_label: RELEVANCE_TIER_LABELS[assessment.suggestedTier],
            relevance_reason: untranslated(assessment.reasoning),
          })
          .eq("id", tenderId);
        relevanceTierChanged = { from: currentTier ?? "(none)", to: assessment.suggestedTier, reasoning: assessment.reasoning };
      }
    }

    return { ...base, status: "written", participationScopeSet, relevanceTierChanged, skippedLockedTier };
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // already gone — fine
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}
