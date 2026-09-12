import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CRON_JOBS, writeCronHeartbeat, type CronHeartbeatStatus, type CronJobId } from "@/lib/ops/cron-jobs";

/**
 * Did the scheduler reach us?
 *
 * Every other monitor in this project is written by code running inside a
 * job, so it can only report failures of work that started. A cron that stops
 * firing altogether — schedule not deployed, CRON_SECRET rotated so every
 * call 401s, a GitHub secret rotated on one side only — reports nothing, and
 * from the admin banner that is indistinguishable from a quiet, healthy week.
 * This is the one signal that tells those apart. See migration 0041.
 *
 * The registry and the write itself live in lib/ops/cron-jobs.ts, which
 * carries no `server-only` guard, because the ingestion jobs run as plain
 * `tsx` scripts on GitHub Actions and need to write heartbeats from outside
 * any Next runtime. What stays here is what genuinely belongs to the server:
 * the admin banner's staleness query.
 */
export { CRON_JOBS, type CronJobId, type CronJobSpec, type CronHeartbeatStatus } from "@/lib/ops/cron-jobs";

export async function recordCronHeartbeat(
  admin: SupabaseClient | null,
  job: CronJobId,
  status: CronHeartbeatStatus = "ok",
  detail?: string,
): Promise<void> {
  return writeCronHeartbeat(admin, job, status, detail);
}

export type StaleCronJob = {
  job: CronJobId;
  label: string;
  /** null when the job has never run at all. */
  lastRunAt: string | null;
  status: CronHeartbeatStatus | null;
  detail: string | null;
  reason: "never" | "overdue" | "failed";
  /** Where to go looking when this one is quiet — Vercel's Cron Jobs page or the repository's Actions tab. */
  runsOn: "vercel" | "github-actions";
};

/**
 * Jobs that should have run by now and have not.
 *
 * A job with no row at all counts as a problem only in production: a local
 * dev server has no scheduler and would otherwise show a permanent warning
 * for every job that is working fine in production.
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
        stale.push({ job: spec.id, label: spec.label, lastRunAt: null, status: null, detail: null, reason: "never", runsOn: spec.runsOn });
      }
      continue;
    }
    const lastRunAt = row.last_run_at as string;
    const status = row.status as CronHeartbeatStatus;
    const detail = (row.detail as string | null) ?? null;
    const ageHours = (now.getTime() - new Date(lastRunAt).getTime()) / 3_600_000;

    if (status === "failed") {
      stale.push({ job: spec.id, label: spec.label, lastRunAt, status, detail, reason: "failed", runsOn: spec.runsOn });
      continue;
    }
    if (ageHours > spec.maxAgeHours) {
      stale.push({ job: spec.id, label: spec.label, lastRunAt, status, detail, reason: "overdue", runsOn: spec.runsOn });
    }
  }

  return stale;
}
