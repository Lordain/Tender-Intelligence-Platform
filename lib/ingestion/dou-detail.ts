import { parseBrazilianDate } from "@/lib/ingestion/antaq-audiencia-parser";

/**
 * Reads one DOU notice's detail page.
 *
 * Written against 13 real pages in `__fixtures__/dou/detail/`, captured on the
 * GitHub runner from the 2026-09-18 Seção 3 edition in two batches: the day's
 * first eight (run #12, municipal) and the five the watch actually keeps
 * (run #14, federal). Both batches were needed, and the second one changed the
 * design.
 *
 * ── The finding: there are TWO shapes, and the publisher decides which ─────
 *
 * Measured across all 13, not assumed:
 *
 *   **`comprasnet` — 4 of 13.** A body publishing through Compras.gov.br emits
 *   labelled fields, one per paragraph:
 *
 *       Modalidade: Concorrência 51/2026
 *       Número do processo: 50603.001604/2026-08
 *       Objeto: Contratação Integrada de empresa para … Rodovia BR-116/CE …
 *       Data de início de recebimento de propostas: 18/09/2026, 08:00
 *       Data de Abertura: 17/12/2026, 09:30
 *       Endereço eletrônico do Edital: https://cnetmobile.estaleiro.serpro…
 *
 *   That is a tender. `Data de Abertura` is the date the DOU payload's
 *   403-character snippet never carried, and the edital address is a deep link
 *   carrying the Comprasnet `compra` id rather than a portal homepage.
 *
 *   **`prose` — 9 of 13.** Everyone else writes paragraphs. The dates appear in
 *   at least three phrasings (`Abertura: 05/10/26 às 09h`, `dia 30 de setembro
 *   de 2026, às 08 horas`, `das 13h30min do dia 21/09/2026 até as 13h00min do
 *   dia 05/10/2026`), the instrument number is inline, and one Guarulhos notice
 *   carries SEVEN tenders in seven paragraphs.
 *
 * All 4 labelled pages are federal; all 4 are rows the watch kept. That is the
 * useful correlation — the notices this platform targets are the ones that
 * arrive machine-readable — but it is a correlation measured on one day, not a
 * rule the National Press published.
 *
 * ── What this module refuses to do ───────────────────────────────────────
 *
 * It does not parse prose. A prose notice comes back as `shape: "prose"` with
 * its paragraphs and a stated reason, and stays a lead. Guessing a deadline out
 * of nine municipal phrasings is precisely the mapper-written-against-an-
 * expectation this repo has paid for three times, and the failure is silent:
 * a wrong deadline sorts, filters and renders exactly like a right one.
 *
 * It also refuses a body carrying more than one instrument number, even in the
 * labelled shape. A mapper that keeps one of seven tenders is worse than one
 * that keeps none, because nobody notices the six.
 */

/** Which of the two real shapes a page turned out to be. Never guessed — `comprasnet` requires the labels to actually be there. */
export type DouDetailShape = "comprasnet" | "prose";

export type DouDetail = {
  shape: DouDetailShape;
  /** The notice's own paragraphs, in order. The whole readable body, for a human or a model to read. */
  paragraphs: string[];
  /** `AVISO DE LICITAÇÃO` — the National Press's headline element, above the body. */
  heading?: string;
  /** `Concorrência`, `Pregão Eletrônico`. Labelled shape only. */
  instrument?: string;
  /** `51/2026`. Labelled shape only. */
  number?: string;
  /** The NUP, e.g. `50603.001604/2026-08`. */
  processNumber?: string;
  object?: string;
  /** ISO. When submissions START — NOT the deadline. */
  proposalsOpenOn?: string;
  /** ISO. Set only by an errata that moved the date: what it was before. Kept so the move is visible rather than silently overwritten. */
  proposalsMovedFrom?: string;
  /** ISO. `Data de Abertura` — the session date, which is the deadline a bidder works to. */
  openingOn?: string;
  editalUrl?: string;
  /** Every distinct instrument+number pair in the body. More than one means the notice carries several tenders. */
  tenderNumbers: string[];
  /** Set whenever this notice must not become a Tender row, saying why. Absent means it may. */
  whyNotMappable?: string;
};

