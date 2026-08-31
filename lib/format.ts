import type { Locale } from "@/types/tender";

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

export function formatCurrency(
  value: number,
  currency: string,
  locale: Locale,
): string {
  return new Intl.NumberFormat(DATE_LOCALES[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
