/**
 * Telling "our own container refused to let this request out" apart from
 * "the source refused us".
 *
 * ── Why this file exists (2026-09-24) ─────────────────────────────────────
 *
 * The Chile probe's first four requests came back `403 Forbidden`. Every
 * instinct in this repo — and every comment in peru-oece-live.ts — reads a
 * 403 on a Latin American government host as a WAF: wrong User-Agent, or a
 * datacenter IP range the operator denies. Both of those are facts about the
 * SOURCE, and both have a next step.
 *
 * It was neither. The 403 was manufactured by the egress proxy of the
 * container this code was running in, which never opened a socket to Chile at
 * all:
 *
 *     HTTP/1.1 403
 *     content-type: text/plain
 *     x-deny-reason: host_not_allowed
 *
 *     Host not in allowlist: api.mercadopublico.cl.
 *     Add this host to your network egress settings to allow access.
 *
 * `pncp.gov.br` and `contratacionesabiertas.oece.gob.pe` — two hosts this
 * platform imports from in production every day — return the identical 403
 * from here. So the status code says nothing whatsoever about Chile, and a
 * report that counted it as "Chile refused us" would be a measurement of the
 * sandbox wearing a measurement of Chile's costume.
 *
 * That is precisely the collapse README.md's house rule forbids: unreachable
 * ≠ empty ≠ not-yet-published, and this adds a fourth state that looks like
 * the first three — *not even asked*.
 *
 * ── Why it is a shared helper and not a line in the probe ──────────────────
 *
 * Because the existing connectors have the same blind spot, and the cost of
 * it is asymmetric. `oeceError()` would render this denial as
 * 「OECE /files responded 403 Forbidden — 服务端返回：Host not in allowlist…」
 * and then append `whereAmI()`, which on a non-Vercel machine says
 * 「如果同一台机器上 npm run ingest:peru-live 能跑通，问题就不在 IP」 —
 * advice that cannot work, because the command it recommends is refused by
 * the same proxy. The body is at least printed there, so a careful reader
 * could spot it; a hurried one would not.
 *
 * Deliberately NOT wired into those connectors in this pass. They are live
 * import paths for a product with paying users, and this is a new source's
 * branch — a shared helper that the Chile probe proves out is the honest
 * order to do it in. See README.md's 2026-09-24 section for the recommendation.
 */

/**
 * The response header the gateway stamps on its own refusals.
 *
 * Matched on the header rather than on the body text, because the header is
 * machine-set and the sentence is English prose that could be reworded. The
 * body check below is the fallback, not the primary.
 */
const DENY_REASON_HEADER = "x-deny-reason";

/**
 * The body, for the case where a proxy strips response headers.
 *
 * Anchored on "not in allowlist" rather than on the host name, so it matches
 * for any denied host and not only the one it was captured from. Kept
 * narrow on purpose: "Access Denied" alone belongs in block-page.ts, where a
 * SOURCE's refusal is what is being detected — conflating the two here would
 * reintroduce the exact confusion this file exists to remove.
 */
const DENY_BODY = /not in allowlist|egress settings to allow access/i;

export type EgressDenial = {
  /** The hostname the gateway refused, when it named one. */
  host: string | null;
  /** The gateway's own reason code, e.g. `host_not_allowed`. */
  reason: string | null;
};

/**
 * Non-null when THIS container's network policy refused the request, so no
 * packet ever reached the source.
 *
 * @param status the HTTP status as received — the gateway uses 403, which is
 *   also what a real WAF uses. The status alone is never sufficient, which is
 *   why it is not checked here at all: the header and body are the evidence.
 */
export function egressDenial(headers: Headers, body: string): EgressDenial | null {
  const reason = headers.get(DENY_REASON_HEADER);
  const denied = reason !== null || DENY_BODY.test(body);
  if (!denied) return null;
  // The gateway names the host in its message. Read out rather than passed
  // in, so the value reported is the one the gateway actually refused —
  // which can differ from the URL's host after a redirect.
  const host = /Host not in allowlist:\s*([^\s.]+(?:\.[^\s.]+)*)/i.exec(body)?.[1]?.replace(/\.$/, "") ?? null;
  return { host, reason };
}

/**
 * The line a report prints for a denied host.
 *
 * Says "environment", names the setting the operator changes, and says what
 * the request did NOT establish — the last part being the whole point. A
 * reader who takes "403" from this report and writes a WAF workaround has
 * been misled by it.
 */
export function describeEgressDenial(denial: EgressDenial): string {
  return (
    `本容器的网络策略拦下的，不是对方拒绝的${denial.host ? `（被拦的域名：${denial.host}）` : ""}` +
    `${denial.reason ? `　网关给的原因码：${denial.reason}` : ""} —— ` +
    "请求根本没发出去，所以这条对「智利那边有没有数据」一个字都没说明。" +
    "要放行得改环境的 Network access 设置（允许的域名清单）。"
  );
}
