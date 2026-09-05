import type { Locale } from "@/types/tender";

/**
 * Approximate, static currency-to-USD rates. NOT live/real-time — this
 * platform's environment can't reach a live FX API (see
 * lib/ingestion/README.md for the broader "this sandbox can't reach
 * arbitrary external hosts" constraint), so these are hand-set
 * approximations, refreshed occasionally, not a precise conversion. Good
 * enough for a consistent USD-only display and for "is this a big-ticket
 * tender" triage (lib/relevance.ts), not for anything that needs exact
 * figures — the UI should read as "approximately" even where it doesn't
 * say so literally.
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  MXN: 1 / 20,
  COP: 1 / 4200,
  PEN: 1 / 3.7,
};

/** Returns null (not the raw value) when the currency isn't in the rate table, so callers can distinguish "genuinely converted" from "unknown currency, don't display a number that looks precise but isn't even the right unit." */
export function convertToUsd(value: number, currency: string | undefined): number | null {
  if (!currency) return null;
  const rate = USD_RATES[currency];
  return rate !== undefined ? value * rate : null;
}

/**
 * A short disclosure line for any USD amount that was actually converted
 * from a non-USD source currency using USD_RATES above — since that table
 * is a static approximation, not a live rate, a reader shouldn't mistake
 * the displayed USD figure for an officially-quoted amount. Returns null
 * for a tender whose source already quotes USD (currency === "USD") or an
 * unrecognized currency (nothing was actually converted to show a rate
 * for), so callers can skip rendering entirely in those cases.
 */
export function exchangeRateNote(currency: string | undefined, locale: Locale): string | null {
  if (!currency || currency === "USD") return null;
  const rate = USD_RATES[currency];
  if (!rate) return null;
  const perUsd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(1 / rate);
  const text = {
    zh: `按 1 USD ≈ ${perUsd} ${currency} 折算，为本平台采用的固定近似汇率，非官方或实时汇率，仅供参考。`,
    en: `Converted at 1 USD ≈ ${perUsd} ${currency}, a fixed approximate rate this platform uses — not an official or live rate, for reference only.`,
    es: `Convertido a 1 USD ≈ ${perUsd} ${currency}, una tasa aproximada fija que usa esta plataforma — no es una tasa oficial ni en tiempo real, solo de referencia.`,
  };
  return text[locale];
}
