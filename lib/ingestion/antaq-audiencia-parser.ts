/**
 * Reads one ANTAQ public-hearing page.
 *
 * WHY A HEARING AND NOT AN AUCTION. ANTAQ publishes both. The auction index
 * is unusable from any machine this platform runs on: 80 of its 89 useful
 * links sit on `leilao.antaq.gov.br`, which serves a Cloudflare challenge to
 * the laptop, to Vercel and to the GitHub runner alike. The hearings sit on
 * `www.gov.br`, which all three open, and every attachment on the three
 * hearings measured came back fetchable — 21 of 21.
 *
 * That is not a downgrade. A hearing runs BEFORE the auction: it publishes
 * the draft edital, the draft contract and the EVTEA (the technical and
 * economic feasibility study) and invites comment for six to eight weeks. A
 * Chinese bidder who needs that time to read Portuguese, price a concession
 * and assemble a consortium is better served by the consultation than by the
 * auction notice, which arrives when the terms are already fixed.
 *
 * WRITTEN AGAINST FIVE REAL PAGES, in `__fixtures__/antaq/`, captured on the
 * runner on 2026-09-19 because no `.gov.br` host is reachable from the
 * sandbox this was written in. Every field below was checked to be present in
 * all five before it was relied on, and the ones that vary are typed optional.
 *
 * WHAT THE PAGES DO NOT CARRY: any money. No estimated value, no reference
 * price, no CAPEX. The figures are inside the EVTEA PDF, which is a separate
 * document behind a separate link. So this parser never sets a value, and the
 * mapper must not invent one — the same rule `aneel-transmissao-mapper.ts`
 * records for RAP.
 */

/** `nº`, `n°`, `Nº`, `N°` — ANTAQ uses the masculine ordinal and the degree sign interchangeably, sometimes on the same page. */
const NUMBER_SIGN = "[nN][º°ºo]?\\s*";

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(raw: string): string {
  return decodeEntities(raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstGroup(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html);
  return match === null ? undefined : stripTags(match[1]) || undefined;
}

/**
 * `25/06/2026 17h14` and `13/08/2026` both become `2026-06-25`.
 *
 * The clock time is dropped on purpose. ANTAQ prints Brasília local time with
 * no offset, so keeping it would mean inventing a timezone, and every date
 * this platform shows is a calendar day. Storing 17h14 as if it were UTC
 * would move a deadline across midnight for a reader in Beijing.
 */
export function parseBrazilianDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (match === null) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  // A malformed date is worse than a missing one: it sorts, filters and
  // renders as if it meant something.
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? undefined : iso;
}

export type AntaqScheduleRow = { order: string; event: string; when: string };
export type AntaqLink = { title: string; url: string };

export type AntaqHearing = {
  /** `07/2026` — ANTAQ's own numbering, and what a reader searches by. */
  number: string;
  year: number;
  /** `ITJ01`, `VDC04`, `SSB01` — the port area code, when the page names one. */
  projectCode?: string;
  /** The page's `<h1>`, e.g. `Audiência Pública nº 07/2026 - ANTAQ`. */
  heading: string;
  /** `lblSubTitulo` — what the project actually IS, and the only field that says so in one line. */
  subject?: string;
  /** The `1. Objetivo` paragraph. */
  objective?: string;
  publishedAt?: string;
  updatedAt?: string;
  /**
   * The last day contributions are accepted, read from
   * `até às 23h59 do dia DD/MM/YYYY`.
   *
   * Deliberately NOT read from `no período de X a Y`: on the VDC04 page that
   * phrase appears twice and the first occurrence belongs to an earlier round
   * of the same consultation, so it yields `23/04/2024` — a deadline two
   * years in the past on a hearing that is open. The `até` sentence appeared
   * exactly once on all five pages and always agreed with the real end date.
   */
  contributionsDeadline?: string;
  schedule: AntaqScheduleRow[];
  /** The `Comunicados` PDFs — notices, deliberations, the contribution report. */
  notices: AntaqLink[];
  /** The `Documentação` buttons: Diretrizes / Minutas de Edital e Contrato / EVTEA. Each is a page holding the real documents. */
  documentSections: AntaqLink[];
  sourceUrl: string;
};

