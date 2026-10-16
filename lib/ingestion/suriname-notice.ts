/**
 * What a gov.sr 「Aanbestedingen」 post says (connectors/suriname-govsr-live.ts):
 * the procedure, the bid deadline, the pre-bid meeting, the clarification
 * deadline, who finances it and the notice PDF. Pure functions, so the
 * fixture test (scripts/test-suriname.ts) runs offline.
 *
 * The posts are written by hand, so each fact is read from the sentence
 * that states it, never from the first date on the page: the clarification
 * deadline ("Requests for clarification must be submitted … no later than
 * 12 October") comes before the bid deadline ("Bids must be delivered … by
 * October 28, 2026, 11:00 a.m.") in every invitation. Measured on the 15
 * posts of 3 June – 24 September 2026, the deadline is written six ways:
 *
 *   Bids must be delivered to the address below by October 28, 2026, 11:00 a.m. local time
 *   Bids must be delivered to the address below by 4 November 2026, 11:00 a.m. local time
 *   Bids must be delivered to the address below by 4 September, 11:00 a.m.   (no year)
 *   Submission & Opening Deadline: 21 Augst 2026 before 11:00 a.m. SRT       (sic)
 *   The deadline for bid submission is 13 July 2026 at 11:00 am Suriname Time
 *   Expressions of Interest must be delivered by 24 th of July 2026 via email
 *
 * One post (the public-transport platform of 22 September) is the bidding
 * document's opening clauses with the dates left in the attached PDF; it
 * reads with no deadline, and the run lists it rather than guessing.
 */
import type { SurinamePost } from "@/lib/ingestion/connectors/suriname-govsr-live";

/** Suriname Time, UTC-3 all year. */
const PARAMARIBO_OFFSET = "-03:00";

export type SurinameMethod = "icb" | "ncb" | "eoi" | null;

export type SurinameNotice = {
  postId: number;
  url: string;
  title: string;
  /** ISO, from the post's date in Paramaribo time. */
  publishedAt: string;
  method: SurinameMethod;
  /** ISO; absent when no sentence states it. */
  deadline?: string;
  preBidMeeting?: string;
  clarificationsUntil?: string;
  /** "Social Bond", "Inter-American Development Bank", … */
  financier: string | null;
  /** Who the purchase is for, when the post says ("for the benefit of the Academic Hospital Paramaribo"). */
  beneficiary: string | null;
  /** PDFs uploaded with the post. */
  documents: string[];
  /** The post's own 「Scope of …」 section, shortened: what is bought or built. */
  scope: string | null;
  /** The post as plain text — contact lines dropped (see postText). */
  text: string;
};

const NAMED_ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * The post as one line of plain text. Email addresses are dropped: the
 * contact block is the procuring office's mailbox, and the platform keeps
 * the notice link instead of copying contact details.
 */
export function postText(html: string): string {
  const text = decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ")
    .replace(/[   ‑]/g, (char) => (char === "‑" ? "-" : " "))
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(January|February|March|April|May|June|July|August|Augst|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?";
const DAY = "(\\d{1,2})\\s*(?:st|nd|rd|th)?(?:\\s+of)?";
const TIME = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)?";
/** "October 28, 2026" or "4 November 2026" or "24 th of July 2026", year optional, then an optional time. */
const DATE_TIME = `(?:${MONTH}\\s+${DAY},?|${DAY}\\s+${MONTH})(?:,?\\s+(\\d{4}))?(?:,?\\s*(?:at|before|by)?\\s*${TIME})?`;

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase().slice(0, 3));
}

/**
 * A date read from DATE_TIME's groups, in Paramaribo time. Without a year
 * it is the first such day on or after the post — "by 4 September" in a
 * post of 10 August is 2026's. Without a time it is the end of that day.
 */
