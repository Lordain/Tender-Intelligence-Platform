import { readFileSync } from "node:fs";
import { extname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TenderRequirement, TenderRisk } from "@/types/tender";
import { extractDocumentText } from "@/lib/ingestion/document-intake";
import { splitPdfIntoChunks } from "@/lib/ingestion/pdf-split";

/**
 * Layer 2 extraction (see lib/ingestion/README.md "Layer 2 design"): reads
 * a real tender document (Convocatoria, Anexo Técnico, etc. — already
 * filed and text-checked by document-intake.ts) and produces
 * qualifications/experienceRequirements/requiredDocuments/risks in
 * exactly the shape those fields already have in types/tender.ts.
 *
 * LIVE-TESTED (2026-09-02, on the user's own machine — this sandbox still
 * has no ANTHROPIC_API_KEY) against two real Compras MX documents on
 * `claude-opus-5`: a Convocatoria (produced 9 qualifications/3 experience
 * requirements/30 required documents/13 risks, every item citing a real
 * página/numeral, correctly referencing real LAASSP articles and real
 * percentages — not boilerplate) and an Anexo Técnico (correctly returned
 * empty qualifications/experienceRequirements, since a technical annex
 * doesn't carry bidder-qualification content, while still extracting its
 * real technical/delivery requirements). Notably caught, as a "critical"
 * risk, that the Convocatoria's procedure was "carácter NACIONAL"
 * requiring Mexican nationality and ≥65% national content — something no
 * title-only signal could ever surface, and the concrete real-world case
 * for `types/tender.ts`'s `participationScope` field (see the
 * "`participationScope`" section below), currently only a best-effort
 * guess. First real evidence the prompt/schema genuinely work, not just
 * that the request shape compiles.
 *
 * Model (2026-09-02): downgraded from `claude-opus-5` to `claude-sonnet-5`
 * as a deliberate cost experiment per the user's explicit request, once
 * the bigger cost lever (gate this whole call behind an on-demand,
 * cached "analyze" trigger for subscribed users, rather than running it
 * proactively on every captured document) was agreed as the real fix and
 * Opus 5's extraction quality was already confirmed above. NOT yet
 * re-verified on Sonnet 5 against a real document — re-run
 * `npm run extract:document` against the same two test PDFs and compare
 * output quality before trusting Sonnet 5's extraction at scale; revert
 * to `claude-opus-5` if quality regresses (e.g. missed requirements,
 * vaguer risk descriptions, weaker sourceReference citations).
 *
 * Locale: the product is Chinese-only (lib/i18n.tsx). Originally asked the
 * model for a Spanish paraphrase AND a Chinese translation of that
 * paraphrase per field — doubling generated-text output tokens for
 * content nobody reads (`es`/`en` are never rendered in this Chinese-only
 * UI). Changed (2026-09-02, per the user's explicit "省API...只用中文"
 * request) to ask the model for `zh` only, generated directly from the
 * source document rather than via an `es` intermediate — the model is
 * already reading the real Spanish PDF, so the paraphrase-then-translate
 * step was pure overhead here, unlike other LocalizedText fields
 * elsewhere in the app where `es` is real government-sourced text worth
 * keeping. `es`/`en` are still populated (types/tender.ts's LocalizedText
 * requires all three) by mirroring `zh`, the same `untranslated()`
 * convention lib/ingestion/text-utils.ts already uses — there's no real
 * "source of truth" being lost, since this `es` was always AI-authored
 * paraphrase, not captured source text, to begin with.
 *
 * sourceReference is self-reported by the model, not API-verified. The
 * Anthropic API's native PDF citations (`citations: {enabled: true}`,
 * which anchor to real, non-hallucinated page numbers) are documented as
 * incompatible with `output_config.format` — the structured-output
 * feature this file relies on for a reliable JSON shape. Real per-item
 * page citations would need restructuring extraction away from
 * structured outputs (e.g. tool use, or a two-pass citations-then-
 * structure pipeline); not done here since it hasn't been decided this
 * tradeoff is worth it yet. Until then, treat sourceReference as "where
 * the model believes this came from," not a verified pointer — spot-check
 * it against the source document, the same way the fixture below was
 * checked against each .docx's own real table-of-contents page numbers
 * rather than invented ones.
 */

