/**
 * Runs the REAL extraction pipeline end to end against a stub model
 * client — no network, no API key, no spend.
 *
 * This exists because of a run that cost real money to learn nothing:
 * five Peru bases PDFs, five identical failures, because `keyDates` was
 * required by ExtractionSchema while JSON_SHAPE_INSTRUCTIONS never asked
 * for it and the manual-JSON path never defaulted it. Every part of that
 * was reproducible offline. Nothing about it needed a live model.
 *
 * What a stub client can and cannot prove, stated plainly so this file
 * isn't mistaken for more than it is:
 *   CAN — that a given model RESPONSE flows correctly through parsing,
 *   defaulting, validation, chunk merging, fallback selection and field
 *   mapping; that an oversized or unreadable document takes the path it
 *   is supposed to take; that a systematic failure stops the batch.
 *   CANNOT — whether a real model reads a real cronograma correctly.
 *   That is task #34's live check and no stub substitutes for it.
 *
 * Usage: npm run test:extraction-pipeline
 */
import type Anthropic from "@anthropic-ai/sdk";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ExtractionSchema,
  extractTenderRequirements,
  mergeExtractions,
  toTenderFields,
  type TenderExtraction,
} from "../lib/ingestion/extract-requirements";
import { BATCH_BUDGET_MS, batchBudgetExhausted, classifyExtractionFailure, shouldAbortBatch } from "../lib/ingestion/extraction-failure";
import { writeTestPdf } from "./fixtures/make-pdf";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Runs one independent group of checks. A group that throws reports itself
 * and the remaining groups still run — the first version of this file
 * aborted the whole harness on the first unexpected error, which hid every
 * other result at exactly the moment they were most worth seeing.
 */
