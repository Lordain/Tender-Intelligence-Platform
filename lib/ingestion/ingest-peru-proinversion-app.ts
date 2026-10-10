/**
 * ProInversión's APP concursos, for the daily cron. One portfolio read, then
 * one detail page per project in Transacción for its call date
 * (connectors/peru-proinversion-app-live.ts); the usual 3-day publication
 * window (publication-window.ts), counted from that call date, and every
 * upsert filter.
 *
 * A written run also marks stored rows of this source 已中标 once the
 * portfolio says Adjudicado — the window only ever brings new calls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAppPortfolio, fetchAppSchedule, type ProinversionAppProject, type ScheduleStep } from "@/lib/ingestion/connectors/peru-proinversion-app-live";
import { isAppConcursoUnderWay, mapAppProjectToTender, PROINVERSION_APP_SOURCE_NAME } from "@/lib/ingestion/peru-proinversion-app-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

export { PROINVERSION_APP_SOURCE_NAME };

export type ProinversionAppIngestResult = {
  portfolioCount: number;
  /** Projects in Transacción and not awarded. */
  underWayCount: number;
  /** Under way but with no call date on the schedule. */
  notCalled: string[];
  days: number;
  /** Called within `days` — the ones written. */
  open: Tender[];
  /** Called before the window. */
  openBeforeWindow: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  awardedSlugs?: string[];
};

export async function ingestPeruProinversionApp(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    days?: number;
    now?: Date;
    /** For tests: the portfolio and each project's schedule, instead of the live reads. */
    portfolio?: ProinversionAppProject[];
    schedules?: Record<string, ScheduleStep[]>;
  },
): Promise<ProinversionAppIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const portfolio = options.portfolio ?? (await fetchAppPortfolio());
  const underWay = portfolio.filter(isAppConcursoUnderWay);

  const allOpen: Tender[] = [];
  const notCalled: string[] = [];
  for (const project of underWay) {
    const schedule = options.schedules?.[project.Slug] ?? (await fetchAppSchedule(project.Slug));
    const tender = mapAppProjectToTender(project, schedule, now);
    if (tender) allOpen.push(tender);
    else notCalled.push(project.NombreCorto);
  }
  const open = filterTendersPublishedWithinDays(allOpen, days, now);
  const openSlugs = new Set(open.map((tender) => tender.slug));

  const result: ProinversionAppIngestResult = {
    portfolioCount: portfolio.length,
    underWayCount: underWay.length,
    notCalled,
    days,
    open,
    openBeforeWindow: allOpen.filter((tender) => !openSlugs.has(tender.slug)),
    staleWarning: portfolio.length === 0 ? "⚠ ProInversión APP 项目库一个项目都没读到。2026-10-10 实测有 88 个，更可能是接口变了，见 peru-proinversion-app-live.ts。" : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, open);

  // Stored concursos the portfolio now lists as awarded.
  const awardedIds = new Set(portfolio.filter((project) => /adjudicad/i.test(project.Estado)).map((project) => `PROINVERSION-APP-${project.Id}`));
  const awardedSlugs: string[] = [];
  if (awardedIds.size > 0) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug,tender_number,status")
      .eq("source_name", PROINVERSION_APP_SOURCE_NAME)
      .in("tender_number", [...awardedIds]);
    if (error) throw new Error(`读取已入库的 ProInversión APP 项目失败：${error.message}`);
    for (const row of (data ?? []) as Array<{ slug: string; status: string }>) {
      if (row.status === "awarded") continue;
      const { error: updateError } = await supabase.from("tenders").update({ status: "awarded" }).eq("slug", row.slug);
      if (updateError) throw new Error(`更新 ${row.slug} 的状态失败：${updateError.message}`);
      awardedSlugs.push(row.slug);
    }
  }
  return { ...result, upsertedCount, failed, awardedSlugs };
}
