import type { Tender, TenderKeyDate, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender, ANTAQ_SOURCE_NAME } from "@/lib/relevance";
import type { AntaqHearing } from "@/lib/ingestion/antaq-audiencia-parser";

/**
 * One ANTAQ public hearing becomes one tender.
 *
 * ── Why a hearing is a tender at all ──────────────────────────────────────
 *
 * It is not a call for bids; it is the consultation that precedes one, and it
 * publishes the draft edital, the draft contract and the EVTEA. For a bidder
 * who has to read Portuguese, price a thirty-year concession and assemble a
 * consortium, that is the stage where the work starts — by the time the
 * auction notice appears the terms are fixed and the timetable is short. The
 * auction pages themselves are unreachable from every machine this platform
 * runs on (leilao.antaq.gov.br serves a Cloudflare challenge to the laptop,
 * to Vercel and to the runner alike), so this is also the only ANTAQ stage
 * that can be imported at all.
 *
 * The status therefore stays `planned` while contributions are open and
 * becomes `submission_closed` afterwards. It is never `open`: nobody can bid
 * on a hearing, and showing one as open would put a customer on a deadline
 * that does not exist.
 *
 * ── Why estimatedValue is absent, always ──────────────────────────────────
 *
 * Measured on all five captured pages: a hearing page states no money. Not a
 * ceiling, not a reference price, not a CAPEX figure. The investment number
 * is inside the EVTEA, a separate PDF behind a separate link, and reading it
 * is document extraction's job, not this mapper's. So no value is ever set —
 * the same rule aneel-transmissao-mapper.ts records for RAP, and for the same
 * reason: a fabricated number is worse than a missing one, because it filters
 * and sorts as if it were true.
 *
 * That absence is exactly why this source carries the national-priority flag
 * (see ANTAQ_SOURCE_NAME). Without it every port concession would land as
 * 常规项目·无金额, sorted alongside the municipal kindergartens the
 * small-works rule exists to remove.
 *
 * ── The summary is built, not copied ──────────────────────────────────────
 *
 * `lblSubTitulo` says what the project is in one line. The `1. Objetivo`
 * paragraph says it in bureaucratic full. The heading says only "Audiência
 * Pública nº 07/2026 - ANTAQ", which names nothing — and this platform's own
 * no-content rule would rightly exclude a row whose title is a reference
 * number. So the title is the sub-heading when there is one, and the heading
 * only as a last resort.
 *
 * Written against __fixtures__/antaq/, five real pages captured 2026-09-19.
 */

/** ANTAQ's port concessions are all federal: the agency is the granting authority. */
const GOVERNMENT_LEVEL = "federal" as const;

/**
 * A concession of a port terminal is works plus operation, not a purchase.
 * `works` is the closest of this platform's five scope types and the one its
 * industry tagging and analysis prompts are tuned for; `services` would read
 * as a cleaning contract.
 */
const SCOPE_TYPE = "works" as const;

function statusFor(hearing: AntaqHearing, now: Date): TenderStatus {
  if (hearing.contributionsDeadline === undefined) return "planned";
  // Compared as calendar days in UTC, matching how the deadline was parsed —
  // see parseBrazilianDate on why no clock time survives.
  return new Date(`${hearing.contributionsDeadline}T23:59:59Z`).getTime() < now.getTime() ? "submission_closed" : "planned";
}

function keyDatesFor(hearing: AntaqHearing, slug: string, publicationDate: string): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (hearing.contributionsDeadline !== undefined) {
    dates.push({
      id: `${slug}-contributions`,
      type: "submission",
      date: hearing.contributionsDeadline,
      notes: untranslated("Prazo final para contribuições à consulta pública"),
    });
  }
  return dates;
}

/**
 * The hearing's own timetable, as prose appended to the summary rather than
 * as key dates.
 *
 * The cronograma rows carry things like "29/06/2026 a 13/08/2026" and
 * "05/08/2026, das 9h às 15h" — ranges and times of day, in a free-text
 * column. `TenderKeyDate.date` is a single day, so half of these would have
 * to be truncated to fit, and a range silently becoming its start date is the
 * kind of quiet lie this platform has already paid for once with deadlines.
 * They are kept verbatim where a reader can see they are verbatim.
 */
function scheduleProse(hearing: AntaqHearing): string {
  if (hearing.schedule.length === 0) return "";
  const rows = hearing.schedule.map((row) => `${row.event}：${row.when}`).join("；");
  return ` Cronograma: ${rows}.`;
}

export function mapAntaqHearingToTender(hearing: AntaqHearing, now: Date = new Date()): Tender | null {
  const publicationDate = hearing.publishedAt;
  // No publication date means no place on a timeline and no bidding-window
  // check. Skipping is correct; stamping "today" would make an old hearing
  // look new every time the importer ran.
  if (publicationDate === undefined) return null;

  const what = hearing.subject ?? hearing.objective;
  if (what === undefined || what.trim().length < 20) return null;

  const tenderNumber = `AP ${hearing.number}`;
  // The number alone repeats across years only if the year is dropped, and it
  // is not: `07/2026` already carries it. The code is appended when present
  // because two hearings in one year are told apart by the port area far more
  // readably than by their sequence number.
  const slug = `antaq-${slugify(`${hearing.number}${hearing.projectCode ? `-${hearing.projectCode}` : ""}`)}`;

  const title = hearing.subject ?? hearing.heading;
  const summary = `${what}${scheduleProse(hearing)}`;

  const { industries, relevance } = classifyStoredTender({
    sourceName: ANTAQ_SOURCE_NAME,
    title,
    summary,
    buyer: "Agência Nacional de Transportes Aquaviários (ANTAQ)",
    country: "Brazil",
    governmentLevel: GOVERNMENT_LEVEL,
    scopeType: SCOPE_TYPE,
    procedureType: "Audiência e Consulta Pública",
  });

  const nowIso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer: "Agência Nacional de Transportes Aquaviários (ANTAQ)",
    country: "Brazil",
    governmentLevel: GOVERNMENT_LEVEL,
    industries,
    scopeType: SCOPE_TYPE,
    procedureType: "Audiência e Consulta Pública",
    publicationDate,
    ...(hearing.contributionsDeadline === undefined ? {} : { submissionDeadline: hearing.contributionsDeadline }),
    status: statusFor(hearing, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: keyDatesFor(hearing, slug, publicationDate),
    risks: [],
    relevance,
    sourceName: ANTAQ_SOURCE_NAME,
    sourceUrl: hearing.sourceUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
