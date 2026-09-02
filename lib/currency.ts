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
