"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  Tender,
  TenderStatus,
  GovernmentLevel,
  TenderScopeType,
  TenderParticipationScope,
  TenderRelevanceTier,
} from "@/types/tender";
import { ALL_INDUSTRIES } from "@/lib/industry";
import {
  ALL_COUNTRIES,
  STATUS_LABELS,
  GOVERNMENT_LEVEL_LABELS,
  SCOPE_TYPE_LABELS,
  PARTICIPATION_SCOPE_LABELS,
  INDUSTRY_LABELS,
  RELEVANCE_TIER_LABELS,
} from "@/lib/tender-labels";
import { KeyDatesEditor } from "@/components/admin/KeyDatesEditor";
import { RequirementsEditor } from "@/components/admin/RequirementsEditor";
import { RisksEditor } from "@/components/admin/RisksEditor";

const STATUS_KEYS = Object.keys(STATUS_LABELS) as TenderStatus[];
const GOVERNMENT_LEVEL_KEYS = Object.keys(GOVERNMENT_LEVEL_LABELS) as GovernmentLevel[];
const SCOPE_TYPE_KEYS = Object.keys(SCOPE_TYPE_LABELS) as TenderScopeType[];
const PARTICIPATION_SCOPE_KEYS = Object.keys(PARTICIPATION_SCOPE_LABELS) as TenderParticipationScope[];
const RELEVANCE_TIER_KEYS = Object.keys(RELEVANCE_TIER_LABELS) as TenderRelevanceTier[];

const inputClass =
  "h-11 w-full rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] outline-none transition-shadow focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10";
