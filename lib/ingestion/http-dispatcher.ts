/**
 * Makes Node's own HTTP timeouts stop being an invisible second ceiling on
 * top of the Anthropic SDK's.
 *
 * Measured 2026-09-13 on peru-...-1248966 (30 pages of a real Peru bases
 * PDF, DashScope): `模型调用耗时 304.8s`, then "Request timed out" — with the
 * SDK timeout set to 30 minutes. 304.8s is not 30 minutes. It is Node's
 * built-in `fetch` (undici) hitting its own default `headersTimeout` of
 * **300 seconds**. The run before it, 609.0s, was that same 300s ceiling hit
 * twice, because `maxRetries` was still 1 at the time. Two failures, one
 * cause, and neither number came from anything this code had set.
 *
 * Worse than the ceiling itself is what it hides: `headersTimeout` measures
 * time until the first response HEADER. A genuinely streaming endpoint sends
 * headers immediately, so this limit would never fire — which means the
 * endpoint is buffering the whole answer before replying, and "streaming"
 * is doing nothing here. That is a real finding about the provider, not a
 * setting, so this file does not try to paper over it: it removes Node's
 * surprise ceiling and leaves ONE authority over how long a call may take —
 * the SDK's own `timeout`, which is deliberate, page-scaled and documented
 * (requestOptions() in extract-requirements.ts).
 *
 * Why the undici Agent is reached this way rather than imported: `undici`
 * is not a dependency of this project, and adding one purely to raise a
 * timeout is a poor trade. Node's global dispatcher already IS an undici
 * Agent, so its constructor is the same class an import would give. That
 * does rely on a Node internal, so every step below is guarded and any
 * failure returns `undefined` — the caller then simply gets the default
 * behaviour it had before, never a crash. Verified against a local server
 * that withholds headers: a custom dispatcher is genuinely honoured by
 * `fetch` (a deliberately short one failed on cue with
 * UND_ERR_HEADERS_TIMEOUT), and raising it lets the slow response through.
 */

type UndiciAgentOptions = { headersTimeout: number; bodyTimeout: number };
type Dispatcher = object;

const GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const cache = new Map<number, Dispatcher | null>();

/**
 * A dispatcher whose header/body timeouts match `timeoutMs`, so Node never
 * gives up before the SDK does. Returns undefined when the internals are
 * not shaped as expected (a future Node), leaving the defaults in place.
 */
export function dispatcherForTimeout(timeoutMs: number): Dispatcher | undefined {
  const cached = cache.get(timeoutMs);
  if (cached !== undefined) return cached ?? undefined;

  const built = build(timeoutMs);
  cache.set(timeoutMs, built ?? null);
  return built;
}

function build(timeoutMs: number): Dispatcher | undefined {
  try {
    const existing = (globalThis as Record<symbol, unknown>)[GLOBAL_DISPATCHER];
    // Only populated once fetch has run at least once in this process. Before
    // that there is nothing to read the class off, and undefined is correct:
    // the very first call keeps Node's defaults, every later one is raised.
    const AgentClass = existing?.constructor as (new (opts: UndiciAgentOptions) => Dispatcher) | undefined;
    if (typeof AgentClass !== "function") return undefined;

    const agent = new AgentClass({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
    return typeof (agent as { dispatch?: unknown }).dispatch === "function" ? agent : undefined;
  } catch {
    return undefined;
  }
}