function readDateTime(groups: (string | undefined)[], published: Date): string | undefined {
  const [monthFirst, dayAfterMonth, dayFirst, monthAfterDay, year, hour, minute, meridiem] = groups;
  const month = monthIndex(monthFirst ?? monthAfterDay ?? "");
  const day = Number(dayAfterMonth ?? dayFirst);
  if (month < 0 || !(day >= 1 && day <= 31)) return undefined;
  let hours = hour === undefined ? 23 : Number(hour);
  const minutes = hour === undefined ? 59 : Number(minute ?? 0);
  if (meridiem && /^p/i.test(meridiem) && hours < 12) hours += 12;
  if (meridiem && /^a/i.test(meridiem) && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return undefined;
  const at = (y: number) => new Date(`${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00${PARAMARIBO_OFFSET}`);
  if (year) return at(Number(year)).toISOString();
  const sameYear = at(published.getUTCFullYear());
  return (sameYear.getTime() >= published.getTime() - 86_400_000 ? sameYear : at(published.getUTCFullYear() + 1)).toISOString();
}

/** The first date that follows one of `leads`, read from the text after it. */
function dateAfter(text: string, leads: RegExp[], published: Date): string | undefined {
  for (const lead of leads) {
    const match = new RegExp(`${lead.source}\\s*${DATE_TIME}`, "i").exec(text);
    if (match) {
      const value = readDateTime(match.slice(1), published);
      if (value) return value;
    }
  }
  return undefined;
}

const DEADLINE_LEADS = [
  /Bids must be (?:delivered|submitted|received)[^.]{0,80}?\bby/,
  /Submission\s*(?:&|and)\s*Opening\s*Deadline:/,
  /deadline for (?:bid )?submission (?:of bids )?is/,
  /Expressions? of Interest must be (?:delivered|submitted|received)[^.]{0,40}?\b(?:by|before|no later than)/,
  /Proposals must be (?:delivered|submitted|received)[^.]{0,80}?\b(?:by|before|no later than)/,
];
/** "will be held: Address: S.M. Jamaludinstraat no. 26 (…). Date & Time: October 7, …", "will be held on Wednesday 12 August …", "Pre ‑ Bid Meeting: 5 October …". */
const PRE_BID_LEADS = [
  /pre\s*-?\s*bid meeting will be held:[\s\S]{0,160}?Date\s*&\s*Time:/,
  /pre\s*-?\s*bid meeting will be held(?:\s+on)?(?:\s+[A-Z][a-z]+day,?)?/,
  /Pre\s*-?\s*Bid Meeting:/,
];
const CLARIFICATION_LEADS = [/Requests for clarification must be submitted[^.]{0,60}?no later than/];

const FINANCIERS: [RegExp, string][] = [
  [/Inter-American Development Bank|\bIDB\b|\bIADB\b/, "Inter-American Development Bank"],
  [/\bWorld Bank\b|International Bank for Reconstruction/i, "World Bank"],
  [/Caribbean Development Bank|\bCDB\b/, "Caribbean Development Bank"],
  [/Islamic Development Bank|\bIsDB\b/, "Islamic Development Bank"],
  [/European Union|\bEU\b/, "European Union"],
  [/Agence Française de Développement|\bAFD\b/, "Agence Française de Développement"],
  [/Social Bond|Social Projects Proceeds Account/i, "Social Bond"],
];

export function surinameMethod(text: string): SurinameMethod {
  if (/International Competitive (?:Bidding|Procurement|Tender)|\bICB\b|international open (?:tender|bidding)/i.test(text)) return "icb";
  if (/National Competitive (?:Bidding|Procurement|Tender)|\bNCB\b/i.test(text)) return "ncb";
  if (/Expressions? of Interest|\bREOI\b|\bEOI\b/i.test(text)) return "eoi";
  return null;
}

const SCOPE_MAX = 400;

/** "Scope of Works and related services Design Phase: … Procurement Method" → the part in between, cut at a word. */
export function surinameScope(text: string): string | null {
  const match = /Scope of (?:Supply|Works|Services|the Assignment)(?:\s+and related \w+)?(?:\s*\(Lots\))?\s*:?\s*([\s\S]+?)\s*(?:Procurement Method|Selection Method|Eligibility|Submission Requirements|Bid Evaluation|$)/i.exec(text);
  const scope = match?.[1]?.trim();
  if (!scope || scope.length < 20) return null;
  return scope.length <= SCOPE_MAX ? scope : `${scope.slice(0, SCOPE_MAX).replace(/\s+\S*$/, "")} …`;
}

export function parseSurinamePost(post: SurinamePost): SurinameNotice {
  const published = new Date(`${post.date}${PARAMARIBO_OFFSET}`);
  const text = postText(post.content.rendered);
  const documents = [...new Set([...post.content.rendered.matchAll(/href="(https:\/\/gov\.sr\/wp-content\/uploads\/[^"]+\.pdf)"/gi)].map((match) => match[1]))];
  const beneficiary = /for the benefit of (?:the )?([^.(]{4,90}?),? (?:now|intends|invites)\b/i.exec(text)?.[1]?.trim() ?? null;
  const deadline = dateAfter(text, DEADLINE_LEADS, published);
  const preBidMeeting = dateAfter(text, PRE_BID_LEADS, published);
  const clarificationsUntil = dateAfter(text, CLARIFICATION_LEADS, published);
  return {
    postId: post.id,
    url: post.link,
    title: decodeEntities(post.title.rendered).replace(/\s+/g, " ").trim(),
    publishedAt: published.toISOString(),
    method: surinameMethod(text),
    ...(deadline ? { deadline } : {}),
    ...(preBidMeeting ? { preBidMeeting } : {}),
    ...(clarificationsUntil ? { clarificationsUntil } : {}),
    financier: FINANCIERS.find(([pattern]) => pattern.test(text))?.[1] ?? null,
    beneficiary: beneficiary ? (/^(Ministry|Academic|Bureau|Suriname|National|Medical)/.test(beneficiary) ? beneficiary : null) : null,
    documents,
    scope: surinameScope(text),
    text,
  };
}
