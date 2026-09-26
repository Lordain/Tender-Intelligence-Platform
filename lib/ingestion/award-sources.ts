import type { SupabaseClient } from "@supabase/supabase-js";
import {
  combineAwardParts,
  listAwardCandidates,
  writeAwardResults,
  type AwardCandidate,
  type AwardObservation,
  type AwardPart,
  type AwardRefreshResult,
} from "@/lib/ingestion/award-results";
import { fetchLicitacionAwards } from "@/lib/ingestion/connectors/licitia-connector";
import { fetchPncpAwardLines, fetchPncpCompra } from "@/lib/ingestion/connectors/brazil-pncp-live";
import { fetchChileOcdsAwards } from "@/lib/ingestion/connectors/chile-ocds-live";
import { fetchSecopAwardedRowsByReference } from "@/lib/ingestion/connectors/colombia-secop-live";
import { fetchOeceRecordsForSegment } from "@/lib/ingestion/connectors/peru-oece-live";
import { downloadOxiExport, OXI_ESTADO_TODOS } from "@/lib/ingestion/connectors/peru-oxi-live";
import { readPeruOxiWorkbook } from "@/lib/ingestion/connectors/peru-oxi-file";
import { mapSecopRowToTender } from "@/lib/ingestion/colombia-mapper";
import { mapOeceRecordToTender } from "@/lib/ingestion/peru-oece-mapper";
import { peruOxiSlug, PERU_OXI_SOURCE_NAME } from "@/lib/ingestion/peru-oxi-mapper";
import { COMPRAS_MX_SOURCE_NAMES } from "@/lib/ingestion/refresh-comprasmx-statuses";
import { BRAZIL_PNCP_SOURCE_NAME } from "@/lib/ingestion/ingest-brazil";
import { CHILE_BUSCA_SOURCE_NAME } from "@/lib/ingestion/chile-busca-mapper";
import { CHILE_SOURCE_NAME } from "@/lib/ingestion/chile-ocds-mapper";
import { PERU_OECE_SOURCE_NAME } from "@/lib/ingestion/ingest-peru";

/**
 * Where each country's 中标结果 comes from (user, 2026-09-26: 看能不能从接口
 * 增加中标结果). Every function here reads only tenders ALREADY stored as
 * 已中标 and missing something, asks the source about exactly those, and
 * hands the answers to writeAwardResults(), which decides what is written.
 *
 *   墨西哥 Compras MX   LicitIA /licitaciones/{numero} → awards[]      日期 供应商 金额
 *   巴西 PNCP           consulta total + itens/{n}/resultados           日期 供应商 金额
 *   智利 Mercado Público OCDS /award/{code}                              日期 供应商 金额
 *   哥伦比亚 SECOP II    Socrata p6dx-8zbt fecha/proveedor/valor adjudicación
 *   秘鲁 OxI            all-states export: Fecha Buena Pro, Monto Adjudicado   (no winner column)
 *   秘鲁 OECE           OCDS compiledRelease.awards[] — CLI only: SEACE refuses
 *                       GitHub's and Vercel's networks (see the README)
 *
 * No source here for PEMEX, CFE (DOF), Proyectos Estratégicos or the company
 * portals (Petronect, Cemig, Codelco, UPME, Petroperú, Metro de Santiago):
 * none of them publishes the award as data. Where they publish it at all it
 * is a fallo / ata document, which is a different job.
 */

export type { AwardSourceId } from "@/lib/ingestion/award-source-labels";

type Progress = (message: string) => void;

/** Consecutive lookups that may fail before the run stops asking — a source refusing every request should cost seconds, not an hour. */
const FAILURE_STREAK_LIMIT = 5;

async function askEach(
  candidates: AwardCandidate[],
  label: string,
  spacingMs: number,
  ask: (row: AwardCandidate) => Promise<AwardObservation | null>,
  onProgress?: Progress,
): Promise<{ observations: AwardObservation[]; notes: string[] }> {
  const observations: AwardObservation[] = [];
  const failures: string[] = [];
  let streak = 0;
  let stopped = false;
  for (const [index, row] of candidates.entries()) {
    if (index > 0 && spacingMs > 0) await new Promise((resolve) => setTimeout(resolve, spacingMs));
    try {
      const observation = await ask(row);
      if (observation) observations.push(observation);
      streak = 0;
    } catch (error) {
      failures.push(`${row.tender_number}：${error instanceof Error ? error.message : String(error)}`);
      streak += 1;
      if (streak >= FAILURE_STREAK_LIMIT) {
        stopped = true;
        break;
      }
    }
    if ((index + 1) % 10 === 0) onProgress?.(`${label} 已查询 ${index + 1}/${candidates.length}`);
  }
  const notes: string[] = [];
  if (failures.length) notes.push(`${failures.length} 条查询失败，例如 ${failures.slice(0, 2).join("；")}`);
  if (stopped) notes.push(`连续 ${FAILURE_STREAK_LIMIT} 条失败，已停止本次查询`);
  return { observations, notes };
}

function hasContent(observation: AwardObservation): boolean {
  return Boolean(observation.awardDate || observation.suppliers.length || observation.amount !== undefined);
}

