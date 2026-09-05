"use client";

import { useEffect, useState } from "react";

type AdminAlert = {
  id: string;
  kind: "quota" | "connection" | "other";
  message: string;
  source: string;
  created_at: string;
};

const KIND_LABEL: Record<AdminAlert["kind"], string> = {
  quota: "额度/限流",
  connection: "网络连接",
  other: "其他错误",
};

/**
 * Rendered in AdminShell on every /admin/* page — shows unresolved rows
 * from admin_alerts (see lib/admin-alerts.ts for what writes them: real
 * Anthropic/DashScope quota/rate-limit errors or network failures from
 * the two web tools that call an LLM directly, translate-tenders and
 * analyze-document). Fetches once on mount, not polled — this is a
 * locally-run admin tool, not a monitoring dashboard; refresh the page
 * to see anything that happened since.
 */
export function AdminAlertBanner() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/alerts")
      .then((res) => res.json())
      .then((data) => setAlerts(data.alerts ?? []))
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

  if (loading || alerts.length === 0) return null;

  return (
    <div className="border-b border-red-900/20 bg-red-50 px-5 py-3 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-red-800">
            {alerts.length} 条未处理的系统告警（LLM 调用出错 — 额度用完或连接失败）
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
  );
}
