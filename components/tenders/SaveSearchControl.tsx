"use client";

import { useState } from "react";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { useSavedSearches } from "@/lib/saved";
import { useUser } from "@/lib/auth";
import { currentPathWithSearch, loginPathFor } from "@/lib/auth-redirect";
import { useRouter } from "next/navigation";

function BookmarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current stroke-[1.7]">
      <path d="M5 3.5A1.5 1.5 0 0 1 6.5 2h7A1.5 1.5 0 0 1 15 3.5V18l-5-3-5 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveSearchControl({ href, disabled = false }: { href: string; disabled?: boolean }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { user } = useUser();
  const { addSearch } = useSavedSearches();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addSearch({ name: trimmed, href, alertEnabled: false });
    setOpen(false);
    setName("");
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!user) {
            router.push(loginPathFor(currentPathWithSearch()));
            return;
          }
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        title={disabled ? "请先设置自定义搜索或筛选条件" : undefined}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#0a2b40] bg-white px-4 text-sm font-black text-[#0a2b40] transition-colors hover:bg-[#edf2f3] disabled:cursor-not-allowed disabled:border-[#d8e0e3] disabled:bg-[#f2f4f3] disabled:text-[#9aa5ab] sm:w-auto"
      >
        <BookmarkIcon />
        {localize(uiText.saveThisSearch, locale)}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-4 shadow-[0_22px_55px_-28px_rgba(6,27,43,.55)]">
          <p className="text-sm font-black text-[#071826]">保存当前搜索</p>
          <p className="mt-1 text-xs leading-5 text-[#75838c]">为当前关键词与筛选条件命名，之后可从“我的收藏”快速打开。</p>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSave();
              }
            }}
            placeholder={localize(uiText.searchNamePlaceholder, locale)}
            autoFocus
            className="mt-3 h-10 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] placeholder:text-[#94a0a7] focus:border-[#ffb21c] focus:outline-none"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-[#64717c] hover:bg-[#f2f4f3] hover:text-[#071826]">
              {localize(uiText.cancel, locale)}
            </button>
            <button type="button" onClick={handleSave} disabled={!name.trim()} className="rounded-xl bg-[#ffb21c] px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#ffc247] disabled:cursor-not-allowed disabled:opacity-40">
              {localize(uiText.save, locale)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