async function group(label: string, body: () => Promise<void>) {
  try {
    await body();
  } catch (err) {
    check(`${label}（整组抛错）`, false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }
}

async function expectThrow(label: string, run: () => Promise<unknown>, matches: RegExp) {
  try {
    await run();
    check(label, false, "did not throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    check(label, matches.test(message), `threw "${message.slice(0, 160)}"`);
  }
}

const TMP = mkdtempSync(join(tmpdir(), "extraction-pipeline-"));
const CONTEXT = { tenderNumber: "LP-001-2026", title: "Adquisición de equipos", buyer: "ESSALUD" };

/** What a well-behaved model returns — the shape every case below varies from. */
const FULL_RESPONSE = {
  oneLineSummary: "为某医院采购医疗设备",
  qualifications: [{ title: "RUC 有效", description: "投标人须持有有效 RUC", mandatory: true, sourceReference: "página 12" }],
  experienceRequirements: [],
  requiredDocuments: [],
  risks: [{ level: "high", title: "履约保证金", description: "合同额 10%", sourceReference: "página 30" }],
  keyDates: [
    { type: "questions_deadline", date: "2026-09-20", notes: null, sourceReference: "página 7, Cronograma" },
    { type: "submission", date: "2026-10-02", notes: "上午 10:00", sourceReference: "página 7, Cronograma" },
  ],
};

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/**
 * A stand-in for the Anthropic client. `script` supplies one behaviour per
 * call — either a JSON body to return or an Error to throw — so a test can
 * say "fail the first call the way DashScope really fails, then succeed",
 * which is exactly the sequence the chunking fallback depends on.
 */
function stubClient(script: (unknown | Error)[]) {
  const calls: { contentTypes: string[]; promptChars: number; docBytes: number }[] = [];
  const requestOptionsSeen: ({ maxRetries?: number; timeout?: number } | undefined)[] = [];
  const next = (content: unknown) => {
    const blocks = Array.isArray(content) ? content : [];
    calls.push({
      contentTypes: blocks.map((b) => (b as { type: string }).type),
      promptChars: blocks.reduce((n, b) => n + ((b as { text?: string }).text?.length ?? 0), 0),
      docBytes: blocks.reduce((n, b) => n + ((b as { source?: { data?: string } }).source?.data?.length ?? 0), 0),
    });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  // Only stream() is implemented, and create()/parse() throw on purpose.
  // Non-streaming is what let one batch spend 31 minutes and return nothing
  // (the SDK pins a 10-minute timeout for a non-streaming request and then
  // retries it twice), so a revert to it must fail here rather than be
  // discovered on the bill.
  const mustStream = () => {
    throw new Error("非流式调用：extract-requirements.ts 必须用 messages.stream()，见 REQUEST_OPTIONS 的注释");
  };
  const client = {
    messages: {
      create: mustStream,
      parse: mustStream,
      stream: (
        { messages }: { messages: { content: unknown }[] },
        requestOptions?: { maxRetries?: number; timeout?: number },
      ) => {
        requestOptionsSeen.push(requestOptions);
        // next() throws synchronously for a scripted error; stream() returns
        // an object whose finalMessage() rejects, which is the real shape.
        const body = (() => {
          try {
            return { ok: next(messages[0].content) };
          } catch (err) {
            return { err };
          }
        })();
        return {
          finalMessage: async () => {
            if ("err" in body) throw body.err;
            return {
              usage: USAGE,
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify(body.ok) }],
              parsed_output: ExtractionSchema.safeParse(body.ok).data ?? null,
            };
          },
        };
      },
    },
  };
  return { client: client as unknown as Anthropic, calls, requestOptionsSeen };
}

/** The manual-JSON path — the one the production DashScope route uses. */
const manual = (path: string, script: (unknown | Error)[], maxPages?: number) => {
  const { client, calls, requestOptionsSeen } = stubClient(script);
  return {
    run: () => extractTenderRequirements(path, CONTEXT, "qwen3.5-plus", client, false, maxPages),
    calls,
    requestOptionsSeen,
  };
};

async function main() {
  const small = join(TMP, "small.pdf");
  writeTestPdf(small, { pages: 4 });

  // ---- 1. The exact 2026-09-13 failure, reproduced and proven fixed ----
  await group("1 schema defaulting", async () => {
    const withoutKeyDates: Record<string, unknown> = { ...FULL_RESPONSE };
    delete withoutKeyDates.keyDates;
    const { run } = manual(small, [withoutKeyDates]);
    const result = await run();
    check("a response with no keyDates key no longer fails the document", Array.isArray(result.keyDates) && result.keyDates.length === 0);
    check("...and the requirements it DID return survive", result.qualifications.length === 1 && result.risks.length === 1);
    check("...and so does the one-line summary", result.oneLineSummary === "为某医院采购医疗设备");
  });

  // The originally-documented DashScope behaviour: array keys simply absent.
  await group("1b 全部数组缺失", async () => {
    const { run } = manual(small, [{ oneLineSummary: "只有总结" }]);
    const result = await run();
    check("a response with no array keys at all still validates", result.qualifications.length === 0 && result.keyDates.length === 0);
  });

  // ---- 2. A schedule the model DID return survives the whole chain ----
  await group("2 日程直达可写入结构", async () => {
    const { run } = manual(small, [FULL_RESPONSE]);
    const fields = toTenderFields(await run(), "peru-test-1");
    check("both cronograma rows reach the writable field shape", fields.keyDates.length === 2);
    check(
      "the bid deadline keeps its exact day",
      fields.keyDates.find((d) => d.type === "submission")?.date === "2026-10-02",
    );
    check("a row's note is carried through", fields.keyDates.find((d) => d.type === "submission")?.notes?.zh === "上午 10:00");
    check("every row keeps its citation", fields.keyDates.every((d) => d.sourceReference.includes("Cronograma")));
  });

  // A date the model wrote ambiguously is dropped, not guessed at.
  await group("2b 歧义日期", async () => {
    const { run } = manual(small, [{ ...FULL_RESPONSE, keyDates: [{ type: "submission", date: "10/09/2026", notes: null, sourceReference: "página 7" }] }]);
    check("an ambiguous DD/MM date is dropped rather than read as October", toTenderFields(await run(), "t").keyDates.length === 0);
  });

  // ---- 3. Shapes that must still fail loudly ----
  // Rejected one step earlier than the others — extractJsonObject() finds no
  // object at all — so the assertion accepts either refusal, not one wording.
  await expectThrow("a top-level array is still rejected", manual(small, [[]]).run, /No JSON object found|schema validation/i);
  await expectThrow(
    "a bad enum value is still rejected",
    manual(small, [{ ...FULL_RESPONSE, keyDates: [{ type: "firma", date: "2026-10-02", notes: null, sourceReference: "p7" }] }]).run,
    /schema validation/i,
  );

  // ---- 4. Bug 2: DashScope's body-byte cap must reach the splitter ----
  await group("4 请求体上限触发分块", async () => {
    const big = join(TMP, "big.pdf");
    writeTestPdf(big, { pages: 200 });
    const bodyCap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const { run, calls } = manual(big, [bodyCap, FULL_RESPONSE]);
    const result = await run();
    check("the request-body cap triggers chunking instead of throwing", calls.length > 1);
    check("...and every chunk is sent as a real PDF, not extracted text", calls.slice(1).every((c) => c.contentTypes.includes("document")));
    check("...and the merged result still carries the schedule", result.keyDates.length === 2);
  });

  // The limits that already worked must keep working.
  for (const [label, error] of [
    ["the page-count limit", new Error("A maximum of 100 PDF pages may be provided")],
    ["the base64 field-length limit", new Error('400 {"error":{"message":"String value length (28049408) exceeds the maximum allowed (28000000)"}}')],
  ] as const) {
    const big = join(TMP, "big.pdf");
    const { run, calls } = manual(big, [error, FULL_RESPONSE]);
    await run();
    check(`${label} still triggers chunking`, calls.length > 1);
  }

  // ---- 5. Fallbacks below chunking ----
  {
    // Every model call fails the same way, so chunking cannot rescue it —
    // the pipeline must land on locally-extracted text rather than give up.
    const big = join(TMP, "big.pdf");
    const cap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    // Call 1 = the whole PDF, call 2 = the first chunk (chunking gives up on
    // its first failure rather than paying for the rest), call 3 = the text.
    const { client, calls } = stubClient([cap, cap, FULL_RESPONSE]);
    const result = await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", client, false);
    check("when every chunk fails, the text fallback runs", calls.at(-1)?.contentTypes.every((t) => t === "text") === true);
    check("...and still returns a usable result", result.keyDates.length === 2);
    check("...and the fallback really sent the document's text", (calls.at(-1)?.promptChars ?? 0) > 200);
  }

  {
    // The text fallback overflowing the context window — a real second-order
    // failure — must retry truncated rather than surface the raw API error.
    const big = join(TMP, "big.pdf");
    const cap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const overflow = new Error("prompt is too long: 298943 tokens > 200000 maximum");
    const { client, calls } = stubClient([cap, cap, overflow, FULL_RESPONSE]);
    await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", client, false);
    const [secondLast, last] = calls.slice(-2);
    check("a context overflow retries with less text, not the same text", last.promptChars < secondLast.promptChars);
  }

  // ---- 6. The page cap, which decides what the model is ever shown ----
  {
    const big = join(TMP, "big.pdf");
    const { run, calls } = manual(big, [FULL_RESPONSE], 20);
    await run();
    const uncapped = manual(big, [FULL_RESPONSE]);
    await uncapped.run();
    // Not asserted at the 10% the page ratio suggests: this fixture's pages
    // are a single text line each, so the PDF's fixed structure (catalog,
    // xref, font) is a large share of a small file in a way a real 200-page
    // Convocatoria's never is. "Meaningfully smaller" is the claim that
    // holds for both.
    check(
      "a 20-page cap genuinely sends less than the whole 200-page document",
      calls[0].docBytes > 0 && calls[0].docBytes < uncapped.calls[0].docBytes / 2,
      `${calls[0].docBytes} vs ${uncapped.calls[0].docBytes} base64 chars`,
    );
  }

  // ---- 7. Chunk merging ----
  {
    const a: TenderExtraction = ExtractionSchema.parse({ ...FULL_RESPONSE, oneLineSummary: "" });
    const b: TenderExtraction = ExtractionSchema.parse(FULL_RESPONSE);
    const merged = mergeExtractions([a, b]);
    check("a date read twice across a chunk boundary is written once", merged.keyDates.length === 2);
    check("the first non-empty one-line summary wins", merged.oneLineSummary === "为某医院采购医疗设备");
  }

  // ---- 7b. The 31-minute failure: streaming, and bounded retries ----
  await group("7b 流式与重试上限", async () => {
    const { run, requestOptionsSeen } = manual(small, [FULL_RESPONSE]);
    await run();
    check("the extraction streams (create/parse would have thrown)", requestOptionsSeen.length === 1);
    check(
      "and passes an explicit maxRetries instead of the SDK default of 2",
      requestOptionsSeen[0]?.maxRetries === 0,
      `saw ${JSON.stringify(requestOptionsSeen[0])}`,
    );
    // The 609s measurement: the SDK's own 10-minute client default applies to
    // streaming too, so inheriting it hangs up on a model that is still working.
    check(
      "and an explicit timeout above the SDK's inherited 10-minute default",
      (requestOptionsSeen[0]?.timeout ?? 0) > 10 * 60 * 1000,
      `saw ${JSON.stringify(requestOptionsSeen[0])}`,
    );
  });

  check(
    "a batch stops at its wall-clock budget rather than running on",
    batchBudgetExhausted(Date.now() - BATCH_BUDGET_MS - 1) && !batchBudgetExhausted(Date.now()),
  );
  check("a request timeout does NOT end the batch on its own — the next file may be fine", classifyExtractionFailure(new Error("Request timed out.")).kind === "document");

  // ---- 8. The money question: does a repeating failure stop the batch? ----
  check(
    "a schema failure is classified as systematic — the 2026-09-13 case",
    classifyExtractionFailure(new Error("Extraction failed schema validation for peru-x: [...]")).kind === "systematic",
  );
  for (const message of ["401 invalid_api_key", "insufficient_quota", "model_not_found: qwen9", "spawn pdfinfo ENOENT"]) {
    check(`"${message}" stops the batch`, classifyExtractionFailure(new Error(message)).kind === "systematic");
  }
  for (const message of [
    "400 Exceeded limit on max bytes to request body : 16777216",
    "A maximum of 100 PDF pages may be provided",
    "529 overloaded_error",
    "429 rate_limit_error",
  ]) {
    check(`"${message.slice(0, 40)}" does NOT stop the batch`, classifyExtractionFailure(new Error(message)).kind === "document");
  }
  check("two failures with nothing succeeding stops the batch", shouldAbortBatch({ consecutiveFailures: 2, anySucceeded: false }));
  check("one failure alone does not", shouldAbortBatch({ consecutiveFailures: 1, anySucceeded: false }) === false);
  check(
    "failures after a success do not stop it — those are per-document",
    shouldAbortBatch({ consecutiveFailures: 3, anySucceeded: true }) === false,
  );

  console.log(`\n${passed}/${passed + failed} checks passed (0 model calls, 0 cost).`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(TMP, { recursive: true, force: true }));
