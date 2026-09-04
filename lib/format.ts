import type { Locale } from "@/types/tender";
import { convertToUsd } from "@/lib/currency";

const DATE_LOCALES: Record<Locale, string> = {
  en: "en-US",
  es: "es-MX",
  zh: "zh-CN",
};

/**
 * Every date this platform stores is a calendar day with no meaningful
 * time-of-day (parseDate() in the mappers stores UTC midnight for a
 * date-only source value like "28/08/2026" — see e.g.
 * compras-mx-open-tenders-mapper.ts). Formatting that instant without
 * pinning timeZone: "UTC" lets Intl.DateTimeFormat convert it into
 * whatever timezone the runtime (server or browser) happens to be in
 * first — for any timezone behind UTC (Mexico included, UTC-6) that
 * rolls UTC midnight back to the previous local day, so every date on
 * the site would silently read one day earlier than the real one. Real,
 * user-caught bug (2026-09-04): a Proyectos Estratégicos MX tender's
 * dates were all off by exactly one day from the official portal.
 */
export function formatDate(isoDate: string, locale: Locale): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
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
