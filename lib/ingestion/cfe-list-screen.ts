import type { TenderRelevanceTier } from "@/types/tender";
import { classifyCfeRelevance } from "@/lib/relevance-cfe";

/**
 * 「CFE 列表初筛」, the first layer before 「CFE 网站粘贴导入」 (user,
 * 2026-10-06: 帮我增加CFE的第一层筛选和识别，我复制以下信息，告诉我哪些值得进一步).
 * The admin copies the search results of CFE's micrositio (Procedimientos
 * Encontrados …) and pastes them; each row is judged from its list columns
 * alone — CFE's own rules (lib/relevance-cfe.ts) on the description and the
 * procedure number — so only the rows worth opening are opened and pasted
 * into the detail import. Nothing is written and nothing is fetched.
 *
 * A row as the page copies:
 *
 *   CFE-0001-CAAAT-0163-2026<TAB>
 *   NO
 *   Ciudad de México<TAB>Adquisición de Conductores…<TAB>Concurso abierto<TAB>Adquisición por Abastecimientos<TAB>02-10-2026<TAB>Vigente<TAB><TAB>$0.00<TAB>
 *
 * The columns are Testigo Social, Entidad Federativa, Descripción, Tipo de
 * procedimiento, Tipo contratación, Fecha Publicación, Estado, Adjudicado A,
 * Monto Adjudicado. Read around the date, which is the one fixed-shape cell,
 * so a line break inside the description does not shift the rest.
 */

export type CfeListRow = {
  number: string;
  state?: string;
  description: string;
  procedureType: string;
  contractType: string;
  /** "02-10-2026" as listed. */
  published: string;
  status: string;
};

/** What the screen says about a row. "open" is the one worth opening. */
export type CfeListVerdict = "open" | "excluded" | "direct_award" | "not_current";

export type CfeListScreenRow = CfeListRow & {
  verdict: CfeListVerdict;
  tier?: TenderRelevanceTier;
  reasonZh: string;
  /** Already on the platform (from the DOF or an earlier paste) — its slug. */
  existingSlug?: string;
};

export type CfeListScreenResponse = { rows: CfeListScreenRow[]; total: number };

const NUMBER = /^(CFE-\d{4}-[A-Z]{5}-\d{4}-\d{4})\b/;
const DATE = /^\d{2}-\d{2}-\d{4}$/;

export function parseCfeListPaste(text: string): CfeListRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: { number: string; cells: string[] }[] = [];
  for (const line of lines) {
    const match = NUMBER.exec(line.trim());
    if (match) {
      blocks.push({ number: match[1], cells: line.trim().slice(match[1].length).split("\t") });
      continue;
    }
    blocks.at(-1)?.cells.push(...line.split("\t"));
  }

  const rows: CfeListRow[] = [];
  const seen = new Set<string>();
  for (const { number, cells } of blocks) {
    const filled = cells.map((cell) => cell.trim()).filter(Boolean);
    const at = filled.findIndex((cell) => DATE.test(cell));
    // Before the date: [Testigo Social], Entidad, Descripción…, Tipo de procedimiento, Tipo contratación.
    if (at < 3 || seen.has(number)) continue;
    const before = filled.slice(0, at);
    if (/^(si|sí|no)$/i.test(before[0] ?? "")) before.shift();
    if (before.length < 3) continue;
    const contractType = before.pop()!;
    const procedureType = before.pop()!;
    const state = before.length > 1 ? before.shift() : undefined;
    seen.add(number);
    rows.push({
      number,
      ...(state ? { state } : {}),
      description: before.join(" "),
      procedureType,
      contractType,
      published: filled[at],
      status: filled[at + 1] ?? "",
    });
  }
  return rows;
}

export function screenCfeListRow(row: CfeListRow, existingSlug?: string): CfeListScreenRow {
  const base = { ...row, ...(existingSlug ? { existingSlug } : {}) };
  if (!/^vigente$/i.test(row.status)) {
    return { ...base, verdict: "not_current", reasonZh: `状态是「${row.status || "未注明"}」，不在招标中。` };
  }
  if (/adjudicaci[oó]n directa/i.test(row.procedureType) || /^CFE-\d{4}-AD/.test(row.number)) {
    return { ...base, verdict: "direct_award", reasonZh: "直接授标（Adjudicación directa），不是公开招标。" };
  }
  const relevance = classifyCfeRelevance({ title: row.description, tenderNumber: row.number });
  return {
    ...base,
    verdict: relevance.tier === "excluded" ? "excluded" : "open",
    tier: relevance.tier,
    reasonZh: relevance.reason.zh,
  };
}
