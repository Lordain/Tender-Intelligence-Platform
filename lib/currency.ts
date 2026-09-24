import type { Locale } from "@/types/tender";

/**
 * Approximate, static currency-to-USD rates. NOT live/real-time — nothing
 * here is fetched at request time; these are hand-set approximations,
 * refreshed occasionally, not a precise conversion. Good
 * enough for a consistent USD-only display and for "is this a big-ticket
 * tender" triage (lib/relevance.ts), not for anything that needs exact
 * figures — the UI should read as "approximately" even where it doesn't
 * say so literally.
 *
 * Refreshed 2026-09-24 against two independent live sources on the same day
 * (open.er-api.com and frankfurter.app/ECB), taking the midpoint where both
 * carry the pair. Four rows moved, two deliberately did not:
 *
 *   MXN 16.9  -> 17.53   (was -3.6% off; the largest gap, and Mexico is the
 *                         biggest source, so it mattered most)
 *   COP 3140  -> 3200    (-2.0%; single-source, ECB carries no COP)
 *   EUR 1.16  -> 1.138   (+1.9%)
 *   GBP 1.354 -> 1.324   (+2.3%)
 *
 * PEN (0.9% off) and BRL (0.2%) were LEFT ALONE on this file's own precedent:
 * the 2026-09-11 note below kept every row inside ~1.3% rather than chase
 * noise. BRL earns a second reason — the two sources disagreed with each
 * other by 1.24%, six times the drift being corrected, so there is no
 * measurement here that justifies moving a number the platform owner quoted
 * by hand.
 *
 * Note the environment changed: this container CAN now reach an FX host, so
 * a future refresh no longer has to be quoted in by hand. CLP and the two
 * Chilean indexed units were added 2026-09-24 that way — measured here, not
 * quoted in — see their own note below.
 *
 * Re-verified 2026-09-11 (Wise/XE/Investing.com, cross-checked): PEN 3.3545,
 * MXN 16.94, COP 3,099 spot against a 7-day average of 3,140 — every existing
 * row within ~1.3% of real, so none were changed; EUR and GBP were added.
 *
 * Last refreshed 2026-09-05 against real current rates (Investing.com,
 * XE.com, Wise — cross-checked across sources, not a single quote): the
 * previous MXN/COP/PEN values had drifted meaningfully from real rates
 * (MXN off by ~16%, COP by ~25-34%, PEN by ~9%) — a real, user-reported
 * gap, not a guess. A monthly Claude Code Routine re-checks these against
 * live rates and updates+pushes this file when drift exceeds ~5% — see
 * the Routine named "Monthly FX rate refresh" (or ask this session's
 * owner to look it up via list_triggers if this comment outlives it).
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  MXN: 1 / 17.53,
  COP: 1 / 3200,
  PEN: 1 / 3.35,
  // Added 2026-09-11: Peru's OECE data is genuinely multi-currency and a real
  // import turned up 7 EUR and 2 GBP tenders. Without a rate, convertToUsd()
  // returns null and the classifier reads a real amount as "no value
  // published" — the one outcome that table is meant to prevent. Quoted the
  // other way round from the rows above (these are worth MORE than a dollar),
  // hence no reciprocal.
  EUR: 1.138,
  GBP: 1.324,
  // Added 2026-09-18 for Brazil. PNCP quotes everything in reais, and without
  // a rate here convertToUsd() returns null — so a real R$ 7,494,680.99 road
  // contract would reach lib/relevance.ts as "no value published", the exact
  // outcome the EUR/GBP note above exists to prevent.
  //
  // Verified 2026-09-18 at 1 USD = 5.16 BRL, quoted by the user — this
  // sandbox reaches no FX host, so unlike the rows above it was not
  // cross-checked here against Wise/XE/Investing.com. It replaces a 5.4
  // placeholder that was ~4.5% off; the monthly FX Routine re-checks it like
  // every other row from here on.
  BRL: 1 / 5.16,
  // Added 2026-09-24 for Chile, the last thing blocking that source: the
  // busca export carries a currency on 4,055 of 4,055 rows, 3,918 of them CLP,
  // and without a rate convertToUsd() returns null — so a real 690,000,000
  // peso contract reaches lib/relevance.ts as "no value published", the
  // outcome the EUR/GBP note above exists to prevent.
  //
  // Two independent LIVE sources, both read 2026-09-24:
  //   open.er-api.com                946.50   (market composite)
  //   mindicador.cl / Banco Central  959.39   ("dólar observado", the official
  //                                            figure, one business day behind
  //                                            by definition)
  // They disagree by 1.36%, so the midpoint 952.9 is stored as 953 and the
  // third digit is the last one this measurement can carry. It lands inside
  // the 900–1000 band the Chile round-2 report used for estimating and
  // explicitly refused to write into this file without a real measurement.
  CLP: 1 / 953,
  // The two Chilean INDEXED UNITS, not currencies — and both appear in the
  // Moneda column as if they were: CLF 47 rows, UF 37 (the same unit under its
  // ISO code and its Spanish name), UTM 6. Ninety real amounts that would
  // otherwise read as "no value published".
  //
  // Published in pesos by the Banco Central (mindicador.cl, read 2026-09-24):
  // UF = 41,008.1 CLP dated the same day, UTM = 71,721 CLP dated 2026-09-01.
  // Converted through the CLP rate above, so they inherit its 1.36% spread —
  // 41008.1/953 = 43.03 and 71721/953 = 75.26. Quoted the same way round as
  // EUR/GBP, since one of either is worth many dollars.
  //
  // THESE DRIFT FASTER THAN A CURRENCY, and for a different reason: UF is
  // re-published DAILY against Chilean inflation and UTM monthly, so they move
  // even on a day the peso does not. The monthly FX Routine re-checks them
  // like every other row, which is the right cadence for UTM and a month
  // behind for UF — acceptable while this table is explicitly a triage aid and
  // not an accounting figure, and worth knowing before anyone quotes one.
  //
  // A UTM RATE DOES NOT RESCUE THE 1,808 BAND ROWS. Those carry a phrase —
  // "Igual o superior a 5.000 UTM" — which is a floor, not an amount. The
  // mapper refuses to turn a range into a number, and a rate does not change
  // that; it would only dress the floor up as a value.
  CLF: 43.03,
  UF: 43.03,
  UTM: 75.26,
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
