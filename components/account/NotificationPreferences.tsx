"use client";

import { useEffect, useState } from "react";
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
  return <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onChange([])} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${allSelected ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]" : "border-[#d8e0e3] bg-white text-[#52636e] hover:border-[#9babb3]"}`}>全部</button>{values.map((value) => {
    const active = selected.includes(value);
    return <button key={value} type="button" onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]" : "border-[#d8e0e3] bg-white text-[#52636e] hover:border-[#9babb3]"}`}>{render(value)}</button>;
  })}</div>;
}

export function NotificationPreferences({ userId }: { userId: string }) {
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

  useEffect(() => {
    getSupabaseBrowserClient().from("email_notification_preferences")
      .select("enabled, countries, industries, statuses, relevance_tiers, keywords").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEnabled(data.enabled); setCountries(data.countries ?? []); setIndustries(data.industries ?? []); setStatuses(data.statuses ?? []); setTiers(data.relevance_tiers ?? []); setKeywords(data.keywords ?? []);
      });
  }, [userId]);

  async function save() {
    setSaving(true); setSaved(false);
    await getSupabaseBrowserClient().from("email_notification_preferences").upsert({ user_id: userId, enabled, countries, industries, statuses, relevance_tiers: tiers, keywords, timezone: "America/Mexico_City", updated_at: new Date().toISOString() });
    setSaving(false); setSaved(true);
  }

  function addKeyword() {
    const keyword = keywordDraft.trim().replace(/\s+/g, " ");
    if (!keyword || keywords.some((item) => item.toLocaleLowerCase() === keyword.toLocaleLowerCase()) || keywords.length >= 20) return;
    setKeywords([...keywords, keyword]); setKeywordDraft(""); setSaved(false);
  }

  return <section id="notification-preferences" className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6">
    <div className="flex items-start justify-between gap-6"><div><h2 className="font-black text-[#071826]">邮件通知</h2><p className="mt-1 text-sm leading-6 text-[#64717c]">每天墨西哥城时间 09:00 和 18:00，发送符合以下条件的新标与项目状态更新汇总；若没有符合条件的新标或状态更新，则不会发送邮件。</p></div><button type="button" role="switch" aria-checked={enabled} onClick={() => { setEnabled(!enabled); setSaved(false); }} className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-[#ffb21c]" : "bg-[#cbd5d9]"}`}><span className={`absolute top-1 size-5 rounded-full bg-white transition-transform ${enabled ? "left-6" : "left-1"}`} /></button></div>
    <div><p className="text-xs font-bold text-[#425461]">国家</p><ToggleList values={[...NOTIFICATION_COUNTRIES]} selected={countries} onChange={(next) => { setCountries(next); setSaved(false); }} render={(value) => localize(COUNTRY_LABELS[value as keyof typeof COUNTRY_LABELS], locale)} /></div>
    <div><p className="text-xs font-bold text-[#425461]">行业</p><ToggleList values={ALL_INDUSTRIES} selected={industries} onChange={(next) => { setIndustries(next); setSaved(false); }} render={(value) => localize(INDUSTRY_LABELS[value as keyof typeof INDUSTRY_LABELS], locale)} /></div>
    <div><p className="text-xs font-bold text-[#425461]">项目阶段</p><ToggleList values={STATUSES} selected={statuses} onChange={(next) => { setStatuses(next); setSaved(false); }} render={(value) => localize(STATUS_LABELS[value as TenderStatus], locale)} /></div>
    <div><p className="text-xs font-bold text-[#425461]">相关度</p><ToggleList values={TIERS} selected={tiers} onChange={(next) => { setTiers(next); setSaved(false); }} render={(value) => localize(RELEVANCE_TIER_LABELS[value as TenderRelevanceTier], locale)} /></div>
    <div><p className="text-xs font-bold text-[#425461]">关键词</p><p className="mt-1 text-xs leading-5 text-[#64717c]">命中任一关键词的项目才会纳入通知。可匹配标题、摘要、采购单位或项目编号。</p><div className="mt-2 flex gap-2"><input value={keywordDraft} onChange={(event) => { setKeywordDraft(event.target.value); setSaved(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} maxLength={80} placeholder="例如：新能源、solar、EPC" className="h-10 min-w-0 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] placeholder:text-[#919ca2] focus:border-[#ffb21c] focus:outline-none" /><button type="button" onClick={addKeyword} disabled={!keywordDraft.trim() || keywords.length >= 20} className="shrink-0 rounded-xl border border-[#071826] px-3 text-xs font-bold text-[#071826] hover:bg-[#071826] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">添加</button></div>{keywords.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{keywords.map((keyword) => <button key={keyword} type="button" onClick={() => { setKeywords(keywords.filter((item) => item !== keyword)); setSaved(false); }} className="rounded-full border border-[#d8e0e3] bg-white px-3 py-1.5 text-xs font-bold text-[#425461] hover:border-[#ffb21c]">{keyword} <span aria-hidden="true">×</span></button>)}</div>}<p className="mt-2 text-[11px] text-[#7a878f]">最多 20 个关键词；未添加关键词时，不限制关键词匹配。</p></div>
    <div className="flex items-center gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-[#ffb21c] px-4 py-2.5 text-xs font-black text-[#071826] hover:bg-[#ffc247] disabled:opacity-50">保存通知设置</button>{saved && <span className="text-xs text-emerald-600">已保存</span>}</div>
  </section>;
}
