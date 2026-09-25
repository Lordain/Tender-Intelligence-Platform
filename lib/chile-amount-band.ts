import { USD_RATES } from "@/lib/currency";

/**
 * The size band a Chilean buyer publishes INSTEAD of an amount, as a USD range.
 *
 * About 45% of open Chilean tenders carry no amount (1,772 of 3,951 on
 * 2026-09-24): Mercado Público lets the buyer withhold it and publish only the
 * statutory UTM band of the procedure — "Igual o superior a 5.000 UTM". Shown
 * bare as 未公开, a scanner purchase above 5,000 UTM and an order below 100 UTM
 * look the same; the band at least says which order of magnitude the buyer
 * declared.
 *
 * Read from `procedureType`, not from a stored band column, because every
 * Chilean row already carries its procedure code there — "Licitación Pública
 * Mayor a 5000 UTM (LR)", or the bare code for the ones without an expansion —
 * so rows imported before this existed get the band too, without a write.
 *
 * The UTM ranges are the source's OWN phrases, cross-tabulated against the
 * procedure code over the 677 unpublished-amount rows of the busca export on
 * 2026-09-25, one phrase per code without exception:
 *
 *   L1 38 · E2 4   "Menor a 100 UTM" / "Inferior a 100 UTM"
 *   LE 357 · CO 11 "Entre 100 y 1000 UTM" / "Igual o superior a 100 UTM e inferior a 1000 UTM"
 *   LP 171 · B2 4  "Igual o superior a 1.000 UTM e inferior a 2.000 UTM"
 *   LR 59 · I2 3   "Igual o superior a 5.000 UTM"
 *   O1 30          "No público" — no band at all, so no entry here
 *
 * LP is 1,000–2,000 and NOT "above 1,000", although the label the OCDS door
 * gives it ("Mayor a 1000 UTM (LP)") reads that way; the phrase on the rows
 * themselves is the narrower one. No code for 2,000–5,000 appeared, so none
 * is guessed.
 *
 * Converted through USD_RATES.UTM, so the monthly FX Routine moves these with
 * the UTM's own monthly re-publication.
 */
const UTM_BANDS: Record<string, { min?: number; max?: number }> = {
  L1: { max: 100 },
  E2: { max: 100 },
  LE: { min: 100, max: 1000 },
  CO: { min: 100, max: 1000 },
  LP: { min: 1000, max: 2000 },
  B2: { min: 1000, max: 2000 },
  LR: { min: 5000 },
  I2: { min: 5000 },
};

const PROCEDURE_CODE = /^\s*([A-Z0-9]{2})\s*$|\(([A-Z0-9]{2})\)\s*$/;

function formatUsd(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  const thousands = usd / 1000;
  return `$${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}K`;
}

function formatUtm(utm: number): string {
  return utm.toLocaleString("en-US");
}

export type UndisclosedAmountBand = {
  /** "$376K USD 以上" — short enough for a card. */
  usd: string;
  /** "5,000 UTM 以上" — the source's own unit, for the detail page. */
  utm: string;
};

/**
 * The band for a tender that published no amount, or undefined.
 *
 * Undefined whenever there IS an amount (that wins, always), for any country
 * but Chile, and for a code whose band was not measured — those keep reading
 * 未公开 rather than borrowing a neighbour's range.
 */
export function undisclosedAmountBand(tender: {
  country: string;
  procedureType: string;
  estimatedValue?: number;
}): UndisclosedAmountBand | undefined {
  if (tender.country !== "Chile" || tender.estimatedValue !== undefined) return undefined;
  const rate = USD_RATES.UTM;
  if (!rate) return undefined;
  const match = PROCEDURE_CODE.exec(tender.procedureType);
  const code = (match?.[1] ?? match?.[2])?.toUpperCase();
  const band = code ? UTM_BANDS[code] : undefined;
  if (!band) return undefined;

  if (band.min === undefined && band.max !== undefined) {
    return { usd: `低于 ${formatUsd(band.max * rate)} USD`, utm: `低于 ${formatUtm(band.max)} UTM` };
  }
  if (band.min !== undefined && band.max === undefined) {
    return { usd: `${formatUsd(band.min * rate)} USD 以上`, utm: `${formatUtm(band.min)} UTM 以上` };
  }
  if (band.min !== undefined && band.max !== undefined) {
    return {
      usd: `${formatUsd(band.min * rate)} – ${formatUsd(band.max * rate)} USD`,
      utm: `${formatUtm(band.min)} – ${formatUtm(band.max)} UTM`,
    };
  }
  return undefined;
}

/** The note under the value on a detail page, naming the rate the range was converted at. */
export function undisclosedAmountBandNote(band: UndisclosedAmountBand): string {
  return `采购方未公布具体金额，只公布了规模档位（${band.utm}），按 1 UTM ≈ $${USD_RATES.UTM} USD 折算。`;
}
