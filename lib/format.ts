import type { Locale } from "@/types/tender";
import { convertToUsd } from "@/lib/currency";

const DATE_LOCALES: Record<Locale, string> = {
  en: "en-US",
  es: "es-MX",
  zh: "zh-CN",
};

export function formatDate(isoDate: string, locale: Locale): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * The whole platform standardizes on USD for display (see
 * lib/currency.ts) — a tender's real source currency (MXN, COP, ...)
 * gets converted here rather than shown as-is, so a Chinese enterprise
 * comparing opportunities across Mexico/Colombia/etc. sees one consistent
 * unit instead of mentally converting several currencies per session.
 * Returns null (not a value that looks precise but isn't even the right
 * unit) when the source currency has no rate in lib/currency.ts yet.
 */
export function formatEstimatedValueUsd(
  value: number,
  currency: string | undefined,
  locale: Locale,
): string | null {
  const usd = convertToUsd(value, currency);
  if (usd === null) return null;
  return new Intl.NumberFormat(DATE_LOCALES[locale], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usd);
}
