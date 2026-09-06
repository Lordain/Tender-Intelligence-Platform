/**
 * Core logic behind the admin "标书附件分析" upload flow (see
 * components/admin/BatchAnalyzeDocumentForm.tsx) — combines what's
 * normally two separate CLI steps (npm run ingest:documents to file the
 * attachment against a tender, then npm run extract:document to actually
 * analyze it) into one upload: pick a tender, upload its document(s), get
 * requirements/risks written in one action.
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
 * Takes an ARRAY of files, not one (2026-09-06, per the user's real
 * workflow: a single tender's own "招标文件" package is routinely split
 * across several PDFs — the main Pliego plus one or more Anexos — and an
 * admin analyzing that tender wants them read together, not as separate
 * tenders or as a single call that only sees the first file). Each file
 * is intake+extracted independently (a scanned Anexo and a text-layer
 * Pliego can legitimately route to different models), then the per-file
 * extractions are merged with the same mergeExtractions() chunked-PDF
 * already uses, and written ONCE — this is a genuine merge, not the
 * delete-then-insert-per-call semantics a second single-file call against
 * the same tender would have produced (which would have silently made
 * the second file's results replace the first's instead of combining).
 *
 * The uploaded files only ever exist as temp files on this machine's disk
 * for the duration of intake+extraction — this platform has no Supabase
 * Storage bucket wired up (tender_documents.storage_url is a placeholder
 * column, never written anywhere — see lib/ingestion/README.md) and per
 * the user's explicit request (2026-09-04), each temp file is deleted as
 * soon as its own extraction finishes, success or failure alike — there
 * is no persisted copy to schedule a later cleanup for.
 */
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeDocument } from "@/lib/ingestion/document-intake";
import { hasRealTextLayer } from "@/lib/ingestion/text-layer";
import {
  extractTenderRequirements,
  mergeExtractions,
  toTenderFields,
  type ExtractionModel,
  type TenderExtraction,
} from "@/lib/ingestion/extract-requirements";
import { extractTenderRequirementsQwenAnthropic } from "@/lib/ingestion/extract-requirements-qwen-anthropic";
import { untranslated } from "@/lib/ingestion/text-utils";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";

export type AnalyzeUploadedDocumentResult = {
  /** Every uploaded file name, in upload order — joined for display since this can now be more than one document analyzed together. */
  fileName: string;
  documentType: string;
  tenderNumberInText?: string;
  /** Every distinct model actually used across the uploaded files (a scanned Anexo and a text-layer Pliego can route to different models), joined for display. */
  model: string;
  oneLineSummary: string;
  qualifications: number;
  experienceRequirements: number;
  requiredDocuments: number;
  risks: number;
  status: "written" | "dry-run" | "skipped-opus-precision";
  message?: string;
  /**
   * Round 2 re-tagging outcome (see extract-requirements.ts's
   * RelevanceAssessmentSchema) — undefined when no uploaded file's own
   * extraction returned an assessment at all (tolerated, not an error).
   * relevanceTierChanged is undefined both when the model agreed with the
   * existing tier AND when the tender's tier is manually locked
   * (relevance_manually_overridden) — skippedLockedTier distinguishes the
   * second case for the admin UI.
   */
  participationScopeSet?: string;
  relevanceTierChanged?: { from: string; to: string; reasoning: string };
  skippedLockedTier?: boolean;
};