const RequirementSchema = z.object({
  title: z.string().describe("Short Chinese (zh) label, e.g. '税务合规意见书（SAT）'."),
  description: z.string().describe("What the bidder must actually do or provide, in plain Chinese, close to the document's own terms — not a verbatim multi-sentence legal quote, and not a placeholder."),
  mandatory: z.boolean().describe("True unless the document itself marks this optional/conditional (e.g. 'en su caso', 'si aplica')."),
  sourceReference: z.string().describe("Where this came from, e.g. 'página 18, numeral 2.3' — always cite a page/section, never assert without one."),
});

const RiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]).describe(
    "critical: grounds for automatic disqualification (causal de desechamiento) or contract rescission. high: financial penalty tied to a specific, easy-to-miss deadline or condition. medium: a real but manageable obligation (e.g. standard performance guarantee). low: informational.",
  ),
  title: z.string().describe("Short Chinese (zh) label for the risk."),
  description: z.string().describe("What triggers this and what it costs the bidder if it happens, in plain Chinese."),
  sourceReference: z.string(),
});

/** Exported so translate-requirements-{qwen,gemini}.ts can reuse the exact same schema/prompt — a provider cost/quality comparison isn't meaningful if each provider is answering a differently-worded question. */
export const ExtractionSchema = z.object({
  qualifications: z.array(RequirementSchema).describe(
    "Legal/administrative standing the bidder's COMPANY must prove — RFC, no debt with SAT/IMSS/Infonavit, not on a disqualified-persons list, corporate existence, power of attorney, etc. NOT the same as experience or documents to submit.",
  ),
  experienceRequirements: z.array(RequirementSchema).describe(
    "Track record demanded of the bidder specifically — years in the sector, prior contracts of comparable size, technical certifications tied to the goods/services (not generic legal filings).",
  ),
  requiredDocuments: z.array(RequirementSchema).describe(
    "The literal paperwork the proposal package must contain (Anexo No. 00 / the lettered list in 'Documentos que integran las proposiciones') — one item per document, not a summary paragraph.",
  ),
  risks: z.array(RiskSchema).describe(
    "Concrete ways a bidder or winner loses money or gets disqualified — penas convencionales, garantía de cumplimiento, causales de desechamiento, rescisión, sanciones. Do not restate generic procurement-law boilerplate that applies to every Compras MX tender identically unless this document gives it a specific number/deadline/amount."
  ),
});

export type TenderExtraction = z.infer<typeof ExtractionSchema>;

export const SYSTEM_PROMPT = `You are extracting bid-qualification information from a real Mexican government tender document (Convocatoria, Anexo Técnico, or similar) for a platform that helps Chinese enterprises decide whether to bid.

Ground rules:
- Extract only what THIS document actually says. Never infer, generalize, or fill in a plausible-sounding requirement that isn't stated.
- Every item needs a sourceReference citing where it came from (page number and/or numeral/section) — an item you cannot cite, you cannot include.
- These documents are long and mostly procedural boilerplate (the same legal citations appear in nearly every Compras MX tender). Extract only tender-specific, actionable content — skip generic restatements of the procurement law itself.
- All title/description fields must be written directly in Chinese (zh), concise and close to the document's own terms — do not copy multi-sentence legal paragraphs verbatim, and do not write a placeholder.
- If a section is genuinely absent from this document (e.g. no Anexo Técnico attached), return an empty array for the corresponding field rather than guessing.`;

/** Sonnet 5 is the default (included) tier; Opus 5 is the "精度分析" premium tier the user proposed (2026-09-02) — same schema/prompt either way, only the model differs. Not yet wired to any actual paid-gating UI/API route (that doesn't exist yet); this parameter is what such a route would pass through once built. `claude-haiku-4-5-20251001` was added 2026-09-03 as a cheaper tier to evaluate alongside Qwen/Gemini via scripts/analyze-batch.ts — same schema/prompt, only the model differs, so the comparison is fair. `qwen3.5-plus` (2026-09-03) is Qwen accessed through DashScope's Anthropic-compatible endpoint, not Claude — see extract-requirements-qwen-anthropic.ts, which calls this same function with a differently-configured client via the new `client` parameter below. */
export type ExtractionModel = "claude-sonnet-5" | "claude-opus-5" | "claude-haiku-4-5-20251001" | "qwen3.5-plus";

