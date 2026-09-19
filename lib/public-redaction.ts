import { convertToUsd } from "@/lib/currency";

/**
 * What a guest (and therefore every crawler) is allowed to know about a
 * tender, expressed as the two transformations that remove its identity
 * without removing its meaning.
 *
 * The premise: a tender's name, budget and dates are published by law in
 * DOF/DOU/SECOP/SEACE, so none of them is this platform's property and none
 * can be "protected" in any legal sense. What CAN be withheld is the set of
 * values precise enough to act as a search key back to the original notice.
 * A visitor who pastes "瓜纳华托州莱昂市第三环路 34.5kV 变电站扩建工程,
 * $47,382,915, 2026-09-18" into an assistant gets the source portal in one
 * hop; the same visitor holding "墨西哥 变电站扩建工程, $10M–$50M USD,
 * 2026年9月" does not, because every one of those three values now matches
 * hundreds of rows.
 *
 * Both helpers below are deliberately lossy in a way that is still HONEST —
 * a band that contains the real figure, a month that contains the real day.
 * Nothing here invents a value, because a visitor comparing our page against
 * the official one later must never find that we lied, only that we were
 * less precise.
 *
 * Applied at the projection boundary (lib/public-tender.ts,
 * lib/tender-list-page.ts, lib/homepage-card.ts) rather than in a view, so
 * the redacted value is what gets serialized into the HTML and the React
 * payload. Hiding a precise value with CSS or a client-side check leaves it
 * in the page source, where it is exactly as reachable by an assistant
 * reading the page on the visitor's behalf.
 */

/**
 * Upper bounds in USD, ascending. Chosen to be wide enough that a band never
 * identifies a row, and narrow enough to still answer the only question a
 * reader asks at list level: is this worth my time. The floor matters least —
 * MIN_VALUE_USD already keeps sub-$100k rows out of the feed entirely.
 */
const VALUE_BANDS: readonly { readonly limit: number; readonly label: string }[] = [
  { limit: 1_000_000, label: "低于 $1M USD" },
  { limit: 5_000_000, label: "$1M – $5M USD" },
  { limit: 10_000_000, label: "$5M – $10M USD" },
  { limit: 50_000_000, label: "$10M – $50M USD" },
  { limit: 100_000_000, label: "$50M – $100M USD" },
  { limit: 500_000_000, label: "$100M – $500M USD" },
];

const ABOVE_TOP_BAND_LABEL = "$500M USD 以上";

/**
 * Collapse an exact amount to the band that contains it.
 *
 * Returns null for the same two cases formatEstimatedValueUsd() returns null:
 * no amount at all, and an amount in a currency lib/currency.ts has no rate
 * for. Both must read as "未公开" rather than as a band, because a band
 * implies we know the figure and chose not to show it — and for an
 * unconvertible currency we genuinely do not know it in USD.
 */
export function estimatedValueBand(
  value: number | undefined,
  currency: string | undefined,
): string | null {
  if (value === undefined) return null;
  const usd = convertToUsd(value, currency);
  if (usd === null) return null;
  return VALUE_BANDS.find((band) => usd < band.limit)?.label ?? ABOVE_TOP_BAND_LABEL;
}

/**
 * Drop the day from a stored date, keeping "YYYY-MM".
 *
 * Done by string prefix and NOT by round-tripping through Date, on purpose.
 * Every date this platform stores is a calendar day held as UTC midnight
 * (see formatDate's comment in lib/format.ts for the real off-by-one-day bug
 * that taught us this): constructing a Date here and reading getMonth() in a
 * runtime behind UTC rolls 2026-09-01 back into August, which would move a
 * tender to the wrong month on any server west of Greenwich. Slicing the
 * string cannot do that.
 *
 * A value that does not start with YYYY-MM is returned unchanged — the
 * formatter downstream already falls back to printing an unparseable date
 * verbatim, and a redaction step is the wrong place to start discarding data
 * it does not recognize.
 */
const LEADING_YEAR_MONTH = /^(\d{4})-(\d{2})/;

export function toMonthPrecision(isoDate: string): string {
  const match = LEADING_YEAR_MONTH.exec(isoDate);
  return match === null ? isoDate : `${match[1]}-${match[2]}`;
}

/** Same, for the optional date fields, so call sites stay free of ternaries. */
export function toMonthPrecisionOptional(isoDate: string | undefined): string | undefined {
  return isoDate === undefined ? undefined : toMonthPrecision(isoDate);
}
