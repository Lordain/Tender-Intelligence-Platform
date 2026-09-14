import { readFileSync } from "node:fs";
import { truncatePdfToPages } from "@/lib/ingestion/pdf-pages";
import { getPdfPageCount } from "@/lib/ingestion/pdf-split";
import { isTextLayerSubstantial } from "@/lib/ingestion/text-layer";
import { classifyExtractionFailure, isRetriableExtractionFailure } from "@/lib/ingestion/extraction-failure";
import { extname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TenderRequirement, TenderRisk } from "@/types/tender";
import { extractDocumentText } from "@/lib/ingestion/document-intake";
import { dispatcherForTimeout } from "@/lib/ingestion/http-dispatcher";
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

/**
 * What the model actually writes when asked for a risk level, mapped onto the
 * four the schema stores.
 *
 * A real run on 2026-09-16 lost a whole document — and aborted the batch
 * behind it — because ONE risk out of five came back with a level outside the
 * enum. The model was not wrong about the risk; it wrote the level in the
 * document's own language, or in the Chinese the rest of its answer is in.
 * Rejecting the entire extraction over that is the schema being brittle about
 * vocabulary, not the model breaking a contract.
 *
 * Only unambiguous synonyms, and only for a field whose four values are an
 * ordered scale: mapping "alto" to high is a translation, not a guess. A value
 * this does not recognise still fails, loudly, as before.
 *
 * Applied in normalizeRawExtraction rather than as a z.preprocess on the
 * schema itself, because that schema is also handed to zodOutputFormat for
 * Claude's structured outputs — where the API enforces the enum server-side
 * and this deviation cannot happen. Only the manual-JSON path (DashScope,
 * useStructuredOutput: false) can produce it, and that path is exactly what
 * normalizeRawExtraction exists for.
 */
const RISK_LEVEL_SYNONYMS: Record<string, "low" | "medium" | "high" | "critical"> = {
  bajo: "low", baja: "low", leve: "low", 低: "low", 低风险: "low", informational: "low",
  medio: "medium", media: "medium", moderado: "medium", moderate: "medium", 中: "medium", 中等: "medium", 中风险: "medium",
  alto: "high", alta: "high", 高: "high", 高风险: "high", severe: "high",
  "muy alto": "critical", "muy alta": "critical", critico: "critical", crítico: "critical", critica: "critical", crítica: "critical",
  极高: "critical", 严重: "critical", 致命: "critical", fatal: "critical",
};

const RiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]).describe(
    "critical: grounds for automatic disqualification (causal de desechamiento) or contract rescission. high: financial penalty tied to a specific, easy-to-miss deadline or condition. medium: a real but manageable obligation (e.g. standard performance guarantee). low: informational.",
  ),
  title: z.string().describe("Short Chinese (zh) label for the risk."),
  description: z.string().describe("What triggers this and what it costs the bidder if it happens, in plain Chinese."),
  sourceReference: z.string(),
});

/**
 * Round 2 re-tagging (lib/ingestion/README.md "Two-round screening" —
 * added 2026-09-04, per the user's explicit choice of "let the AI judge
 * directly" over a deterministic keyword approach). Round 1
 * (classifyRelevance() in lib/relevance.ts) only ever sees a title/summary
 * and matches Spanish-language keyword regexes against it — cheap, and
 * necessarily coarse. This document-extraction call ALREADY reads the real
 * document, so it's the natural place to also ask: now that you've
 * actually read it, does the Round 1 tier still hold, and what does the
 * document say about participationScope (currently only a best-effort
 * guess from a summary field — see types/tender.ts's own comment on it)?
 *
 * Deliberately NOT solved by feeding the extracted qualifications/risks
 * text back into classifyRelevance()'s existing Spanish-regex matching —
 * that text is Chinese-only (see this file's header comment on the
 * zh-only extraction decision), so it would never match those patterns at
 * all, a silently-broken "round 2" that looks like it works but never
 * fires. Asking the model directly, grounded in the same document it just
 * read, is the only approach that actually uses the document's content.
 */
const RelevanceAssessmentSchema = z.object({
  participationScope: z
    .enum(["national", "international_treaty", "international_open"])
    .nullable()
    .describe(
      "The procedure's 'Carácter' as this document actually states it. 'national' = NACIONAL — requires Mexican nationality and/or a minimum % of contenido nacional; a foreign bidder cannot realistically participate directly. 'international_treaty' = INTERNACIONAL BAJO LA COBERTURA DE TRATADOS — open to bidders from countries with a trade treaty covering Mexico. 'international_open' = INTERNACIONAL ABIERTA — fully open. Return null ONLY if the document genuinely never states this (don't guess).",
    ),
  suggestedTier: z
    .enum(["flagship", "significant", "standard", "excluded"])
    .describe(
      "Your own assessment of how much priority this tender deserves for a Chinese enterprise, now that you've read the real document — not a repeat of whatever the title alone suggested. flagship = genuinely large-scale/strategically significant. significant = a real, meaningful opportunity. standard = real but modest in scale. excluded = having read the actual document, this isn't a genuine equipment/works opportunity worth surfacing (e.g. it turns out to be a routine service, or participationScope is 'national' with no realistic path for a foreign bidder). Use 'excluded' sparingly and only on what the document plainly is: the platform's own rules, not this assessment, decide exclusion, so a wrong one here is only ever noise for a human to read. A word like 'servicios' in a title is not enough — engineering, design and supervision services attached to a construction programme are works, not routine services.",
    ),
  reasoning: z
    .string()
    .describe(
      "Why, in Chinese (zh), grounded specifically in what THIS document says — cite concrete content (a real requirement, value, scope, or the participationScope finding), not generic boilerplate reasoning that could apply to any tender.",
    ),
});