export async function analyzeUploadedDocument(
  supabase: SupabaseClient,
  tenderSlug: string,
  files: { buffer: Buffer; fileName: string }[],
  options: { write: boolean; force: boolean },
): Promise<AnalyzeUploadedDocumentResult> {
  if (files.length === 0) throw new Error("no files provided");

  const tempDir = mkdtempSync(join(tmpdir(), "tender-doc-"));
  type PerFile = {
    intake: Awaited<ReturnType<typeof intakeDocument>>;
    model: ExtractionModel;
    extraction: TenderExtraction;
  };
  const perFile: PerFile[] = [];

  try {
    for (const file of files) {
      const tempPath = join(tempDir, file.fileName || `upload${extname(file.fileName) || ".pdf"}`);
      try {
        writeFileSync(tempPath, file.buffer);

        const intake = await intakeDocument(tempPath);
        const context = { tenderNumber: intake.tenderNumber ?? tenderSlug, title: intake.fileName, buyer: "" };

        // Always auto-routed (text-layer -> qwen3.5-plus / scanned ->
        // claude-haiku) — the "精度分析" (force claude-opus-5) option was
        // removed from this upload flow per the user's explicit request
        // (2026-09-04). extract-tender-document.ts's CLI --precise flag
        // is a separate code path and is unaffected.
        const hasText = await hasRealTextLayer(tempPath);
        const model: ExtractionModel = hasText ? "qwen3.5-plus" : "claude-haiku-4-5-20251001";
        const extraction: TenderExtraction = hasText
          ? await extractTenderRequirementsQwenAnthropic(tempPath, context)
          : await extractTenderRequirements(tempPath, context, model);
        perFile.push({ intake, model, extraction });
      } finally {
        try {
          unlinkSync(tempPath);
        } catch {
          // already gone — fine
        }
      }
    }

    const merged = mergeExtractions(perFile.map((p) => p.extraction));
    const fields = toTenderFields(merged, tenderSlug);
    // mergeExtractions() only merges the 5 core fields (see its own header
    // comment) — relevanceAssessment isn't one of them, so it has to be
    // picked separately here: first file whose own extraction returned one.
    const relevanceAssessment = perFile.map((p) => p.extraction.relevanceAssessment).find((a) => a !== undefined);
    const models = [...new Set(perFile.map((p) => p.model))];

    const base = {
      fileName: perFile.map((p) => p.intake.fileName).join(" + "),
      documentType: perFile[0].intake.documentType,
      tenderNumberInText: perFile.map((p) => p.intake.tenderNumber).find((n) => n),
      model: models.join(" + "),
      oneLineSummary: fields.oneLineSummary,
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

    const contentHashes = perFile.map((p) => p.intake.contentHash);
    const { data: existingDocs } = await supabase
      .from("tender_documents")
      .select("id, content_hash, extraction_model")
      .in("content_hash", contentHashes);

    // This upload flow always auto-routes (never opus) — so any file here
    // that matches an existing claude-opus-5 result (from extract-tender-
    // document.ts's CLI --precise flag) would always be a downgrade unless
    // forced. Since the write below is one merged operation, not a
    // per-file write, a single matching file blocks the whole batch.
    const opusDoc = existingDocs?.find((d) => d.extraction_model === "claude-opus-5");
    if (opusDoc && !options.force) {
      return { ...base, status: "skipped-opus-precision", message: "已有精度分析（claude-opus-5）结果" };
    }

    // Real complaint, 2026-09-06: only written when non-empty — a
    // degraded extraction (e.g. the text-only fallback on a scanned page)
    // returning "" shouldn't blank out a good oneLineSummary a previous
    // analysis run already wrote for this same tender.
    if (fields.oneLineSummary?.trim()) {
      await supabase.from("tenders").update({ one_line_summary: fields.oneLineSummary.trim() }).eq("id", tenderId);
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

    for (const p of perFile) {
      const existingDoc = existingDocs?.find((d) => d.content_hash === p.intake.contentHash);
      if (existingDoc) {
        await supabase
          .from("tender_documents")
          .update({ extraction_status: "extracted", extracted_at: new Date().toISOString(), extraction_model: p.model })
          .eq("id", existingDoc.id);
      } else {
        await supabase.from("tender_documents").insert({
          tender_id: tenderId,
          file_name: p.intake.fileName,
          document_type: p.intake.documentType,
          content_hash: p.intake.contentHash,
          extraction_status: "extracted",
          extracted_at: new Date().toISOString(),
          extraction_model: p.model,
        });
      }
    }

    // Round 2 re-tagging (see extract-requirements.ts's
    // RelevanceAssessmentSchema header comment) — apply the model's own
    // assessment of THESE document(s), now that they've been read, instead
    // of leaving relevance/participationScope permanently fixed at
    // whatever Round 1's title-only classifyRelevance() decided at ingest
    // time.
    let participationScopeSet: string | undefined;
    let relevanceTierChanged: { from: string; to: string; reasoning: string } | undefined;
    let skippedLockedTier: boolean | undefined;

    if (relevanceAssessment) {
      if (relevanceAssessment.participationScope) {
        await supabase.from("tenders").update({ participation_scope: relevanceAssessment.participationScope }).eq("id", tenderId);
        participationScopeSet = relevanceAssessment.participationScope;
      }

      const currentTier = tender.relevance_tier as string | null;
      if (tender.relevance_manually_overridden) {
        if (relevanceAssessment.suggestedTier !== currentTier) skippedLockedTier = true;
      } else if (relevanceAssessment.suggestedTier !== currentTier) {
        await supabase
          .from("tenders")
          .update({
            relevance_tier: relevanceAssessment.suggestedTier,
            relevance_label: RELEVANCE_TIER_LABELS[relevanceAssessment.suggestedTier],
            relevance_reason: untranslated(relevanceAssessment.reasoning),
          })
          .eq("id", tenderId);
        relevanceTierChanged = { from: currentTier ?? "(none)", to: relevanceAssessment.suggestedTier, reasoning: relevanceAssessment.reasoning };
      }
    }

    return { ...base, status: "written", participationScopeSet, relevanceTierChanged, skippedLockedTier };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
