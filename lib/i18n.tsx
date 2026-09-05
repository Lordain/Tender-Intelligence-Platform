"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/types/tender";
import { localize, uiText } from "@/lib/localize";

export { localize, uiText };

/**
 * The product is Chinese-only on the frontend by design (the en/es market
 * has too many similar competitors — the language/interpretation layer for
 * Chinese enterprises is the actual differentiation, see
 * lib/ingestion/README.md). `Locale`/`LocalizedText` still carry es/en/zh
 * underneath — es stays the source-of-truth field for real government data
 * (see lib/ingestion/text-utils.ts's `untranslated`), and any future
 * AI-generated analysis/translation output (Phase 6) should target zh only,
 * not all three — but nothing in the UI renders en/es anymore, and there's
 * no switcher to turn it back on.
 */
const LOCALE: Locale = "zh";

type LocaleContextValue = {
  locale: Locale;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // No effect needed to sync <html lang>: app/layout.tsx already renders
  // lang="zh" server-side, matching this constant, so there's nothing to
  // correct after mount (unlike the old per-browser-language detection).
  return (
    <LocaleContext.Provider value={{ locale: LOCALE }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

