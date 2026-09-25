/**
 * The two kinds of link a Colombian (SECOP II) tender can carry as its
 * sourceUrl, and how to tell them apart without a network call.
 *
 * A process still in SECOP's "Borrador" state publishes no public page: its
 * `urlproceso` is the bare SECOP login screen, so mapSecopRowToTender stores
 * the datos.gov.co API row instead (2026-09-05). Measured 2026-09-25: 87 of
 * 96 Borrador rows are like this; 1,000 of 1,000 Publicado/Abierto rows have
 * a real OpportunityDetail page. The row stops matching here once SECOP
 * publishes and the daily Colombia refresh rewrites sourceUrl.
 *
 * No `server-only`: the 待补文件 view uses the predicate client-side to pick
 * between its 官方入口 link and its 官方文件 list.
 */
const SECOP_PROCESS_API_PREFIX = "https://www.datos.gov.co/resource/p6dx-8zbt.json?id_del_proceso=";

/** SECOP II's own process id, "CO1.REQ.<digits>". */
export const SECOP_PROCESS_ID = /^CO1\.REQ\.\d+$/;

/** The fallback sourceUrl for a process with no public SECOP page. */
export function secopProcessApiUrl(idDelProceso: string | undefined): string {
  return `${SECOP_PROCESS_API_PREFIX}${idDelProceso}`;
}

/** The process id when `sourceUrl` is that fallback — i.e. there is no official page to open — else undefined. */
export function secopProcessIdWithoutOfficialPage(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl?.startsWith(SECOP_PROCESS_API_PREFIX)) return undefined;
  const id = sourceUrl.slice(SECOP_PROCESS_API_PREFIX.length).trim();
  return SECOP_PROCESS_ID.test(id) ? id : undefined;
}