/** Exported so extract-requirements-qwen*.ts can reuse the exact same schema/prompt — a provider cost/quality comparison isn't meaningful if each provider is answering a differently-worded question. */
export const ExtractionSchema = z.object({
  // Explicit user request (2026-09-06): a one-line "what is this tender"
  // summary, shown on the public tender page directly above 资质要求 —
  // distinct from the ingestion-time `summary` column (a longer, source-
  // derived paraphrase, already populated before this call ever runs).
  // zh-only, same convention as every other field this schema generates.
  oneLineSummary: z.string().describe(
    "One or two Chinese (zh) sentences, at most 100 characters, stating what this tender/project actually IS — e.g. '为地铁3号线采购120台安检机', '新建某市污水处理厂二期工程'. Use the room: name the scope, scale and location the document gives (length, capacity, site), rather than padding a short answer. Concrete (what's being bought/built and for whom/where if the document says), not a category label ('设备采购项目') or a boilerplate opener ('本项目旨在...'). Written for someone deciding whether to open the full listing.",
  ),
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
  // Optional (not every provider reliably returns every field on the
  // manual-JSON-parse path — see JSON_SHAPE_INSTRUCTIONS/runExtraction()
  // below) — analyze-uploaded-document.ts treats an absent assessment as
  // "not assessed" rather than failing the whole extraction over it; the
  // qualifications/experienceRequirements/requiredDocuments/risks arrays
  // remain the core deliverable this schema exists for.
  relevanceAssessment: RelevanceAssessmentSchema.optional(),
});

export type TenderExtraction = z.infer<typeof ExtractionSchema>;

/**
 * Fills in required keys a manual-JSON-parse provider left out entirely,
 * so an omitted empty category degrades to `[]` instead of hard-failing
 * the whole document (see runExtraction()'s header comment for the real
 * responses that made this necessary).
 *
 * The array key list is derived FROM the schema rather than written out
 * by hand, because the hand-written version caused a real, confirmed
 * outage: a `keyDates` array (since removed, 2026-09-16) was added to
 * ExtractionSchema as required and never added to the list, so every
 * DashScope extraction whose model didn't volunteer the key — which was all
 * of them, since JSON_SHAPE_INSTRUCTIONS never asked for it either — failed
 * schema validation and threw away its qualifications, experience, documents
 * and risks along with it. Five real Peru bases PDFs, all five lost, on
 * 2026-09-13. Deriving the list means the next array added to the schema
 * cannot repeat that.
 *
 * Note what this deliberately does NOT do: it never invents a *value*.
 * Only a missing key becomes an empty array; a key the model actually
 * returned is passed through untouched, wrong shape and all, so a genuine
 * schema violation still fails loudly instead of being papered over.
 */
export function normalizeRawExtraction(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const raw = input as Record<string, unknown>;
  if (raw.oneLineSummary === undefined) raw.oneLineSummary = "";
  for (const [key, field] of Object.entries(ExtractionSchema.shape)) {
    if (raw[key] === undefined && isArrayField(field)) raw[key] = [];
  }

  // Translate a risk level the model wrote in the document's language, or in
  // the Chinese the rest of its answer is in — see RISK_LEVEL_SYNONYMS. Same
  // rule as the array defaulting above: only a missing or differently-worded
  // value is repaired, never a value invented. Anything unrecognised is left
  // exactly as it came and still fails validation.
  if (Array.isArray(raw.risks)) {
    for (const risk of raw.risks) {
      if (typeof risk !== "object" || risk === null) continue;
      const item = risk as Record<string, unknown>;
      if (typeof item.level !== "string") continue;
      const mapped = RISK_LEVEL_SYNONYMS[item.level.trim().toLowerCase()];
      if (mapped) item.level = mapped;
    }
  }

  return raw;
}

function isArrayField(field: unknown): boolean {
  return (field as { _zod?: { def?: { type?: string } } })?._zod?.def?.type === "array";
}

export const SYSTEM_PROMPT = `You are extracting bid-qualification information from a real Mexican government tender document (Convocatoria, Anexo Técnico, or similar) for a platform that helps Chinese enterprises decide whether to bid.

Ground rules:
- Extract only what THIS document actually says. Never infer, generalize, or fill in a plausible-sounding requirement that isn't stated.
- Every item needs a sourceReference citing where it came from (page number and/or numeral/section) — an item you cannot cite, you cannot include.
- These documents are long and mostly procedural boilerplate (the same legal citations appear in nearly every Compras MX tender). Extract only tender-specific, actionable content — skip generic restatements of the procurement law itself.
- All title/description fields must be written directly in Chinese (zh), concise and close to the document's own terms — do not copy multi-sentence legal paragraphs verbatim, and do not write a placeholder.
- You may be given a block headed 本平台已对该项目使用的中文写法 — the tender's title, summary and any earlier one-line summary, as this platform ALREADY displays them. It is reference vocabulary, never a source to extract from. Reuse its renderings of proper nouns — place names, entity names, river and project names — exactly as written there, and do not re-transliterate any name that appears in it. One tender showing 亚纳万卡区 in its title and 扬阿万卡 in its summary reads as two different places to a customer. For a name that appears NOWHERE in that block, transliterate it as you normally would.
- If a section is genuinely absent from this document (e.g. no Anexo Técnico attached), return an empty array for the corresponding field rather than guessing.
- Never write an unescaped ASCII double quote inside a value. To quote a Spanish proper noun inside a Chinese sentence use 「」 or no quotes at all — 建设 BRAMONAS 2 堤防, not 建设"BRAMONAS 2"堤防.

Also provide "oneLineSummary": one or two Chinese sentences, at most 100 characters, stating what this tender/project concretely IS — not a category label, not a boilerplate opener. See the schema field description for examples.

Additionally, provide a "relevanceAssessment": this tender was already given a rough priority tier from its TITLE ALONE before anyone had read the actual document — you have now read the real thing, so give your own independent, grounded assessment of participationScope and suggestedTier (see the schema field descriptions for exactly what each means). Base this ONLY on what THIS document actually says, the same evidentiary bar as everything else above — cite concrete content in your reasoning, not a generic template.`;

