/**
 * Decides whether a failed document extraction is worth continuing past.
 *
 * Written after a real, expensive 2026-09-13 run: five Peru bases PDFs
 * were analysed one after another, and all five failed with the SAME
 * message — a required schema key the prompt never asked for. The first
 * failure already contained everything needed to know the other four
 * would fail identically, and the batch billed four more model calls
 * anyway. Nothing in the pipeline was watching.
 *
 * Two kinds of failure, and only one of them is worth retrying on the
 * next document:
 *
 * - "systematic" — a property of the CODE or the ACCOUNT, identical for
 *   every document: a schema/shape contract bug, a bad or missing API
 *   key, an exhausted quota, an unknown model id, a missing poppler
 *   binary. The next document cannot do better. Stop, and say why.
 * - "document" — a property of THIS file: too large, too many pages,
 *   corrupt, no text layer, a context overflow. The next document is a
 *   different file and may well succeed. Keep going.
 *
 * Anything unrecognised is treated as "document" — a wrong guess there
 * costs one extra call, while a wrong guess the other way silently
 * abandons a batch the user asked for. Consecutive-failure counting
 * (see shouldAbortBatch) covers the unrecognised-but-really-systematic
 * case without needing this list to be exhaustive.
 */
export type ExtractionFailureKind = "systematic" | "document";

const SYSTEMATIC_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // The exact class that caused the 2026-09-13 run. A response shape the
  // code rejects is a contract bug between prompt and schema; every
  // document goes through the same prompt and the same schema.
  { pattern: /failed schema validation/i, reason: "模型返回的结构不符合我们的 schema —— 这是代码问题，换一个文档不会变" },
  { pattern: /no json object found in response/i, reason: "模型没有返回 JSON —— 提示词或 provider 配置问题，换一个文档不会变" },
  { pattern: /invalid[_ ]api[_ ]key|authentication[_ ]error|\b401\b|\b403\b/i, reason: "API key 无效或没有权限" },
  { pattern: /insufficient[_ ]quota|credit balance|billing|arrears|欠费/i, reason: "账户额度或账单问题" },
  { pattern: /model[_ ]not[_ ]found|not a valid model|unknown model|invalid model/i, reason: "模型 id 无效" },
  { pattern: /ENOENT.*\b(pdfinfo|pdftotext|pdfseparate|pdfunite)\b|\b(pdfinfo|pdftotext|pdfseparate|pdfunite)\b.*ENOENT/i, reason: "本机缺少 poppler 工具" },
  { pattern: /DASHSCOPE_API_KEY|ANTHROPIC_API_KEY/i, reason: "缺少 API key 环境变量" },
];

/**
 * Not every schema failure is a contract bug.
 *
 * The 2026-09-13 run that this whole file exists for failed on SHAPE: a
 * required array the prompt never asked for, absent from all five responses
 * because the prompt was the same all five times. Nothing about the documents
 * mattered, and stopping was right.
 *
 * A value outside an enum is the opposite. On 2026-09-16 one risk out of five
 * came back with a level the enum does not list — the model wrote it in the
 * document's own language — and the batch aborted with four tenders left
 * unprocessed. The contract held; the model slipped on one row of one answer,
 * and the next document is a fresh roll of the same dice.
 *
 * So: a schema failure whose every complaint is `invalid_value` is treated as
 * this document's problem. Mixed with anything else — a missing key, a wrong
 * type — it is the shape again, and shape is systematic.
 */
function isValueOnlySchemaFailure(message: string): boolean {
  if (!/failed schema validation/i.test(message)) return false;
  const codes = [...message.matchAll(/"code":\s*"([a-z_]+)"/g)].map((match) => match[1]);
  return codes.length > 0 && codes.every((code) => code === "invalid_value");
}

export function classifyExtractionFailure(err: unknown): { kind: ExtractionFailureKind; reason?: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (isValueOnlySchemaFailure(message)) return { kind: "document" };
  const hit = SYSTEMATIC_PATTERNS.find((entry) => entry.pattern.test(message));
  return hit ? { kind: "systematic", reason: hit.reason } : { kind: "document" };
}

/**
 * How many document-level failures in a row, with nothing succeeding in
 * between, before a batch gives up anyway.
 *
 * Two, not one: a batch whose first document happens to be a corrupt or
 * oversized file is a real and ordinary case, and stopping the whole run
 * over it would be its own kind of waste. Two consecutive failures with
 * zero successes is no longer a coincidence worth paying to confirm.
 */
export const MAX_CONSECUTIVE_FAILURES = 2;

/**
 * A failure that is the provider having a bad second, not this request being
 * wrong — the one class worth sending again.
 *
 * The extraction path sets maxRetries: 0 deliberately, and that stays right:
 * every failure it was written against repeats (a size limit, a schema
 * mismatch, a provider slower than the budget), and retrying a TIMEOUT is
 * what turned one batch into 31 minutes. This is the narrow exception the
 * evidence since then demands. On 2026-09-16 a single Anthropic 500 cost
 * three 90MB Convocatorias and one Peru OXI document a complete analysis,
 * while other documents — and other chunks of the SAME document — went
 * through in the same minutes. That is not a failure that repeats.
 *
 * Deliberately narrow:
 *   - Server-side 5xx, explicit overload, and a dead connection. A 4xx is this
 *     request being wrong and will be wrong again.
 *   - A timeout is excluded by name, whatever status it carries with it. It
 *     is the one failure whose retry cost is the full budget over again.
 *   - Anything already classified systematic never reaches here.
 */