export function parseAntaqHearing(html: string, sourceUrl: string): AntaqHearing | null {
  const heading = firstGroup(html, /<h1[^>]*class="[^"]*documentFirstHeading[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (heading === undefined) return null;

  const titleLabel = firstGroup(html, /id="lblTitulo"[^>]*>([\s\S]{0,400}?)<\/span>/i);
  const subject = firstGroup(html, /id="lblSubTitulo"[^>]*>([\s\S]{0,600}?)<\/span>/i);

  // The number is on the h1 on all five pages; lblTitulo is the fallback
  // because page 05 truncates its h1's number into the sub-heading.
  const numberMatch = new RegExp(`${NUMBER_SIGN}(\\d{1,3})\\s*/\\s*(\\d{4})`).exec(heading) ?? new RegExp(`${NUMBER_SIGN}(\\d{1,3})\\s*/\\s*(\\d{4})`).exec(titleLabel ?? "");
  if (numberMatch === null) return null;
  const number = `${numberMatch[1].padStart(2, "0")}/${numberMatch[2]}`;

  // Port-area codes are three letters and two digits (ITJ01, VDC04, SSB01).
  // Read from the heading first, then the label, and never from the body —
  // the body quotes other areas' codes when a hearing references them.
  const code = /\b([A-Z]{3}\d{2})\b/.exec(heading) ?? /\b([A-Z]{3}\d{2})\b/.exec(titleLabel ?? "");

  const schedule: AntaqScheduleRow[] = [];
  const grid = /<table[^>]*id="gridCronograma"[\s\S]*?<\/table>/i.exec(html);
  if (grid !== null) {
    const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(grid[0]);
    for (const row of (body?.[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
      if (cells.length >= 3 && (cells[1] !== "" || cells[2] !== "")) {
        schedule.push({ order: cells[0], event: cells[1], when: cells[2] });
      }
    }
  }

  const notices: AntaqLink[] = [];
  for (const anchor of html.matchAll(/<a\b[^>]*class="[^"]*internal-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeEntities(anchor[1]);
    // The extension may be followed by a slash, not only by the end of the
    // URL: Plone serves `…/vdc04_contribuies_publico.pdf/` with a trailing
    // slash, and `…/x.pdf/@@download/file` elsewhere. Anchoring at the end
    // dropped the VDC04 contributions report — the ninth of nine — which is
    // the same defect, in a second place, that the link reader was fixed for.
    if (!/\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z)(?:[/?#]|$)/i.test(url)) continue;
    const title = stripTags(anchor[2]);
    if (notices.some((n) => n.url === url)) continue;
    notices.push({ title: title || url.split("/").pop() || url, url });
  }

  // The Documentação buttons are styled inline rather than classed, so they
  // are found by that styling. Fragile by nature — hence the parser test that
  // asserts all five pages still yield a "Minutas" section, which is the one
  // that leads to the draft edital.
  const documentSections: AntaqLink[] = [];
  for (const anchor of html.matchAll(/<a\b[^>]*style="[^"]*border-radius:\s*5px[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    documentSections.push({ title: stripTags(anchor[2]), url: decodeEntities(anchor[1]) });
  }
  for (const anchor of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*style="[^"]*border-radius:\s*5px[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeEntities(anchor[1]);
    if (!documentSections.some((d) => d.url === url)) documentSections.push({ title: stripTags(anchor[2]), url });
  }

  const objective = firstGroup(html, /\b1\.?\s*Objetivo\s*<\/strong>\s*:?([\s\S]{0,1200}?)(?:<strong>|<\/p>)/i);

  return {
    number,
    year: Number(numberMatch[2]),
    projectCode: code?.[1],
    heading,
    subject,
    objective,
    publishedAt: parseBrazilianDate(firstGroup(html, /documentPublished[\s\S]{0,400}?class="value">([^<]*)</i)),
    updatedAt: parseBrazilianDate(firstGroup(html, /documentModified[\s\S]{0,400}?class="value">([^<]*)</i)),
    contributionsDeadline: parseBrazilianDate(firstGroup(html, /at[ée]\s*[àa]s?\s*[\dh:]+\s*do\s*dia\s*([0-9/]{10})/i)),
    schedule,
    notices,
    documentSections,
    sourceUrl,
  };
}

/** The hearings listed on the "em andamento" page, with the two hosts that refuse us marked. */
export function parseAntaqHearingIndex(html: string, baseUrl: string): AntaqLink[] {
  const found: AntaqLink[] = [];
  for (const anchor of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = stripTags(anchor[2]);
    if (!new RegExp(`audi[êe]ncia\\s+p[úu]blica\\s+${NUMBER_SIGN}`, "i").test(title)) continue;
    let url: string;
    try {
      url = new URL(decodeEntities(anchor[1]), baseUrl).toString();
    } catch {
      continue;
    }
    if (found.some((f) => f.url === url)) continue;
    found.push({ title, url });
  }
  return found;
}

/**
 * Every calendar day the hearing ITSELF states, in ascending order.
 *
 * Read from the cronograma's free-text `when` column plus the contributions
 * deadline — the two places on the page where ANTAQ writes a date about the
 * hearing rather than about the web page. Both are needed and neither is
 * enough alone, measured across the five captures:
 *
 *   - AP 02/2026's `até … dia` sentence says 02/05/2026, while its cronograma
 *     runs the comment period to 29/09/2026 and schedules the virtual session
 *     for 01/09/2026. The deadline sentence caught the round before the
 *     extension, so it understates the hearing by four months.
 *   - AP 07/2026's schedule cell reads `29/06/2026 a 13/08/2026` — two dates
 *     in one string, of which parseBrazilianDate returns only the first. A
 *     range read as its start date is the quiet lie this platform has already
 *     paid for once with deadlines, so here every date in the cell is taken.
 *
 * Deliberately NOT including publishedAt or updatedAt. Those are Plone's
 * dates for the PAGE, and ANTAQ re-stamps them: AP 07/2025's comment period
 * ran 29/12/2025 to 27/01/2026 and its page says published 08/06/2026, and AP
 * 04/2026's period opened 23/04/2026 on a page that says published
 * 25/05/2026 — published a month after it opened. See antaq-window.ts.
 */
export function statedDays(hearing: AntaqHearing): string[] {
  const days = new Set<string>();
  if (hearing.contributionsDeadline !== undefined) days.add(hearing.contributionsDeadline);
  for (const row of hearing.schedule) {
    for (const match of row.when.matchAll(/\d{2}\/\d{2}\/\d{4}/g)) {
      const day = parseBrazilianDate(match[0]);
      if (day !== undefined) days.add(day);
    }
  }
  return [...days].sort();
}

/** The last day the hearing states about itself, or undefined if it states none. */
export function latestStatedDay(hearing: AntaqHearing): string | undefined {
  const days = statedDays(hearing);
  return days.length === 0 ? undefined : days[days.length - 1];
}
