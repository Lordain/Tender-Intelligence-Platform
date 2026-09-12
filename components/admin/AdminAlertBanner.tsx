"use client";

import { useEffect, useState } from "react";

type AdminAlert = {
  id: string;
  kind: "quota" | "connection" | "other";
  message: string;
  source: string;
  created_at: string;
};

/** A scheduled job that should have run by now and hasn't — migration 0041. */
type StaleCronJob = {
  job: string;
  label: string;
  lastRunAt: string | null;
  detail: string | null;
  reason: "never" | "overdue" | "failed";
};

const REASON_TEXT: Record<StaleCronJob["reason"], string> = {
  never: "从未运行过",
  overdue: "超过预期时间未运行",
  failed: "最近一次运行失败",
};

function describeLastRun(job: StaleCronJob) {
  if (!job.lastRunAt) return "没有运行记录";
  const hours = Math.floor((Date.now() - new Date(job.lastRunAt).getTime()) / 3_600_000);
  if (hours < 24) return `上次运行：${hours} 小时前`;
  return `上次运行：${Math.floor(hours / 24)} 天前`;
}

const KIND_LABEL: Record<AdminAlert["kind"], string> = {
  quota: "额度/限流",
  connection: "网络连接",
  other: "其他错误",
};

/**
 * Rendered in AdminShell on every /admin/* page — shows unresolved rows
 * from admin_alerts (see lib/admin-alerts.ts and the Stripe webhook
 * monitor for what writes them). Fetches once on mount, not polled — this is a
 * locally-run admin tool, not a monitoring dashboard; refresh the page
 * to see anything that happened since.
 */
export function AdminAlertBanner() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [staleJobs, setStaleJobs] = useState<StaleCronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/alerts")
      .then((res) => res.json())
      .then((data) => {
        setAlerts(data.alerts ?? []);
        setStaleJobs(data.staleJobs ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id?: string) {
    try {
      await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { resolveAll: true }),
      });
      setAlerts((prev) => (id ? prev.filter((a) => a.id !== id) : []));
    } catch {
      // leave the alert showing — the admin can retry the dismiss
    }
  }

  if (loading || (alerts.length === 0 && staleJobs.length === 0)) return null;

  return (
    <>
    {staleJobs.length > 0 && (
      // Amber, not red, and with no dismiss control: this is not an event that
      // happened and can be acknowledged, it is a state that is still true.
      // It clears itself the moment the job runs again.
      <div className="border-b border-amber-900/20 bg-amber-50 px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-sm font-bold text-amber-900">
            {staleJobs.length} 个定时任务没有按计划运行（检查 Vercel Cron 与 CRON_SECRET）
          </p>
          <ul className="flex flex-col gap-1.5">
            {staleJobs.map((job) => (
              <li key={job.job} className="text-xs text-amber-800">
                <span className="font-semibold">{job.label}</span>：{REASON_TEXT[job.reason]}（{describeLastRun(job)}）
                {job.detail ? `　${job.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )}
    {alerts.length > 0 && (
    <div className="border-b border-red-900/20 bg-red-50 px-5 py-3 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-red-800">
            {alerts.length} 条未处理的系统告警（接口、额度或支付处理异常）
          </p>
          <button type="button" onClick={() => resolve()} className="text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900">
            全部标记已读
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 text-xs text-red-700">
              <span>
                <span className="font-semibold">[{KIND_LABEL[a.kind]}]</span> {a.source}：{a.message}
              </span>
              <button type="button" onClick={() => resolve(a.id)} className="shrink-0 font-semibold underline underline-offset-2 hover:text-red-900">
                标记已读
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
    )}
    </>
  );
}
