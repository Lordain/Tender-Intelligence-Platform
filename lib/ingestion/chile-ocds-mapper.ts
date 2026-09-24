import type { GovernmentLevel, Tender, TenderKeyDate, TenderStatus } from "@/types/tender";
import type { OcdsRelease, OcdsReleasePackage } from "@/lib/ingestion/types";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { platformDay } from "@/lib/tender-status";

/**
 * ChileCompra / Mercado Público OCDS release → this platform's Tender.
 *
 * Pure. No network, no Supabase, no clock except the one passed in.
 *
 * ── Why this is not just a call to ocds-mapper.ts ─────────────────────────
 *
 * lib/ingestion/ocds-mapper.ts already maps an OcdsRelease and is genuinely
 * country-agnostic, and reusing it was the plan. Four things measured against
 * 120 real Chilean records on 2026-09-24 made it the wrong call, and every one
 * of them would have been SILENT — the generic mapper would have produced a
 * complete-looking Tender with a wrong value in it:
 *
 * 1. `tender.status` is "active" on 120 of 120 records, including ones whose
 *    bid deadline passed seven weeks ago. The generic mapper maps
 *    active → "open", so every Chilean row would import as 招标中 forever.
 *    Chile's status field is a snapshot taken at publication and never
 *    refreshed, not a lifecycle. The deadline is the only honest signal here.
 *
 * 2. `sourceUrl` is built there as `${base}${release.ocid}`. Chile's public
 *    ficha is not addressed by ocid at all — see chileOcdsPublicUrl(), which
 *    documents a URL form that returns 200 and a full-looking empty page.
 *
 * 3. The buyer name in `parties[].name` carries a `" | "` on 120 of 120
 *    records, and the two halves are NOT always the same string (64 of 120).
 *    The generic mapper reads that field. `identifier.legalName` was clean on
 *    120 of 120 — see chileBuyerName().
 *
 * 4. `inferGovernmentLevel()` is built from Mexican buyer names
 *    (municipio/ayuntamiento/secretaría) and matches none of Chile's, so all
 *    120 would have landed on its "federal" fallback — including 42
 *    municipalities. See chileGovernmentLevel().
 *
 * ── The survey these rules come from ──────────────────────────────────────
 *
 * 120 records, 40 each from 2026-05, 2026-06 and 2026-07, taken at an even
 * stride through each month's index rather than off the top of it. Counts
 * quoted in the comments below are from that survey and nothing else. Where a
 * number is not measured this file says so rather than rounding a guess into
 * a rule.
 */

export const CHILE_SOURCE_NAME = "Mercado Público — ChileCompra（智利公共采购平台）";

/**
 * The public ficha, for a Chinese user to open.
 *
 * ── The form that works, and the one that lies ────────────────────────────
 *
 * `?idlicitacion=<code>` — 200, and the server itself 302s to its canonical
 * `?qs=<encrypted token>` form and serves the real page. Verified on two
 * different codes, each rendering its OWN title in `lblNombreLicitacion`
 * ("MAQUINARIAS DE ASEO CLÍNICO" and "COMPRA DE MOTOR PEQUEÑOS FRAGMENTOS
 * BATERIA", 246,763B and 255,445B).
 *
 * `?qs=<code>` — ALSO 200. Also ~121KB of real-looking HTML. Also contains
 * the tender code, because the code is echoed back in the query string and
 * the viewstate. And every data field on it is empty: `lblNombreLicitacion`
 * is `<span id="lblNombreLicitacion" class="texto04"></span>`. Two different
 * codes produced pages of 121,624 and 121,625 bytes — differing by the one
 * character of the code itself.
 *
 * That second URL is the shape this repo's house rule is about. "Did it come
 * back 200, and does the page mention the tender?" passes it. It is pinned as
 * a fixture (ficha-qs-plain-code.html) and asserted in
 * scripts/test-chile-ocds-mapper.ts so nobody has to rediscover it.
 *
 * The `qs` token is server-issued and encrypted, so it cannot be constructed
 * offline — which is exactly why this returns the `idlicitacion` form and
 * lets Mercado Público mint its own link.
 */
export function chileOcdsPublicUrl(code: string): string {
  return `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(code)}`;
}

