import type { SupabaseClient } from "@supabase/supabase-js";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";
import { CRON_JOBS } from "@/lib/ops/cron-jobs";

/**
 * The imports only an admin can run — sources with no API the daily job can
 * read, so their new tenders reach the platform only when someone exports or
 * copies them by hand (user, 2026-10-06: 帮我加一个网站内提醒：每天需要我做什么？
 * 比如手动+comprasMX 手动+秘鲁 手动+CFE 手动+proyectosestrategicos).
 *
 * A task counts as done for the day (Beijing time, where the admin works) when
 * its import wrote, or when the admin pressed 「今天看过了」 because there was
 * nothing worth importing. Both stamp a row in cron_heartbeats (migration
 * 0041) under `manual:<id>`; that table takes any job name, so no new SQL is
 * needed, and the scheduled-job monitor reads only the ids in CRON_JOBS, so
 * these rows never show up there as stale jobs.
 *
 * Client-safe: no server-only imports, the panel imports the list and the
 * day helper.
 */
export type ManualTaskId = "comprasmx" | "proyectos-estrategicos" | "peru-seace" | "cfe-micrositio" | "ecuador-soce" | "bolivia-sicoes" | "uruguay-arce" | "guatemala-guatecompras";

export type ManualTask = {
  id: ManualTaskId;
  label: string;
  /** What to do, in one line. */
  how: string;
  /** The admin tab where it is done. */
  href: string;
  /** The official site the data comes from. */
  site: { label: string; href: string };
  /**
   * Shown only while this scheduled job is not running normally: its last
   * heartbeat "skipped" (paused) or "failed", or older than the job's
   * maxAgeHours (lib/ops/cron-jobs.ts). Overdue counts because a run that
   * crashes writes no heartbeat at all — how ARCE's first refusals looked,
   * the last heartbeat still "ok" from the day before (user, 2026-10-15:
   * 没有乌拉圭啊？). Gone again the day the job runs normally.
   */
  whilePaused?: string;
};

export const MANUAL_TASKS: ManualTask[] = [
  {
    id: "comprasmx",
    label: "墨西哥 Compras MX",
    how: "在 Compras MX 导出开放招标（Difusión de procedimientos）的 .xlsx，上传到「墨西哥」页第一项",
    href: "/admin/import-tenders/mexico",
    site: { label: "Compras MX", href: "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/" },
  },
  {
    id: "proyectos-estrategicos",
    label: "墨西哥 Proyectos Estratégicos",
    how: "在 Proyectos Estratégicos 导出 .xlsx，上传到「墨西哥」页第一项（来源选 Proyectos Estratégicos）",
    href: "/admin/import-tenders/mexico",
    site: { label: "Proyectos Estratégicos", href: "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/" },
  },
  {
    id: "peru-seace",
    label: "秘鲁 SEACE",
    how: "在 SEACE 搜索页导出 Lista-Procesos.xls，上传到「秘鲁」页的「SEACE 导出清单」",
    href: "/admin/import-tenders/peru",
    site: { label: "SEACE", href: SEACE_PUBLIC_SEARCH_URL },
  },
  {
    id: "cfe-micrositio",
    label: "墨西哥 CFE",
    how: "在 CFE 招标网站复制搜索结果列表，贴到「CFE 列表初筛」；把值得的项目详情页整页贴到「CFE 网站粘贴导入」",
    href: "/admin/import-tenders/mexico",
    site: { label: "CFE 招标网站", href: "https://msc.cfe.mx/Aplicaciones/NCFE/Concursos/" },
  },
  {
    id: "ecuador-soce",
    label: "厄瓜多尔 SOCE",
    how: "在 SOCE 打开值得的项目详情页，连同链接整页复制，粘贴到「厄瓜多尔」页",
    href: "/admin/import-tenders/ecuador",
    site: { label: "SOCE", href: "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/buscarProceso.cpe" },
  },
  // Added 2026-10-10 (user: 玻利维亚加进每日人工任务提醒 ok); Bolivia opened
  // to visitors the same day.
  {
    id: "bolivia-sicoes",
    label: "玻利维亚 SICOES",
    how: "在 SICOES 搜索结果复制列表，贴到「SICOES 列表初筛」；把值得的项目 Ficha 整页贴到「SICOES 粘贴导入」",
    href: "/admin/import-tenders/bolivia",
    // BOLIVIA_SICOES_SEARCH_URL, written out: this file is client-safe and
    // bolivia-sicoes-paste.ts brings the whole classifier with it.
    site: { label: "SICOES", href: "https://www.sicoes.gob.bo/portal/index.php" },
  },
  // Added 2026-10-15 (user: 现在就做 / 上面的手动提醒，应该也要增加提醒？), only
  // while the daily Uruguay import is paused or failing (scripts/cron-uruguay.ts).
  {
    id: "uruguay-arce",
    label: "乌拉圭 ARCE（自动导入暂停期间）",
    how: "在 ARCE「Llamados vigentes」列表页全选复制，贴到「乌拉圭」页的「ARCE 列表初筛」；把值得的项目详情页整页贴到「ARCE 详情页粘贴导入」",
    href: "/admin/import-tenders/uruguay",
    site: { label: "ARCE", href: "https://www.comprasestatales.gub.uy/consultas/" },
    whilePaused: "import-uruguay",
  },
  // Added 2026-10-16 (user: A — 两步粘贴导入，每天要手动贴一次): Guatecompras
  // challenges our servers, so Guatemala is pasted by hand every day.
  {
    id: "guatemala-guatecompras",
    label: "危地马拉 Guatecompras（未公开）",
    how: "在 Guatecompras「Concursos vigentes」点「Licitación Pública」，复制第 1 页贴到「Guatecompras 列表初筛」；把值得的项目详情页整页贴到「Guatecompras 详情页粘贴导入」",
    href: "/admin/import-tenders/guatemala",
    site: { label: "Guatecompras", href: "https://www.guatecompras.gt/concursos/consultaConcursos.aspx" },
  },
];

