import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The scheduled-job registry and the heartbeat WRITE, deliberately free of
 * `import "server-only"`.
 *
 * Every ingestion job now runs on GitHub Actions rather than inside Next
 * (.github/workflows/daily-ingest.yml), which means plain `tsx` scripts need
 * to write heartbeats too — and the module they used to live in starts with
 * `import "server-only"`, which throws outside a Next server runtime. Rather
 * than duplicate the write per script (which is what the first version of
 * scripts/licitia-daily.ts did), the parts that are not server-specific live
 * here and lib/ops/cron-heartbeat.ts keeps the guard for the parts that are.
 */
export type CronJobId =
  | "tender-digest"
  | "subscription-renewal-reminders"
  | "purge-stale-colombia"
  | "import-colombia"
  | "import-pemex"
  | "licitia-daily"
  | "import-chile"
  | "import-petronect"
  | "import-upme"
  | "import-codelco";

export type CronJobSpec = {
  id: CronJobId;
  label: string;
  /**
   * How long after a run this job is overdue. Set from the widest gap the
   * schedule allows, plus room for a late start — not from the average gap,
   * or a job that legitimately runs once a day reports itself broken every
   * morning. GitHub's scheduler is best-effort and can drift by tens of
   * minutes under load, which is another reason these are generous.
   */
  maxAgeHours: number;
  /** Where the schedule actually lives, so the admin banner can say where to look when one goes quiet. */
  runsOn: "vercel" | "github-actions";
};

export const CRON_JOBS: CronJobSpec[] = [
  // Twice daily (15:00 and 00:00 UTC = 09:00 and 18:00 America/Mexico_City),
  // so the widest gap is 15h.
  { id: "tender-digest", label: "每日招标摘要邮件", maxAgeHours: 24, runsOn: "vercel" },
  { id: "subscription-renewal-reminders", label: "续费提醒", maxAgeHours: 30, runsOn: "vercel" },
  { id: "purge-stale-colombia", label: "哥伦比亚过期项目清理", maxAgeHours: 30, runsOn: "vercel" },
  // The ingestion jobs. Their heartbeats are the only thing standing between
  // "no new tenders this week" and "we stopped reading this source a week
  // ago" — from the feed itself the two are indistinguishable.
  { id: "import-colombia", label: "哥伦比亚自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-pemex", label: "PEMEX 自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "licitia-daily", label: "LicitIA 自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-chile", label: "智利自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-petronect", label: "Petrobras（Petronect）自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-upme", label: "哥伦比亚 UPME 输电项目自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-codelco", label: "Codelco 公开招标自动导入", maxAgeHours: 30, runsOn: "github-actions" },
];

export type CronHeartbeatStatus = "ok" | "skipped" | "failed";

/**
 * Best-effort, and deliberately so: a heartbeat that fails to write must
 * never turn a healthy run into a failed one. The cost is a false "overdue"
 * warning, which is the safe direction to be wrong in.
 */
export async function writeCronHeartbeat(
  admin: SupabaseClient | null,
  job: CronJobId,
  status: CronHeartbeatStatus = "ok",
  detail?: string,
): Promise<void> {
  if (!admin) return;
  const now = new Date().toISOString();
  try {
    await admin.from("cron_heartbeats").upsert(
      { job, last_run_at: now, status, detail: detail?.slice(0, 2000) ?? null, updated_at: now },
      { onConflict: "job" },
    );
  } catch {
    // swallow — see the doc comment above
  }
}