/** Sonnet 5 is the default (included) tier; Opus 5 is the "精度分析" premium tier the user proposed (2026-09-02) — same schema/prompt either way, only the model differs. Not yet wired to any actual paid-gating UI/API route (that doesn't exist yet); this parameter is what such a route would pass through once built. `claude-haiku-4-5-20251001` was added 2026-09-03 as a cheaper tier to evaluate alongside Qwen via scripts/analyze-batch.ts — same schema/prompt, only the model differs, so the comparison is fair. `qwen3.5-plus` (2026-09-03) is Qwen accessed through DashScope's Anthropic-compatible endpoint, not Claude — see extract-requirements-qwen-anthropic.ts, which calls this same function with a differently-configured client via the new `client` parameter below. */
export type ExtractionModel = "claude-sonnet-5" | "claude-opus-5" | "claude-haiku-4-5-20251001" | "qwen3.5-plus" | "qwen3.6-plus";

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
  return (
    /maximum of \d+ pdf pages/i.test(message) ||
    /request_too_large|exceeds the maximum (size|allowed)/i.test(message) ||
    // DashScope's overall request-BODY cap, worded nothing like the other
    // two: "Exceeded limit on max bytes to request body : 16777216".
    // pdf-split.ts's MAX_CHUNK_BYTES was already sized against this exact
    // ceiling, but this matcher never recognised the message, so the
    // splitter it was sized for never ran — the document just threw
    // (confirmed 2026-09-13 on a real Peru bases PDF).
    /exceeded limit on max bytes to request body/i.test(message)
  );
}

/** Real second-order failure found the same day: the SAME oversized PDF that hit isPdfNativeLimitError() above, once its pdftotext fallback text was sent instead, overflowed the model's own context window too ("prompt is too long: 298943 tokens > 200000 maximum") — a multi-hundred-page real Convocatoria is long enough as plain text alone. Parses the exact actual/max token counts the API itself reports rather than guessing a chars-per-token ratio for Spanish text. */
function parseContextOverflow(err: unknown): { actualTokens: number; maxTokens: number } | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/prompt is too long:\s*(\d+)\s*tokens?\s*>\s*(\d+)\s*maximum/i);
  return match ? { actualTokens: Number(match[1]), maxTokens: Number(match[2]) } : null;
}

/**
 * Describes the exact JSON shape manually, for providers that don't take
 * `output_config.format` (Claude's structured-output feature) reliably —
 * mirrors extract-requirements-qwen.ts's already-proven OpenAI-compat
 * prompt, since the underlying schema is identical.
 */
// The Chinese-only reminder at the end is deliberate repetition, not
// redundant with SYSTEM_PROMPT's own rule above it: real gap found
// 2026-09-03 (qwen3.5-plus, first document in a batch run) — every
// title/description came back in Spanish, not Chinese, despite
// SYSTEM_PROMPT already saying so once, further up the combined prompt.
export const JSON_SHAPE_INSTRUCTIONS = `Respond with ONLY a JSON object matching {"oneLineSummary": "...", "qualifications": [...], "experienceRequirements": [...], "requiredDocuments": [...], "risks": [...], "relevanceAssessment": {...}} — no prose, no markdown fences. "oneLineSummary" and the four array keys are required even when a category is empty — use [] for qualifications/experienceRequirements/requiredDocuments/risks, never omit a key. "oneLineSummary" is one or two Chinese sentences, at most 100 characters, stating what this tender/project concretely is (not a category label, not a boilerplate opener). Each requirement item is {"title", "description", "mandatory", "sourceReference"}; each risk item is {"level", "title", "description", "sourceReference"} with level one of "low"/"medium"/"high"/"critical". "relevanceAssessment" is {"participationScope": "national"|"international_treaty"|"international_open"|null, "suggestedTier": "flagship"|"significant"|"standard"|"excluded", "reasoning": "..."} — include it when you can support it from the document; omit the key entirely rather than guessing if you genuinely cannot. Inside a string value, never use an unescaped ASCII double quote — to quote a Spanish proper noun inside Chinese text use 「」 or no quotes at all (建设 BRAMONAS 2 堤防, not 建设"BRAMONAS 2"堤防). An unescaped quote ends the string early and the whole response is discarded. Every "oneLineSummary"/"title"/"description"/"reasoning" value MUST be written in Chinese (中文) — never Spanish or English, even though the source document is in Spanish.`;

