"use client";

import { useState } from "react";
import type { TenderRequirement } from "@/types/tender";

const inputClass =
  "h-10 w-full rounded-lg border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none transition-shadow focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10";
const textareaClass = `${inputClass} h-auto min-h-16 py-2`;
const labelClass = "flex flex-col gap-1 text-xs";
const labelTextClass = "font-bold text-[#52636e]";

type DraftState = { titleZh: string; descriptionZh: string; mandatory: boolean; sourceReference: string };
const EMPTY_DRAFT: DraftState = { titleZh: "", descriptionZh: "", mandatory: true, sourceReference: "" };

function toDraft(item: TenderRequirement): DraftState {
  return { titleZh: item.title.zh, descriptionZh: item.description.zh, mandatory: item.mandatory, sourceReference: item.sourceReference ?? "" };
}

/**
 * Manual add/edit/delete for one requirement kind (qualifications /
 * experienceRequirements / requiredDocuments — all share the
 * tender_requirements table, distinguished by `kind`; see
 * supabase/migrations/0001_init.sql). Instantiate once per kind — this is
 * the "标书分析结果" manual entry the admin normally only gets from the
 * Layer 2 document-extraction pipeline. Only rendered in AdminTenderForm's
 * edit mode.
 */
export function RequirementsEditor({
  tenderSlug,
  kind,
  initialItems,
}: {
  tenderSlug: string;
  kind: "qualification" | "experience" | "document";
  initialItems: TenderRequirement[];
}) {
  const [items, setItems] = useState<TenderRequirement[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [addDraft, setAddDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!addDraft.titleZh.trim()) {
      setError("请填写标题");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...addDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems((prev) => [
        ...prev,
        {
          id: data.id,
          title: { es: "", en: "", zh: addDraft.titleZh },
          description: { es: "", en: "", zh: addDraft.descriptionZh },
          mandatory: addDraft.mandatory,
          sourceReference: addDraft.sourceReference || undefined,
        },
      ]);
      setAddDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/requirements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                title: { es: "", en: "", zh: editDraft.titleZh },
                description: { es: "", en: "", zh: editDraft.descriptionZh },
                mandatory: editDraft.mandatory,
                sourceReference: editDraft.sourceReference || undefined,
              }
            : item,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定要删除这一项吗？")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/requirements/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {items.length === 0 && <p className="text-xs text-[#7a878f]">还没有内容。</p>}

      {items.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-[#ffb21c]/60 bg-[#fff8e9] p-3">
            <input className={inputClass} placeholder="标题" value={editDraft.titleZh} onChange={(e) => setEditDraft((d) => ({ ...d, titleZh: e.target.value }))} />
            <textarea className={textareaClass} placeholder="说明（可选）" value={editDraft.descriptionZh} onChange={(e) => setEditDraft((d) => ({ ...d, descriptionZh: e.target.value }))} />
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${inputClass} flex-1`} placeholder="来源引用（可选，如页码/条款号）" value={editDraft.sourceReference} onChange={(e) => setEditDraft((d) => ({ ...d, sourceReference: e.target.value }))} />
              <label className="flex items-center gap-1.5 text-xs text-[#52636e]">
                <input type="checkbox" className="size-4 accent-[#ffb21c]" checked={editDraft.mandatory} onChange={(e) => setEditDraft((d) => ({ ...d, mandatory: e.target.checked }))} />
                强制项
              </label>
              <button type="button" disabled={busyId === item.id} onClick={() => handleSaveEdit(item.id)} className="rounded-lg bg-[#ffb21c] px-3 py-1.5 text-xs font-black text-[#071826] disabled:opacity-50">
                保存
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[#d8e0e3] px-3 py-1.5 text-xs font-bold text-[#52636e]">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div key={item.id} className="rounded-xl border border-[#e2e7e9] bg-white px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-[#071826]">
                  {item.title.zh} {item.mandatory && <span className="ml-1 text-xs font-bold text-[#b86e00]">（强制）</span>}
                </p>
                {item.description.zh && <p className="mt-1 text-xs leading-5 text-[#7a878f]">{item.description.zh}</p>}
                {item.sourceReference && <p className="mt-1 text-[11px] text-[#9aa5ab]">来源：{item.sourceReference}</p>}
              </div>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditDraft(toDraft(item));
                  }}
                  className="text-xs font-bold text-[#0a6ebd] hover:underline"
                >
                  编辑
                </button>
                <button type="button" disabled={busyId === item.id} onClick={() => handleDelete(item.id)} className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50">
                  删除
                </button>
              </span>
            </div>
          </div>
        ),
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-[#cbd4d8] p-3">
        <label className={labelClass}>
          <span className={labelTextClass}>标题</span>
          <input className={inputClass} value={addDraft.titleZh} onChange={(e) => setAddDraft((d) => ({ ...d, titleZh: e.target.value }))} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>说明（可选）</span>
          <textarea className={textareaClass} value={addDraft.descriptionZh} onChange={(e) => setAddDraft((d) => ({ ...d, descriptionZh: e.target.value }))} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input className={`${inputClass} flex-1`} placeholder="来源引用（可选）" value={addDraft.sourceReference} onChange={(e) => setAddDraft((d) => ({ ...d, sourceReference: e.target.value }))} />
          <label className="flex items-center gap-1.5 text-xs text-[#52636e]">
            <input type="checkbox" className="size-4 accent-[#ffb21c]" checked={addDraft.mandatory} onChange={(e) => setAddDraft((d) => ({ ...d, mandatory: e.target.checked }))} />
            强制项
          </label>
          <button type="button" disabled={adding} onClick={handleAdd} className="rounded-lg bg-[#061b2b] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
            {adding ? "添加中…" : "+ 添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
