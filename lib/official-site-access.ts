/**
 * A line under 官方正式投标入口 for official sites a reader in China often
 * cannot open at all.
 *
 * COMPR.AR and CONTRAT.AR (Argentina) time out from mainland China — the user
 * got ERR_CONNECTION_TIMED_OUT on comprar.gob.ar, 2026-09-29 — and drop
 * connections from other foreign networks too, while an Argentine or other
 * South American network opens them. Keyed on the tender's link, not its
 * country: ADIF and the Boletín Oficial are separate sites.
 */
const SLOW_FROM_ABROAD = new Set(["comprar.gob.ar", "contratar.gob.ar"]);

export function officialSiteAccessNote(tender: { sourceUrl: string }): string | null {
  let host: string;
  try {
    host = new URL(tender.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!SLOW_FROM_ABROAD.has(host)) return null;
  const site = host === "comprar.gob.ar" ? "COMPR.AR" : "CONTRAT.AR";
  return `${site}（${host}）从中国大陆访问经常超时或打不开。如果出现「无法访问此网站」，请切换到阿根廷或其他南美洲节点的网络（VPN）后再打开官方入口。项目页上 Anexos、Cláusulas particulares、Circulares 等栏目的下载图标即是标书文件，无需登录即可下载。`;
}
