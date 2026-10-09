import type { TenderRelevanceTier } from "@/types/tender";
import { classifyStoredTender } from "@/lib/relevance";
import { BOLIVIA, BOLIVIA_SICOES_SOURCE_NAME, boliviaGovernmentLevel, boliviaScopeType, boliviaTime } from "@/lib/ingestion/bolivia-sicoes-paste";

/**
 * 「SICOES 列表初筛」, the first layer before 「SICOES 粘贴导入」 (user,
 * 2026-10-09: 能不能也做成两层？… 但是我会贴好几页). The admin copies SICOES's
 * Convocatorias results — several pages, one after another — and pastes
 * them; each row is judged from its list columns alone, so only the rows
 * worth opening are opened (Ver Ficha) and pasted into the detail import.
 * Nothing is written and nothing is fetched.
 *
 * A row as the page copies: the CUCE starts a line and the list columns
 * follow it, tab-separated —
 *
 *   26-1704-00-1694954-1-1<TAB>Gobierno Autonomo Municipal De La Guardia<TAB>Obras<TAB>LP<TAB>Const. …<TAB>Si<TAB>09/10/2026<TAB>03/11/2026<TAB>Vigente<TAB>Documento Base de Contratacion
 *
 * then one line per published file and 「Ver Ficha」. Entidad, Tipo de
 * contratación, Modalidad, Objeto, Subasta, Fecha publicación, Fecha
 * presentación, Estado. Headers, search forms and pagers between pages are
 * ignored. The list shows no amount: the admin's search (Monto from
 * Bs 7,000,000) does that part, and the Ficha has the exact price.
 */

export type BoliviaListRow = {
  cuce: string;
  entity: string;
  contractType: string;
  modality: string;
  object: string;
  subasta: string;
  published: string;
  /** "03/11/2026" as listed; empty for a direct award. */
  submission: string;
  status: string;
};

export type BoliviaListVerdict = "open" | "excluded" | "small_or_direct" | "not_current" | "closed";

export type BoliviaListScreenRow = BoliviaListRow & {
  verdict: BoliviaListVerdict;
  tier?: TenderRelevanceTier;
  reasonZh: string;
  /** Already on the platform under this CUCE — its slug. */
  existingSlug?: string;
  /** Otras modalidades: usually a lender's procedure (World Bank, IDB …). */
  lenderProcedure?: true;
};

export type BoliviaListScreenResponse = { rows: BoliviaListScreenRow[]; total: number };

const CUCE_START = /^\s*(\d{2}-\d{4}-\d{2}-\d{5,8}-\d+-[0-9A-Z]+)\t/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

export function parseBoliviaListPaste(text: string): BoliviaListRow[] {
  const rows = new Map<string, BoliviaListRow>();
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const match = CUCE_START.exec(line);
    if (!match) continue;
    const cells = line.slice(match[0].length).split("\t").map((cell) => cell.trim());
    // Entidad, Tipo, Modalidad, Objeto, Subasta, Publicación, Presentación, Estado
    const [entity, contractType, modality, object, subasta, published, submission, status] = cells;
    if (!entity || !object || !DATE.test(published ?? "")) continue;
    rows.set(match[1], {
      cuce: match[1],
      entity,
      contractType: contractType ?? "",
      modality: modality ?? "",
      object: object.replace(/^[\s"“”']+|[\s"“”']+$/g, ""),
      subasta: subasta ?? "",
      published,
      submission: DATE.test(submission ?? "") ? submission : "",
      status: status ?? "",
    });
  }
  return [...rows.values()];
}

/**
 * SICOES's modalities that are never an open call worth a Ficha: direct
 * awards and exceptions, minor purchases, and ANPE (Apoyo Nacional a la
 * Producción y Empleo — up to Bs 1M, far under the US$1M floor).
 */
const SMALL_OR_DIRECT: ReadonlyArray<[RegExp, string]> = [
  [/^CD$/i, "直接采购（Contratación Directa），不是公开招标。"],
  [/^(EX|CE)$/i, "例外采购（Excepción），不是公开招标。"],
  [/^EM$/i, "紧急采购（Emergencia），不是公开招标。"],
  [/^CM$/i, "小额采购（Contratación Menor），金额远低于 100 万美元。"],
  [/^ANP/i, "ANPE 方式（Apoyo Nacional a la Producción y Empleo），上限约 100 万 Bs，远低于 100 万美元门槛。"],
];

export function screenBoliviaListRow(row: BoliviaListRow, now: Date, existingSlug?: string): BoliviaListScreenRow {
  const lender = /^OF$/i.test(row.modality);
  const base = { ...row, ...(existingSlug ? { existingSlug } : {}), ...(lender ? { lenderProcedure: true as const } : {}) };
  if (!/^vigente$/i.test(row.status)) return { ...base, verdict: "not_current", reasonZh: `状态是「${row.status || "未注明"}」，不在招标中。` };
  for (const [pattern, reasonZh] of SMALL_OR_DIRECT) if (pattern.test(row.modality)) return { ...base, verdict: "small_or_direct", reasonZh };
  const deadline = boliviaTime(row.submission, "23:59");
  if (deadline && Date.parse(deadline) < now.getTime()) return { ...base, verdict: "closed", reasonZh: `交标截止日 ${row.submission} 已过。` };

  const scopeType = boliviaScopeType(row.contractType);
  // No amount in the list: the title, buyer and kind decide, and an amount-only verdict waits for the Ficha.
  const { relevance } = classifyStoredTender({
    title: row.object,
    summary: row.object,
    buyer: row.entity,
    country: BOLIVIA,
    governmentLevel: boliviaGovernmentLevel(row.entity),
    scopeType,
    procedureType: lender ? "Otras modalidades" : "Licitación Pública",
    tenderNumber: row.cuce,
    sourceName: BOLIVIA_SICOES_SOURCE_NAME,
  });
  if (relevance.tier === "excluded" && !/金额|预估金额|未注明金额|没有金额/.test(relevance.reason.zh)) {
    return { ...base, verdict: "excluded", tier: relevance.tier, reasonZh: relevance.reason.zh };
  }
  return {
    ...base,
    verdict: "open",
    reasonZh: lender ? "其他方式（多为世界银行、美洲开发银行等出资的项目），值得打开详情。" : "公开招标，列表上看不出金额，打开详情看参考价。",
  };
}
