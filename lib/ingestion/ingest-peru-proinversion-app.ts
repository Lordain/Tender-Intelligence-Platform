/**
 * ProInversión's APP concursos, for the daily cron. One portfolio read, then
 * one detail page per project in Transacción for its call date
 * (connectors/peru-proinversion-app-live.ts); the usual 3-day publication
 * window (publication-window.ts), counted from that call date, and every
 * upsert filter.
 *
 * A written run also closes stored rows of this source once the portfolio
 * says the concurso is over — the window only ever brings new calls, and the
 * rows have no deadline for the calendar to close them by (see
 * lib/proinversion-app-source.ts): Adjudicado → 已中标, Desierto → 流标,
 * Cancelado → 已取消, Suspendido → 暂停中, and a project that has left
 * Transacción or the portfolio → 已截止. One that is under way again after a
 * suspension goes back to 招标中.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAppPortfolio, fetchAppSchedule, type ProinversionAppProject, type ScheduleStep } from "@/lib/ingestion/connectors/peru-proinversion-app-live";
import { isAppConcursoUnderWay, mapAppProjectToTender, PROINVERSION_APP_SOURCE_NAME } from "@/lib/ingestion/peru-proinversion-app-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { Tender, TenderStatus } from "@/types/tender";

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
  /** Stored rows whose status this run changed, and to what. */
  statusChanges?: { slug: string; status: TenderStatus }[];
};

/**
 * 88 projects on 2026-10-10. A read far short of that is a changed or failing
 * endpoint, not 50 concursos ending at once, and must not close what it missed.
 */
const MIN_PORTFOLIO_FOR_CLOSING = 40;

/** What a stored row becomes once its project is no longer under way; null while it still is. */
export function appClosingStatus(project: ProinversionAppProject | undefined): TenderStatus | null {
  if (project && isAppConcursoUnderWay(project)) return null;
  const state = project?.Estado ?? "";
  if (/adjudicad/i.test(state)) return "awarded";
  if (/desierto/i.test(state)) return "deserted";
  if (/cancelad/i.test(state)) return "cancelled";
  if (/suspendid/i.test(state)) return "suspended";
  return "submission_closed";
}

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

  // Stored concursos whose project is no longer under way (or is again).
  if (portfolio.length < MIN_PORTFOLIO_FOR_CLOSING) return { ...result, upsertedCount, failed, statusChanges: [] };
  const byNumber = new Map(portfolio.map((project) => [`PROINVERSION-APP-${project.Id}`, project]));
  const { data, error } = await supabase.from("tenders").select("slug,tender_number,status").eq("source_name", PROINVERSION_APP_SOURCE_NAME);
  if (error) throw new Error(`读取已入库的 ProInversión APP 项目失败：${error.message}`);
  const statusChanges: { slug: string; status: TenderStatus }[] = [];
  for (const row of (data ?? []) as Array<{ slug: string; tender_number: string; status: TenderStatus }>) {
    const status = appClosingStatus(byNumber.get(row.tender_number)) ?? "open";
    if (row.status === status) continue;
    const { error: updateError } = await supabase.from("tenders").update({ status }).eq("slug", row.slug);
    if (updateError) throw new Error(`更新 ${row.slug} 的状态失败：${updateError.message}`);
    statusChanges.push({ slug: row.slug, status });
  }
  return { ...result, upsertedCount, failed, statusChanges };
}
