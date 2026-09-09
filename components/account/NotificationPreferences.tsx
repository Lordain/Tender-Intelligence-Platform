"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ALL_INDUSTRIES } from "@/lib/industry";
import { COUNTRY_LABELS, INDUSTRY_LABELS, RELEVANCE_TIER_LABELS, STATUS_LABELS } from "@/lib/tender-labels";
import { localize, useLocale } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { TenderRelevanceTier, TenderStatus } from "@/types/tender";

const STATUSES: TenderStatus[] = ["planned", "open", "clarification", "submission_closed", "awarded", "cancelled"];
const TIERS: TenderRelevanceTier[] = ["flagship", "significant", "standard"];
const NOTIFICATION_COUNTRIES = ["Mexico", "Colombia"] as const;

function ToggleList({ values, selected, onChange, render }: { values: string[]; selected: string[]; onChange: (next: string[]) => void; render: (value: string) => string }) {
  const allSelected = selected.length === 0;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange([])} className={`min-w-14 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${allSelected ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]" : "border-[#d8e0e3] bg-white text-[#52636e] hover:border-[#9babb3]"}`}>
        全部
      </button>
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button key={value} type="button" onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])} className={`min-w-14 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${active ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]" : "border-[#d8e0e3] bg-white text-[#52636e] hover:border-[#9babb3]"}`}>
            {render(value)}
          </button>
        );
      })}
    </div>
  );
}

function PreferenceGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#f3f5f4] p-4 sm:p-5">
      <p className="text-xs font-black tracking-[0.04em] text-[#425461]">{title}</p>
      {children}
    </div>
  );
}

export function NotificationPreferences({
  userId,
  locked = false,
  lockReason = "订阅后即可设置项目邮件通知。",
}: {
  userId: string;
  locked?: boolean;
  lockReason?: string;
}) {
  const { locale } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    getSupabaseBrowserClient().from("email_notification_preferences")
      .select("enabled, countries, industries, statuses, relevance_tiers, keywords").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEnabled(data.enabled);
        setCountries(data.countries ?? []);
        setIndustries(data.industries ?? []);
        setStatuses(data.statuses ?? []);
        setTiers(data.relevance_tiers ?? []);
        setKeywords(data.keywords ?? []);
      });
  }, [userId, locked]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error: saveError } = await getSupabaseBrowserClient().from("email_notification_preferences").upsert({ user_id: userId, enabled, countries, industries, statuses, relevance_tiers: tiers, keywords, timezone: "America/Mexico_City", updated_at: new Date().toISOString() });
    setSaving(false);
    if (saveError) {
      setError("通知设置保存失败，请稍后重试。");
      return;
    }
    setSaved(true);
  }

  function addKeyword() {
    const keyword = keywordDraft.trim().replace(/\s+/g, " ");
    if (!keyword || keywords.some((item) => item.toLocaleLowerCase() === keyword.toLocaleLowerCase()) || keywords.length >= 20) return;
    setKeywords([...keywords, keyword]);
    setKeywordDraft("");
    setSaved(false);
  }

  if (locked) {
    return (
      <section id="notification-preferences" className="scroll-mt-28 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf2f3] text-[#64717c]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-black text-[#071826]">邮件通知</h2>
                <span className="rounded-full bg-[#edf2f3] px-3 py-1 text-[10px] font-bold text-[#64717c]">暂未开放</span>
              </div>
              <p className="mt-2 text-sm leading-7 text-[#64717c]">{lockReason}</p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-[#0a2b40] px-5 text-sm font-black text-[#0a2b40] hover:bg-[#0a2b40] hover:text-white">查看订阅服务</Link>
        </div>
      </section>
    );
  }

  return (
    <section id="notification-preferences" className="scroll-mt-28 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-8">
      <div className="flex items-start justify-between gap-5 border-b border-[#e4e9eb] pb-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0ca] text-[#a96100]" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-black text-[#071826]">邮件通知</h2>
              <span className="rounded-full bg-[#edf2f3] px-3 py-1 text-[10px] font-bold text-[#52636e]">每日 09:00 / 18:00</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#64717c]">按墨西哥城时间发送符合条件的新标与项目状态更新汇总。没有符合条件的内容时，不会发送邮件。</p>
          </div>
        </div>
        <button type="button" role="switch" aria-label="邮件通知" aria-checked={enabled} onClick={() => { setEnabled(!enabled); setSaved(false); }} className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors ${enabled ? "bg-[#ffb21c]" : "bg-[#cbd5d9]"}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <PreferenceGroup title="国家"><ToggleList values={[...NOTIFICATION_COUNTRIES]} selected={countries} onChange={(next) => { setCountries(next); setSaved(false); }} render={(value) => localize(COUNTRY_LABELS[value as keyof typeof COUNTRY_LABELS], locale)} /></PreferenceGroup>
        <PreferenceGroup title="相关度"><ToggleList values={TIERS} selected={tiers} onChange={(next) => { setTiers(next); setSaved(false); }} render={(value) => localize(RELEVANCE_TIER_LABELS[value as TenderRelevanceTier], locale)} /></PreferenceGroup>
        <PreferenceGroup title="项目阶段"><ToggleList values={STATUSES} selected={statuses} onChange={(next) => { setStatuses(next); setSaved(false); }} render={(value) => localize(STATUS_LABELS[value as TenderStatus], locale)} /></PreferenceGroup>
        <PreferenceGroup title="行业"><ToggleList values={ALL_INDUSTRIES} selected={industries} onChange={(next) => { setIndustries(next); setSaved(false); }} render={(value) => localize(INDUSTRY_LABELS[value as keyof typeof INDUSTRY_LABELS], locale)} /></PreferenceGroup>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e1e7e9] p-4 sm:p-5">
        <p className="text-xs font-black tracking-[0.04em] text-[#425461]">关键词</p>
        <p className="mt-1 text-xs leading-5 text-[#64717c]">命中任一关键词的项目才会纳入通知，可匹配标题、摘要、采购单位或项目编号。</p>
        <div className="mt-3 flex gap-2">
          <input value={keywordDraft} onChange={(event) => { setKeywordDraft(event.target.value); setSaved(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} maxLength={80} placeholder="例如：新能源、solar、EPC" className="h-11 min-w-0 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] placeholder:text-[#98a2a8] focus:border-[#ffb21c] focus:outline-none focus:ring-2 focus:ring-[#ffb21c]/15" />
          <button type="button" onClick={addKeyword} disabled={!keywordDraft.trim() || keywords.length >= 20} className="shrink-0 rounded-xl border border-[#071826] px-4 text-xs font-bold text-[#071826] transition-colors hover:bg-[#071826] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">添加</button>
        </div>
        {keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{keywords.map((keyword) => <button key={keyword} type="button" onClick={() => { setKeywords(keywords.filter((item) => item !== keyword)); setSaved(false); }} className="rounded-full border border-[#d8e0e3] bg-white px-3 py-2 text-xs font-bold text-[#425461] hover:border-[#ffb21c]">{keyword} <span aria-hidden="true">×</span></button>)}</div>}
        <p className="mt-3 text-[11px] text-[#7a878f]">最多 20 个关键词；未添加关键词时，不限制关键词匹配。</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#e4e9eb] pt-6">
        <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-[#ffb21c] px-5 py-3 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50">{saving ? "保存中…" : "保存通知设置"}</button>
        {saved && <span className="text-xs font-semibold text-emerald-600">已保存</span>}
      </div>
      {error && <p className="mt-3 text-xs font-bold text-red-700">{error}</p>}
    </section>
  );
}