type ExtractionContent = Array<{ type: "text"; text: string } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }>;

/**
 * A real Compras MX/Proyectos Estratégicos MX PDF can exceed a provider's
 * native-document limits outright — real 4xx failures hit live
 * 2026-09-03, not a guess about where any ceiling is:
 * - Claude: a multi-hundred-page Convocatoria hit "A maximum of 100 PDF
 *   pages may be provided"; a ~33MB scanned Anexo hit the request's
 *   overall size cap ("Request exceeds the maximum size").
 * - DashScope's Anthropic-compatible endpoint (qwen3.5-plus, see
 *   extract-requirements-qwen-anthropic.ts): the SAME 33MB Anexo hit a
 *   DIFFERENT limit there — not an overall request cap, but a per-JSON-
 *   string-field length cap on the base64 PDF data itself ("String value
 *   length (28049408) exceeds the maximum allowed (28000000, from
 *   `StreamReadConstraints.getMaxStringLength()`)") — confirms this
 *   endpoint genuinely accepts native `document` content blocks (it got
 *   far enough to parse the field before rejecting it on length), just
 *   with a stricter, differently-shaped ceiling than Claude's own.
 * Matched against message text since neither SDK exposes a distinct error
 * subclass for any of these.
 */
function isPdfNativeLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /maximum of \d+ pdf pages/i.test(message) || /request_too_large|exceeds the maximum (size|allowed)/i.test(message);
}

/** Real second-order failure found the same day: the SAME oversized PDF that hit isPdfNativeLimitError() above, once its pdftotext fallback text was sent instead, overflowed the model's own context window too ("prompt is too long: 298943 tokens > 200000 maximum") — a multi-hundred-page real Convocatoria is long enough as plain text alone. Parses the exact actual/max token counts the API itself reports rather than guessing a chars-per-token ratio for Spanish text. */
function parseContextOverflow(err: unknown): { actualTokens: number; maxTokens: number } | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/prompt is too long:\s*(\d+)\s*tokens?\s*>\s*(\d+)\s*maximum/i);
  return match ? { actualTokens: Number(match[1]), maxTokens: Number(match[2]) } : null;
}