const labelClass = "flex flex-col gap-1 text-sm";
const labelTextClass = "text-xs font-black text-[#52636e]";

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_18px_50px_-48px_rgba(6,27,43,.5)] sm:p-6">
      <div className="flex items-start gap-3 border-b border-[#e5e9eb] pb-4">
        <span aria-hidden="true" className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-[#ffb21c]" />
        <div>
          <h2 className="text-base font-black text-[#071826]">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[#75838c]">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

type FormState = {
  titleEs: string;
  titleZh: string;
  summaryEs: string;
  summaryZh: string;
  buyer: string;
  country: string;
  governmentLevel: GovernmentLevel;
  industries: string[];
  scopeType: TenderScopeType;
  procedureType: string;
  participationScope: TenderParticipationScope | "";
  publicationDate: string;
  publicationDateIsEstimated: boolean;
  submissionDeadline: string;
  awardDate: string;
  awardedTo: string;
  awardedValue: string;
  estimatedValue: string;
  currency: string;
  location: string;
  status: TenderStatus;
  relevanceTier: TenderRelevanceTier;
  relevanceManuallyOverridden: boolean;
  documentsUnavailable: boolean;
  tenderNumber: string;
  sourceName: string;
  sourceUrl: string;
};

function toDateInputValue(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function initialStateFrom(tender?: Tender): FormState {
  return {
    titleEs: tender?.title.es ?? "",
    titleZh: tender?.title.zh ?? "",
    summaryEs: tender?.summary.es ?? "",
    summaryZh: tender?.summary.zh ?? "",
    buyer: tender?.buyer ?? "",
    country: tender?.country ?? ALL_COUNTRIES[0],
    governmentLevel: tender?.governmentLevel ?? "federal",
    industries: tender?.industries ?? [],
    scopeType: tender?.scopeType ?? "services",
    procedureType: tender?.procedureType ?? "",
    participationScope: tender?.participationScope ?? "",
    publicationDate: toDateInputValue(tender?.publicationDate) || toDateInputValue(new Date().toISOString()),
    publicationDateIsEstimated: tender?.publicationDateIsEstimated ?? false,
    submissionDeadline: toDateInputValue(tender?.submissionDeadline),
    awardDate: toDateInputValue(tender?.awardDate),
    awardedTo: tender?.awardedTo ?? "",
    awardedValue: tender?.awardedValue?.toString() ?? "",
    estimatedValue: tender?.estimatedValue?.toString() ?? "",
    currency: tender?.currency ?? "",
    location: tender?.location ?? "",
    status: tender?.status ?? "open",
    relevanceTier: tender?.relevance.tier ?? "standard",
    relevanceManuallyOverridden: tender?.relevanceManuallyOverridden ?? false,
    documentsUnavailable: tender?.documentsUnavailable ?? false,
    tenderNumber: tender?.tenderNumber ?? "",
    sourceName: tender?.sourceName ?? "人工添加（管理后台）",
    sourceUrl: tender?.sourceUrl ?? "",
  };
}

export function AdminTenderForm({ tender }: { tender?: Tender }) {
  const router = useRouter();
  const isEdit = Boolean(tender);
  const [form, setForm] = useState<FormState>(() => initialStateFrom(tender));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedTenderNumber, setCopiedTenderNumber] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const officialEntryUrl = /^https?:\/\//i.test(form.sourceUrl.trim()) ? form.sourceUrl.trim() : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIndustry(key: string) {
    setForm((prev) => ({
      ...prev,
      industries: prev.industries.includes(key) ? prev.industries.filter((i) => i !== key) : [...prev.industries, key],
    }));
  }

  async function copyTenderNumber() {
    const tenderNumber = form.tenderNumber.trim();
    if (!tenderNumber) return;
    await navigator.clipboard.writeText(tenderNumber);
    setCopiedTenderNumber(true);
    window.setTimeout(() => setCopiedTenderNumber(false), 1800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      titleEs: form.titleEs,
      titleZh: form.titleZh,
      summaryEs: form.summaryEs,
      summaryZh: form.summaryZh,
      buyer: form.buyer,
      country: form.country,
      governmentLevel: form.governmentLevel,
      industries: form.industries,
      scopeType: form.scopeType,
      procedureType: form.procedureType,
      participationScope: form.participationScope || undefined,
      publicationDate: form.publicationDate ? new Date(form.publicationDate).toISOString() : undefined,
      publicationDateIsEstimated: form.publicationDateIsEstimated,
      submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : null,
      awardDate: form.awardDate ? new Date(form.awardDate).toISOString() : null,
      awardedTo: form.awardedTo || null,
      awardedValue: form.awardedValue ? Number(form.awardedValue) : null,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      currency: form.currency || null,
      location: form.location || null,
      status: form.status,
      relevanceTier: form.relevanceTier,
      relevanceManuallyOverridden: form.relevanceManuallyOverridden,
      documentsUnavailable: form.documentsUnavailable,
      tenderNumber: form.tenderNumber,
      sourceName: form.sourceName,
      sourceUrl: form.sourceUrl,
    };

    try {
      const res = await fetch(isEdit ? `/api/admin/tenders/${tender!.slug}` : "/api/admin/tenders", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Real complaint, 2026-09-06: a newly-created tender has no id yet,
      // so "标书分析结果"/"其他关键日期" can't render on this form (see the
      // placeholder text above) — sending the admin back to the list after
      // create meant clicking straight back in to reach those blocks.
      // Land on the tender's own edit page instead, where everything is
      // now available. Editing an existing tender still returns to the
      // list, matching prior behavior.
      router.push(isEdit ? "/admin/tenders" : `/admin/tenders/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!tender) return;
    if (!confirm(`确定要删除「${tender.title.zh}」吗？此操作无法撤销。`)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tender.slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      router.push("/admin/tenders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {isEdit && (
        <p className="w-fit rounded-lg bg-[#f2f4f3] px-3 py-2 text-xs text-[#7a878f]">
          项目标识：<code className="font-bold text-[#425461]">{tender!.slug}</code>（不可修改）
        </p>
      )}

      <FormSection title="项目名称与摘要" description="保留西语原文，并提供面向中文用户的标题与简要说明。">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>标题（西语原文）*</span>
          <input className={inputClass} value={form.titleEs} onChange={(e) => update("titleEs", e.target.value)} required />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>标题（中文）*</span>
          <input className={inputClass} value={form.titleZh} onChange={(e) => update("titleZh", e.target.value)} required />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>摘要（西语原文）</span>
          <textarea className={`${inputClass} min-h-24 py-3`} value={form.summaryEs} onChange={(e) => update("summaryEs", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>摘要（中文）</span>
          <textarea className={`${inputClass} min-h-24 py-3`} value={form.summaryZh} onChange={(e) => update("summaryZh", e.target.value)} />
        </label>
      </div>
      </FormSection>

      <FormSection title="采购与分类" description="定义采购主体、所属市场、行业标签和投标范围。">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>采购单位 *</span>
          <input className={inputClass} value={form.buyer} onChange={(e) => update("buyer", e.target.value)} required />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>国家 *</span>
          <select className={inputClass} value={form.country} onChange={(e) => update("country", e.target.value)}>
            {ALL_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>政府层级 *</span>
          <select className={inputClass} value={form.governmentLevel} onChange={(e) => update("governmentLevel", e.target.value as GovernmentLevel)}>
            {GOVERNMENT_LEVEL_KEYS.map((k) => (
              <option key={k} value={k}>
                {GOVERNMENT_LEVEL_LABELS[k].zh}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={labelClass}>
        <span className={labelTextClass}>行业（可多选）</span>
        <div className="flex flex-wrap gap-2">
          {ALL_INDUSTRIES.map((key) => (
            <label
              key={key}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                form.industries.includes(key)
                  ? "border-[#061b2b] bg-[#061b2b] text-white"
                  : "border-[#d8e0e3] text-[#5d6d77]"
              }`}
            >
              <input type="checkbox" className="hidden" checked={form.industries.includes(key)} onChange={() => toggleIndustry(key)} />
              {INDUSTRY_LABELS[key].zh}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>标的类型 *</span>
          <select className={inputClass} value={form.scopeType} onChange={(e) => update("scopeType", e.target.value as TenderScopeType)}>
            {SCOPE_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {SCOPE_TYPE_LABELS[k].zh}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>采购方式 *</span>
          <input className={inputClass} value={form.procedureType} onChange={(e) => update("procedureType", e.target.value)} required />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>境外投标人可否参与</span>
          <select
            className={inputClass}
            value={form.participationScope}
            onChange={(e) => update("participationScope", e.target.value as TenderParticipationScope | "")}
          >
            <option value="">未知</option>
            {PARTICIPATION_SCOPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {PARTICIPATION_SCOPE_LABELS[k].zh}
              </option>
            ))}
          </select>
        </label>
      </div>
      </FormSection>

      <FormSection title="项目状态和预算" description="集中设置项目状态、相关度、预算与中标结果。">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>状态 *</span>
          <select className={inputClass} value={form.status} onChange={(e) => update("status", e.target.value as TenderStatus)}>
            {STATUS_KEYS.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k].zh}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>相关度分级</span>
          <select
            className={inputClass}
            value={form.relevanceTier}
            onChange={(e) => {
              const value = e.target.value as TenderRelevanceTier;
              setForm((prev) => ({ ...prev, relevanceTier: value, relevanceManuallyOverridden: true }));
            }}
          >
            {RELEVANCE_TIER_KEYS.map((k) => (
              <option key={k} value={k}>
                {RELEVANCE_TIER_LABELS[k].zh}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>地点</span>
          <input className={inputClass} value={form.location} onChange={(e) => update("location", e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 rounded-xl bg-[#f2f4f3] px-4 py-3 text-sm text-[#233846]">
        <input
          type="checkbox"
          checked={form.relevanceManuallyOverridden}
          onChange={(e) => update("relevanceManuallyOverridden", e.target.checked)}
          className="size-4 accent-[#ffb21c]"
        />
        锁定此相关度分级，避免重新抓取时被自动分类覆盖
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>预估金额</span>
          <input type="number" className={inputClass} value={form.estimatedValue} onChange={(e) => update("estimatedValue", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>币种（如 MXN / USD）</span>
          <input className={inputClass} value={form.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="border-t border-[#e5e9eb] pt-4">
        <p className="mb-3 text-xs font-black text-[#52636e]">中标结果</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>中标日期</span>
          <input type="date" className={inputClass} value={form.awardDate} onChange={(e) => update("awardDate", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>中标单位</span>
          <input className={inputClass} value={form.awardedTo} onChange={(e) => update("awardedTo", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>中标金额</span>
          <input type="number" className={inputClass} value={form.awardedValue} onChange={(e) => update("awardedValue", e.target.value)} />
        </label>
        </div>
      </div>
      </FormSection>

      {/*
        Publication and submission remain together with the additional
        timeline editor. Award-result fields live in the status/budget
        section above so administrators can review the outcome as one unit.
      */}
      <FormSection
        title="关键日期"
        description={
          isEdit
            ? "发布日期与投标截止日期点击下方“保存修改”生效；其他关键节点各自独立立即保存。"
            : "发布日期为必填项；其余关键节点需要先保存这条标书后才能添加。"
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={labelClass}>
            <label className="flex flex-col gap-1">
              <span className={labelTextClass}>发布日期 *</span>
              <input type="date" className={inputClass} value={form.publicationDate} onChange={(e) => update("publicationDate", e.target.value)} required />
            </label>
            <label className="mt-1 flex items-center gap-1.5 text-xs text-[#7a878f]">
              <input
                type="checkbox"
                checked={form.publicationDateIsEstimated}
                onChange={(e) => update("publicationDateIsEstimated", e.target.checked)}
                className="size-3.5 accent-[#ffb21c]"
              />
              该日期是估算值（部分数据源没有真实发布日期字段，用入库时间代替）——已核实真实日期请取消勾选
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>投标截止日期</span>
            <input type="date" className={inputClass} value={form.submissionDeadline} onChange={(e) => update("submissionDeadline", e.target.value)} />
          </label>
        </div>

        {isEdit && (
          <div className="border-t border-[#e5e9eb] pt-5">
            <p className="text-xs font-black text-[#52636e]">其他关键日期</p>
            <p className="mt-1 text-xs leading-5 text-[#75838c]">
              澄清会议、现场踏勘、提问截止、开标、合同签署等——每项立即保存，无需点击上方的整体保存按钮。
            </p>
            <div className="mt-3">
              <KeyDatesEditor tenderSlug={tender!.slug} initialKeyDates={tender!.keyDates} />
            </div>
          </div>
        )}
      </FormSection>

      {/*
        RequirementsEditor/RisksEditor each save straight to their own
        /api/admin/tenders/{slug}/requirements|risks endpoints — they need
        a real, already-persisted tender id, which a brand-new tender
        doesn't have yet. Rather than hiding the whole section (the
        original complaint was that create looked like it was "missing
        blocks"), show the same titled block with an explanation, so it's
        visibly present and an admin knows exactly why it's not editable
        yet and where it'll show up.
      */}
      <FormSection title="标书分析结果" description="资质要求、经验要求、所需文件与风险提示——通常由文件分析流程生成，也可以在这里手动补充或修正；每项立即保存。">
        {isEdit ? (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-black text-[#52636e]">资质要求</p>
              <RequirementsEditor tenderSlug={tender!.slug} kind="qualification" initialItems={tender!.qualifications} />
            </div>
            <div>
              <p className="mb-2 text-xs font-black text-[#52636e]">经验要求</p>
              <RequirementsEditor tenderSlug={tender!.slug} kind="experience" initialItems={tender!.experienceRequirements} />
            </div>
            <div>
              <p className="mb-2 text-xs font-black text-[#52636e]">所需文件</p>
              <RequirementsEditor tenderSlug={tender!.slug} kind="document" initialItems={tender!.requiredDocuments} />
            </div>
            <div>
              <p className="mb-2 text-xs font-black text-[#52636e]">风险提示</p>
              <RisksEditor tenderSlug={tender!.slug} initialItems={tender!.risks} />
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-[#f2f4f3] px-3 py-2 text-xs leading-5 text-[#7a878f]">
            请先点击下方“创建项目”保存这条标书，保存后会自动进入编辑页面，再在这里补充资质要求、经验要求、所需文件与风险提示。
          </p>
        )}
      </FormSection>

      <FormSection title="官方正式投标入口" description="保存官方编号与正式投标页面，方便核验并按官方要求参与投标。">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>标书编号</span>
          <input className={inputClass} value={form.tenderNumber} onChange={(e) => update("tenderNumber", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>官方平台名称</span>
          <input className={inputClass} value={form.sourceName} onChange={(e) => update("sourceName", e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>官方正式投标入口链接</span>
          <input className={inputClass} value={form.sourceUrl} onChange={(e) => update("sourceUrl", e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyTenderNumber}
          disabled={!form.tenderNumber.trim()}
          className="inline-flex h-11 items-center rounded-xl border border-[#cbd6da] bg-white px-4 text-sm font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copiedTenderNumber ? "已复制标书编号" : "复制标书编号"}
        </button>
        {officialEntryUrl && (
          <a
            href={officialEntryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#0a2b40] bg-[#0a2b40] px-4 text-sm font-black text-white transition-colors hover:bg-[#123d56]"
          >
            打开官方正式投标入口 <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-[#233846]">
        <input
          type="checkbox"
          checked={form.documentsUnavailable}
          onChange={(e) => update("documentsUnavailable", e.target.checked)}
          className="size-4 accent-[#ffb21c]"
        />
        🚫 标记为无法获取附件（不再出现在&ldquo;待补文件&rdquo;清单；取消勾选可恢复到待处理清单）
      </label>
      </FormSection>

      <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]/95 p-3 shadow-[0_12px_35px_-18px_rgba(6,27,43,.35)] backdrop-blur">
        <div>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              {deleting ? "删除中…" : "删除此项目"}
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || deleting}
          className="rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {saving ? "保存中…" : isEdit ? "保存修改" : "创建项目"}
        </button>
      </div>
    </form>
  );
}
