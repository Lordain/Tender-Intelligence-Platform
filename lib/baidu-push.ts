/**
 * Baidu 普通收录 API — the push channel for the search engine most of this
 * site's readers use, and the one IndexNow does not reach (Baidu is not an
 * IndexNow member; Bing, Yandex, Seznam and Naver are).
 *
 * Unlike IndexNow this needs an account: the site must first be verified in
 * 百度搜索资源平台, which then issues a per-site token (资源提交 → API提交).
 * The token is a credential, so it lives in the BAIDU_PUSH_TOKEN secret and
 * is never printed.
 *
 * The endpoint is the documented http:// one. Each site gets a small daily
 * quota (single digits to a few dozen for a new site) and a batch that
 * exceeds what is left is refused whole with "over quota" — which is why the
 * caller orders its URLs by importance and trims to a limit before sending.
 */
const ENDPOINT = "http://data.zz.baidu.com/urls";

export type BaiduPushResult = {
  ok: boolean;
  status: number;
  /** URLs Baidu accepted. */
  success?: number;
  /** Quota left for today, as Baidu reports it. */
  remain?: number;
  overQuota: boolean;
  /** Baidu's own message on failure. */
  message?: string;
  notSameSite?: string[];
  notValid?: string[];
};

export async function submitToBaidu(origin: string, token: string, urls: readonly string[]): Promise<BaiduPushResult> {
  const host = new URL(origin).host;
  const foreign = urls.filter((url) => new URL(url).host !== host);
  if (foreign.length > 0) {
    throw new Error(`百度推送只能提交 ${host} 的地址，收到了 ${foreign.length} 个别的域名，例如 ${foreign[0]}`);
  }

  const endpoint = `${ENDPOINT}?site=${encodeURIComponent(origin)}&token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: urls.join("\n"),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: number;
    remain?: number;
    error?: number;
    message?: string;
    not_same_site?: string[];
    not_valid?: string[];
  };
  const message = body.message;
  return {
    ok: response.ok && body.error === undefined,
    status: response.status,
    ...(body.success !== undefined ? { success: body.success } : {}),
    ...(body.remain !== undefined ? { remain: body.remain } : {}),
    overQuota: /over quota/i.test(message ?? ""),
    ...(message ? { message } : {}),
    ...(body.not_same_site?.length ? { notSameSite: body.not_same_site } : {}),
    ...(body.not_valid?.length ? { notValid: body.not_valid } : {}),
  };
}