async function runExtraction(client: Anthropic, model: ExtractionModel, content: ExtractionContent, context: { tenderNumber: string }) {
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  // Printed so a real cost is visible per run, not just guessed at — the
  // user asked directly after the first two live-test calls whether
  // $1.30/month usage (real, checked on their own Anthropic console) was
  // expected. response.usage is real API data, not an estimate.
  const u = response.usage;
  console.log(
    `Token usage — input: ${u.input_tokens}, output: ${u.output_tokens}` +
      (u.cache_creation_input_tokens ? `, cache write: ${u.cache_creation_input_tokens}` : "") +
      (u.cache_read_input_tokens ? `, cache read: ${u.cache_read_input_tokens}` : ""),
  );

  if (!response.parsed_output) {
    throw new Error(`Extraction failed to parse for ${context.tenderNumber} (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/**
 * Runs a text-only extraction, retrying ONCE with the document text
 * truncated to fit if the model rejects it as too long for its context
 * window (see parseContextOverflow()'s header comment). Truncates from the
 * end, keeping the beginning — a Convocatoria's own qualification/
 * requirement sections are typically front-loaded, with repetitive
 * annex/format boilerplate padding the tail — and keeps a safety margin
 * below the API's own reported ratio rather than trimming to the exact
 * boundary, since re-tokenizing slightly different text than what produced
 * the original count could still land just over.
 */
async function runTextExtractionWithOverflowRetry(
  client: Anthropic,
  model: ExtractionModel,
  instruction: string,
  documentText: string,
  context: { tenderNumber: string },
) {
  const content: ExtractionContent = [{ type: "text", text: `${instruction}\n\n---\n\n${documentText}` }];
  try {
    return await runExtraction(client, model, content, context);
  } catch (err) {
    const overflow = parseContextOverflow(err);
    if (!overflow) throw err;

    const keepRatio = (overflow.maxTokens / overflow.actualTokens) * 0.85;
    const truncatedText = documentText.slice(0, Math.floor(documentText.length * keepRatio));
    console.log(
      `  document text (${overflow.actualTokens} tokens) exceeds the ${overflow.maxTokens}-token context window — retrying truncated to ~${Math.round((truncatedText.length / documentText.length) * 100)}% of its original length.`,
    );
    const truncatedContent: ExtractionContent = [
      { type: "text", text: `${instruction}\n\n---\n\n${truncatedText}\n\n[... document truncated to fit the model's context window; content past this point was not seen ...]` },
    ];
    return runExtraction(client, model, truncatedContent, context);
  }
}

/**
 * Boilerplate legal citations repeat near-verbatim on many pages of a real
 * Convocatoria (see SYSTEM_PROMPT's own note on this) — splitting into
 * chunks means each chunk's own instance of that boilerplate can get
 * independently (re-)extracted, producing exact-duplicate items across
 * chunks that a single whole-document call wouldn't. Dropped here by exact
 * (title, description) match rather than left for a human to notice.
 */
function dedupeByTitleAndDescription<T extends { title: string; description: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title} ${item.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeExtractions(parts: TenderExtraction[]): TenderExtraction {
  return {
    qualifications: dedupeByTitleAndDescription(parts.flatMap((p) => p.qualifications)),
    experienceRequirements: dedupeByTitleAndDescription(parts.flatMap((p) => p.experienceRequirements)),
    requiredDocuments: dedupeByTitleAndDescription(parts.flatMap((p) => p.requiredDocuments)),
    risks: dedupeByTitleAndDescription(parts.flatMap((p) => p.risks)),
  };
}

/**
 * Splits an oversized PDF (see pdf-split.ts's header comment for the two
 * real limits this works around) and runs the SAME native-document call
 * per chunk, merging the results — unlike the plain-text fallback, this
 * keeps Claude's native PDF vision per chunk, so a scanned/image-only page
 * still gets read (confirmed real gap 2026-09-03: a 33MB scanned Anexo
 * produced an empty 0/0/0/0 result under the text-only fallback alone,
 * since pdftotext has nothing to extract from a page with no text layer).
 * Real, disclosed cost: a requirement whose own text spans a chunk
 * boundary, or a "ver página 45" reference pointing outside the current
 * chunk, can be missed or come back incomplete — inherent to splitting,
 * not fixable without reassembling full-document context.
 */
async function runChunkedPdfExtraction(
  client: Anthropic,
  model: ExtractionModel,
  filePath: string,
  instruction: string,
  context: { tenderNumber: string },
): Promise<TenderExtraction> {
  const { chunks, cleanup } = splitPdfIntoChunks(filePath);
  try {
    console.log(`  splitting into ${chunks.length} chunk(s) of up to 80 pages each (native PDF understanding per chunk, not a text fallback)...`);
    const parts: TenderExtraction[] = [];
    for (const chunk of chunks) {
      const chunkInstruction = `${instruction}\n\n(This excerpt is pages ${chunk.startPage}-${chunk.endPage} of a ${chunk.totalPages}-page document, split to fit — a requirement or cross-reference spanning outside this page range may not be visible here.)`;
      const content: ExtractionContent = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: readFileSync(chunk.path).toString("base64") },
        },
        { type: "text", text: chunkInstruction },
      ];
      parts.push(await runExtraction(client, model, content, context));
    }
    return mergeExtractions(parts);
  } finally {
    cleanup();
  }
}

