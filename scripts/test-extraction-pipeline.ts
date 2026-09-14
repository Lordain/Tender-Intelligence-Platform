/**
 * Runs the REAL extraction pipeline end to end against a stub model
 * client — no network, no API key, no spend.
 *
 * This exists because of a run that cost real money to learn nothing: five
 * Peru bases PDFs, five identical failures, because an array was required by
 * ExtractionSchema while JSON_SHAPE_INSTRUCTIONS never asked for it and the
 * manual-JSON path never defaulted it. (That array was `keyDates`, removed
 * from the extraction on 2026-09-16 — the defaulting it forced is what
 * stayed, and group 1 still proves it on a different array.) Every part of
 * that was reproducible offline. Nothing about it needed a live model.
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
  type TenderExtraction,
} from "../lib/ingestion/extract-requirements";
import { BATCH_BUDGET_MS, batchBudgetExhausted, classifyExtractionFailure, shouldAbortBatch } from "../lib/ingestion/extraction-failure";
import { isTextLayerSubstantial } from "../lib/ingestion/text-layer";
import { isRetriableExtractionFailure, isTransientServerError } from "../lib/ingestion/extraction-failure";
import { escapeStrayQuotes, normalizeRawExtraction } from "../lib/ingestion/extract-requirements";
import { chooseExtractionModel, maxPagesForTier } from "../lib/ingestion/extraction-routing";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dispatcherForTimeout } from "../lib/ingestion/http-dispatcher";
import { runPool } from "../lib/ingestion/run-pool";
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
};

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/**
 * A stand-in for the Anthropic client. `script` supplies one behaviour per
 * call — either a JSON body to return or an Error to throw — so a test can
 * say "fail the first call the way DashScope really fails, then succeed",
 * which is exactly the sequence the chunking fallback depends on.
 */
