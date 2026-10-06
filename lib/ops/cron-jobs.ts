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
  | "trigger-daily-ingest"
  | "import-colombia"
  | "import-pemex"
  | "licitia-daily"
  | "import-chile"
  | "import-petronect"
  | "import-upme"
  | "import-codelco"
  | "import-metro-santiago"
  | "import-cemig"
  | "import-petroperu"
  | "import-brazil"
  | "import-brazil-pregao"
  | "import-peru-oxi"
  | "refresh-statuses"
  | "import-guyana"
  | "import-argentina"
  | "import-dominicana"
  | "import-cfe-dof"
  | "import-energy-auctions";

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
  /**
   * Where the schedule actually lives, so the admin banner can say where to
   * look when one goes quiet. "manual" is a job with no schedule at all,
   * run by hand from the owner's own computer with `manualCommand`.
   */
  runsOn: "vercel" | "github-actions" | "manual";
  manualCommand?: string;
};

export const CRON_JOBS: CronJobSpec[] = [
  // Twice daily (15:00 and 00:00 UTC = 09:00 and 18:00 America/Mexico_City),
  // so the widest gap is 15h.
  { id: "tender-digest", label: "每日招标摘要邮件", maxAgeHours: 24, runsOn: "vercel" },
  { id: "subscription-renewal-reminders", label: "续费提醒", maxAgeHours: 30, runsOn: "vercel" },
  { id: "purge-stale-colombia", label: "哥伦比亚过期项目清理", maxAgeHours: 30, runsOn: "vercel" },
  // Twice daily (11:xx and 21:xx UTC): starts daily-ingest on GitHub on time.
  // A skipped heartbeat here (token not set) is healthy — GitHub's own
  // schedule still runs the imports, late.
  { id: "trigger-daily-ingest", label: "每日导入准点触发（Vercel → GitHub）", maxAgeHours: 30, runsOn: "vercel" },
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
  // Manual since 2026-09-27: the site answers GitHub's runners with HTTP 403
  // and its programme page changes every few months, so a weekly run from the
  // owner's computer is enough. 8 days leaves a day of slack on "weekly".
  {
    id: "import-metro-santiago",
    label: "圣地亚哥地铁招标预告导入（每周手动）",
    maxAgeHours: 8 * 24,
    runsOn: "manual",
    manualCommand: "npm run cron:metro-santiago -- --write",
  },
  { id: "import-cemig", label: "巴西 Cemig 电力公司自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-petroperu", label: "秘鲁 Petroperú 国际招标自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-brazil", label: "巴西 PNCP 自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-brazil-pregao", label: "巴西 PNCP 电子竞价（设备类）自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-peru-oxi", label: "秘鲁 OxI 自动导入与状态刷新", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "refresh-statuses", label: "已入库项目状态刷新（巴西、智利、墨西哥）", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-guyana", label: "圭亚那 eprocure 自动导入（未公开）", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-argentina", label: "阿根廷 COMPR.AR / CONTRAT.AR / ADIF / 政府公报 自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-dominicana", label: "多米尼加 DGCP 自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-cfe-dof", label: "墨西哥 CFE（DOF 公报）自动导入", maxAgeHours: 30, runsOn: "github-actions" },
  { id: "import-energy-auctions", label: "能源拍卖（人工整理）写入", maxAgeHours: 30, runsOn: "github-actions" },
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
