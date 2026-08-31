"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@/types/tender";
import { localize, uiText } from "@/lib/localize";
import { pickSupportedLocale } from "@/lib/detect-locale";

export { localize, uiText };

const LOCALE_STORAGE_KEY = "tender-intelligence:locale";
const LOCALES: Locale[] = ["en", "es", "zh"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  zh: "中文",
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // Deliberately syncing post-mount (rather than as lazy initial state) to avoid an SSR/client
    // hydration mismatch — the server always renders "en" since it has no access to the browser's
    // stored preference or language settings.
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const detected =
      stored && LOCALES.includes(stored as Locale)
        ? (stored as Locale)
        : pickSupportedLocale(navigator.languages ?? [navigator.language]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
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