const TRANSIENT_PATTERNS = [
  // Word-anchored: without \b, /50[0234]/ also matches a token count like
  // "15002 input tokens" that happens to appear in an error message.
  /\b50[0234]\b/,
  /\b529\b/,
  /internal server error/i,
  /overloaded_error|\boverloaded\b/i,
  /\bapi_error\b/i,
  /bad gateway|service unavailable/i,
  // The network layer, which the first version of this list missed entirely
  // (2026-09-16): a Proyectos Estratégicos scan died with the SDK's bare
  // "Connection error." and was not retried. A dead socket is the MOST
  // obviously transient failure there is — nothing was answered, and the
  // request may never have reached the server at all. It is also the failure
  // these documents invite: a 90MB PDF is ~120MB of base64 on one connection.
  //
  // "terminated" is undici's wording when a response stream dies mid-flight;
  // it cost a 33-notice DOF import once already (dof-notice-detail.ts).
  /connection error/i,
  /ECONNRESET|ECONNREFUSED|EPIPE|ENETUNREACH|ENOTFOUND|EAI_AGAIN/,
  /socket hang up/i,
  /fetch failed/i,
  /\bterminated\b/i,
];

const NEVER_TRANSIENT = /timed?\s*out|timeout|ETIMEDOUT|aborted/i;

/**
 * Output the model got slightly wrong, on a request that was fine.
 *
 * Only the manual-JSON path can produce these: Claude's structured outputs are
 * enforced server-side, so a response there is valid by construction. On
 * DashScope the model writes the JSON itself, and 2026-09-16 produced three in
 * one run — two where a stray ASCII quote inside a Chinese sentence closed a
 * string early ("文件“ASPECTOS PARTICULARES"章节"), one where an object was
 * closed and then continued with more properties.
 *
 * None of that is a property of the document or of this code. It is one
 * sampling of a model that usually gets it right, which makes it exactly as
 * retriable as a 500 — and a retry is far better than the alternatives, which
 * are writing a JSON repairer or losing the document.
 *
 * "No JSON object found" is deliberately NOT here: it stays systematic. A
 * response with no JSON at all means the prompt or the provider配置 is wrong,
 * and every document would do the same.
 */
const MALFORMED_OUTPUT_PATTERNS = [
  /in JSON at position \d+/i,
  /Unexpected token .* in JSON/i,
  /Unexpected end of JSON input/i,
  /Expected (?:',' or|double-quoted property name)/i,
];

export function isMalformedModelOutput(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/no json object found in response/i.test(message)) return false;
  if (isValueOnlySchemaFailure(message)) return true;
  return MALFORMED_OUTPUT_PATTERNS.some((pattern) => pattern.test(message));
}

/** Worth sending again exactly once — the provider had a bad second, or the model's own output slipped. */
export function isRetriableExtractionFailure(err: unknown): boolean {
  return isTransientServerError(err) || isMalformedModelOutput(err);
}

export function isTransientServerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (NEVER_TRANSIENT.test(message)) return false;
  if (classifyExtractionFailure(err).kind === "systematic") return false;
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

export function shouldAbortBatch(state: { consecutiveFailures: number; anySucceeded: boolean }): boolean {
  return !state.anySucceeded && state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/**
 * Marks an error as "already diagnosed as systematic, stop the batch" as
 * it travels up from one file's extraction, through one tender's
 * analysis, to the folder-level loop — which has no other way to tell a
 * batch-ending failure from an ordinary one-tender failure.
 */
export const SYSTEMATIC_FAILURE_PREFIX = "【系统性错误，已中止】";

export function isSystematicFailureError(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).startsWith(SYSTEMATIC_FAILURE_PREFIX);
}

/**
 * Wall-clock ceiling for one batch run.
 *
 * The per-call bounds in extract-requirements.ts cap a single model call;
 * this caps the run. Both exist because they fail differently: a call that
 * hangs is bounded by its own timeout, while a run of documents that are
 * each merely slow is bounded by nothing at all — which is how a batch
 * reached 31 minutes on 2026-09-13 and returned nothing.
 *
 * Checked BETWEEN tenders, never mid-call: interrupting a call already paid
 * for would throw away the result and the money both. So the real ceiling is
 * this budget plus however long the last tender takes — stated here rather
 * than pretended away.
 *
 * An hour, not the 20 minutes first written here. A single flagship
 * document is allowed up to 40 minutes by itself (requestOptions() in
 * extract-requirements.ts scales with the tier's page cap), and a budget
 * that cannot fit one legitimate document is a budget that punishes big
 * tenders for being big. What actually protects against waste is elsewhere
 * and is cheaper: retries are 0, so nothing is attempted three times, and
 * two consecutive failures end the run. This is only a runaway guard.
 */
export const BATCH_BUDGET_MS = 60 * 60 * 1000;

export function batchBudgetExhausted(startedAt: number, now: number = Date.now()): boolean {
  return now - startedAt >= BATCH_BUDGET_MS;
}

/**
 * How many tenders a batch analyses at once.
 *
 * Measured 2026-09-14: a document's model call is ~99s, nearly all of it
 * spent waiting on the provider rather than working this machine. Strictly
 * sequential, 66 Peru documents is over two hours of idle waiting; at this
 * width it is closer to half an hour.
 *
 * Four, not forty. Each worker holds a tender's files in memory and shells
 * out to poppler, and DashScope is a shared rate limit whose 429s would
 * arrive as per-document failures — a width that turns one slow provider
 * into a thundering herd trades a real speedup for a batch that fails.
 */
export const ANALYSIS_CONCURRENCY = 4;
