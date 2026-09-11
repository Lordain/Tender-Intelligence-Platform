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
import { join, extname, basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeDocument } from "@/lib/ingestion/document-intake";
import { hasRealTextLayer } from "@/lib/ingestion/text-layer";
import { maxPagesForTier, chooseExtractionModel } from "@/lib/ingestion/extraction-routing";
import type { TenderRelevanceTier } from "@/types/tender";
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
import { assertWritten } from "@/lib/db/assert-written";

export type AnalyzeUploadedDocumentResult = {
  /** Every successfully analyzed file name, in upload order — joined for display since this can now be more than one document analyzed together. */
  fileName: string;
  /** Every distinct document type across the analyzed files, joined for display. */
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
   * Non-fatal things the admin should see: a file that failed while others
   * succeeded, a duplicate skipped, uploaded files that disagree about
   * which tender they belong to (the easiest mistake to make in this
   * flow — attaching another tender's PDF), an extraction that came back
   * completely empty and was therefore NOT allowed to wipe existing data.
   */
  warnings?: string[];
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
  const warnings: string[] = [];

  try {
    // Resolved BEFORE any model runs, for two reasons. The tender's scale
    // tag decides which model reads the document (chooseExtractionModel),
    // and a dry run has to route exactly as the real write would or it is
    // not a preview of anything. It also means an unknown slug now fails
    // here instead of after a whole batch of extractions has been paid
    // for — the lookup used to sit after the dry-run return, so a typo'd
    // slug burned every model call in the upload first.
    const { data: tender, error: tenderError } = await supabase
      .from("tenders")
      .select("id, relevance_tier, relevance_manually_overridden")
      .eq("slug", tenderSlug)
      .maybeSingle();
    if (tenderError || !tender) {
      throw new Error(`No ingested tender found for slug "${tenderSlug}": ${tenderError?.message ?? "not found"}`);
    }
    const tenderId = tender.id as string;
    const relevanceTier = (tender.relevance_tier ?? null) as TenderRelevanceTier | null;

    for (const file of files) {
      // basename(), not the raw name: file.fileName is whatever the
      // multipart request said it was. Browsers strip directory
      // components, but this route accepts any multipart body, and
      // join(tempDir, "../../…") would write (and then unlink) outside
      // the temp directory entirely.
      const safeName = basename(file.fileName || "").trim();
      const tempPath = join(tempDir, safeName || `upload${extname(file.fileName) || ".pdf"}`);
      try {
        writeFileSync(tempPath, file.buffer);

        const intake = await intakeDocument(tempPath);

        // Deduped on the real content hash, before the expensive call —
        // selecting the same PDF twice in one upload (easy to do with a
        // multi-select dialog) would otherwise pay for two identical
        // extractions AND insert two tender_documents rows for it, since
        // the existing-document lookup below runs once, before this loop.
        if (perFile.some((p) => p.intake.contentHash === intake.contentHash)) {
          warnings.push(`「${intake.fileName}」与已上传的另一个文件内容完全相同，已跳过（未重复调用模型）。`);
          continue;
        }

        // Always auto-routed, now on the text layer AND the tender's scale
        // tag — see chooseExtractionModel() for why those are two separate
        // questions in that order. The "精度分析" (force claude-opus-5)
        // option was removed from this upload flow per the user's explicit
        // request (2026-09-04); extract-tender-document.ts's CLI --precise
        // flag is a separate code path and is unaffected.
        const context = { tenderNumber: intake.tenderNumber ?? tenderSlug, title: intake.fileName, buyer: "" };
        const hasText = await hasRealTextLayer(tempPath);
        const model: ExtractionModel = chooseExtractionModel(hasText, relevanceTier);
        // Only the first N pages are read, N by tier — real tenders reach
        // 900 pages and 100MB, and the fields extracted here are all stated
        // up front. See maxPagesForTier().
        const maxPages = maxPagesForTier(relevanceTier);
        const extraction: TenderExtraction = hasText
          ? await extractTenderRequirementsQwenAnthropic(tempPath, context, model === "qwen3.6-plus" ? "qwen3.6-plus" : "qwen3.5-plus", maxPages)
          : await extractTenderRequirements(tempPath, context, model, undefined, true, maxPages);
        perFile.push({ intake, model, extraction });
      } catch (err) {
        // One bad file (corrupt PDF, a model error partway through a
        // chunked document) must not throw away the extractions already
        // paid for in this same batch — those are real API spend, and a
        // Pliego that analyzed fine is still worth writing. Reported as a
        // warning instead; only an all-files-failed batch throws.
        warnings.push(`「${safeName || file.fileName}」分析失败，已跳过：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        try {
          unlinkSync(tempPath);
        } catch {
          // already gone — fine
        }
      }
    }

    if (perFile.length === 0) {
      throw new Error(`没有任何文件分析成功。${warnings.join(" ")}`);
    }

    const merged = mergeExtractions(perFile.map((p) => p.extraction));
    const fields = toTenderFields(merged, tenderSlug);
    // mergeExtractions() only merges the 5 core fields (see its own header
    // comment) — relevanceAssessment isn't one of them, so it has to be
    // picked separately here. Upload order is meaningless (the admin picks
    // files in whatever order the file dialog listed them), so the longest
    // document wins: in a real package that's the Pliego/Convocatoria,
    // which is the one that actually states who may participate.
    const relevanceAssessment = [...perFile]
      .filter((p) => p.extraction.relevanceAssessment)
      .sort((a, b) => b.intake.textLength - a.intake.textLength)[0]?.extraction.relevanceAssessment;
    const models = [...new Set(perFile.map((p) => p.model))];
    const documentTypes = [...new Set(perFile.map((p) => p.intake.documentType))];

    // The single easiest mistake in this flow is attaching a document that
    // belongs to a DIFFERENT tender than the one selected — nothing
    // downstream would catch it, the other tender's requirements would
    // just get written onto this one. The procedure numbers the documents
    // state about themselves are the only independent signal available,
    // so surface a disagreement rather than silently taking the first.
    const distinctTenderNumbers = [...new Set(perFile.map((p) => p.intake.tenderNumber).filter((n): n is string => Boolean(n)))];
    if (distinctTenderNumbers.length > 1) {
      warnings.push(`上传的文件里出现了 ${distinctTenderNumbers.length} 个不同的招标编号（${distinctTenderNumbers.join("、")}）——请确认它们确实属于同一个项目。`);
    }

    const base = {
      fileName: perFile.map((p) => p.intake.fileName).join(" + "),
      documentType: documentTypes.join(" + "),
      tenderNumberInText: distinctTenderNumbers[0],
      model: models.join(" + "),
      oneLineSummary: fields.oneLineSummary,
      qualifications: fields.qualifications.length,
      experienceRequirements: fields.experienceRequirements.length,
      requiredDocuments: fields.requiredDocuments.length,
      risks: fields.risks.length,
    };

    if (!options.write) return { ...base, status: "dry-run", warnings: warnings.length > 0 ? warnings : undefined };

    // Scoped to THIS tender (2026-09-06): content_hash is not unique
    // across tenders and genuinely repeats across them — a buyer's
    // standard "Anexo formatos" boilerplate is byte-identical in every
    // tender it appears in. An unscoped lookup made that file's row for
    // some other tender look like this tender's own: the update below
    // would edit the other tender's row and this tender would never get
    // one, and the opus guard would block this whole batch over a
    // precision analysis that belongs to a different tender entirely.
    const contentHashes = perFile.map((p) => p.intake.contentHash);
    const { data: existingDocs, error: existingDocsError } = await supabase
      .from("tender_documents")
      .select("id, content_hash, extraction_model")
      .eq("tender_id", tenderId)
      .in("content_hash", contentHashes);
    if (existingDocsError) throw new Error(`读取已有文档记录失败：${existingDocsError.message}`);

    // This upload flow always auto-routes (never opus) — so any file here
    // that matches an existing claude-opus-5 result (from extract-tender-
    // document.ts's CLI --precise flag) would always be a downgrade unless
    // forced. Since the write below is one merged operation, not a
    // per-file write, a single matching file blocks the whole batch.
    const opusDoc = existingDocs?.find((d) => d.extraction_model === "claude-opus-5");
    if (opusDoc && !options.force) {
      return { ...base, status: "skipped-opus-precision", message: "已有精度分析（claude-opus-5）结果", warnings: warnings.length > 0 ? warnings : undefined };
    }

    // Real complaint, 2026-09-06: only written when non-empty — a
    // degraded extraction (e.g. the text-only fallback on a scanned page)
    // returning "" shouldn't blank out a good oneLineSummary a previous
    // analysis run already wrote for this same tender.
    if (fields.oneLineSummary?.trim()) {
      assertWritten(
        "一句话总结",
        await supabase.from("tenders").update({ one_line_summary: fields.oneLineSummary.trim() }).eq("id", tenderId),
      );
    }

    // Rows are built BEFORE the delete, so a bad merge can't get as far as
    // clearing the tender's existing analysis.
    const requirementRows = [
      ...fields.qualifications.map((r, i) => ({ kind: "qualification" as const, sort_order: i, ...r })),
      ...fields.experienceRequirements.map((r, i) => ({ kind: "experience" as const, sort_order: i, ...r })),
      ...fields.requiredDocuments.map((r, i) => ({ kind: "document" as const, sort_order: i, ...r })),
    ];

    // Same reasoning as the oneLineSummary guard above, applied to the one
    // write that can actually destroy data: this is a delete-then-insert,
    // and an extraction that came back completely empty (a failed OCR
    // route, a model returning 0/0/0/0 on a scanned page) would otherwise
    // wipe a good previous analysis and replace it with nothing. An empty
    // result is never worth more than what's already there.
    if (requirementRows.length === 0 && fields.risks.length === 0) {
      warnings.push("本次分析没有提取到任何要求或风险，已保留该项目原有的分析结果（不覆盖）。");
    } else {
      for (const kind of ["qualification", "experience", "document"] as const) {
        assertWritten(`清除旧的${kind}要求`, await supabase.from("tender_requirements").delete().eq("tender_id", tenderId).eq("kind", kind));
      }
      assertWritten("清除旧的风险", await supabase.from("tender_risks").delete().eq("tender_id", tenderId));

      if (requirementRows.length > 0) {
        assertWritten(
          "要求",
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
          ),
        );
      }

      if (fields.risks.length > 0) {
        assertWritten(
          "风险",
          await supabase.from("tender_risks").insert(
            fields.risks.map((r) => ({
              tender_id: tenderId,
              level: r.level,
              title: r.title,
              description: r.description,
              source_reference: r.sourceReference,
            })),
          ),
        );
      }
    }

    for (const p of perFile) {
      const existingDoc = existingDocs?.find((d) => d.content_hash === p.intake.contentHash);
      if (existingDoc) {
        assertWritten(
          `文档记录（${p.intake.fileName}）`,
          await supabase
            .from("tender_documents")
            .update({ extraction_status: "extracted", extracted_at: new Date().toISOString(), extraction_model: p.model })
            .eq("id", existingDoc.id),
        );
      } else {
        assertWritten(
          `文档记录（${p.intake.fileName}）`,
          await supabase.from("tender_documents").insert({
            tender_id: tenderId,
            file_name: p.intake.fileName,
            document_type: p.intake.documentType,
            content_hash: p.intake.contentHash,
            extraction_status: "extracted",
            extracted_at: new Date().toISOString(),
            extraction_model: p.model,
          }),
        );
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
        assertWritten(
          "参与范围",
          await supabase.from("tenders").update({ participation_scope: relevanceAssessment.participationScope }).eq("id", tenderId),
        );
        participationScopeSet = relevanceAssessment.participationScope;
      }

      const currentTier = tender.relevance_tier as string | null;
      if (tender.relevance_manually_overridden) {
        if (relevanceAssessment.suggestedTier !== currentTier) skippedLockedTier = true;
      } else if (relevanceAssessment.suggestedTier !== currentTier) {
        assertWritten(
          "相关度分级",
          await supabase
            .from("tenders")
            .update({
              relevance_tier: relevanceAssessment.suggestedTier,
              relevance_label: RELEVANCE_TIER_LABELS[relevanceAssessment.suggestedTier],
              relevance_reason: untranslated(relevanceAssessment.reasoning),
            })
            .eq("id", tenderId),
        );
        relevanceTierChanged = { from: currentTier ?? "(none)", to: relevanceAssessment.suggestedTier, reasoning: relevanceAssessment.reasoning };
      }
    }

    return {
      ...base,
      status: "written",
      participationScopeSet,
      relevanceTierChanged,
      skippedLockedTier,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
