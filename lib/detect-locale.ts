import type { Locale } from "@/types/tender";

const SUPPORTED_LOCALES: Locale[] = ["en", "es", "zh"];

/** Picks the first supported locale from an ordered list of BCP-47 language tags (e.g. navigator.languages). */
export function pickSupportedLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const base = tag.split("-")[0].toLowerCase() as Locale;
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return "en";
}