/** Pulls the first JSON object out of a text response — tolerates a model wrapping it in a ```json fence or prose despite instructions not to, rather than requiring an exact match. */
/**
 * Escapes a double quote that is INSIDE a JSON string value rather than
 * ending it — the one malformed-JSON shape this pipeline actually sees.
 *
 * Confirmed twice on real runs (2026-09-16), and it is a habit rather than
 * noise: writing Chinese, the model quotes a Spanish proper noun with ASCII
 * double quotes and does not escape them.
 *
 *   "oneLineSummary": "…建设"BRAMONAS 2"及"BRAMONAS 5"堤防，工期 91 天。"
 *   "reasoning": "…但文件“ASPECTOS PARTICULARES"章节明确要求…"
 *
 * The rule is narrow on purpose: a quote inside a string closes it only when
 * the next non-space character is one that can legally follow a closed string
 * — `:` `,` `}` `]` or the end. Anything else and the quote is part of the
 * text. That is a heuristic, not a parser, so it runs ONLY after JSON.parse
 * has already failed and its result has to parse cleanly to be used; a repair
 * that does not parse is discarded and the original error is reported.
 */
export function escapeStrayQuotes(json: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i];

    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (ch === "\\") {
      out += ch + (json[i + 1] ?? "");
      i += 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j += 1;
      const next = json[j];
      if (j >= json.length || next === ":" || next === "," || next === "}" || next === "]") {
        out += ch;
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }

    out += ch;
  }

  return out;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`No JSON object found in response text: ${text.slice(0, 200)}`);

  const jsonText = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    // One repair attempt, for the shape this actually sees — see
    // escapeStrayQuotes. It has to parse to be accepted, so a wrong guess
    // costs nothing but the original error, reported below as before.
    try {
      const repaired = JSON.parse(escapeStrayQuotes(jsonText));
      console.warn("  模型返回的 JSON 里有未转义的引号，已自动修复后解析（内容未改动，只补了转义）。");
      return repaired;
    } catch {
      // Fall through to the diagnostic below.
    }

    // Real gap found 2026-09-03: a model can produce near-valid JSON with
    // one real syntax error (an unescaped quote inside a string value is
    // the classic case) — the generic JSON.parse error alone ("Expected
    // ',' or '}' after property value...") wasn't enough to diagnose
    // without the actual text around the failure, so this surfaces a
    // window around the reported position (when JSON.parse's message
    // includes one) alongside the original message.
    const message = err instanceof Error ? err.message : String(err);
    const posMatch = message.match(/position (\d+)/);
    const context = posMatch ? jsonText.slice(Math.max(0, Number(posMatch[1]) - 80), Number(posMatch[1]) + 80) : jsonText.slice(0, 300);
    throw new Error(`${message} — context: ...${context}...`);
  }
}

/**
 * Every model call below streams, and these bound what one call may cost in
 * wall-clock time.
 *
 * Confirmed live 2026-09-13: a batch spent 31 MINUTES and produced nothing.
 * The calls were non-streaming, and for a non-streaming request the SDK pins
 * its own timeout — `_calculateNonstreamingTimeout`, 10 minutes for
 * max_tokens 16000 — then retries a timeout `maxRetries` (default 2) more
 * times. One slow document therefore burns up to 30 minutes, and each
 * attempt can be billed for work the server may well have completed.
 *
 * The SDK states the real rule outright: "Streaming is required for
 * operations that may take longer than 10 minutes." A 30-page native PDF at
 * 16,000 max output tokens is exactly that, and this code was not streaming.
 * It is now.
 *
 * Streaming alone was NOT enough, and the first fix here was incomplete.
 * Measured 2026-09-13 on peru-...-1248966: `模型调用耗时 609.0s`, then
 * "Request timed out". 609s is 10 minutes — the SDK's CLIENT-level default
 * timeout (`opts.timeout=10 minutes`), which applies to streaming requests
 * too. Streaming only lifts the extra restriction the SDK imposes on
 * non-streaming calls; the plain default still cut the call off. So the
 * model was not failing — we were hanging up on it. The timeout is now set
 * explicitly rather than inherited.
 *
 * maxRetries is 0, not the default 2. Every failure mode actually seen on
 * this path is one that repeats: a size limit, a schema mismatch, a
 * provider slower than the budget. Retrying any of them doubles or triples
 * the wall clock and can be billed again for work the server already did —
 * that is what turned one batch into 31 minutes. Transient failures (429,
 * 529) are instead handled a level up: the document is reported, the batch
 * continues, and two in a row stop the run (extraction-failure.ts).
 */
const MIN_TIMEOUT_MS = 20 * 60 * 1000;
/**
 * Seconds of budget per page read. Calibrated from the one real
 * measurement available: 30 pages of a real Peru bases PDF was still
 * working at 609s (10:09) when the old default cut it off, i.e. it needed
 * MORE than ~20s/page. 60s/page is triple that — headroom, not a stopwatch.
 * Revise it when a successful run prints a real completion time; do not
 * tighten it from a failure, which only ever proves a lower bound.
 */
const TIMEOUT_MS_PER_PAGE = 60 * 1000;

/**
 * A backstop against a dead connection — deliberately NOT a performance
 * budget. It scales with the tier's own page cap (maxPagesForTier: 20
 * standard / 30 significant / 40 flagship), because that cap is already
 * this platform's statement of how much document a tender is worth
 * reading, and a 40-page flagship Convocatoria legitimately takes longer
 * than a 20-page routine one. An uncapped call (the offline comparison
 * scripts) gets the floor.
 *
 * What bounds the wall clock is NOT this number: maxRetries is 0, so a
 * call is attempted once rather than three times, and analyzeLocalFolder()
 * stops the run at BATCH_BUDGET_MS. Those two are why this can afford to
 * be generous — the 31-minute run was three attempts at one doomed call,
 * not one call doing real work.
 */
