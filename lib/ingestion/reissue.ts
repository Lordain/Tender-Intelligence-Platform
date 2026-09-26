import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender, TenderStatus } from "@/types/tender";
import { lifecycleSchemaAvailable } from "@/lib/ingestion/lifecycle-schema";

/**
 * 重发 — a procedure re-issued under a NEW code after its earlier round was
 * cancelled, deserted (流标) or suspended (user, 2026-09-26: 也要考虑后续的
 * 恢复或者取消、重发).
 *
 * A re-issue with the SAME code is not handled here and needs nothing: it is
 * the same row, and the source reporting it open again is 恢复, recorded in
 * tender_status_history like any other status change.
 *
 * Matching is deliberately strict — same source, same buyer, same title once
 * the re-issue wording is stripped — because a wrong link tells a reader that
 * two unrelated procedures are one project. A missed link costs only the
 * cross-reference. What real re-issues look like:
 *
 *   - Peru OxI: a new CONV code for the same investment, and the title is the
 *     investment's name (Nombre de la inversión), identical across rounds.
 *   - Mexico / Chile / Colombia / Peru OECE: the same object text, often with
 *     "SEGUNDA CONVOCATORIA", "(2DA CONVOCATORIA)", "reconvocatoria" or
 *     "nueva licitación" added — that wording is removed before comparing.
 *
 * Only rows already in a terminal-or-paused state can be the earlier round:
 * an OPEN row with the same title is a parallel lot, not a previous attempt.
 */
const PREVIOUS_ROUND_STATUSES: TenderStatus[] = ["cancelled", "deserted", "suspended"];

/** Matched against text that is already lower-case and accent-free. */
const REISSUE_WORDING = [
  /\b(?:primera|segunda|tercera|cuarta|1ra|2da|3ra|4ta|1a|2a|3a|2o|3o)\s+convocatoria\b/g,
  /\bre-?convocatoria\b/g,
  /\bnueva\s+convocatoria\b/g,
  /\bnueva\s+licitacion\b/g,
  /\bre-?licitacion\b/g,
  /\bsegundo\s+llamado\b/g,
  /\bnovo\s+(?:edital|certame)\b/g,
  /\brepeticao\b/g,
];

/** Lower-case, accent-free, re-issue wording and punctuation removed, whitespace collapsed. */
export function reissueTitleKey(title: string): string {
  // NFKD also folds the ordinal indicators (2º, 2ª → 2o, 2a).
  let text = foldText(title).replace(/°/g, "o");
  for (const pattern of REISSUE_WORDING) text = text.replace(pattern, " ");
  return text.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function foldText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function buyerKey(buyer: string): string {
  return foldText(buyer).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Titles this short match too much to be evidence of anything. */
const MIN_TITLE_KEY_LENGTH = 25;

type PreviousRound = { id: string; slug: string; buyer: string; title: { es?: string } | null; publication_date: string; source_name: string };

/**
 * Links each NEWLY inserted tender to the earlier round it re-issues, if any.
 * Called by upsertTendersBatched for rows that did not exist before this
 * import, so a re-import of a known row never re-links it.
 *
 * Never throws: a failed link is logged and the import carries on — the
 * tender itself is already written, and a missing cross-reference is the
 * mild failure here.
 */
export async function linkReissuedTenders(
  supabase: SupabaseClient,
  fresh: { id: string; tender: Tender }[],
): Promise<{ linked: { slug: string; previousSlug: string }[] }> {
  const linked: { slug: string; previousSlug: string }[] = [];
  if (fresh.length === 0) return { linked };
  try {
    if (!(await lifecycleSchemaAvailable(supabase))) return { linked };

    const sources = [...new Set(fresh.map(({ tender }) => tender.sourceName))];
    const previous: PreviousRound[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("tenders")
        .select("id, slug, buyer, title, publication_date, source_name")
        .in("source_name", sources)
        .in("status", PREVIOUS_ROUND_STATUSES)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      previous.push(...((data ?? []) as PreviousRound[]));
      if ((data ?? []).length < 1000) break;
    }
    if (previous.length === 0) return { linked };

    const byKey = new Map<string, PreviousRound[]>();
    for (const row of previous) {
      const titleKey = reissueTitleKey(row.title?.es ?? "");
      if (titleKey.length < MIN_TITLE_KEY_LENGTH) continue;
      const key = `${row.source_name}|${buyerKey(row.buyer)}|${titleKey}`;
      const list = byKey.get(key);
      if (list) list.push(row);
      else byKey.set(key, [row]);
    }

    const rows: { tender_id: string; previous_tender_id: string; matched_by: string }[] = [];
    for (const { id, tender } of fresh) {
      const titleKey = reissueTitleKey(tender.title.es);
      if (titleKey.length < MIN_TITLE_KEY_LENGTH) continue;
      const candidates = (byKey.get(`${tender.sourceName}|${buyerKey(tender.buyer)}|${titleKey}`) ?? []).filter(
        (row) => row.id !== id && row.slug !== tender.slug && row.publication_date.slice(0, 10) <= tender.publicationDate.slice(0, 10),
      );
      // The most recent earlier round: a procedure deserted twice links to
      // the second attempt, which links to the first.
      const match = candidates.sort((a, b) => b.publication_date.localeCompare(a.publication_date))[0];
      if (!match) continue;
      rows.push({ tender_id: id, previous_tender_id: match.id, matched_by: "same source, buyer and title" });
      linked.push({ slug: tender.slug, previousSlug: match.slug });
    }
    if (rows.length === 0) return { linked };

    const { error } = await supabase
      .from("tender_reissues")
      .upsert(rows, { onConflict: "tender_id,previous_tender_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    console.log(`识别到 ${rows.length} 个重发项目，已关联到上一轮：${linked.slice(0, 10).map((l) => `${l.slug} ← ${l.previousSlug}`).join("，")}`);
    return { linked };
  } catch (error) {
    console.error(`[reissue] 重发关联失败，导入本身不受影响：${error instanceof Error ? error.message : String(error)}`);
    return { linked: [] };
  }
}