function stubClient(script: (unknown | Error)[]) {
  const calls: { contentTypes: string[]; promptChars: number; promptText: string; docBytes: number }[] = [];
  const requestOptionsSeen: ({ maxRetries?: number; timeout?: number; fetchOptions?: { dispatcher?: unknown } } | undefined)[] = [];
  const next = (content: unknown) => {
    const blocks = Array.isArray(content) ? content : [];
    calls.push({
      contentTypes: blocks.map((b) => (b as { type: string }).type),
      promptChars: blocks.reduce((n, b) => n + ((b as { text?: string }).text?.length ?? 0), 0),
      promptText: blocks.map((b) => (b as { text?: string }).text ?? "").join("\n"),
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
        requestOptions?: { maxRetries?: number; timeout?: number; fetchOptions?: { dispatcher?: unknown } },
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
        const self = {
          // The real MessageStream is an event emitter; extract-requirements
          // attaches connect/streamEvent marks to it to tell a genuinely
          // streaming provider from one that buffers. The stub emits
          // connect immediately, which is what a streaming endpoint does.
          on: (event: string, listener: () => void) => {
            if (event === "connect") listener();
            return self;
          },
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
        return self;
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
    const withoutRisks: Record<string, unknown> = { ...FULL_RESPONSE };
    delete withoutRisks.risks;
    const { run } = manual(small, [withoutRisks]);
    const result = await run();
    check("a response missing a required array no longer fails the document", Array.isArray(result.risks) && result.risks.length === 0);
    check("...and the requirements it DID return survive", result.qualifications.length === 1);
    check("...and so does the one-line summary", result.oneLineSummary === "为某医院采购医疗设备");
  });

  // The originally-documented DashScope behaviour: array keys simply absent.
  await group("1b 全部数组缺失", async () => {
    const { run } = manual(small, [{ oneLineSummary: "只有总结" }]);
    const result = await run();
    check("a response with no array keys at all still validates", result.qualifications.length === 0 && result.risks.length === 0);
  });

  // ---- 3. Shapes that must still fail loudly ----
  // Rejected one step earlier than the others — extractJsonObject() finds no
  // object at all — so the assertion accepts either refusal, not one wording.
  await expectThrow("a top-level array is still rejected", manual(small, [[]]).run, /No JSON object found|schema validation/i);
  await expectThrow(
    "a bad enum value is still rejected",
    manual(small, [{ ...FULL_RESPONSE, risks: [{ level: "catastrophic", title: "x", description: "y", sourceReference: "p7" }] }]).run,
    /schema validation/i,
  );

  // ---- 4. Bug 2: DashScope's body-byte cap must reach the splitter ----
  await group("4 请求体上限触发分块", async () => {
    const big = join(TMP, "big.pdf");
    // ~300 characters a page, so this 200-page fixture reads as a genuinely
    // text-bearing document under the per-page text-layer bar. One short line
    // a page — what this fixture used to carry — is what a SCAN looks like,
    // and the fallback correctly refuses those now (see 扫描件没有可回退的文本).
    writeTestPdf(big, { pages: 200, linesPerPage: 40 });
    const bodyCap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const { run, calls } = manual(big, [bodyCap, FULL_RESPONSE]);
    const result = await run();
    check("the request-body cap triggers chunking instead of throwing", calls.length > 1);
    check("...and every chunk is sent as a real PDF, not extracted text", calls.slice(1).every((c) => c.contentTypes.includes("document")));
    check("...and the merged result still carries the requirements", result.qualifications.length === 1);
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

  // ---- 5. One bad chunk does not discard the good ones ----
  // Contract changed 2026-09-16. Chunking used to abort on its first failed
  // chunk, which threw away every chunk already paid for: three real
  // Proyectos Estratégicos Convocatorias (75-94MB scans, five chunks each)
  // lost four good chunks to one Anthropic 500 and reported reading nothing.
  // A five-chunk document is five chances to fail, so all-or-nothing made
  // the biggest tenders the least likely to ever succeed.
  {
    const big = join(TMP, "big.pdf");
    const cap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const blip = new Error("500 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Internal server error\"}}");
    // Call 1 = the whole PDF (too big), then one chunk blips and the rest answer.
    const { client, calls } = stubClient([cap, blip, FULL_RESPONSE, FULL_RESPONSE]);
    const result = await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", client, false);
    check("a chunk that fails does not abort the document", result.qualifications.length === 1);
    check("...and the surviving chunks were still sent as documents, not text", calls.at(-1)?.contentTypes.includes("document") === true);
  }

  {
    // The other half of the same contract: when NOTHING survives, the text
    // fallback still runs. Four caps — the whole PDF plus all three chunks
    // (this fixture splits into three) — and only then the text call.
    const big = join(TMP, "big.pdf");
    const cap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const { client, calls } = stubClient([cap, cap, cap, cap, FULL_RESPONSE]);
    const result = await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", client, false);
    check("when every chunk fails, the text fallback runs", calls.at(-1)?.contentTypes.every((t) => t === "text") === true);
    check("...and still returns a usable result", result.qualifications.length === 1);
    check("...and the fallback really sent the document's text", (calls.at(-1)?.promptChars ?? 0) > 200);
  }

  {
    // The text fallback overflowing the context window — a real second-order
    // failure — must retry truncated rather than surface the raw API error.
    const big = join(TMP, "big.pdf");
    const cap = new Error("400 Exceeded limit on max bytes to request body : 16777216");
    const overflow = new Error("prompt is too long: 298943 tokens > 200000 maximum");
    const { client, calls } = stubClient([cap, cap, cap, cap, overflow, FULL_RESPONSE]);
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
    check("a requirement read twice across a chunk boundary is written once", merged.qualifications.length === 1);
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

  // A big tender must not be punished for being big: the timeout follows the
  // tier's page cap (20/30/40) rather than one flat number.
  await group("7c 超时随页数上限放大", async () => {
    const big = join(TMP, "big.pdf");
    const standard = manual(big, [FULL_RESPONSE], 20);
    await standard.run();
    const flagship = manual(big, [FULL_RESPONSE], 40);
    await flagship.run();
    check(
      "a 40-page flagship gets a longer budget than a 20-page standard",
      (flagship.requestOptionsSeen[0]?.timeout ?? 0) > (standard.requestOptionsSeen[0]?.timeout ?? 0),
      `${standard.requestOptionsSeen[0]?.timeout} vs ${flagship.requestOptionsSeen[0]?.timeout}`,
    );
    check(
      "and the 30-page case that really timed out at 609s now gets well over that",
      (manual(big, [FULL_RESPONSE], 30), true) &&
        (await (async () => {
          const thirty = manual(big, [FULL_RESPONSE], 30);
          await thirty.run();
          return (thirty.requestOptionsSeen[0]?.timeout ?? 0) >= 30 * 60 * 1000;
        })()),
    );
  });

  check(
    "a batch stops at its wall-clock budget rather than running on",
    batchBudgetExhausted(Date.now() - BATCH_BUDGET_MS - 1) && !batchBudgetExhausted(Date.now()),
  );
  check("a request timeout does NOT end the batch on its own — the next file may be fine", classifyExtractionFailure(new Error("Request timed out.")).kind === "document");

  // ---- 7d. Node's own 300s ceiling, the real cause of both timeouts ----
  await group("7d dispatcher 真的改变 fetch 行为", async () => {
    // A server that withholds response HEADERS for 1.2s — the shape of a
    // provider that buffers its answer instead of streaming it, which is
    // what undici's headersTimeout actually measures.
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
      }, 1200);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/`;

    try {
      // Forces Node to create its global dispatcher, which is the class the
      // helper reads. Before any fetch there is nothing to read.
      await fetch("http://127.0.0.1:1").catch(() => {});

      const tooShort = dispatcherForTimeout(300);
      check("a dispatcher is actually produced on this Node", tooShort !== undefined);

      // Proves it is honoured rather than ignored: 300ms MUST fail on a
      // 1.2s server. If this passes, the dispatcher did nothing and the
      // headroom below would be a comforting illusion.
      let shortFailed = false;
      try {
        await fetch(url, { dispatcher: tooShort } as RequestInit);
      } catch {
        shortFailed = true;
      }
      check("a deliberately short dispatcher does time out — so it is honoured", shortFailed);

      const generous = dispatcherForTimeout(30_000);
      const res = await fetch(url, { dispatcher: generous } as RequestInit);
      check("and a generous one lets the slow response through", res.ok);
    } finally {
      server.close();
    }
  });

  // ---- 7e. The DashScope path sends text, never the PDF ----
  await group("7e 文本优先", async () => {
    const big = join(TMP, "big.pdf");
    const { client, calls } = stubClient([FULL_RESPONSE]);
    // preferExtractedText: true — what extractTenderRequirementsQwenAnthropic passes.
    const result = await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", client, false, 20, true);
    check("only one call is made — no doomed native-PDF attempt first", calls.length === 1);
    check("and it carries no document block at all", !calls[0].contentTypes.includes("document"));
    check("the PDF's own text is what was sent", calls[0].promptChars > 200 && calls[0].docBytes === 0);
    check("and the result still comes through", result.qualifications.length === 1);
  });

  await group("7e' 未开启时仍然先走原生 PDF", async () => {
    const big = join(TMP, "big.pdf");
    const { run, calls } = manual(big, [FULL_RESPONSE], 20);
    await run();
    check("the Claude path is untouched — still native PDF", calls[0].contentTypes.includes("document"));
  });

  // ---- 7f. The worker pool that makes a 66-document backlog finishable ----
  await group("7f 并发池", async () => {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    const { completed } = await runPool([...Array(12).keys()], 4, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      seen.push(item);
      inFlight -= 1;
    });
    check("never exceeds its width", peak === 4, `peak ${peak}`);
    check("runs every item exactly once", completed === 12 && new Set(seen).size === 12);

    // A pool is faster than sequence or it is pointless. 12 items of 30ms
    // at width 4 must land far under the 360ms a sequential run would take.
    const startedAt = Date.now();
    await runPool([...Array(12).keys()], 4, () => sleep(30));
    const elapsed = Date.now() - startedAt;
    check("is genuinely concurrent, not sequential in disguise", elapsed < 240, `${elapsed}ms for 12×30ms at width 4`);

    // The guarantee that protects money: once a stop is decided, nothing
    // NEW starts, but work already in flight is awaited rather than
    // abandoned — an abandoned model call is paid for and thrown away.
    let started = 0;
    let finished = 0;
    let stop = false;
    const res = await runPool(
      [...Array(20).keys()],
      4,
      async () => {
        started += 1;
        await sleep(10);
        finished += 1;
        if (started >= 4) stop = true;
      },
      () => stop,
    );
    check("stops claiming new work once asked", started < 20, `started ${started} of 20`);
    check("but finishes everything already in flight", finished === started && res.completed === started);

    // The number the admin UI turns into "N 个项目未处理（不产生费用）".
    check("reports how many actually completed", res.completed === finished);

    const empty = await runPool([], 4, async () => {});
    check("an empty run is not an error", empty.completed === 0);
  });

  // ---- 7g. One spelling per name, across two unrelated model calls ----
  await group("7g 术语锚点", async () => {
    const big = join(TMP, "big.pdf");
    const established = "标题：亚纳万卡区河岸防护工程\n摘要：乔皮瓦兰加河左右岸防护";
    const { client, calls } = stubClient([FULL_RESPONSE]);
    await extractTenderRequirements(
      big,
      { ...CONTEXT, existingChineseText: established },
      "qwen3.5-plus",
      client,
      false,
      20,
      true,
    );
    const sent = calls[0].promptText;
    check("the established Chinese reaches the model", sent.includes("亚纳万卡区"));
    check("including names that appear only in the summary, not the title", sent.includes("乔皮瓦兰加河"));
    check(
      "labelled as vocabulary, not as something to extract from",
      sent.includes("本平台已对该项目使用的中文写法") && sent.includes("不是提取来源"),
    );

    const without = stubClient([FULL_RESPONSE]);
    await extractTenderRequirements(big, CONTEXT, "qwen3.5-plus", without.client, false, 20, true);
    check(
      "and a tender with no established Chinese gets no empty header",
      !without.calls[0].promptText.includes("本平台已对该项目使用的中文写法"),
    );
  });

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

  // ---- A fallback needs something to fall back TO ----
  // When the chunked native call fails, the code drops to locally-extracted
  // text. For a scanned PDF that text is a few hundred stray characters, and
  // sending it returns an empty result that looks like a successful reading of
  // an empty document. This threshold is what separates the two.
  await group("扫描件没有可回退的文本", async () => {
    check("a real document's text passes", isTextLayerSubstantial("a".repeat(500)));
    check("a scanned PDF's stray caption text does not", !isTextLayerSubstantial("Figura 1. Planta general"));
    check("whitespace is not text", !isTextLayerSubstantial(" ".repeat(5000)));

    // The 2026-09-16 case: a 61-page scanned pliego whose thin OCR layer
    // cleared the old flat 500-character bar, got routed to the text path,
    // and returned 0/0/0/0 on a document that is nothing but requirements.
    check(
      "a 61-page scan with a thin OCR layer no longer counts as text-bearing",
      !isTextLayerSubstantial("a".repeat(4_000), 61),
    );
    check(
      "…while a genuinely text-bearing 61-page document still does",
      isTextLayerSubstantial("a".repeat(61 * 2_000), 61),
    );
    check("a real two-pager is unaffected by the per-page bar", isTextLayerSubstantial("a".repeat(3_000), 2));
    check("an unknown page count falls back to the absolute floor", isTextLayerSubstantial("a".repeat(600)));
  });

  // ---- Who reads a scanned document ----
  // Two questions in a fixed order: can this file be read as text at all
  // (a scanned PDF goes to Claude whatever the project is worth — it is the
  // only provider confirmed to read image pages here, and the way around the
  // DashScope chunked-PDF gap), and only then how much the tender is worth.
  // Load-bearing and, until now, untested.
  await group("扫描件必须走 Claude，不受项目分级影响", async () => {
    for (const tier of ["flagship", "significant", "standard", null] as const) {
      check(
        `a scanned PDF on a ${tier ?? "未分级"} tender goes to Claude Haiku`,
        chooseExtractionModel(false, tier) === "claude-haiku-4-5-20251001",
      );
    }
    check("a flagship text-layer document gets the better Qwen", chooseExtractionModel(true, "flagship") === "qwen3.6-plus");
    for (const tier of ["significant", "standard", null] as const) {
      check(`a ${tier ?? "未分级"} text-layer document stays on the cheaper Qwen`, chooseExtractionModel(true, tier) === "qwen3.5-plus");
    }
    check("page caps follow the tier: 40/30/20", maxPagesForTier("flagship") === 40 && maxPagesForTier("significant") === 30 && maxPagesForTier("standard") === 20);
    check("an unclassified tender gets the standard cap", maxPagesForTier(null) === 20);
  });

  // ---- What earns the one retry ----
  await group("只有服务端抖动和断线才重试", async () => {
    for (const message of [
      "Connection error.",
      "500 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Internal server error\"}}",
      "529 overloaded_error",
      "FetchError: request to https://api.anthropic.com failed, reason: ECONNRESET",
      "socket hang up",
      "terminated",
    ]) {
      check(`retried: ${message.slice(0, 40)}`, isTransientServerError(new Error(message)));
    }

    for (const message of [
      // A timeout's retry costs the whole budget again — the 31-minute run.
      "Request timed out.",
      "ETIMEDOUT",
      // 4xx: this request is wrong and will be wrong again.
      "400 {\"type\":\"invalid_request_error\",\"message\":\"Invalid request data\"}",
      "413 request_too_large",
      "400 Exceeded limit on max bytes to request body : 16777216",
      // Systematic failures are diagnosed elsewhere and must stop the batch.
      "failed schema validation",
      "401 authentication_error",
      // A token count that merely contains "500" is not a 500.
      "Token usage — input: 15002, output: 1276",
    ]) {
      check(`not retried: ${message.slice(0, 40)}`, !isTransientServerError(new Error(message)));
    }
  });

  // ---- A model's wording must not cost the batch ----
  await group("风险等级用别的写法不该中止整批", async () => {
    for (const [written, expected] of [["alto", "high"], ["MUY ALTO", "critical"], ["中等", "medium"], ["高", "high"], ["Bajo", "low"]] as const) {
      const normalized = normalizeRawExtraction({ risks: [{ level: written }] }) as { risks: { level: string }[] };
      check(`"${written}" reads as ${expected}`, normalized.risks[0].level === expected);
    }
    const unknown = normalizeRawExtraction({ risks: [{ level: "catastrófico-ish" }] }) as { risks: { level: string }[] };
    check("a level nobody can map is left alone, to fail loudly", unknown.risks[0].level === "catastrófico-ish");

    // The 2026-09-16 abort: one bad enum value stopped a batch with four
    // tenders left. A value complaint is this document's problem.
    const valueOnly = new Error(
      'Extraction failed schema validation for peru-x: [{ "code": "invalid_value", "path": ["risks", 4, "level"] }]',
    );
    check("an invalid enum value is a document failure, not systematic", classifyExtractionFailure(valueOnly).kind === "document");

    // The 2026-09-13 outage: a required key the prompt never asked for. Shape,
    // identical on every document, and stopping is right.
    const shape = new Error(
      'Extraction failed schema validation for peru-y: [{ "code": "invalid_type", "expected": "array", "path": ["keyDates"] }]',
    );
    check("a wrong SHAPE is still systematic", classifyExtractionFailure(shape).kind === "systematic");

    const mixed = new Error(
      'Extraction failed schema validation for peru-z: [{ "code": "invalid_value" }, { "code": "invalid_type" }]',
    );
    check("value plus shape is shape", classifyExtractionFailure(mixed).kind === "systematic");

    // The model writing its own JSON gets one more go — 2026-09-16 produced
    // three of these in one run, all on the DashScope path, all a stray quote
    // or a stray brace in otherwise complete answers.
    for (const message of [
      "Expected ',' or '}' after property value in JSON at position 3502 (line 98 column 63)",
      "Expected ',' or ']' after array element in JSON at position 2099",
      "Unexpected end of JSON input",
    ]) {
      check(`retried: ${message.slice(0, 44)}`, isRetriableExtractionFailure(new Error(message)));
    }
    check("a value-only schema failure is retried too", isRetriableExtractionFailure(valueOnly));
    check("a wrong shape is NOT retried — it would fail identically", !isRetriableExtractionFailure(shape));
    check(
      "no JSON at all is NOT retried — that is the prompt or the provider",
      !isRetriableExtractionFailure(new Error("No JSON object found in response")),
    );
  });

  // ---- Unescaped quotes inside a value ----
  // Both fixtures are verbatim from real 2026-09-16 failures: writing Chinese,
  // the model quotes a Spanish proper noun with ASCII double quotes and does
  // not escape them, which ends the string early and costs the whole document.
  await group("字符串里的裸引号能修好", async () => {
    const bramonas = '{"oneLineSummary": "科蒙杜市地下水回灌项目，建设"BRAMONAS 2"及"BRAMONAS 5"堤防，工期 91 天。", "risks": []}';
    const repaired = JSON.parse(escapeStrayQuotes(bramonas)) as { oneLineSummary: string; risks: unknown[] };
    check("the document survives", repaired.oneLineSummary.includes("BRAMONAS 2"));
    check("...with the quotes kept as text, not dropped", repaired.oneLineSummary.includes('"BRAMONAS 5"'));
    check("...and the rest of the object intact", Array.isArray(repaired.risks));

    const aspectos = '{"reasoning": "但文件“ASPECTOS PARTICULARES"章节明确要求投标人为墨西哥法人。"}';
    check("a Chinese opening quote closed by an ASCII one too", (JSON.parse(escapeStrayQuotes(aspectos)) as { reasoning: string }).reasoning.includes("章节"));

    // The repair must not touch JSON that was already correct.
    for (const valid of ['{"a": "b", "c": ["d", "e"], "f": {"g": 1}}', '{"empty": "", "escaped": "say \\"hi\\""}']) {
      check(`untouched: ${valid.slice(0, 28)}`, escapeStrayQuotes(valid) === valid);
    }
  });

  console.log(`\n${passed}/${passed + failed} checks passed (0 model calls, 0 cost).`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(TMP, { recursive: true, force: true }));