function requestOptions(maxPages: number | undefined) {
  const timeout = Math.max(MIN_TIMEOUT_MS, (maxPages ?? 0) * TIMEOUT_MS_PER_PAGE);
  return {
    maxRetries: 0,
    timeout,
    // Node's own fetch stops at 300s by default regardless of the above —
    // the real cause of both the 304.8s and 609.0s failures. Matching its
    // limits to this one leaves a single authority over call duration.
    // See http-dispatcher.ts.
    fetchOptions: { dispatcher: dispatcherForTimeout(timeout) } as Record<string, unknown>,
  };
}

/**
 * Prints how long a call actually took.
 *
 * Added rather than guessing a tighter timeout: nobody here knows how long
 * DashScope really needs for a 30-page PDF, and picking a number without
 * that measurement is how a legitimate slow extraction gets cut off. Two
 * real runs of this log answer it.
 */
async function withElapsed<T>(tenderNumber: string, run: (marks: StreamMarks) => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const marks: StreamMarks = {};
  try {
    return await run(marks);
  } finally {
    const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
    // The two marks answer the question a total alone cannot: did the
    // provider actually stream? Headers on a real streaming response arrive
    // in under a second. Headers that never arrive at all mean the answer
    // was being buffered server-side and "streaming" bought nothing —
    // which is what Node's 300s header timeout was really reporting.
    const detail = [
      marks.connectedAt === undefined ? "响应头始终未到达（对方在缓冲，不是真流式）" : `首个响应头 ${secs(marks.connectedAt - startedAt)}`,
      marks.firstEventAt === undefined ? "没有收到任何流式事件" : `首个流式事件 ${secs(marks.firstEventAt - startedAt)}`,
    ].join("，");
    console.log(`  ${tenderNumber}: 模型调用耗时 ${secs(Date.now() - startedAt)}（${detail}）`);
  }
}

type StreamMarks = { connectedAt?: number; firstEventAt?: number };

/**
 * Attaches the timing marks above to a stream without consuming it. Typed
 * on MessageStream's own generic so the caller keeps its parsed_output
 * type — a widened `{ on }` shape would erase it.
 */
function markStream<ParsedT>(stream: MessageStream<ParsedT>, marks: StreamMarks): MessageStream<ParsedT> {
  stream.on("connect", () => {
    marks.connectedAt ??= Date.now();
  });
  stream.on("streamEvent", () => {
    marks.firstEventAt ??= Date.now();
  });
  return stream;
}

/**
 * Real gap found 2026-09-03 (qwen3.5-plus via DashScope's Anthropic-
 * compatible endpoint, see extract-requirements-qwen-anthropic.ts): its
 * translation of `output_config.format` doesn't reliably produce the
 * requested object shape — one real response came back as a top-level
 * JSON *array* instead of an object, another omitted required array keys
 * entirely (`qualifications`/`risks` simply absent) rather than `[]`.
 * Neither is fixable by retrying the same structured-output call, so
 * `useStructuredOutput = false` bypasses `output_config.format` for that
 * provider and asks for the JSON shape directly in the prompt instead
 * (JSON_SHAPE_INSTRUCTIONS above) — the same manual-parse strategy
 * extract-requirements-qwen.ts already uses successfully over its OpenAI-
 * compat path. Missing array keys are defaulted to `[]` before validation
 * either way (a model saying nothing by omitting an empty category is a
 * reasonable real behavior, not a shape to hard-fail on) — but a
 * genuinely wrong top-level shape (e.g. an array, not an object) still
 * throws rather than guessing how to reinterpret it.
 */
/** Waits between the one retry below. Short: a 500 comes back in seconds, not minutes. */
const TRANSIENT_RETRY_DELAY_MS = 3_000;

/**
 * Every model call in this file goes through here, which is why the one
 * retry lives here rather than in each path.
 *
 * ONE retry, and only for something a second attempt can actually fix
 * (isRetriableExtractionFailure: a provider-side blip, or the model's own
 * output coming back malformed on the manual-JSON path). The
 * SDK's own retries stay off — see requestOptions() for why, and note that a
 * timeout is excluded by name there and here, since retrying one costs the
 * whole budget again.
 *
 * What this is worth, measured rather than assumed: on 2026-09-16 a single
 * Anthropic 500 cost three 90MB Convocatorias and a Peru OXI document their
 * entire analysis, while other documents — and other chunks of the same
 * document — answered normally in the same minutes. One extra call is a much
 * smaller price than a re-run of a five-chunk document.
 */
async function runExtraction(
  client: Anthropic,
  model: ExtractionModel,
  content: ExtractionContent,
  context: { tenderNumber: string },
  useStructuredOutput: boolean,
  /** Only used to size the request timeout — see requestOptions(). */
  maxPages?: number,
) {
  try {
    return await runExtractionOnce(client, model, content, context, useStructuredOutput, maxPages);
  } catch (err) {
    if (!isRetriableExtractionFailure(err)) throw err;
    console.warn(
      `  ${context.tenderNumber}: 这一次调用没成功（${(err instanceof Error ? err.message : String(err)).slice(0, 160)}），${TRANSIENT_RETRY_DELAY_MS / 1000} 秒后重试一次。`,
    );
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    return await runExtractionOnce(client, model, content, context, useStructuredOutput, maxPages);
  }
}