/**
 * The buying entity's name, from the field that is actually clean.
 *
 * `parties[].name` and `tender.procuringEntity.name` are the same string on
 * 120 of 120 records, and on 120 of 120 that string contains `" | "`:
 *
 *     "CORP MUNIC EDUC SALUD Y ATENCION | CORP MUNIC EDUC SALUD Y ATENCION"
 *
 * On 64 of those the two halves are identical, so a "split and dedupe" rule
 * looks right — and on the other 56 they are not identical, so that rule
 * would be silently choosing one of two different names. What the halves mean
 * (entity and buying unit, most likely) was NOT established here, so this
 * does not pretend to split them.
 *
 * `parties[].identifier.legalName` was present and free of `" | "` on 120 of
 * 120, and carries a `CL-RUT` scheme identifier alongside it. That is the
 * field to read. The `" | "` form is kept only as a fallback, taking the
 * first half, for the record that does not have a legalName — none was seen,
 * but "none in 120" is not "never".
 */
export function chileBuyerName(release: OcdsRelease): string | undefined {
  const party = release.parties?.find((candidate) => candidate.roles?.includes("buyer")) ?? release.parties?.[0];
  const legalName = party?.identifier?.legalName?.trim();
  if (legalName) return legalName;
  const raw = (party?.name ?? release.tender?.procuringEntity?.name)?.trim();
  if (!raw) return undefined;
  return raw.split(" | ")[0]?.trim() || undefined;
}

/**
 * The region, de-whitespaced.
 *
 * 58 of 120 arrive with trailing spaces inside the value — "Región de
 * Valparaíso ", "Región de Tarapacá  " (two). Stored raw, the same region
 * becomes two or three distinct facet values and the list page's region
 * filter splits one region across several entries. The survey saw 16 distinct
 * regions after trimming, which is exactly Chile's count.
 */
export function chileRegion(release: OcdsRelease): string | undefined {
  const party = release.parties?.find((candidate) => candidate.roles?.includes("buyer")) ?? release.parties?.[0];
  const region = party?.address?.region?.replace(/\s+/g, " ").trim();
  return region || undefined;
}

/**
 * Chile's administrative ladder, which is not Mexico's.
 *
 * Chile is a unitary state: below the central government there are exactly
 * two levels a buyer can sit at — the 16 regional governments and the 345
 * municipalities. Everything else (ministries, the armed forces, the
 * Servicios de Salud and their hospitals, the national services, the state
 * universities) is central government, which this schema calls "federal".
 * So the two patterns below are not a partial list to be extended later;
 * they are the only two non-central cases that exist.
 *
 * Measured over the 120: 42 match the municipal pattern ("I MUNICIPALIDAD DE
 * PURRANQUE", "ILUSTRE MUNICIPALIDAD DE POZO ALMONTE", "CORP MUNIC EDUC SALUD
 * Y ATENCION"), and the regional pattern catches the "… V REGION" /
 * "SECRETARIA REGIONAL MINISTERIAL …" forms that appeared. No
 * "GOBIERNO REGIONAL" string appeared in the sample at all, and it is
 * included anyway because it is the formal name of the body.
 *
 * Same caveat the shared inferGovernmentLevel() carries: a heuristic on a
 * name, for human review, not a field the source publishes. It is here rather
 * than in heuristics.ts because that function is on Mexico's, Colombia's and
 * Brazil's live import paths and this branch has no business changing what
 * they classify.
 */
const CHILE_MUNICIPAL = /\bmunicipalidad\b|\bmunic\b|\bmunicipal\b/i;
const CHILE_REGIONAL = /gobierno regional|secretar[íi]a regional ministerial|\bseremi\b|\b[ivxIVX]+\s+regi[óo]n\b/i;

export function chileGovernmentLevel(buyerName: string): GovernmentLevel {
  if (CHILE_MUNICIPAL.test(buyerName)) return "municipal";
  if (CHILE_REGIONAL.test(buyerName)) return "state";
  return "federal";
}

/**
 * Status, from the deadline — because the status field does not carry one.
 *
 * `tender.status` was "active" on 120 of 120, while 119 of the 119 records
 * that have a `tenderPeriod.endDate` had a deadline in the past. The richer
 * `tender.statusDetails` showed "5-Publicada" 119 times and "6-Cerrada" once;
 * those numeric prefixes are Mercado Público's own estado codes and the full
 * code table was NOT measured here, so nothing is read off them. One
 * observation of "6-Cerrada" is not a mapping.
 *
 * Compared with platformDay() rather than as instants, for the reason that
 * function documents: a tender due TODAY is still open, and an importer that
 * disagreed with what the site displays about the same tender would be its
 * own bug.
 *
 * "awarded" is deliberately never returned. The award lives behind a separate
 * `urlAward` endpoint this pass does not fetch, and the index's mere mention
 * of a urlAward was not verified to mean an award was made — see the README.
 * Claiming an award from an unverified signal is worse than not claiming one.
 */