async function finish(
  supabase: SupabaseClient,
  candidates: AwardCandidate[],
  observations: AwardObservation[],
  notes: string[],
  write: boolean,
): Promise<AwardRefreshResult> {
  const result = await writeAwardResults(supabase, candidates, observations.filter(hasContent), { write });
  return { ...result, notes: [...(result.notes ?? []), ...notes] };
}

export async function refreshMexicoAwards(supabase: SupabaseClient, options: { write: boolean }, onProgress?: Progress): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { sourceNames: COMPRAS_MX_SOURCE_NAMES });
  let notFound = 0;
  const { observations, notes } = await askEach(
    candidates,
    "LicitIA",
    120,
    async (row) => {
      const answer = await fetchLicitacionAwards(row.tender_number);
      if (answer.status === "error") throw new Error(answer.message);
      if (answer.status === "not_found") {
        notFound += 1;
        return null;
      }
      // A fresh fallo arrives before its contracts: on 2026-09-26 the four
      // procedures that had just turned ADJUDICADO carried award_at and an
      // empty awards[]. The date is written now; the row stays a candidate
      // (supplier and amount still empty) and the next run asks again.
      const awards = answer.awards.filter((award) => !/cancel/i.test(award.status ?? ""));
      const parts: AwardPart[] = awards.map((award) => ({ supplier: award.supplier, amount: award.amount, currency: award.currency ?? "MXN" }));
      parts.push({ date: answer.awardAt });
      return combineAwardParts(row.slug, parts);
    },
    onProgress,
  );
  if (notFound) notes.push(`${notFound} 条在 LicitIA 查不到`);
  return finish(supabase, candidates, observations, notes, options.write);
}

export async function refreshBrazilAwards(supabase: SupabaseClient, options: { write: boolean }, onProgress?: Progress): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { sourceNames: [BRAZIL_PNCP_SOURCE_NAME] });
  const { observations, notes } = await askEach(
    candidates,
    "PNCP",
    300,
    async (row) => {
      const compra = await fetchPncpCompra(row.tender_number);
      const { lines } = await fetchPncpAwardLines(row.tender_number);
      // The compra's own homologated total when it has one: the item results
      // read above are capped, so their sum can be short.
      const total = typeof compra.valorTotalHomologado === "number" && compra.valorTotalHomologado > 0 ? compra.valorTotalHomologado : undefined;
      const parts: AwardPart[] = lines.map((line) => ({ supplier: line.supplier, date: line.date, amount: total ? undefined : line.amount, currency: "BRL" }));
      if (total) parts.push({ amount: total, currency: "BRL" });
      return combineAwardParts(row.slug, parts);
    },
    onProgress,
  );
  return finish(supabase, candidates, observations, notes, options.write);
}

export async function refreshChileAwards(supabase: SupabaseClient, options: { write: boolean }, onProgress?: Progress): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { sourceNames: [CHILE_BUSCA_SOURCE_NAME, CHILE_SOURCE_NAME] });
  const { observations, notes } = await askEach(
    candidates,
    "Mercado Público",
    300,
    async (row) => {
      const awards = (await fetchChileOcdsAwards(row.tender_number)).filter((award) => award.status === "active");
      if (awards.length === 0) return null;
      return combineAwardParts(
        row.slug,
        awards.flatMap((award) => {
          const suppliers = award.suppliers?.length ? award.suppliers : [{}];
          // One amount per award, however many suppliers share it.
          return suppliers.map((supplier, index) => ({
            supplier: supplier.name,
            date: award.date,
            amount: index === 0 ? award.value?.amount : undefined,
            currency: award.value?.currency ?? "CLP",
          }));
        }),
      );
    },
    onProgress,
  );
  return finish(supabase, candidates, observations, notes, options.write);
}

export async function refreshColombiaAwards(supabase: SupabaseClient, options: { write: boolean }, onProgress?: Progress): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { slugPrefix: "secop-" });
  if (candidates.length === 0) return finish(supabase, candidates, [], [], options.write);
  onProgress?.(`SECOP II：查询 ${candidates.length} 条`);
  const bySlug = new Set(candidates.map((row) => row.slug));
  const rows = await fetchSecopAwardedRowsByReference(candidates.map((row) => row.tender_number));
  // A process awarded in several lots comes back as the cross product of its
  // winners and its amounts — ICCU-LP-038-2026: two consortia x two values =
  // four rows, each pairing a winner with the other lot's amount half the
  // time. So the rows are folded per tender into DISTINCT winners and
  // DISTINCT amounts, summed. Two lots awarded for exactly the same figure
  // would be counted once; that is the price of not quadrupling every total.
  const grouped = new Map<string, { date?: string; suppliers: Set<string>; amounts: Set<number>; currency: string }>();
  for (const row of rows) {
    // The same slug rule the import uses (it strips the phase suffix), so a
    // reference shared by another entity never lands on our tender.
    const tender = mapSecopRowToTender(row, "SECOP II — Colombia Compra Eficiente");
    if (!tender || !bySlug.has(tender.slug)) continue;
    const entry = grouped.get(tender.slug) ?? { suppliers: new Set<string>(), amounts: new Set<number>(), currency: tender.currency ?? "COP" };
    if (tender.awardedTo) entry.suppliers.add(tender.awardedTo);
    if (tender.awardedValue !== undefined) entry.amounts.add(tender.awardedValue);
    if (tender.awardDate && (!entry.date || tender.awardDate > entry.date)) entry.date = tender.awardDate;
    grouped.set(tender.slug, entry);
  }
  const observations: AwardObservation[] = [...grouped].map(([slug, entry]) =>
    combineAwardParts(slug, [
      { date: entry.date },
      ...[...entry.suppliers].map((supplier) => ({ supplier })),
      ...[...entry.amounts].map((amount) => ({ amount, currency: entry.currency })),
    ]),
  );
  return finish(supabase, candidates, observations, [], options.write);
}

