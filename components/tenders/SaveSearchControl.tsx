"use client";

import { useState } from "react";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { useSavedSearches } from "@/lib/saved";

export function SaveSearchControl({ href }: { href: string }) {
  const { locale } = useLocale();
  const { addSearch } = useSavedSearches();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50"
      >
        {localize(uiText.saveThisSearch, locale)}
      </button>
    );
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addSearch({ name: trimmed, href, alertEnabled });
    setOpen(false);
    setName("");
    setAlertEnabled(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={localize(uiText.searchNamePlaceholder, locale)}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
      />
      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={alertEnabled}
          onChange={(event) => setAlertEnabled(event.target.checked)}
        />
        {localize(uiText.notifyMeOfNewMatches, locale)}
      </label>
      {alertEnabled && (
        <p className="text-xs text-zinc-400">{localize(uiText.alertNotYetDeliveredNote, locale)}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {localize(uiText.save, locale)}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          {localize(uiText.cancel, locale)}
        </button>
      </div>
    </div>
  );
}