async function runExtractionOnce(
  client: Anthropic,
  model: ExtractionModel,
  content: ExtractionContent,
  context: { tenderNumber: string },
  useStructuredOutput: boolean,
  maxPages?: number,
) {
  if (useStructuredOutput) {
    const response = await withElapsed(context.tenderNumber, (marks) =>
      markStream(
        client.messages.stream(
          {
            model,
            max_tokens: 16000,
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content }],
            output_config: { format: zodOutputFormat(ExtractionSchema) },
          },
          requestOptions(maxPages),
        ),
        marks,
      )
        // Streaming still returns parsed_output when output_config.format is
        // set — structured outputs are not given up by streaming here.
        .finalMessage(),
    );

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

  const response = await withElapsed(context.tenderNumber, (marks) =>
    markStream(
      client.messages.stream(
        {
          model,
          max_tokens: 16000,
          system: [{ type: "text", text: `${SYSTEM_PROMPT}\n\n${JSON_SHAPE_INSTRUCTIONS}`, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
        },
        requestOptions(maxPages),
      ),
      marks,
    ).finalMessage(),
  );

  const u = response.usage;
  console.log(
    `Token usage — input: ${u.input_tokens}, output: ${u.output_tokens}` +
      (u.cache_creation_input_tokens ? `, cache write: ${u.cache_creation_input_tokens}` : "") +
      (u.cache_read_input_tokens ? `, cache read: ${u.cache_read_input_tokens}` : ""),
  );

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error(`Extraction returned no text content for ${context.tenderNumber} (stop_reason: ${response.stop_reason})`);

  const raw = normalizeRawExtraction(extractJsonObject(textBlock.text));
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    // The zod message lists the values we ACCEPT and never the one that
    // arrived, which is the only one worth knowing: it is what RISK_LEVEL_
    // SYNONYMS has to learn before this stops happening.
    const received = parsed.error.issues
      .map((issue) => {
        const at = issue.path.join(".");
        const value = issue.path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key as never], raw);
        return typeof value === "string" ? `${at} = "${value}"` : null;
      })
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Extraction failed schema validation for ${context.tenderNumber}: ${parsed.error.message}${received ? `\n模型实际返回：${received}` : ""}`,
    );
  }
  return parsed.data;
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
  useStructuredOutput: boolean,
  maxPages?: number,
) {
  const content: ExtractionContent = [{ type: "text", text: `${instruction}\n\n---\n\n${documentText}` }];
  try {
    return await runExtraction(client, model, content, context, useStructuredOutput, maxPages);
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
    return runExtraction(client, model, truncatedContent, context, useStructuredOutput, maxPages);
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
    const key = `${item.title}|${item.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeExtractions(parts: TenderExtraction[]): TenderExtraction {
  return {
    // A chunked PDF's earlier chunks (the document's front matter — title,
    // objeto del contrato) are the most likely to actually state what the
    // tender IS, so the first chunk with a non-empty oneLineSummary wins
    // rather than concatenating one per chunk.
    oneLineSummary: parts.find((p) => p.oneLineSummary?.trim())?.oneLineSummary ?? "",
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
  useStructuredOutput: boolean,
  maxPages?: number,
  onWarning?: (message: string) => void,
): Promise<TenderExtraction> {
  const { chunks, cleanup } = splitPdfIntoChunks(filePath);
  try {
    // The real pages-per-chunk, not MAX_PAGES_PER_CHUNK. Those are almost
    // never the same number: the tier cap means the file being split is at
    // most 40 pages, so 80 can never bind, and what actually decides the
    // split is MAX_CHUNK_BYTES against this document's bytes-per-page. A run
    // that reported "5 chunks of up to 80 pages each" for a 40-page file was
    // stating a constant, not a fact — and it is the fact that says whether
    // a scanned document is being cut into eight-page slivers.
    const pagesPerChunk = chunks[0] ? chunks[0].endPage - chunks[0].startPage + 1 : 0;
    console.log(`  splitting into ${chunks.length} chunk(s) of ${pagesPerChunk} page(s) each (native PDF understanding per chunk, not a text fallback)...`);
    const parts: TenderExtraction[] = [];
    const failures: { startPage: number; endPage: number; message: string }[] = [];

    for (const chunk of chunks) {
      const chunkInstruction = `${instruction}\n\n(This excerpt is pages ${chunk.startPage}-${chunk.endPage} of a ${chunk.totalPages}-page document, split to fit — a requirement or cross-reference spanning outside this page range may not be visible here.)`;
      const content: ExtractionContent = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: readFileSync(chunk.path).toString("base64") },
        },
        { type: "text", text: chunkInstruction },
      ];
      // One chunk's failure must not discard the chunks that already
      // succeeded — they are real, already-billed model calls, and on a
      // scanned document they are the only reading of those pages there is.
      //
      // Real case 2026-09-16: three Proyectos Estratégicos Convocatorias
      // were split five ways, four chunks answered, one hit an Anthropic 500
      // or an "Invalid request data", and the whole document was reported as
      // read-nothing — throwing away four paid calls and sending the
      // operator to re-run all five, with the same odds of one more blip.
      // A five-chunk document is five chances to fail, so being all-or-
      // nothing makes big scanned tenders the least likely to ever succeed,
      // which is backwards: they are the ones worth reading.
      //
      // A systematic failure still stops everything, one level up:
      // classifyExtractionFailure() sees the rethrow when NOTHING succeeded,
      // which is what a schema or credential fault looks like.
      try {
        parts.push(await runExtraction(client, model, content, context, useStructuredOutput, maxPages));
      } catch (err) {
        // Two failures that must not be treated alike. A SYSTEMATIC one — a
        // schema mismatch, a bad credential — would repeat identically on
        // every remaining chunk and bill for each, which is the exact waste
        // the fail-fast design exists to prevent (five documents, five
        // identical schema failures, five paid calls, 2026-09-13). It still
        // aborts the document immediately, as before.
        //
        // A per-chunk one (a 500, an oversized or malformed chunk) is the
        // case this salvage is for, and continuing costs nothing extra: the
        // remaining chunks were going to be called anyway.
        if (classifyExtractionFailure(err).kind === "systematic") throw err;
        failures.push({
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (parts.length === 0) {
      throw new Error(
        `all ${chunks.length} chunk(s) failed. First failure (pages ${failures[0]?.startPage}-${failures[0]?.endPage}): ${failures[0]?.message ?? "unknown"}`,
      );
    }

    if (failures.length > 0) {
      const ranges = failures.map((f) => `${f.startPage}-${f.endPage}`).join("、");
      const note = `标书分块读取时有 ${failures.length}/${chunks.length} 块失败（第 ${ranges} 页），本次分析只覆盖了其余 ${chunks.length - failures.length} 块。失败原因：${failures[0].message.slice(0, 200)}`;
      console.warn(`  ${note}`);
      onWarning?.(note);
    }

    return mergeExtractions(parts);
  } finally {
    cleanup();
  }
}

export async function extractTenderRequirements(
  filePath: string,
  context: {
    tenderNumber: string;
    title: string;
    buyer: string;
    /**
     * Chinese this platform ALREADY shows for this tender — its title, its
     * summary, and any one-line summary a previous analysis wrote.
     *
     * Handed to the model purely as a vocabulary anchor. Real report
     * 2026-09-14: a tender titled 亚纳万卡区（Yanahuanca） was summarised as
     * 扬阿万卡 — one town, two transliterations, on one page. The title
     * alone does not fix it, because a place named only in the summary
     * (a river, a neighbouring district, the buyer's own municipality)
     * still gets re-transliterated from scratch. Everything the site
     * already displays goes in, so there is one established spelling per
     * name rather than one per model call.
     */
    existingChineseText?: string;
  },
  model: ExtractionModel = "claude-sonnet-5",
  // Defaults to a real Anthropic client; extract-requirements-qwen-
  // anthropic.ts passes one pointed at DashScope's Anthropic-compatible
  // endpoint instead, reusing every call below (native PDF document
  // blocks, chunking, overflow retry) unchanged.
  client: Anthropic = new Anthropic(),
  // False for extract-requirements-qwen-anthropic.ts — see runExtraction()'s
  // header comment for the real gap that requires this.
  useStructuredOutput: boolean = true,
  /**
   * Read at most this many PDF pages. Callers pass maxPagesForTier() (lib/
   * ingestion/extraction-routing.ts); undefined reads the whole document,
   * which is what the offline comparison scripts want.
   */
  maxPages?: number,
  /**
   * Send a PDF's locally-extracted text instead of the PDF itself, for a
   * provider where native document input is the wrong tool.
   *
   * Set by extract-requirements-qwen-anthropic.ts, on three days of real
   * evidence rather than a preference. DashScope's Anthropic-compatible
   * endpoint rejected the same real Peru bases PDF three different ways —
   * a 16MB request-body cap, a 28,000,000-character base64 field cap, and
   * chunks that still exceeded the second — and, measured 2026-09-13, sent
   * NO response header for 734.5 seconds before failing, which means it
   * buffers the whole answer rather than streaming it. The text of the very
   * same document, on the very same model, returned in 98.9s with its first
   * header at 4.6s and succeeded. Seven times faster, and the difference
   * between working and not.
   *
   * This costs what native document understanding would have given: a table
   * rendered as an IMAGE inside an otherwise text-bearing PDF is invisible
   * to pdftotext. A text table is not — extractPdfText() now passes
   * -layout, which keeps a cronograma's columns on one line. The route is
   * only ever taken for a file hasRealTextLayer() has already confirmed,
   * and an empty 关键日期 in the batch table is the visible symptom if a
   * schedule was nonetheless lost, so this fails loudly rather than
   * silently.
   */
  preferExtractedText?: boolean,
  /** Called with anything the operator should see that is not a failure — currently a partially-read chunked document. */
  onWarning?: (message: string) => void,
): Promise<TenderExtraction> {
  // Word documents — .docx and legacy .doc alike (2026-09-03, per the
  // user's report that many real tender documents arrive as Word files,
  // both formats, not PDF) — go through local text extraction instead of
  // Claude's native document vision — unlike a scanned PDF page, a real
  // Word file is already machine-readable text, so there's nothing
  // meaningful for native document understanding to add here (no
  // layout/table-image rendering to lose).
  const isWord = [".docx", ".doc"].includes(extname(filePath).toLowerCase());
  // The literal word "json" below is required, not decorative: DashScope's
  // Anthropic-compatible endpoint (extract-requirements-qwen-anthropic.ts)
  // translates output_config.format into its own OpenAI-style
  // response_format:"json_object" mode under the hood, which real-world
  // 2026-09-03 testing showed rejects the request outright ("'messages'
  // must contain the word 'json' in some form") when nothing in the
  // messages array says so — this file's SYSTEM_PROMPT never happened to.
  // Harmless for Claude's own structured outputs either way.
  // Placed AFTER the task sentence and clearly labelled, so it reads as
  // reference material rather than as content to extract from — it is the
  // platform's own prior output, not the tender document.
  const established = context.existingChineseText?.trim()
    ? `\n\n本平台已对该项目使用的中文写法（仅供统一术语，不是提取来源）：\n${context.existingChineseText.trim()}`
    : "";
  const instruction = `Tender ${context.tenderNumber} — "${context.title}" (${context.buyer}). Extract qualifications, experience requirements, required documents, and risks from the ${isWord ? "document text below" : "attached document"}, and respond with a valid JSON object matching the required schema.${established}`;

  if (isWord) return runTextExtractionWithOverflowRetry(client, model, instruction, await extractDocumentText(filePath), context, useStructuredOutput, maxPages);

  // Same branch as Word, for the same reason and one more: a provider that
  // buffers a multi-megabyte native PDF for 12 minutes and then rejects it
  // on size is not one to send a PDF to at all. See preferExtractedText.
  if (preferExtractedText) {
    const capped = maxPages === undefined ? null : truncatePdfToPages(filePath, maxPages);
    try {
      const textInstruction = instruction.replace("attached document", "document text below");
      return await runTextExtractionWithOverflowRetry(
        client,
        model,
        textInstruction,
        await extractDocumentText(capped?.path ?? filePath),
        context,
        useStructuredOutput,
        maxPages,
      );
    } finally {
      capped?.cleanup();
    }
  }

  // Cap the pages BEFORE reading the file, not after: a 100MB, 900-page
  // tender would otherwise be base64'd into memory in full just to have most
  // of it thrown away. Everything below — the chunking fallback and the
  // plain-text fallback — then operates on the capped file too, so the cap
  // holds on every path rather than only the happy one.
  const capped = maxPages === undefined ? null : truncatePdfToPages(filePath, maxPages);
  const sourcePath = capped?.path ?? filePath;
  if (capped?.truncated) {
    console.log(`  Reading the first ${capped.usedPages} of ${capped.originalPages} pages (tier cap ${maxPages}).`);
  }

  try {
    const pdfContent: ExtractionContent = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: readFileSync(sourcePath).toString("base64") },
      },
      { type: "text", text: instruction },
    ];

    try {
      return await runExtraction(client, model, pdfContent, context, useStructuredOutput, maxPages);
    } catch (err) {
      if (!isPdfNativeLimitError(err)) throw err;
      console.log(`  PDF exceeds Claude's native document limits (${(err instanceof Error ? err.message : String(err)).slice(0, 300)}) — splitting into chunks.`);

      try {
        return await runChunkedPdfExtraction(client, model, sourcePath, instruction, context, useStructuredOutput, maxPages, onWarning);
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
        // The fallback is only a fallback when there is text to fall back
        // TO. A scanned/image-only PDF yields a few hundred characters of
        // stray caption text, and sending that returns a confident, empty,
        // successful-looking 0/0/0/0 — the operator is told the document
        // contains nothing, which is a different and much worse claim than
        // "this failed, run it again". Real case 2026-09-16: a 
        // Proyectos Estratégicos highway Convocatoria whose chunked call hit
        // one Anthropic 500 and whose text fallback then ran on 3,025 input
        // tokens — a whole highway tender cannot be 3,025 tokens.
        //
        // Rethrowing puts it where the design already says transient failures
        // belong (see requestOptions' comment on maxRetries: reported, batch
        // continues, two in a row stop the run) instead of converting a blip
        // into a permanent empty answer.
        const fallbackText = await extractDocumentText(sourcePath);
        let fallbackPages: number | undefined;
        try {
          fallbackPages = getPdfPageCount(sourcePath);
        } catch {
          fallbackPages = undefined;
        }
        if (!isTextLayerSubstantial(fallbackText, fallbackPages)) {
          throw new Error(
            `chunked extraction failed and this PDF has no usable text layer (${fallbackText.trim().length} chars), so there is nothing to fall back to — rerun it. Original failure: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`,
          );
        }
        console.log(`  chunked extraction failed (${(chunkErr instanceof Error ? chunkErr.message : String(chunkErr)).slice(0, 800)}) — falling back to extracted text instead.`);
        return runTextExtractionWithOverflowRetry(client, model, instruction, fallbackText, context, useStructuredOutput, maxPages);
      }
    }
  } finally {
    capped?.cleanup();
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
/**
 * A real calendar day, or null.
 *
 * The schema asks for YYYY-MM-DD and describes the trap (these countries
 * write 10/09/2026 for 10 September, never 9 October), but a `z.string()`
 * cannot enforce either, and the manual-JSON-parse path some providers take
 * does not even validate the schema. A date is the one extracted field that
 * is acted on rather than read — it drives 交标截止日, the status derivation
 * and the digest — so anything not already an unambiguous ISO day is dropped
 * rather than parsed generously: `new Date("10/09/2026")` silently answers
 * October 9th, which is a wrong deadline presented as a real one.
 *
 * Also rejects a day that does not exist (2026-02-30 round-trips to March 2
 * through Date), and anything absurdly far out, which is what a
 * hallucinated or mis-OCR'd year looks like.
 */
export function toCalendarDay(raw: string, now: Date = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  const yearNumber = Number(year);
  if (yearNumber < now.getUTCFullYear() - 5 || yearNumber > now.getUTCFullYear() + 5) return null;
  return `${year}-${month}-${day}`;
}

export function toTenderFields(extraction: TenderExtraction, tenderSlug: string) {
  return {
    oneLineSummary: extraction.oneLineSummary,
    qualifications: extraction.qualifications.map((item, i) => toRequirement(item, `${tenderSlug}-qual`, i)),
    experienceRequirements: extraction.experienceRequirements.map((item, i) => toRequirement(item, `${tenderSlug}-exp`, i)),
    requiredDocuments: extraction.requiredDocuments.map((item, i) => toRequirement(item, `${tenderSlug}-doc`, i)),
    risks: extraction.risks.map((item, i) => toRisk(item, tenderSlug, i)),
  };
}