export async function extractTenderRequirements(
  filePath: string,
  context: { tenderNumber: string; title: string; buyer: string },
  model: ExtractionModel = "claude-sonnet-5",
  // Defaults to a real Anthropic client; extract-requirements-qwen-
  // anthropic.ts passes one pointed at DashScope's Anthropic-compatible
  // endpoint instead, reusing every call below (native PDF document
  // blocks, structured output, chunking, overflow retry) unchanged.
  client: Anthropic = new Anthropic(),
): Promise<TenderExtraction> {
  // Word documents — .docx and legacy .doc alike (2026-09-03, per the
  // user's report that many real tender documents arrive as Word files,
  // both formats, not PDF) — go through local text extraction instead of
  // Claude's native document vision — unlike a scanned PDF page, a real
  // Word file is already machine-readable text, so there's nothing
  // meaningful for native document understanding to add here (no
  // layout/table-image rendering to lose).
  const isWord = [".docx", ".doc"].includes(extname(filePath).toLowerCase());
  const instruction = `Tender ${context.tenderNumber} — "${context.title}" (${context.buyer}). Extract qualifications, experience requirements, required documents, and risks from the ${isWord ? "document text below" : "attached document"}.`;

  if (isWord) return runTextExtractionWithOverflowRetry(client, model, instruction, await extractDocumentText(filePath), context);

  const pdfContent: ExtractionContent = [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: readFileSync(filePath).toString("base64") },
    },
    { type: "text", text: instruction },
  ];

  try {
    return await runExtraction(client, model, pdfContent, context);
  } catch (err) {
    if (!isPdfNativeLimitError(err)) throw err;
    console.log(`  PDF exceeds Claude's native document limits (${(err instanceof Error ? err.message : String(err)).slice(0, 100)}) — splitting into chunks.`);

    try {
      return await runChunkedPdfExtraction(client, model, filePath, instruction, context);
    } catch (chunkErr) {
      // Chunking needs poppler's pdfinfo/pdfseparate/pdfunite on PATH —
      // if any is missing (ENOENT) or a chunk call itself errors, this
      // falls back to locally-extracted plain text instead of failing the
      // whole document outright. Loses layout/table-image understanding
      // (and anything on a scanned/image-only page — see
      // runChunkedPdfExtraction()'s header comment), but a degraded
      // extraction beats none. That fallback text can ITSELF overflow the
      // context window for a genuinely huge document (confirmed real
      // 2026-09-03) — runTextExtractionWithOverflowRetry() handles that
      // second failure mode too.
      console.log(`  chunked extraction failed (${(chunkErr instanceof Error ? chunkErr.message : String(chunkErr)).slice(0, 100)}) — falling back to extracted text instead.`);
      return runTextExtractionWithOverflowRetry(client, model, instruction, await extractDocumentText(filePath), context);
    }
  }
}

// es/en mirror zh here (untranslated()'s convention) rather than carrying
// a real Spanish/English translation — see this file's header comment on
// why: the model now only generates zh, since es/en were never rendered
// in this Chinese-only product anyway.
function toRequirement(item: TenderExtraction["qualifications"][number], idPrefix: string, index: number): TenderRequirement {
  return {
    id: `${idPrefix}-${index}`,
    title: { es: item.title, en: item.title, zh: item.title },
    description: { es: item.description, en: item.description, zh: item.description },
    mandatory: item.mandatory,
    sourceReference: item.sourceReference,
  };
}

function toRisk(item: TenderExtraction["risks"][number], idPrefix: string, index: number): TenderRisk {
  return {
    id: `${idPrefix}-risk-${index}`,
    level: item.level,
    title: { es: item.title, en: item.title, zh: item.title },
    description: { es: item.description, en: item.description, zh: item.description },
    sourceReference: item.sourceReference,
  };
}

/** Converts the raw model output into the exact arrays Tender's fields expect, id-prefixed by tender slug so re-extraction produces stable, replaceable ids. */
export function toTenderFields(extraction: TenderExtraction, tenderSlug: string) {
  return {
    qualifications: extraction.qualifications.map((item, i) => toRequirement(item, `${tenderSlug}-qual`, i)),
    experienceRequirements: extraction.experienceRequirements.map((item, i) => toRequirement(item, `${tenderSlug}-exp`, i)),
    requiredDocuments: extraction.requiredDocuments.map((item, i) => toRequirement(item, `${tenderSlug}-doc`, i)),
    risks: extraction.risks.map((item, i) => toRisk(item, tenderSlug, i)),
  };
}
