/**
 * "fetch failed" is not a diagnosis.
 *
 * Node's fetch reports every transport-level problem as the same five
 * characters — DNS failure, TLS rejection, connection reset, connect timeout,
 * a proxy refusing a tunnel — and puts the actual reason in `err.cause`,
 * which nothing prints unless you ask. On 2026-09-18 that cost a round trip:
 * `pncp.gov.br/api/search` was reported as `连接失败 fetch failed` in a probe
 * whose entire job was to find out WHY one PNCP path works and another does
 * not, while the answer sat one property deep in the error it had caught.
 *
 * Same lesson as the UnhandledPromiseRejection earlier in this project, where
 * the real message turned out to be "Host not in allowlist": an error that
 * has been generalised before it is printed is worse than no error, because
 * it looks like a finding.
 *
 * `cause` can itself be an AggregateError — one entry per address the
 * resolver tried, typically IPv6 then IPv4 — so the common "worked in the
 * browser, ECONNREFUSED here" case only shows up if the nested errors are
 * unwrapped too.
 */
function oneLine(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const errno = err as unknown as { address?: string; port?: number };
    const where = errno.address ? ` ${errno.address}${errno.port ? `:${errno.port}` : ""}` : "";
    return `${code ? `${code} ` : ""}${err.message}${where}`.trim();
  }
  return String(err);
}

/** The message, plus every nested `cause` — which is where the real reason lives. */
export function describeFetchFailure(err: unknown, maxDepth = 4): string {
  const parts: string[] = [oneLine(err)];
  let current: unknown = err;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const cause = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
    if (cause === undefined || cause === null) break;
    // An AggregateError holds one error per attempted address; the first two
    // are what distinguish "no route to this host" from "this host said no".
    const nested = cause instanceof AggregateError ? cause.errors.slice(0, 2).map(oneLine).join(" / ") : oneLine(cause);
    if (nested && !parts.includes(nested)) parts.push(nested);
    current = cause;
  }
  return parts.filter(Boolean).join(" ← ");
}
