"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ManualTaskState } from "@/lib/ops/manual-tasks";

/** "今天 14:05" / "10月5日 09:12", Beijing time. */
function whenDone(iso: string): string {
  const options = { timeZone: "Asia/Shanghai" } as const;
  const day = new Date(iso).toLocaleDateString("en-CA", options);
  const today = new Date().toLocaleDateString("en-CA", options);
  const time = new Date(iso).toLocaleTimeString("zh-CN", { ...options, hour: "2-digit", minute: "2-digit" });
  if (day === today) return `今天 ${time}`;
  return `${new Date(iso).toLocaleDateString("zh-CN", { ...options, month: "numeric", day: "numeric" })} ${time}`;
}

function useManualTasks() {
  const [tasks, setTasks] = useState<ManualTaskState[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/manual-tasks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTasks(data?.tasks ?? null))
      .catch(() => setTasks(null));
  }, []);
  return [tasks, setTasks] as const;
}

/**
 * The daily checklist of imports only an admin can run (user, 2026-10-06:
 * 帮我加一个网站内提醒：每天需要我做什么？). The full list sits at the top of
 * 新项目清单; every other admin page shows one line while something is left.
 * A task ticks itself when its import writes; 「今天看过了」 is for a day the
 * source had nothing worth importing. See lib/ops/manual-tasks.ts.
 */
export function DailyManualTasks() {
  const [tasks, setTasks] = useManualTasks();
  const [marking, setMarking] = useState<string | null>(null);

  async function markSeen(id: string) {
    setMarking(id);
    try {
      const res = await fetch("/api/admin/manual-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTasks(data.tasks);
    } catch (err) {
      alert(`标记失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMarking(null);
    }
  }

  if (!tasks) return null;
  const left = tasks.filter((task) => !task.doneToday).length;

  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-black text-[#071826]">今天要手动做的</h2>
        <p className={`text-xs font-black ${left > 0 ? "text-[#8a5a00]" : "text-[#186a3b]"}`}>
          {left > 0 ? `还剩 ${left} 项（共 ${tasks.length} 项）` : `${tasks.length} 项都做完了`}
        </p>
      </div>
      <p className="mt-1 text-xs text-[#64717c]">
        这些来源没有自动接口，每天要你手动导入。导入并写入后自动打勾（按北京时间算「今天」）；看过但没有值得导入的，点「今天看过了」。
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-[#eef1f2]">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${task.doneToday ? "bg-[#186a3b] text-white" : "border border-[#c9d2d6] text-transparent"}`}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span className="text-sm font-black text-[#071826]">{task.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${task.doneToday ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]"}`}>
                  {task.doneToday ? "今天已完成" : "今天还没做"}
                </span>
              </div>
              <p className="mt-1 pl-6 text-xs text-[#52636e]">{task.how}</p>
              <p className="mt-0.5 pl-6 text-[11px] text-[#8b979e]">
                {task.lastDoneAt ? `上次：${whenDone(task.lastDoneAt)}${task.detail ? ` · ${task.detail}` : ""}` : "还没有记录"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 pl-6 sm:pl-0">
              <a href={task.site.href} target="_blank" rel="noreferrer" className="rounded-lg border border-[#d8e0e3] px-2.5 py-1.5 text-xs font-bold text-[#52636e] hover:bg-[#f4f6f7]">
                {task.site.label} ↗
              </a>
              <Link href={task.href} className="rounded-lg bg-[#ffb21c] px-2.5 py-1.5 text-xs font-black text-[#071826] hover:bg-[#ffc247]">
                去导入
              </Link>
              {!task.doneToday && (
                <button
                  type="button"
                  onClick={() => markSeen(task.id)}
                  disabled={marking === task.id}
                  className="rounded-lg border border-[#d8e0e3] px-2.5 py-1.5 text-xs font-bold text-[#52636e] hover:bg-[#f4f6f7] disabled:opacity-50"
                >
                  今天看过了
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line on the other admin pages while something is left today. */
export function DailyManualTasksReminder() {
  const pathname = usePathname();
  const [tasks] = useManualTasks();
  if (!tasks || pathname.startsWith("/admin/import-tenders")) return null;
  const left = tasks.filter((task) => !task.doneToday);
  if (left.length === 0) return null;
  return (
    <div className="border-b border-[#ffb21c]/30 bg-[#fff8e8] px-5 py-2.5 sm:px-8">
      <p className="mx-auto max-w-6xl text-xs text-[#6b4a00]">
        <span className="font-black">今天还有 {left.length} 项手动导入：</span>
        {left.map((task) => task.label).join("、")}
        <Link href="/admin/import-tenders" className="ml-2 font-black underline underline-offset-2 hover:text-[#071826]">
          去处理
        </Link>
      </p>
    </div>
  );
}
