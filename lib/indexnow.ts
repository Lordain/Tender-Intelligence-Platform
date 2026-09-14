/**
 * IndexNow — telling Bing (and therefore ChatGPT and Copilot) that a page
 * exists, on the day it starts existing.
 *
 * Why this and not just the sitemap: Google Search Console covers Google, and
 * Google alone. Bing's index is what ChatGPT, Copilot and a meaningful part of
 * Perplexity's retrieval read from, so a site that only ever told Google about
 * itself is invisible to every assistant a customer might ask "拉美有哪些政府
 * 招标项目". IndexNow is the push channel Bing offers for that, and it is a
 * plain HTTP POST — no SDK, no account binding, no rate plan.
 *
 * OWNERSHIP IS THE KEY FILE, NOT AN ACCOUNT. The protocol proves control of
 * the domain by asking for a file at the site root whose NAME is the key and
 * whose CONTENT is the same key. That is why the key is a plain constant here
 * rather than an environment variable: it is served publicly at
 * /<key>.txt by design, so hiding it would buy nothing and would only let the
 * constant and the file drift apart. Both must change together — see
 * scripts/ping-indexnow.ts, which refuses to submit unless the live file
 * agrees with this value.
 */
export const INDEXNOW_KEY = "fe45057c859db5d56687a22fb9578d6c";

/** Where the key file is served. Root of the host, per the protocol. */
export function indexNowKeyPath(): string {
  return `/${INDEXNOW_KEY}.txt`;
}

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The protocol's own ceiling for a single request. */
const MAX_URLS_PER_REQUEST = 10_000;

export type IndexNowResult = {
  submitted: number;
  status: number;
  /** Bing answers 200 or 202 on success; anything else carries a reason worth printing. */
  ok: boolean;
  body: string;
};

/**
 * Submits absolute URLs, all of which must be on `origin`'s host — the
 * protocol rejects a batch that mixes hosts, and silently ignoring that would
 * turn a typo into "IndexNow says everything is fine and nothing is indexed".
 */
export async function submitToIndexNow(origin: string, urls: readonly string[]): Promise<IndexNowResult> {
  const host = new URL(origin).host;
  const foreign = urls.filter((url) => new URL(url).host !== host);
  if (foreign.length > 0) {
    throw new Error(`IndexNow 只能提交 ${host} 的地址，收到了 ${foreign.length} 个别的域名，例如 ${foreign[0]}`);
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`一次最多提交 ${MAX_URLS_PER_REQUEST} 个地址，收到 ${urls.length} 个`);
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${origin}${indexNowKeyPath()}`,
      urlList: [...urls],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  // Read the body inside the same await chain as the response — an undici
  // stream that dies during .text() throws a bare "terminated", which cost a
  // 33-notice DOF import once already (lib/ingestion/connectors/dof-notice-detail.ts).
  let body = "";
  try {
    body = (await response.text()).trim();
  } catch {
    body = "(读取响应失败)";
  }

  return {
    submitted: urls.length,
    status: response.status,
    ok: response.status === 200 || response.status === 202,
    body,
  };
}