const LABELS = {
  modalidade: "Modalidade",
  processo: "Número do processo",
  objeto: "Objeto",
  propostas: "Data de início de recebimento de propostas",
  // An errata restates the submission-open date as a MOVE. Its label contains
  // the plain one as a substring, which is how the first version of this file
  // read the superseded date off `de 16/09/2026 para 18/09/2026` and reported
  // 09-16 as the date bidders should work to. Both the anchoring in field()
  // and this separate entry exist because of that page.
  novaPropostas: "Nova data de início de recebimento de propostas",
  abertura: "Data de Abertura",
  edital: "Endereço eletrônico do Edital",
} as const;

/**
 * The notice's paragraphs.
 *
 * `<p class="dou-paragraph">` and nothing else. The first version of this read
 * `texto-dou` with a lazy `</div>` stop, which ends at the FIRST closing div
 * and reported 1044/1054/1105 characters for bodies that are really 897/1544/
 * 2751 — three different notices landing within 60 characters of each other,
 * which is what a fixed-size cut looks like.
 */
export function douParagraphs(html: string): string[] {
  return [...html.matchAll(/<p[^>]*class="[^"]*dou-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => plain(m[1]))
    .filter((p) => p !== "");
}

function plain(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** `<p class="identifica">AVISO DE LICITAÇÃO</p>` — present on all 13 captures, above the body. */
function heading(html: string): string | undefined {
  const match = /<p[^>]*class="[^"]*identifica[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const text = match === null ? "" : plain(match[1]);
  return text === "" ? undefined : text;
}

/**
 * One labelled field's value.
 *
 * A label is not always at the start of a paragraph: the federal pages pack
 * several into one line separated by ` / ` (`Modalidade: … / Número do
 * processo: … / Objeto: …`), so the value runs to the next ` / <Label>:` or to
 * the end. Splitting on ` / ` alone would cut every URL and every object text
 * containing a slash.
 */
function field(body: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const others = Object.values(LABELS)
    .filter((l) => l !== label)
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // Anchored to a paragraph start or a ` / ` separator. Without this,
  // "Data de início de recebimento de propostas" matches inside "Nova data de
  // início de recebimento de propostas" and returns the date being replaced.
  const pattern = new RegExp(`(?:^|\\n|/\\s*)${escaped}:\\s*([\\s\\S]*?)(?=\\s*(?:/\\s*)?(?:${others}):|\\n|$)`, "i");
  const match = pattern.exec(body);
  if (match === null) return undefined;
  const value = match[1].replace(/\s*\/\s*$/, "").trim();
  return value === "" ? undefined : value;
}

/**
 * Instrument + number pairs, used to detect a notice carrying several tenders.
 *
 * Measured need: `02-avisos-de-licitacao-732452192` is ONE Guarulhos notice
 * holding CP 95034/26, 95035/26, 95036/26, PE 90159/26, 90160/26, 90161/26 and
 * a reprogrammed 90155/26 — seven, one per paragraph, each with its own object
 * and opening date.
 *
 * The year is normalised to two digits before de-duplicating, because the same
 * tender is written `51/2026` in the labelled shape and `51/26` in prose, and
 * counting those as two would make every errata look multi-tender.
 */
export function tenderNumbersIn(body: string): string[] {
  const found = new Set<string>();
  const pattern =
    /\b(CP|PE|PP|TP|RDC|Concorr[êe]ncia|Preg[ãa]o(?:\s+Eletr[ôo]nico)?|Tomada de Pre[çc]os|Dispensa|Inexigibilidade)\b[^\d\n]{0,20}(\d{1,6})\s*\/\s*(\d{2,4})/gi;
  for (const match of body.matchAll(pattern)) {
    const year = match[3].length === 4 ? match[3].slice(2) : match[3];
    found.add(`${match[2].replace(/^0+(?=\d)/, "")}/${year}`);
  }
  return [...found];
}

/** `17/12/2026, 09:30` → `2026-12-17`. The time is deliberately dropped: nothing downstream stores one, and a fabricated timezone is worse than no hour. */
function labelledDate(value: string | undefined): string | undefined {
  return parseBrazilianDate(value);
}

/**
 * An errata states a moved date as `de 16/09/2026 para 18/09/2026`.
 *
 * The date that counts is the one after `para`; the one before it is the date
 * being cancelled. Reading left to right returns the superseded date, which is
 * the worst possible answer here — it is a real date, in range, that sorts and
 * renders like the right one while sending a bidder to a day that no longer
 * exists.
 */
function movedDate(value: string | undefined): { to?: string; from?: string } {
  if (value === undefined) return {};
  const move = /\bde\s+(\d{2}\/\d{2}\/\d{4})\s+para\s+(\d{2}\/\d{2}\/\d{4})/i.exec(value);
  if (move === null) return { to: parseBrazilianDate(value) };
  return { to: parseBrazilianDate(move[2]), from: parseBrazilianDate(move[1]) };
}

export function parseDouDetail(html: string): DouDetail {
  const paragraphs = douParagraphs(html);
  const body = paragraphs.join("\n");
  const tenderNumbers = tenderNumbersIn(body);
  const base = { paragraphs, heading: heading(html), tenderNumbers };

  const modalidade = field(body, LABELS.modalidade);
  const objeto = field(body, LABELS.objeto);
  const abertura = labelledDate(field(body, LABELS.abertura));

  // The labelled shape is claimed only when the three fields that make a
  // tender are all present. A page with a bare `Objeto:` inside prose — one of
  // the 13 is exactly that — is prose, and saying otherwise would hand the
  // mapper an object and no date.
  if (modalidade === undefined || objeto === undefined || abertura === undefined) {
    return {
      ...base,
      shape: "prose",
      whyNotMappable:
        "散文式公告：没有 Modalidade / Objeto / Data de Abertura 这套标签，日期和标号都写在句子里。" +
        "这一版不猜 —— 13 份真实页面里有 9 份是这样，光开标日期就有三种写法。",
    };
  }

  const instrumentMatch = /^(.*?)\s*(\d{1,6}\s*\/\s*\d{2,4})\s*$/.exec(modalidade);
  const detail: DouDetail = {
    ...base,
    shape: "comprasnet",
    instrument: instrumentMatch === null ? modalidade : instrumentMatch[1].trim(),
    number: instrumentMatch === null ? undefined : instrumentMatch[2].replace(/\s+/g, ""),
    processNumber: field(body, LABELS.processo),
    object: objeto,
    ...(() => {
      // An errata's "Nova data …" wins over the plain label when both are on
      // the page, because it is the one that is still true.
      const moved = movedDate(field(body, LABELS.novaPropostas));
      if (moved.to !== undefined) return { proposalsOpenOn: moved.to, proposalsMovedFrom: moved.from };
      return { proposalsOpenOn: labelledDate(field(body, LABELS.propostas)) };
    })(),
    openingOn: abertura,
    editalUrl: field(body, LABELS.edital),
  };

  if (tenderNumbers.length > 1) {
    return {
      ...detail,
      whyNotMappable: `这一条公告里有 ${tenderNumbers.length} 个标（${tenderNumbers.join("、")}）—— 一条一个标的映射会留下一个、丢掉其余的。`,
    };
  }
  return detail;
}

/**
 * Whether this notice may become a Tender row.
 *
 * Deliberately narrow. A `true` here means the object and the deadline were
 * READ off labelled fields, not inferred, which is the only condition under
 * which a DOU notice stops being a lead.
 */
export function canBecomeTender(detail: DouDetail): boolean {
  return (
    detail.whyNotMappable === undefined &&
    detail.shape === "comprasnet" &&
    detail.object !== undefined &&
    detail.openingOn !== undefined
  );
}
