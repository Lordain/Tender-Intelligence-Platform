import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenderStatus } from "@/types/tender";
import { fetchLicitacionEstatuses } from "@/lib/ingestion/connectors/licitia-connector";
import { inferStatus as comprasMxEstatusStatus } from "@/lib/ingestion/compras-mx-open-tenders-mapper";
import { refreshStoredStatuses, type ObservedStatus, type StatusRefreshResult } from "@/lib/ingestion/status-refresh";

/** Both names the Compras MX rows are stored under: LicitIA discovery and the manual Difusión export. */
export const COMPRAS_MX_SOURCE_NAMES = ["Compras MX", "Compras MX — Difusión de procedimientos (exportación pública)"];

/**
 * A Compras MX estatus as a status, for the refresh only — or undefined when
 * the word is not one the platform knows. comprasMxEstatusStatus() (the
 * import's rule) defaults an unknown word to "open", which is right for an
 * import of the vigentes tab and wrong here: telling a stored tender it is
 * open again on a word nobody recognised would undo a real closure.
 */
export function comprasMxRefreshStatus(estatus: string, seccion: string): TenderStatus | undefined {
  const normalized = estatus.toUpperCase().trim();
  const status = comprasMxEstatusStatus(normalized);
  if (status !== "open") return status;
  if (normalized === "VIGENTE" || normalized === "PENDIENTE DE APERTURA") return "open";
  // The section says where an unknown word sits. "seguimiento" is LicitIA's
  // bucket for procedures past their bid opening and not yet concluded
  // ("POR EVALUAR" was the one such word on 2026-09-26): bids are closed.
  // An unknown word in "concluido" says the procedure is over but not how —
  // no reading rather than a guess at which ending.
  if (seccion === "vigente") return "open";
  if (seccion === "seguimiento") return "submission_closed";
  return undefined;
}

/**
 * Every Compras MX tender stored here that has not already ended, checked
 * against LicitIA's corpus (which carries every procedure since 2022 in every
 * section, not only the open ones the daily discovery keeps): 暂停中 on
 * SUSPENDIDO, back to 招标中 when it is vigente again, 流标 / 已取消 /
 * 已中标 when it ends (user, 2026-09-26: 自动&手动，刷新标书状态).
 */
export async function refreshComprasMxStatuses(
  supabase: SupabaseClient,
  options: { write: boolean },
  onProgress?: (message: string) => void,
): Promise<StatusRefreshResult & { checked: number; notInCorpus: number; unknownEstatus: string[] }> {
  const stored: { slug: string; tender_number: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number")
      .in("source_name", COMPRAS_MX_SOURCE_NAMES)
      .not("status", "in", "(awarded,cancelled,deserted)")
      .order("slug", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`读取已入库的墨西哥 Compras MX 项目失败：${error.message}`);
    stored.push(...((data ?? []) as typeof stored));
    if ((data ?? []).length < 1000) break;
  }

  const numbers = new Set(stored.map((row) => row.tender_number.toUpperCase()));
  const estatuses = await fetchLicitacionEstatuses(numbers, (lote, total) => {
    if (lote === 0 || (lote + 1) % 5 === 0) onProgress?.(`LicitIA 全量数据 ${lote + 1}/${total}`);
  });

  const observed: ObservedStatus[] = [];
  const unknownEstatus = new Set<string>();
  let notInCorpus = 0;
  for (const row of stored) {
    const entry = estatuses.get(row.tender_number.toUpperCase());
    if (!entry) {
      notInCorpus += 1;
      continue;
    }
    const status = comprasMxRefreshStatus(entry.estatus, entry.seccion);
    if (status) observed.push({ slug: row.slug, status });
    else unknownEstatus.add(`${entry.seccion}/${entry.estatus}`);
  }

  const result = await refreshStoredStatuses(supabase, observed, { write: options.write });
  return { ...result, checked: stored.length, notInCorpus, unknownEstatus: [...unknownEstatus] };
}
