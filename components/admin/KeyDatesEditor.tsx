"use client";

import { useState } from "react";
import type { TenderKeyDate } from "@/types/tender";
import { KEY_DATE_TYPE_LABELS } from "@/lib/tender-labels";
import { formatDate } from "@/lib/format";

const KEY_DATE_TYPES = Object.keys(KEY_DATE_TYPE_LABELS) as TenderKeyDate["type"][];

const inputClass =
  "h-10 w-full rounded-lg border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none transition-shadow focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10";
const labelClass = "flex flex-col gap-1 text-xs";
const labelTextClass = "font-bold text-[#52636e]";

type DraftState = {
  type: TenderKeyDate["type"];
  date: string;
  notesZh: string;
  mandatory: boolean;
};

const EMPTY_DRAFT: DraftState = { type: "submission", date: "", notesZh: "", mandatory: false };

function toDraft(keyDate: TenderKeyDate): DraftState {
  return { type: keyDate.type, date: keyDate.date.slice(0, 10), notesZh: keyDate.notes?.zh ?? "", mandatory: keyDate.mandatory ?? false };
}

/**
 * Manual add/edit/delete for one tender's key dates (tender_key_dates —
 * see supabase/migrations/0001_init.sql). Only rendered in AdminTenderForm's
 * edit mode (a new, unsaved tender has no id for these rows to reference).
 * Each action persists immediately via its own API call (not bundled into
 * the surrounding form's single submit) — same posture as the rest of this
 * admin surface (ReclassifyButton, TranslateTendersButton, etc.).
 */
export function KeyDatesEditor({ tenderSlug, initialKeyDates }: { tenderSlug: string; initialKeyDates: TenderKeyDate[] }) {
  const [keyDates, setKeyDates] = useState<TenderKeyDate[]>(initialKeyDates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [addDraft, setAddDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draftPayload(draft: DraftState) {
    return { type: draft.type, date: draft.date, mandatory: draft.mandatory, notesZh: draft.notesZh };
  }

  async function handleAdd() {
    if (!addDraft.date) {
      setError("请填写日期");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/key-dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload(addDraft)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setKeyDates((prev) =>
        [...prev, { id: data.id, type: addDraft.type, date: addDraft.date, mandatory: addDraft.mandatory, notes: addDraft.notesZh ? { es: "", en: "", zh: addDraft.notesZh } : undefined }].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      );
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
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/key-dates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload(editDraft)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setKeyDates((prev) =>
        prev
          .map((kd) =>
            kd.id === id
              ? { ...kd, type: editDraft.type, date: editDraft.date, mandatory: editDraft.mandatory, notes: editDraft.notesZh ? { es: "", en: "", zh: editDraft.notesZh } : undefined }
              : kd,
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定要删除这个关键日期吗？")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${tenderSlug}/key-dates/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setKeyDates((prev) => prev.filter((kd) => kd.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {keyDates.length === 0 && <p className="text-xs text-[#7a878f]">还没有关键日期。</p>}

      {keyDates.map((kd) =>
        editingId === kd.id ? (
          <div key={kd.id} className="grid grid-cols-1 gap-2 rounded-xl border border-[#ffb21c]/60 bg-[#fff8e9] p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
            <select className={inputClass} value={editDraft.type} onChange={(e) => setEditDraft((d) => ({ ...d, type: e.target.value as TenderKeyDate["type"] }))}>
              {KEY_DATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KEY_DATE_TYPE_LABELS[t].zh}
                </option>
              ))}
            </select>
            <input type="date" className={inputClass} value={editDraft.date} onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))} />
            <input className={inputClass} placeholder="备注（可选）" value={editDraft.notesZh} onChange={(e) => setEditDraft((d) => ({ ...d, notesZh: e.target.value }))} />
            <label className="flex items-center gap-1.5 text-xs text-[#52636e]">
              <input type="checkbox" className="size-4 accent-[#ffb21c]" checked={editDraft.mandatory} onChange={(e) => setEditDraft((d) => ({ ...d, mandatory: e.target.checked }))} />
              强制
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busyId === kd.id} onClick={() => handleSaveEdit(kd.id)} className="rounded-lg bg-[#ffb21c] px-3 py-1.5 text-xs font-black text-[#071826] disabled:opacity-50">
                保存
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[#d8e0e3] px-3 py-1.5 text-xs font-bold text-[#52636e]">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div key={kd.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e2e7e9] bg-white px-3 py-2.5 text-sm">
            <span className="rounded-full bg-[#edf2f3] px-2.5 py-1 text-xs font-bold text-[#425461]">{KEY_DATE_TYPE_LABELS[kd.type].zh}</span>
            <span className="font-bold text-[#071826]">{formatDate(kd.date, "zh")}</span>
            {kd.mandatory && <span className="text-xs font-bold text-[#b86e00]">强制</span>}
            {kd.notes?.zh && <span className="text-xs text-[#7a878f]">{kd.notes.zh}</span>}
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingId(kd.id);
                  setEditDraft(toDraft(kd));
                }}
                className="text-xs font-bold text-[#0a6ebd] hover:underline"
              >
                编辑
              </button>
              <button type="button" disabled={busyId === kd.id} onClick={() => handleDelete(kd.id)} className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50">
                删除
              </button>
            </span>
          </div>
        ),
      )}

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-[#cbd4d8] p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
        <label className={labelClass}>
          <span className={labelTextClass}>类型</span>
          <select className={inputClass} value={addDraft.type} onChange={(e) => setAddDraft((d) => ({ ...d, type: e.target.value as TenderKeyDate["type"] }))}>
            {KEY_DATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {KEY_DATE_TYPE_LABELS[t].zh}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>日期</span>
          <input type="date" className={inputClass} value={addDraft.date} onChange={(e) => setAddDraft((d) => ({ ...d, date: e.target.value }))} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>备注（可选）</span>
          <input className={inputClass} value={addDraft.notesZh} onChange={(e) => setAddDraft((d) => ({ ...d, notesZh: e.target.value }))} />
        </label>
        <label className="flex items-center gap-1.5 self-end pb-2.5 text-xs text-[#52636e]">
          <input type="checkbox" className="size-4 accent-[#ffb21c]" checked={addDraft.mandatory} onChange={(e) => setAddDraft((d) => ({ ...d, mandatory: e.target.checked }))} />
          强制
        </label>
        <button type="button" disabled={adding} onClick={handleAdd} className="self-end rounded-lg bg-[#061b2b] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
          {adding ? "添加中…" : "+ 添加日期"}
        </button>
      </div>
    </div>
  );
}