export function manualTaskJob(id: ManualTaskId): string {
  return `manual:${id}`;
}

/** "2026-10-06" for the instant's day in Beijing. */
export function beijingDay(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export type ManualTaskState = ManualTask & { lastDoneAt: string | null; detail: string | null; doneToday: boolean };

/**
 * Stamps a task done. Never throws: the import it follows has already
 * succeeded, and a missed stamp only means the reminder stays up.
 */
export async function markManualTaskDone(supabase: SupabaseClient | null, id: ManualTaskId, detail: string): Promise<void> {
  if (!supabase) return;
  const now = new Date().toISOString();
  try {
    await supabase.from("cron_heartbeats").upsert({ job: manualTaskJob(id), last_run_at: now, status: "ok", detail, updated_at: now }, { onConflict: "job" });
  } catch {
    // see above
  }
}

export async function readManualTasks(supabase: SupabaseClient | null, now = new Date()): Promise<ManualTaskState[]> {
  const rows = new Map<string, { last_run_at: string; detail: string | null; status?: string }>();
  if (supabase) {
    const pausedJobs = MANUAL_TASKS.flatMap((task) => (task.whilePaused ? [task.whilePaused] : []));
    const { data } = await supabase
      .from("cron_heartbeats")
      .select("job, last_run_at, detail, status")
      .in("job", [...MANUAL_TASKS.map((task) => manualTaskJob(task.id)), ...pausedJobs]);
    for (const row of (data ?? []) as { job: string; last_run_at: string; detail: string | null; status: string }[]) rows.set(row.job, row);
  }
  const today = beijingDay(now);
  const notRunning = (job: string) => {
    const row = rows.get(job);
    if (!row) return false;
    if (row.status === "skipped" || row.status === "failed") return true;
    const maxAgeHours = CRON_JOBS.find((spec) => spec.id === job)?.maxAgeHours;
    return maxAgeHours !== undefined && now.getTime() - new Date(row.last_run_at).getTime() > maxAgeHours * 3_600_000;
  };
  return MANUAL_TASKS.filter((task) => !task.whilePaused || notRunning(task.whilePaused)).map((task) => {
    const row = rows.get(manualTaskJob(task.id));
    return { ...task, lastDoneAt: row?.last_run_at ?? null, detail: row?.detail ?? null, doneToday: row ? beijingDay(row.last_run_at) === today : false };
  });
}