/**
 * ProInversión's all-states export carries Monto Adjudicado and Fecha Buena
 * Pro, and no column naming the company. Checked on the user's
 * ListaConvocatoriaTodos_20260926.xlsx: 2,729 adjudicado/convenio rows, 2,464
 * with an amount.
 */
export async function refreshPeruOxiAwards(
  supabase: SupabaseClient,
  options: { write: boolean; file?: { buffer: Buffer; fileName: string } },
  onProgress?: Progress,
): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { sourceNames: [PERU_OXI_SOURCE_NAME] });
  if (candidates.length === 0 && !options.file) return finish(supabase, candidates, [], [], options.write);
  let buffer: Buffer;
  if (options.file) buffer = options.file.buffer;
  else {
    onProgress?.("下载 ProInversión 全部状态清单…");
    buffer = await downloadOxiExport(OXI_ESTADO_TODOS);
  }
  const { rows, headers } = await readPeruOxiWorkbook({ buffer, fileName: options.file?.fileName ?? "oxi-todos.xlsx" });
  if (!headers.includes("Monto Adjudicado (S/)") && !headers.includes("Fecha Buena Pro")) {
    throw new Error("这个 OxI 文件没有「Monto Adjudicado」「Fecha Buena Pro」两列 —— 请用「状态」选「全部」后导出的清单。");
  }
  const observations: AwardObservation[] = [];
  for (const row of rows as (Record<string, string | undefined> & { "Codigo Convocatoria": string })[]) {
    const code = row["Codigo Convocatoria"]?.trim();
    if (!code) continue;
    const amount = Number((row["Monto Adjudicado (S/)"] ?? "").replace(/,/g, "").trim());
    observations.push(
      combineAwardParts(peruOxiSlug(code), [{ date: row["Fecha Buena Pro"], amount: Number.isFinite(amount) ? amount : undefined, currency: "PEN" }]),
    );
  }
  return finish(supabase, candidates, observations, ["秘鲁 OxI 清单不含中标企业名称，只补中标日期和金额"], options.write);
}

/**
 * CLI only — SEACE's proxy refuses Vercel and the GitHub runner (README).
 * The segments come from the candidates' own publication months, like
 * refreshPeruOeceStatuses.
 */
export async function refreshPeruOeceAwards(
  supabase: SupabaseClient,
  options: { write: boolean; sourceId?: string; maxSegments?: number },
  onProgress?: Progress,
): Promise<AwardRefreshResult> {
  const candidates = await listAwardCandidates(supabase, { sourceNames: [PERU_OECE_SOURCE_NAME] });
  const segments = [...new Set(candidates.map((row) => row.publication_date?.slice(0, 7)).filter((s): s is string => !!s && /^\d{4}-\d{2}$/.test(s)))]
    .sort()
    .reverse()
    .slice(0, options.maxSegments ?? 12);
  const wanted = new Set(candidates.map((row) => row.slug));
  const observations: AwardObservation[] = [];
  for (const segment of segments) {
    const records = await fetchOeceRecordsForSegment({ dataSegmentationId: segment, sourceId: options.sourceId ?? "seace_v3" }, (page, soFar) => {
      if (page === 1 || page % 10 === 0) onProgress?.(`${segment}: page ${page}, ${soFar} record(s)`);
    });
    for (const record of records) {
      const tender = mapOeceRecordToTender(record, PERU_OECE_SOURCE_NAME);
      if (!tender || !wanted.has(tender.slug)) continue;
      const awards = (record.compiledRelease.awards ?? []) as {
        status?: string;
        date?: string;
        value?: { amount?: number; currency?: string };
        suppliers?: { name?: string }[];
      }[];
      const parts = awards
        .filter((award) => !/cancel|unsuccessful/i.test(award.status ?? ""))
        .flatMap((award) =>
          (award.suppliers?.length ? award.suppliers : [{}]).map((supplier, index) => ({
            supplier: supplier.name,
            date: award.date,
            amount: index === 0 ? award.value?.amount : undefined,
            currency: award.value?.currency ?? "PEN",
          })),
        );
      if (parts.length) observations.push(combineAwardParts(tender.slug, parts));
    }
  }
  return finish(supabase, candidates, observations, [`读取了 ${segments.length} 个月份`], options.write);
}
