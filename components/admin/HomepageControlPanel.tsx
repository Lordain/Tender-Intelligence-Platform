"use client";

import { useMemo, useState } from "react";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { countryLabel } from "@/lib/tender-labels";
import type { LocalizedText } from "@/types/tender";

type HomepageTenderOption = {
  id: string;
  slug: string;
  tenderNumber: string;
  title: LocalizedText;
  country: string;
  publicationDate: string;
};

type ListKind = "featured" | "ticker";

function Arrow({ direction }: { direction: "up" | "down" }) {
  return <span aria-hidden="true">{direction === "up" ? "↑" : "↓"}</span>;
}

export function HomepageControlPanel({
  tenders,
  initialFeaturedSlugs,
  initialTickerSlugs,
  initialFeaturedCount,
  initialTickerCount,
}: {
  tenders: HomepageTenderOption[];
  initialFeaturedSlugs: string[];
  initialTickerSlugs: string[];
  initialFeaturedCount: number;
  initialTickerCount: number;
}) {
  const bySlug = useMemo(() => new Map(tenders.map((tender) => [tender.slug, tender])), [tenders]);
  const [featuredSlugs, setFeaturedSlugs] = useState(initialFeaturedSlugs.filter((slug) => bySlug.has(slug)));
  const [tickerSlugs, setTickerSlugs] = useState(initialTickerSlugs.filter((slug) => bySlug.has(slug) && !initialFeaturedSlugs.includes(slug)));
  const [featuredCount, setFeaturedCount] = useState(initialFeaturedCount);
  const [tickerCount, setTickerCount] = useState(initialTickerCount);
  const [featuredInput, setFeaturedInput] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function findTender(value: string) {
    const key = value.trim().toLowerCase();
    return tenders.find((tender) =>
      tender.id.toLowerCase() === key ||
      tender.slug.toLowerCase() === key ||
      tender.tenderNumber.toLowerCase() === key,
    );
  }

  function addTender(kind: ListKind) {
    const input = kind === "featured" ? featuredInput : tickerInput;
    const tender = findTender(input);
    if (!tender) {
      setMessage("未找到该项目，请核对项目 ID、slug 或标书编号。");
      return;
    }
    const own = kind === "featured" ? featuredSlugs : tickerSlugs;
    const other = kind === "featured" ? tickerSlugs : featuredSlugs;
    if (own.includes(tender.slug)) {
      setMessage("这个项目已经在当前区域中。");
      return;
    }
    if (other.includes(tender.slug)) {
      setMessage("同一项目不能同时出现在免费展示和滚动预览中，请先从另一处移除。");
      return;
    }
    if (kind === "featured") {
      setFeaturedSlugs((current) => [...current, tender.slug]);
      setFeaturedInput("");
    } else {
      setTickerSlugs((current) => [...current, tender.slug]);
      setTickerInput("");
    }
    setMessage(null);
  }

  function removeTender(kind: ListKind, slug: string) {
    if (kind === "featured") setFeaturedSlugs((current) => current.filter((item) => item !== slug));
    else setTickerSlugs((current) => current.filter((item) => item !== slug));
    setMessage(null);
  }

  function moveTender(kind: ListKind, index: number, offset: number) {
    const list = kind === "featured" ? featuredSlugs : tickerSlugs;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    const next = [...list];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    if (kind === "featured") setFeaturedSlugs(next);
    else setTickerSlugs(next);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/homepage-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featuredSlugs, tickerSlugs, featuredCount, tickerCount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setMessage("首页设置已保存，刷新前台即可查看效果。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function section({
    kind,
    eyebrow,
    title,
    description,
    slugs,
    input,
    setInput,
    count,
    setCount,
  }: {
    kind: ListKind;
    eyebrow: string;
    title: string;
    description: string;
    slugs: string[];
    input: string;
    setInput: (value: string) => void;
    count: number;
    setCount: (value: number) => void;
  }) {
    return (
      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)] sm:p-7">
        <div className="flex flex-col gap-4 border-b border-[#e5e9eb] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b86e00]">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-black text-[#071826]">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64717c]">{description}</p>
          </div>
          <label className="flex shrink-0 items-center gap-3 text-xs font-black text-[#52636e]">
            前台显示数量
            <input
              type="number"
              min={0}
              max={50}
              value={count}
              onChange={(event) => setCount(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
              className="h-11 w-20 rounded-xl border border-[#d8e0e3] bg-white px-3 text-center text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
            />
          </label>
        </div>

        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => { event.preventDefault(); addTender(kind); }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入项目 ID、slug 或标书编号"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] outline-none placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
          />
          <button type="submit" className="h-11 rounded-xl bg-[#071826] px-5 text-sm font-black text-white transition-colors hover:bg-[#12364d]">
            + 添加项目
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          {slugs.map((slug, index) => {
            const tender = bySlug.get(slug);
            if (!tender) return null;
            return (
              <div key={slug} className={`grid gap-3 rounded-xl border px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center ${index < count ? "border-[#dbe2e5] bg-white" : "border-dashed border-[#d8e0e3] bg-[#f4f6f5] opacity-65"}`}>
                <span className="text-center text-xs font-black text-[#8a969d]">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#071826]">{tender.title.zh || tender.title.es}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#71808a]">
                    <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, "zh")}</span>
                    <span>ID: {tender.id}</span>
                    <span>标书编号: {tender.tenderNumber}</span>
                  </p>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button type="button" aria-label="上移" disabled={index === 0} onClick={() => moveTender(kind, index, -1)} className="size-8 rounded-lg border border-[#d8e0e3] bg-white text-sm font-black text-[#52636e] disabled:opacity-30"><Arrow direction="up" /></button>
                  <button type="button" aria-label="下移" disabled={index === slugs.length - 1} onClick={() => moveTender(kind, index, 1)} className="size-8 rounded-lg border border-[#d8e0e3] bg-white text-sm font-black text-[#52636e] disabled:opacity-30"><Arrow direction="down" /></button>
                  <button type="button" onClick={() => removeTender(kind, slug)} className="h-8 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-600 hover:bg-red-50">移除</button>
                </div>
              </div>
            );
          })}
          {slugs.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#d8e0e3] bg-[#f7f8f7] px-4 py-8 text-center text-sm text-[#7a878f]">尚未添加项目</p>
          )}
        </div>
        {slugs.length > count && <p className="mt-3 text-xs text-[#8a6a2e]">当前有 {slugs.length} 个项目，仅前 {count} 个会显示；可调整数量或顺序。</p>}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {message && (
        <div
          role="status"
          className={`fixed right-5 top-24 z-50 flex max-w-[min(28rem,calc(100vw-2.5rem))] items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-[0_18px_50px_-24px_rgba(6,27,43,.45)] sm:right-8 ${message.includes("已保存") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-[#fff9e8] text-amber-800"}`}
        >
          <span className="leading-6">{message}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => setMessage(null)}
            className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-base leading-5 opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
      {section({
        kind: "featured",
        eyebrow: "Free preview",
        title: "首页免费展示设置",
        description: "控制首页下方免费项目卡片。这里的项目不会再出现在右上方滚动预览中。",
        slugs: featuredSlugs,
        input: featuredInput,
        setInput: setFeaturedInput,
        count: featuredCount,
        setCount: setFeaturedCount,
      })}
      {section({
        kind: "ticker",
        eyebrow: "Scrolling preview",
        title: "项目滚动设置",
        description: "建议选择 10 个来自不同国家和行业的项目；不限制墨西哥，国家名称与国旗会按项目数据自动显示。",
        slugs: tickerSlugs,
        input: tickerInput,
        setInput: setTickerInput,
        count: tickerCount,
        setCount: setTickerCount,
      })}

      <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]/95 p-3 shadow-[0_14px_36px_-20px_rgba(6,27,43,.45)] backdrop-blur">
        <button type="button" onClick={save} disabled={saving} className="h-11 rounded-xl bg-[#ffb21c] px-6 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50">
          {saving ? "保存中…" : "保存首页设置"}
        </button>
      </div>
    </div>
  );
}
