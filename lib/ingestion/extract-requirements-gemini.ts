import { readFileSync } from "node:fs";
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionSchema, SYSTEM_PROMPT, type TenderExtraction } from "@/lib/ingestion/extract-requirements";

/**
 * Cost-comparison alternative to extract-requirements.ts's Claude
 * Sonnet/Opus 5 path (2026-09-03, per the user's request to evaluate
 * cheaper providers for document analysis too — see
 * translate-titles-qwen.ts's header for the full context). Reads the
 * real PDF natively (inlineData, base64) the same way Claude does — this
 * SDK generation's PDF support is well-documented (WebSearch, 2026-09-03),
 * unlike Qwen3.6-Plus's, where native-PDF-input support over the
 * OpenAI-compatible chat completions endpoint couldn't be confirmed (see
 * extract-requirements-qwen.ts's header for why that one extracts text
 * locally instead).
 *
 * Same ExtractionSchema/SYSTEM_PROMPT as the Claude path — a provider
 * comparison isn't meaningful if each one is answering a differently-
 * worded question.
 *
 * NOT LIVE-TESTED — no GEMINI_API_KEY configured yet (2026-09-03). Run
 * `npm run compare:extraction <file.pdf>` once a key is added.
 */

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    qualifications: { type: Type.ARRAY, items: requirementSchema() },
    experienceRequirements: { type: Type.ARRAY, items: requirementSchema() },
    requiredDocuments: { type: Type.ARRAY, items: requirementSchema() },
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          sourceReference: { type: Type.STRING },
        },
        required: ["level", "title", "description", "sourceReference"],
      },
    },
  },
  required: ["qualifications", "experienceRequirements", "requiredDocuments", "risks"],
};

function requirementSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      mandatory: { type: Type.BOOLEAN },
      sourceReference: { type: Type.STRING },
    },
    required: ["title", "description", "mandatory", "sourceReference"],
  };
}

export async function extractTenderRequirementsGemini(
  pdfPath: string,
  context: { tenderNumber: string; title: string; buyer: string },
): Promise<TenderExtraction> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const pdfBase64 = readFileSync(pdfPath).toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      { text: `Tender ${context.tenderNumber} — "${context.title}" (${context.buyer}). Extract qualifications, experience requirements, required documents, and risks from the attached document.` },
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  if (!response.text) throw new Error(`Gemini extraction returned no text for ${context.tenderNumber}`);

  const parsed = ExtractionSchema.safeParse(JSON.parse(response.text));
  if (!parsed.success) throw new Error(`Gemini extraction failed schema validation for ${context.tenderNumber}: ${parsed.error.message}`);

  return parsed.data;
}
