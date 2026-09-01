import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TenderRequirement, TenderRisk } from "@/types/tender";

/**
 * Layer 2 extraction (see lib/ingestion/README.md "Layer 2 design"): reads
 * a real tender document (Convocatoria, Anexo Técnico, etc. — already
 * filed and text-checked by document-intake.ts) and produces
 * qualifications/experienceRequirements/requiredDocuments/risks in
 * exactly the shape those fields already have in types/tender.ts.
 *
 * NOT LIVE-TESTED. This environment has no ANTHROPIC_API_KEY — every shape
 * here (PDF document content block, `client.messages.parse` +
 * `zodOutputFormat`, prompt caching) is copied from the current Anthropic
 * TypeScript SDK documentation, not guessed, but the actual API call has
 * only been exercised as far as `tsc`/lint checking the request shape
 * compiles — not a real response. Run `npm run extract:document` against
 * a real document once a key is configured to confirm the prompt actually
 * produces good output before trusting it at scale.
 *
 * Locale: the product is Chinese-only (lib/i18n.tsx) — the model is asked
 * for `es` (a faithful paraphrase, not a verbatim legal quote) and a real
 * `zh` translation of that paraphrase, never a fabricated `en` — `en` is
 * mirrored from `es`, the same convention lib/ingestion/text-utils.ts's
 * `untranslated()` already uses for non-extracted fields.
 */

const LocalizedPairSchema = z.object({
  es: z.string().describe("Concise Spanish paraphrase, close to the source document's own wording — not a verbatim multi-sentence legal quote."),
  zh: z.string().describe("Real Chinese translation of the es text — not a placeholder or mirror."),
});

const RequirementSchema = z.object({
  title: LocalizedPairSchema.describe("Short label, e.g. 'Opinión de cumplimiento fiscal (SAT)'."),
  description: LocalizedPairSchema.describe("What the bidder must actually do or provide, in plain terms."),
  mandatory: z.boolean().describe("True unless the document itself marks this optional/conditional (e.g. 'en su caso', 'si aplica')."),
  sourceReference: z.string().describe("Where this came from, e.g. 'página 18, numeral 2.3' — always cite a page/section, never assert without one."),
});

const RiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]).describe(
    "critical: grounds for automatic disqualification (causal de desechamiento) or contract rescission. high: financial penalty tied to a specific, easy-to-miss deadline or condition. medium: a real but manageable obligation (e.g. standard performance guarantee). low: informational.",
  ),
  title: LocalizedPairSchema,
  description: LocalizedPairSchema.describe("What triggers this and what it costs the bidder if it happens."),
  sourceReference: z.string(),
});

const ExtractionSchema = z.object({
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

const SYSTEM_PROMPT = `You are extracting bid-qualification information from a real Mexican government tender document (Convocatoria, Anexo Técnico, or similar) for a platform that helps Chinese enterprises decide whether to bid.

Ground rules:
- Extract only what THIS document actually says. Never infer, generalize, or fill in a plausible-sounding requirement that isn't stated.
- Every item needs a sourceReference citing where it came from (page number and/or numeral/section) — an item you cannot cite, you cannot include.
- These documents are long and mostly procedural boilerplate (the same legal citations appear in nearly every Compras MX tender). Extract only tender-specific, actionable content — skip generic restatements of the procurement law itself.
- "es" fields: paraphrase in your own concise words, close to the document's terms — do not copy multi-sentence legal paragraphs verbatim.
- "zh" fields: a real, accurate Chinese translation of your "es" text — never a placeholder.
- If a section is genuinely absent from this document (e.g. no Anexo Técnico attached), return an empty array for the corresponding field rather than guessing.`;

export async function extractTenderRequirements(
  pdfPath: string,
  context: { tenderNumber: string; title: string; buyer: string },
): Promise<TenderExtraction> {
  const client = new Anthropic();
  const pdfBase64 = readFileSync(pdfPath).toString("base64");

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: `Tender ${context.tenderNumber} — "${context.title}" (${context.buyer}). Extract qualifications, experience requirements, required documents, and risks from the attached document.`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Extraction failed to parse for ${context.tenderNumber} (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

function toRequirement(item: TenderExtraction["qualifications"][number], idPrefix: string, index: number): TenderRequirement {
  return {
    id: `${idPrefix}-${index}`,
    title: { es: item.title.es, en: item.title.es, zh: item.title.zh },
    description: { es: item.description.es, en: item.description.es, zh: item.description.zh },
    mandatory: item.mandatory,
    sourceReference: item.sourceReference,
  };
}

function toRisk(item: TenderExtraction["risks"][number], idPrefix: string, index: number): TenderRisk {
  return {
    id: `${idPrefix}-risk-${index}`,
    level: item.level,
    title: { es: item.title.es, en: item.title.es, zh: item.title.zh },
    description: { es: item.description.es, en: item.description.es, zh: item.description.zh },
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
