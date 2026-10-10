/**
 * Chile's public-works concessions (MOP DGC), for the daily cron. One list
 * read and one read per project page (connectors/chile-concesiones-live.ts);
 * only projects still before their offer date are mapped, then the usual
 * 3-day publication window (publication-window.ts) and every upsert filter.
 *
 * An empty list is reported, not taken as "nothing to tender": the page has
 * held projects whose offers were long in (six on 2026-10-10), so zero rows
 * means the page changed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchConcesionProjects, type ConcesionProject } from "@/lib/ingestion/connectors/chile-concesiones-live";
import { concesionDocumentLinks, mapConcesionToTender, CHILE_CONCESIONES_SOURCE_NAME } from "@/lib/ingestion/chile-concesiones-mapper";
import { santiagoToday } from "@/lib/ingestion/ingest-codelco";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

export { CHILE_CONCESIONES_SOURCE_NAME };

export type ChileConcesionesIngestResult = {
  projects: ConcesionProject[];
  days: number;
  /** Still before the offer date AND called within `days` — the ones written. */
  open: Tender[];
  /** Still before the offer date, called before the window. */
  openBeforeWindow: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

export async function ingestChileConcesiones(
  supabase: SupabaseClient | null,
  options: { write: boolean; days?: number; projects?: ConcesionProject[]; now?: Date },
): Promise<ChileConcesionesIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const projects = options.projects ?? (await fetchConcesionProjects());
  const today = santiagoToday(now);

  const allOpen: Tender[] = [];
  const projectBySlug = new Map<string, ConcesionProject>();
  for (const project of projects) {
    const tender = mapConcesionToTender(project, today, now);
    if (!tender) continue;
    allOpen.push(tender);
    projectBySlug.set(tender.slug, project);
  }
  const open = filterTendersPublishedWithinDays(allOpen, days, now);
  const openSlugs = new Set(open.map((tender) => tender.slug));

  const result: ChileConcesionesIngestResult = {
    projects,
    days,
    open,
    openBeforeWindow: allOpen.filter((tender) => !openSlugs.has(tender.slug)),
    staleWarning: projects.length === 0 ? "⚠ 特许经营总局「Proyectos en Licitación」一个项目都没解析出来。2026-10-10 实测有 6 个，更可能是页面结构变了，见 chile-concesiones-live.ts。" : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, open);
  await saveDocumentLinks(
    supabase,
    open.map((tender) => ({ slug: tender.slug, links: concesionDocumentLinks(projectBySlug.get(tender.slug)!) })),
  );
  return { ...result, upsertedCount, failed };
}
