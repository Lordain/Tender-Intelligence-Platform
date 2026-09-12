"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HomepageSettingsPanel({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const [count, setCount] = useState(String(initialCount));
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function clearFeatured() {
    if (!confirm("确定要清空所有已勾选的“首页”项目吗？此操作无法撤销。")) return;
    setClearing(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/tenders/clear-homepage-featured", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  }

  async function save() {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      setError("请输入一个非负整数");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/homepage-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featuredCount: n }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Homepage</p>
          <h2 className="mt-1 text-lg font-black text-[#071826]">首页免费展示设置</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-[#52636e]">
            勾选下方列表中的“首页”项目，并设置首页最多展示的数量；数量不足时，系统会自动使用最新项目补足。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">首页展示数量</span>
          <input
            type="number"
            min={0}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              setSaved(false);
            }}
            className="h-9 w-28 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-700">已保存</span>}
        <button
          type="button"
          onClick={clearFeatured}
          disabled={clearing}
          className="h-9 rounded-lg border border-[#d8e0e3] bg-white px-4 text-xs font-black text-[#64717c] transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
        >
          {clearing ? "清空中…" : "清空当前勾选"}
        </button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
