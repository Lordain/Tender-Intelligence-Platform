"use client";

import { useMemo, useRef, useState } from "react";

export function MultiSelectPills<T extends string>({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  // Staged locally until "应用" is clicked — checking/unchecking a box no
  // longer calls onChange (and so no longer changes the URL/results) right
  // away. Real user report (2026-09-04): with the old "apply on every
  // click" behavior there was no way to back out of an accidental toggle
  // short of manually re-toggling it, and "重置"/"应用" looked like they
  // should stage changes but didn't — every click had already committed.
  const [draft, setDraft] = useState<T[]>(selected);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const visibleOptions = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  function toggle(value: T) {
    setDraft((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function apply() {
    onChange(draft);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  function cancel() {
    setDraft(selected);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const summary = selected.length
    ? `${selected.slice(0, 2).map((value) => options.find((option) => option.value === value)?.label ?? value).join("、")}${selected.length > 2 ? ` +${selected.length - 2}` : ""}`
    : "全部";

  return (
    <label className="relative flex min-w-[9.5rem] flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#425461]">{label}</span>
      <details
        ref={detailsRef}
        className="group"
        // Re-sync the draft to whatever's actually applied every time the
        // panel opens — picks up both a fresh session and any change made
        // elsewhere on the page (e.g. the "清除筛选" link) since it was
        // last opened, and discards any unapplied draft from a prior
        // cancel.
        onToggle={(event) => {
          if (event.currentTarget.open) setDraft(selected);
        }}
      >
        <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#172c3b] transition-colors hover:border-[#9babb3] [&::-webkit-details-marker]:hidden">
          <span className="max-w-[10rem] truncate">{summary}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current transition-transform group-open:rotate-180">
            <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-3 shadow-[0_20px_50px_-25px_rgba(6,27,43,0.5)]">
          {searchable && (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索行业"
              className="mb-2 h-9 w-full rounded-lg border border-[#d8e0e3] bg-white px-3 text-sm placeholder:text-[#94a0a7] focus:border-[#ffb21c] focus:outline-none"
            />
          )}
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-[#233846] hover:bg-[#f2f4f3]"
              >
                <span className={`flex size-4 items-center justify-center rounded border ${draft.includes(option.value) ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]" : "border-[#bdc8cd] bg-white"}`}>
                  {draft.includes(option.value) && (
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 fill-none stroke-current stroke-2.5">
                      <path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e5e9eb] pt-3">
            <button type="button" onClick={() => setDraft([])} className="px-2 py-1.5 text-xs font-semibold text-[#63737d] hover:text-[#071826]">重置</button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancel} className="px-2 py-1.5 text-xs font-semibold text-[#63737d] hover:text-[#071826]">取消</button>
              <button
                type="button"
                onClick={apply}
                className="rounded-lg bg-[#ffb21c] px-3 py-1.5 text-xs font-bold text-[#071826] hover:bg-[#ffc247]"
              >
                应用 {draft.length || 0} 项
              </button>
            </div>
          </div>
        </div>
      </details>
    </label>
  );
}
