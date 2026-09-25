import type { GovernmentLevel, Tender, TenderKeyDate, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { platformDay } from "@/lib/tender-status";
import { chileGovernmentLevel } from "@/lib/ingestion/chile-ocds-mapper";
import { chileBuscaPublicUrl } from "@/lib/ingestion/connectors/chile-busca-live";
import {
  parseChileBuscaAmount,
  parseChileBuscaDate,
  type ChileBuscaCard,
  type ChileBuscaRow,
} from "@/lib/ingestion/chile-busca-parser";

/**
 * Mercado Público search rows → this platform's Tender.
 *
 * Pure. No network, no Supabase, no clock except the one passed in.
 *
 * ── How this differs from chile-ocds-mapper.ts, and why both exist ────────
 *
 * Same country, same tenders, same tender codes — a different door with a
 * different field set. The OCDS mapper is NOT replaced: it reads a versioned,
 * CC0, structured export that carries a region field this door does not, and
 * it resumes on its own if ChileCompra starts publishing again. This one reads
 * the live search, which is the only Chilean door serving anything newer than
 * 2026-07-29.
 *
 * What this door has that OCDS does not:
 *   - Tenders published TODAY (measured 2026-09-24: 168 rows published that day)
 *   - An `Estado` that is a LIVE lifecycle state, not a publication snapshot
 *   - Two buyer-reliability counters, on the HTML card only
 *
 * What OCDS has that this door does not:
 *   - The buyer's region (`parties[].address.region`) — 120 of 120 there, absent here
 *   - A UNSPSC classification per line item
 *   - An enquiry-period deadline
 *   - A CC0 licence stated in the payload
 *
 * ── The status field is worth reading here, which it was not in OCDS ──────
 *
 * chile-ocds-mapper.ts refuses to read `tender.status` because it was "active"
 * on 120 of 120 records including ones whose deadline had passed seven weeks
 * earlier. That is still true, and this round measured it directly rather than
 * inferring it: a tender the SEARCH reports as `Cancelada por el organismo`
 * (idEstado 15) reads as `status: "active"`, `statusDetails: "5-Publicada"` in
 * OCDS. Same tender, same day, two sources, and only one of them is current.
 *
 * So this mapper reads the estado text — and still crosses it with the
 * deadline, because a row can be `Publicada y disponible para ofertar` and
 * have a closing date in the past between the site's own refresh cycles.
 *
 * ── The survey these rules come from ──────────────────────────────────────
 *
 * 4,055 open tenders — the complete `idEstado=5` corpus on 2026-09-24, not a
 * sample — plus 120 HTML cards. Counts quoted below are from that and nothing
 * else. Where a number was not measured this file says so.
 */

export const CHILE_BUSCA_SOURCE_NAME = "Mercado Público — 公开招标搜索（智利公共采购平台）";

/**
 * Mercado Público's own estado texts, and what this platform calls them.
 *
 * The six codes were read off `busqueda.filtros.js` and then confirmed by
 * sending each one and reading the `Estado` column that came back — every code
 * produced exactly one distinct text. `-1` (todos) additionally surfaced a
 * seventh text, `Suspendida`, which has no code of its own in the site's table.
 *
 * `adjudicadas` maps to `awarded` on this door and ONLY on this door. The OCDS
 * mapper deliberately never returns `awarded` because there the signal was an
 * unverified `urlAward` in an index. Here the source states the outcome in
 * words, in the column it was asked to filter on, and the filter round-trips:
 * asking for code 8 returns rows all saying `Adjudicada a uno o varios
 * proveedores`, and nothing else does.
 */
const CHILE_BUSCA_ESTADO_TEXTS: { pattern: RegExp; status: TenderStatus }[] = [
  { pattern: /^publicada y disponible para ofertar$/i, status: "open" },
  { pattern: /^cerrada a recibir m[áa]s ofertas$/i, status: "submission_closed" },
  { pattern: /^sin ofertas recibidas$/i, status: "cancelled" },
  { pattern: /^adjudicada a uno o varios proveedores$/i, status: "awarded" },
  { pattern: /^cancelada por el organismo$/i, status: "cancelled" },
  // Seen only under idEstado=-1 and never as a filterable code of its own. A
  // suspended tender is not open for bids and is not finished either; the
  // honest nearest neighbour is "closed to submissions", not "cancelled",
  // because it can resume. One observation is not a mapping, and this is
  // recorded as the weakest row in the table.
  { pattern: /^suspendida$/i, status: "submission_closed" },
];

/**
 * Status, from the estado text AND the deadline — neither alone.
 *
 * The text is authoritative for everything except the open/closed boundary.
 * For that, a row can say `Publicada y disponible para ofertar` while its
 * closing date has already passed: the site's estado is updated on its own
 * schedule, and an importer that showed 招标中 for a tender whose deadline was
 * yesterday would be lying to a user about whether they can still bid.
 *
 * Compared by platformDay() rather than as instants, for the reason that
 * function documents: a tender due TODAY is still open, and disagreeing with
 * what the site displays about the same tender would be its own bug.
 *
 * An unrecognised estado text returns undefined rather than a default. A new
 * state this table has never seen is news, and the caller reports it — see
 * ingest-chile.ts. Defaulting it to "open" would surface a tender nobody can
 * bid on.
 */
export function chileBuscaStatus(
  estado: string,
  submissionDeadline: string | undefined,
  now: Date,
): TenderStatus | undefined {
  const matched = CHILE_BUSCA_ESTADO_TEXTS.find((entry) => entry.pattern.test(estado.trim()));
  if (!matched) return undefined;
  if (matched.status !== "open" || !submissionDeadline) return matched.status;
  const deadline = platformDay(submissionDeadline);
  const today = platformDay(now);
  if (!deadline || !today) return matched.status;
  return deadline < today ? "submission_closed" : "open";
}

/**
 * The procurement-method label, from the two-letter code.
 *
 * `Tipo` is the code alone (`LE`), where OCDS's `procurementMethodDetails`
 * spells it out ("Licitación Pública Entre 100 y 1000 UTM (LE)"). The UTM
 * bands below are Chile's statutory thresholds for each licitación class and
 * they are quoted from the source's own OCDS strings for the four codes that
 * appeared there — not from memory.
 *
 * Codes seen in the 4,055: LE 1,645 · LP 1,179 · LR 623 · L1 328 · O1 171 ·
 * CO 52 · B2 36 · I2 12 · E2 9.
 *
 * The five codes NOT documented by an OCDS string (O1, CO, B2, I2, E2) are
 * passed through as the bare code with no invented expansion. O1 is 171 rows,
 * so this is not a rounding error — it is a labelled gap. Guessing that "O1"
 * means "obras" would read plausibly and be unverified.
 */
const CHILE_BUSCA_TIPO_LABELS: Record<string, string> = {
  L1: "Licitación Pública Menor a 100 UTM (L1)",
  LE: "Licitación Pública Entre 100 y 1000 UTM (LE)",
  LP: "Licitación Pública Mayor a 1000 UTM (LP)",
  LR: "Licitación Pública Mayor a 5000 UTM (LR)",
};

export function chileBuscaProcedureType(tipo: string): string {
  const code = tipo.trim().toUpperCase();
  return CHILE_BUSCA_TIPO_LABELS[code] ?? (code || "Unknown");
}

/**
 * The buyer name, which — unlike OCDS's — needs no repair.
 *
 * Round 2 measured `" | "` in `parties[].name` on 120 of 120 OCDS records,
 * with the two halves differing on 56 of them. `Organismo` here carries it on
 * 0 of 4,055. The HTML card additionally shows a buying unit under the
 * organismo ("Subsecretaria de las Culturas y las Artes Región del Biobio"),
 * which is plausibly the other half of that OCDS string — but "plausibly" is
 * not measured, so nothing here joins them or claims they are the same thing.
 *
 * Trimming happens in the parser; this exists to make the absence of a repair
 * step a documented finding rather than an omission.
 */
export function chileBuscaBuyerName(row: ChileBuscaRow): string | undefined {
  return row.organismo.trim() || undefined;
}

function buildKeyDates(id: string, publicationDate: string, submissionDeadline: string | undefined): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [{ id: `${id}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) dates.push({ id: `${id}-submission`, type: "submission", date: submissionDeadline });
  // No questions_deadline. The OCDS door carries enquiryPeriod.endDate; this
  // one publishes no enquiry period anywhere this round looked. A gap, stated.
  return dates;
}

export type ChileBuscaMapped = {
  tender: Tender;
  /** The UTM size band, when the buyer did not publish a number. Not money and never treated as money. */
  amountBand?: string;
  /** Present only for rows enriched from the HTML fragment. */
  comprasEfectuadas?: number;
  reclamosPagoNoOportuno?: number;
};

/**
 * One export row (optionally enriched with its HTML card) → a Tender.
 *
 * Returns null when the row is missing something a row cannot be built
 * without, rather than filling a blank — the rule every other mapper here
 * follows.
 *
 * @param card the matching HTML card, when one was fetched. This is where the
 *   closing date comes from: the CSV has no such column, on any of the 4,055
 *   rows. Without it the tender still maps, with no submissionDeadline — which
 *   is correct rather than convenient, because inventing a deadline for a
 *   bidding platform is the worst available failure.
 * @param now injected so a status assertion does not change with the calendar.
 */
export function mapChileBuscaRowToTender(
  row: ChileBuscaRow,
  card?: ChileBuscaCard,
  sourceName: string = CHILE_BUSCA_SOURCE_NAME,
  now: Date = new Date(),
): ChileBuscaMapped | null {
  if (!row.id || !row.title) return null;
  const buyer = chileBuscaBuyerName(row);
  if (!buyer) return null;

  const publicationDate = parseChileBuscaDate(row.fechaPublicacion);
  if (!publicationDate) return null;

  const submissionDeadline =
    card?.submissionDeadline ?? (card?.fechaCierre ? parseChileBuscaDate(card.fechaCierre) : undefined);
  const status = chileBuscaStatus(row.estado, submissionDeadline, now);
  if (!status) return null;

  const governmentLevel: GovernmentLevel = chileGovernmentLevel(buyer);
  // "unknown", exactly as in chile-ocds-mapper.ts, and NOT the generic
  // "services" default this used until 2026-09-24. This door publishes no
  // procurement category at all — not even the UNSPSC codes OCDS carries on
  // tender.items — so there is even less to map from here than there.
  //
  // "services" was a claim, and a false one on the rows that matter most: the
  // AVO II motorway and seven lots of the 34th PPP round arrived filed as
  // service contracts, and filtering the site for 工程 returned nothing from
  // Chile while works were sitting in the data. Missing data displayed as a
  // confident wrong value is worse than missing data displayed as missing.
  // See migration 0056 and TenderScopeType; this changes no classification,
  // because no rule in lib/relevance.ts reads "services" positively.
  const scopeType = "unknown" as const;

  const parsedAmount = parseChileBuscaAmount(row.montoLicitacion, row.tipoPresupuesto);
  const estimatedValue = parsedAmount.kind === "number" ? parsedAmount.amount : undefined;
  // Read independently of the amount, the same way the OCDS mapper does: the
  // currency column is populated on 4,055 of 4,055 here, but a currency
  // attached to a band rather than a number is not a price, and pairing them
  // would put a number-shaped thing next to CLP that nobody published.
  const currency = estimatedValue !== undefined ? row.moneda.trim() || undefined : undefined;
  const procedureType = chileBuscaProcedureType(row.tipo);
  const summary = row.descripcion.trim() || row.title;

  const { industries, relevance } = classifyStoredTender({
    procedureType,
    title: row.title,
    // Must be the same string stored as `summary` below, or a row gets
    // classified from less text at import than at reclassify.
    summary,
    buyer,
    country: "Chile",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency,
    sourceName,
  });

  const timestamp = now.toISOString();
  const tender: Tender = {
    id: crypto.randomUUID(),
    // The SAME slug the OCDS mapper builds for the same tender code. That is
    // the dedupe: both doors carry `NNNN-NN-XXNN` and a 25-row cross-check
    // resolved 24 of them in OCDS with a byte-identical tender.id, so a tender
    // seen through both doors upserts onto one row instead of importing twice.
    slug: `chile-${slugify(row.id)}`,
    tenderNumber: row.id,
    title: untranslated(row.title),
    summary: untranslated(summary),
    buyer,
    country: "Chile",
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(estimatedValue !== undefined ? { estimatedValue } : {}),
    ...(currency ? { currency } : {}),
    // No `location`. This door publishes no region field — see the header.
    status,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(row.id, publicationDate, submissionDeadline),
    risks: [],
    relevance,
    sourceName,
    sourceUrl: chileBuscaPublicUrl(row.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    tender,
    ...(parsedAmount.kind === "band" ? { amountBand: parsedAmount.band } : {}),
    ...(card?.comprasEfectuadas !== undefined ? { comprasEfectuadas: card.comprasEfectuadas } : {}),
    ...(card?.reclamosPagoNoOportuno !== undefined ? { reclamosPagoNoOportuno: card.reclamosPagoNoOportuno } : {}),
  };
}
