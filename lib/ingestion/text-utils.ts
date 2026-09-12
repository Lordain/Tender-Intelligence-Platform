import type { LocalizedText } from "@/types/tender";

/**
 * Government sources carry a single (Spanish) string per field, not
 * per-locale text. The platform's rule is "original language is the source
 * of truth" — we store the real Spanish text in `es` and mirror it into
 * `en`/`zh` rather than fabricate a translation. Phase 6 (AI Analysis) is
 * what's supposed to produce real en/zh text; until that exists, showing
 * the Spanish source in every locale is honest, a fabricated-sounding
 * translation is not.
 */
export function untranslated(text: string): LocalizedText {
  return { es: text, en: text, zh: text };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
