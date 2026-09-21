/**
 * Reads one edition of the Diário Oficial da União.
 *
 * `in.gov.br/leiturajornal?data=DD-MM-YYYY&secao=do3` is a server-rendered
 * page whose real payload is a JSON blob inside a `<script>` tag — a shape,
 * not a page. So this reads the blob and leaves the HTML alone.
 *
 * Written against `__fixtures__/dou/`, captured on the GitHub runner on
 * 2026-09-19 because in.gov.br closes the socket on the user's laptop and is
 * outside the agent sandbox's egress allowlist. The capture is a SAMPLE —
 * 216 of that weekday's 2,139 Seção 3 notices, two per `artType` and two per
 * top-level organ, because the edition is ordered by publishing body and its
 * first hundred rows are all municipal. `scripts/capture-dou.ts` says why.
 *
 * ── The two things the payload settles ────────────────────────────────────
 *
 *  1. **Every notice is typed and attributed.** `artType` is the National
 *     Press's own vocabulary — 95 distinct values in the sample, from
 *     `Aviso de Licitação-Concorrência` to `Extrato de Termo Aditivo` — and
 *     `hierarchyList` is the publishing body from ministry down to the
 *     individual regional office. That is what makes targeting possible at
 *     all, and it is why the watch filters locally (see dou-watch.ts) rather
 *     than through in.gov.br's own search.
 *
 *  2. **`content` is a 403-character stub.** Measured: 211 of 216 sampled
 *     notices end in an ellipsis, and the median length equals the maximum.
 *     A DOU notice is therefore a LEAD, not a tender — it carries no
 *     deadline, no value and half an object description. Mapping one
 *     straight into `Tender` would manufacture rows with truncated summaries
 *     and no submission date, which is the shape this platform has already
 *     paid for elsewhere. Hence a watch that reports, and a human or a
 *     second fetch that imports.
 */

/** DOU sections this platform has a reason to read. Seção 3 carries contracts and tender notices; Seção 1 carries the acts that authorise a concession, which reach no procurement portal at all. */
export const DOU_SECTIONS = ["do1", "do2", "do3"] as const;
export type DouSection = (typeof DOU_SECTIONS)[number];

export type DouNotice = {
  /** `DO3`, `DO1_EXTRA_C` — the National Press's own edition code, which distinguishes an extra edition from the ordinary one. */
  pubName: string;
  /** The slug the permalink is built from. Ends in the notice's numeric id. */
  urlTitle: string;
  title: string;
  /** The National Press's own classification. See dou-watch.ts for what is done with it. */
  artType: string;
  /** Publishing body, outermost first: `["Ministério dos Transportes", "DNIT", "Superintendência Regional no Ceará"]`. */
  organs: string[];
  /** The same path as one string, as the payload gives it. */
  organPath: string;
  /** ISO calendar day, converted from the payload's `DD/MM/YYYY`. */
  publishedOn?: string;
  editionNumber?: string;
  page?: string;
  /** The first ~400 characters of the notice. Truncated at the source — see the header. */
  snippet: string;
};

export type DouEdition = {
  section?: string;
  /** The day the payload itself reports, which is not necessarily the day that was asked for. */
  publishedOn?: string;
  notices: DouNotice[];
  /** Set when the file is one of the committed samples rather than a whole edition, so a count is never mistaken for a day's total. */
  sampleNote?: string;
  sampledFrom?: number;
};

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** `18/09/2026` → `2026-09-18`. Undefined rather than a guess when it is anything else. */
export function parseDouDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (match === null) return undefined;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? undefined : iso;
}

/**
 * The search results highlight the matched term with an inline `<span>`, so
 * the snippet arrives with markup in it. Left in would leak into every report
 * line and into any keyword match run over the text.
 */
function plain(raw: string | undefined): string {
  if (raw === undefined) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function toNotice(raw: Record<string, unknown>): DouNotice | null {
  const urlTitle = str(raw.urlTitle);
  if (urlTitle === undefined) return null;
  const hierarchy = Array.isArray(raw.hierarchyList) ? raw.hierarchyList.filter((h): h is string => typeof h === "string") : [];
  // `title` is the headline; `titulo`/`subTitulo` are present but empty on
  // every sampled Seção 3 row, so they are a fallback and not the source.
  const title = plain(str(raw.title) ?? str(raw.titulo) ?? str(raw.subTitulo) ?? "");
  return {
    pubName: str(raw.pubName) ?? "",
    urlTitle,
    title,
    artType: str(raw.artType) ?? "",
    organs: hierarchy,
    organPath: str(raw.hierarchyStr) ?? hierarchy.join("/"),
    publishedOn: parseDouDate(str(raw.pubDate)),
    editionNumber: str(raw.editionNumber),
    page: str(raw.numberPage),
    snippet: plain(str(raw.content)),
  };
}

/** Reads an already-extracted payload — what the committed fixtures hold, and what the live connector hands over after pulling the blob out of the page. */
export function readDouPayload(payload: unknown): DouEdition {
  if (payload === null || typeof payload !== "object") return { notices: [] };
  const doc = payload as Record<string, unknown>;
  const rows = Array.isArray(doc.jsonArray) ? doc.jsonArray : [];
  const notices: DouNotice[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const notice = toNotice(row as Record<string, unknown>);
    if (notice !== null) notices.push(notice);
  }
  const sample = doc._sample as { note?: unknown; originalCount?: unknown } | undefined;
  return {
    section: str(doc.section),
    // The edition's own date, taken from the notices rather than from the URL
    // that was asked for: leiturajornal answers a weekend request with the
    // nearest edition, and reporting the requested day would then be a lie.
    publishedOn: notices.find((n) => n.publishedOn !== undefined)?.publishedOn,
    notices,
    sampleNote: typeof sample?.note === "string" ? sample.note : undefined,
    sampledFrom: typeof sample?.originalCount === "number" ? sample.originalCount : undefined,
  };
}

/**
 * Pulls the payload out of a `leiturajornal` page.
 *
 * Every JSON blob is tried and the one carrying a `jsonArray` wins, rather
 * than the first one or one matched by id. The page carries several — Liferay
 * portlet configuration among them — and picking by position would break the
 * day in.gov.br adds another.
 */
export function parseDouEdition(html: string): DouEdition | null {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    candidates.push(match[1]);
  }
  for (const match of html.matchAll(/<input[^>]*value="(\{&quot;[\s\S]*?)"/gi)) {
    candidates.push(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  for (const raw of candidates) {
    if (!raw.includes("jsonArray")) continue;
    try {
      const edition = readDouPayload(JSON.parse(raw.trim()));
      if (edition.notices.length > 0) return edition;
    } catch {
      continue;
    }
  }
  return null;
}

/** The edition page for a given day and section — the URL that was actually captured, and the one a link in a report can always fall back to. */
export function douEditionUrl(section: DouSection, day: string): string {
  const [year, month, date] = day.split("-");
  return `https://www.in.gov.br/leiturajornal?data=${date}-${month}-${year}&secao=${section}`;
}

/**
 * The permalink for one notice.
 *
 * `urlTitle` exists in the payload for no other purpose: it is a slug ending
 * in the notice's own numeric id, and `in.gov.br/web/dou/-/<slug>` is the
 * address the reader's own links use. It is stated here rather than measured,
 * because in.gov.br refuses both the laptop and this sandbox — so every
 * report prints the edition URL beside it, which IS the captured address, and
 * the first run from a machine that can reach in.gov.br should confirm one of
 * these resolves.
 */
export function douNoticeUrl(notice: DouNotice): string {
  return `https://www.in.gov.br/web/dou/-/${notice.urlTitle}`;
}