export function chileStatus(submissionDeadline: string | undefined, now: Date): TenderStatus {
  if (!submissionDeadline) return "open";
  const deadline = platformDay(submissionDeadline);
  const today = platformDay(now);
  if (!deadline || !today) return "open";
  return deadline < today ? "submission_closed" : "open";
}

function buildKeyDates(release: OcdsRelease, publicationDate: string): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const tender = release.tender;
  const id = release.ocid;
  dates.push({ id: `${id}-publication`, type: "publication", date: publicationDate });
  if (tender?.enquiryPeriod?.endDate) {
    dates.push({ id: `${id}-questions`, type: "questions_deadline", date: tender.enquiryPeriod.endDate });
  }
  if (tender?.tenderPeriod?.endDate) {
    dates.push({ id: `${id}-submission`, type: "submission", date: tender.tenderPeriod.endDate });
  }
  return dates;
}

/**
 * Maps one Chilean OCDS release package to a Tender, or null when the record
 * is missing something a row cannot be built without.
 *
 * Returning null rather than filling a blank keeps "we did not get this" out
 * of the database, which is the same rule every other mapper here follows.
 *
 * @param now injected so the status a test asserts does not change with the
 *   calendar — the fixtures are from 2026-07 and their deadlines are fixed.
 */
export function mapChileOcdsPackageToTender(
  pkg: OcdsReleasePackage,
  sourceName: string = CHILE_SOURCE_NAME,
  now: Date = new Date(),
): Tender | null {
  const release = pkg.releases?.[0];
  if (!release) return null;
  const tender = release.tender;
  if (!tender?.title) return null;

  const buyer = chileBuyerName(release);
  if (!buyer) return null;

  const publicationDate = release.date ?? tender.tenderPeriod?.startDate;
  if (!publicationDate) return null;

  // The ficha and the slug are both keyed on the tender CODE, not the ocid:
  // the ocid is the code with ChileCompra's `ocds-70d2nz-` prefix, and that
  // prefix is noise in a URL a human reads and in a slug an admin types.
  const code = tender.id ?? release.ocid.replace(/^ocds-70d2nz-/, "");

  const submissionDeadline = tender.tenderPeriod?.endDate;
  const governmentLevel = chileGovernmentLevel(buyer);
  // Deliberately the generic default. `mainProcurementCategory` was absent on
  // 120 of 120 records, so OCDS's own goods/services/works signal simply is
  // not published by Chile. The UNSPSC classification on tender.items IS
  // present and could ground a real mapping — but that needs the UNSPSC
  // segment table, and inventing one from memory is the thing this repo does
  // not do. Recorded as an open gap in the README rather than papered over.
  const scopeType = "services" as const;
  const estimatedValue = tender.value?.amount;
  // Read independently of the amount, not alongside it: one record in the 120
  // carried an amount with NO currency (2273-36-LE26, 24,000,000 and no
  // currency field). Defaulting that to CLP would be a guess about money.
  const currency = tender.value?.currency;
  const procedureType = tender.procurementMethodDetails ?? tender.procurementMethod ?? "Unknown";
  const location = chileRegion(release);

  const { industries, relevance } = classifyStoredTender({
    procedureType,
    title: tender.title,
    // Must be the same string stored as `summary` below, or a row gets
    // classified from less text at import than at reclassify — the trap
    // ocds-mapper.ts documents.
    summary: tender.description ?? tender.title,
    buyer,
    country: "Chile",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency,
    sourceName,
  });

  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug: `chile-${slugify(code)}`,
    tenderNumber: code,
    title: untranslated(tender.title),
    summary: untranslated(tender.description ?? tender.title),
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
    ...(location ? { location } : {}),
    status: chileStatus(submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(release, publicationDate),
    risks: [],
    relevance,
    sourceName,
    sourceUrl: chileOcdsPublicUrl(code),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
