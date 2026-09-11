import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Did the scheduler reach us?
 *
 * Every other monitor in this project is written by code running inside a
 * job, so it can only report failures of work that started. A cron that stops
 * firing altogether — schedule not deployed, CRON_SECRET rotated so every
 * call 401s, the project renamed — reports nothing, and from the admin banner
 * that is indistinguishable from a quiet, healthy week. This is the one
 * signal that tells those apart. See migration 0041.
 */
export type CronJobId = "tender-digest" | "subscription-renewal-reminders" | "purge-stale-colombia";

export type CronJobSpec = {
  id: CronJobId;
  label: string;
  /**
   * How long after a run this job is overdue. Set from the widest gap the
   * schedule in vercel.json allows, plus room for a late start — not from the
   * average gap, or a job that legitimately runs once a day reports itself
   * broken every morning.
   */
  maxAgeHours: number;
};

export const CRON_JOBS: CronJobSpec[] = [
  // Twice daily (15:00 and 00:00 UTC = 09:00 and 18:00 America/Mexico_City),
  // so the widest gap is 15h.
  { id: "tender-digest", label: "每日招标摘要邮件", maxAgeHours: 24 },
  { id: "subscription-renewal-reminders", label: "续费提醒", maxAgeHours: 30 },
  { id: "purge-stale-colombia", label: "哥伦比亚过期项目清理", maxAgeHours: 30 },
];

export type CronHeartbeatStatus = "ok" | "skipped" | "failed";

/**
 * Best-effort, and deliberately so: a heartbeat that fails to write must
 * never turn a healthy run into a failed one. The cost is a false "overdue"
 * warning, which is the safe direction to be wrong in.
 */
export async function recordCronHeartbeat(
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

export type StaleCronJob = {
  job: CronJobId;
  label: string;
  /** null when the job has never run at all. */
  lastRunAt: string | null;
  status: CronHeartbeatStatus | null;
  detail: string | null;
  reason: "never" | "overdue" | "failed";
};

/**
 * Jobs that should have run by now and have not.
 *
 * A job with no row at all counts as a problem only in production: a local
 * dev server has no scheduler and would otherwise show three permanent
 * warnings for jobs that are working fine on Vercel.
 */
export async function findStaleCronJobs(admin: SupabaseClient | null, now = new Date()): Promise<StaleCronJob[]> {
  if (!admin) return [];
  const { data, error } = await admin.from("cron_heartbeats").select("job, last_run_at, status, detail");
  if (error) return [];

  const rows = new Map((data ?? []).map((row) => [row.job as CronJobId, row]));
  const stale: StaleCronJob[] = [];

  for (const spec of CRON_JOBS) {
    const row = rows.get(spec.id);
    if (!row) {
      if (process.env.NODE_ENV === "production") {
        stale.push({ job: spec.id, label: spec.label, lastRunAt: null, status: null, detail: null, reason: "never" });
      }
      continue;
    }
    const lastRunAt = row.last_run_at as string;
    const status = row.status as CronHeartbeatStatus;
    const detail = (row.detail as string | null) ?? null;
    const ageHours = (now.getTime() - new Date(lastRunAt).getTime()) / 3_600_000;

    if (status === "failed") {
      stale.push({ job: spec.id, label: spec.label, lastRunAt, status, detail, reason: "failed" });
      continue;
    }
    if (ageHours > spec.maxAgeHours) {
      stale.push({ job: spec.id, label: spec.label, lastRunAt, status, detail, reason: "overdue" });
    }
  }

  return stale;
}
