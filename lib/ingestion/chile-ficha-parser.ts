import type { TenderStatus } from "@/types/tender";
/**
 * The per-tender ficha page (`DetailsAcquisition.aspx`) and its attachment
 * index (`VerAntecedentes.aspx`). Pure parsing — no fetching — so every rule
 * below is pinned by real captured bytes in __fixtures__/chile/.
 *
 * ── WHY THIS EXISTS, when ingest-chile.ts already enriches closing dates ──
 *
 * enrichWithClosingDates() re-reads the SEARCH pages, ten cards per request,
 * in the site's own ordering, and keeps the first N it sees. The rows we kept
 * are a relevance-filtered subset scattered through that ordering, so asking
 * for 60 cards fills whichever 60 the site lists first — measured against a
 * 1,309-row shortlist, that overlaps our 60 kept rows barely at all. Reading
 * each kept tender's OWN ficha costs one request per row and hits the row it
 * was asked about. It also returns the attachment index, which the search
 * cards do not carry at any page size.
 *
 * ── THE TRAP THIS MODULE IS BUILT AROUND ─────────────────────────────────
 *
 * The ficha is served from /Procurement/Modules/RFB/ and links its attachment
 * index with a RELATIVE href: `../Attachment/VerAntecedentes.aspx?enc=…`.
 * Resolve that one directory too high and the server does NOT answer 404:
 *
 *   /Procurement/Modules/Attachment/VerAntecedentes.aspx?enc=…  200,  6 KB, the file table
 *   /Procurement/Attachment/VerAntecedentes.aspx?enc=…          200, 59 KB, the LOGIN LANDING PAGE
 *   /Attachment/VerAntecedentes.aspx?enc=…                      404
 *
 * Measured 2026-09-24 on 1057439-135-LE26; both 200s are captured, as
 * attachment-index.html and attachment-wrong-base.html. The middle row is the
 * whole reason this file has a refusal function: a 200 carrying 32 keycloak
 * references and a "Iniciar Sesión" button is indistinguishable from "these
 * attachments require an account" unless you already know the right URL. It
 * cost one wrong conclusion reported to the user before the URLs were
 * compared side by side.
 *
 * Nothing here requires a session, a cookie or a browser User-Agent: the same
 * bytes come back from a cold client with curl's default UA. That was tested
 * BEFORE it was written down, because "it needs a session" was the second
 * wrong explanation for the same 59 KB page.
 */

const ATTACHMENT_HREF = /\.\.\/Attachment\/VerAntecedentes\.aspx\?enc=[^"'\s]+/g;

/**
 * The ONE base these hrefs may be resolved against.
 *
 * Written out rather than computed with `new URL(href, fichaUrl)` because the
 * ficha's own URL is not stable: `?idlicitacion=<code>` redirects to an opaque
 * `?qs=<token>`, and a caller that resolved against a redirected or rewritten
 * location would silently produce the 59 KB login page above.
 */
export const CHILE_MODULES_BASE = "https://www.mercadopublico.cl/Procurement/Modules/";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[String(name).toLowerCase()] ?? whole);
}

function stripTags(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * `../Attachment/VerAntecedentes.aspx?enc=…` → an absolute URL.
 *
 * Throws on any href that is not that exact shape, rather than patching one
 * up: a half-recognised href is how the wrong base got built in the first
 * place, and a thrown error is visible where a wrong URL is not.
 */
export function resolveChileAttachmentUrl(href: string): string {
  const cleaned = decodeEntities(href.trim());
  const match = /^\.\.\/Attachment\/(VerAntecedentes\.aspx\?enc=.+)$/.exec(cleaned);
  if (!match) {
    throw new Error(
      `附件链接的形状不认识：「${cleaned.slice(0, 80)}」。\n` +
        `  只接受 ../Attachment/VerAntecedentes.aspx?enc=…（相对 ${CHILE_MODULES_BASE}RFB/）。\n` +
        "  少一层目录不会报 404，会返回 200 + 登录落地页 —— 见本文件头部。",
    );
  }
  return `${CHILE_MODULES_BASE}Attachment/${match[1]}`;
}

/** Every attachment-index link on a ficha, resolved and de-duplicated, in page order. */
export function parseChileFichaAttachmentUrls(html: string): string[] {
  const seen = new Set<string>();
  for (const href of html.match(ATTACHMENT_HREF) ?? []) seen.add(resolveChileAttachmentUrl(href));
  return [...seen];
}

export type ChileFichaClosing = {
  /** `yyyy-mm-dd`, the shape `tenders.submission_deadline` already holds. */
  date: string;
  /** `HH:MM:SS` as the page states it, Chilean local time. Carried for logs; there is no column for it. */
  time?: string;
};

/**
 * `<span id="lblCierre">30-09-2026 17:00:00</span>` → `{ date: "2026-09-30", time: "17:00:00" }`.
 *
 * Anchored on the element id rather than on the visible label, because the
 * label ("Fecha de Cierre: ") lives in a SEPARATE span and a text-proximity
 * match would drift the first time the markup is reflowed.
 *
 * `dd-mm-yyyy`, never `mm-dd-yyyy` — the ficha uses hyphens where the search
 * CSV uses slashes, which is why parseChileBuscaDate is not reused here. The
 * distinction is unfalsifiable on 03-04-2026, so the tests pin it with
 * 30-09-2026 (no 30th month) instead of asserting it in a comment.
 *
 * Returns undefined rather than an Invalid Date: an unparseable cell must not
 * become a deadline nobody can act on.
 */
export function parseChileFichaClosingDate(html: string): ChileFichaClosing | undefined {
  const span = /<span[^>]*\bid="lblCierre"[^>]*>([^<]*)<\/span>/i.exec(html);
  if (!span) return undefined;
  const match = /^\s*(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/.exec(decodeEntities(span[1]));
  if (!match) return undefined;
  const [, dd, mm, yyyy, time] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // Round-tripped so an impossible calendar day (31-02) is rejected rather
  // than rolling forward into March.
  const probe = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCDate() !== day ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCFullYear() !== year
  ) {
    return undefined;
  }
  return { date: `${yyyy}-${mm}-${dd}`, ...(time ? { time } : {}) };
}

export type ChileAttachment = {
  fileName: string;
  /** The buyer's own category, e.g. "Anexos Administrativos de Adquisición". */
  documentType?: string;
  /** The buyer's free-text note, e.g. "Anexo Administrativo". */
  description?: string;
  /** `yyyy-mm-dd` the file was posted, from the index's Fecha column. */
  publishedAt?: string;
  /**
   * The ASP.NET control that serves the bytes, e.g.
   * `grdAttachment$ctl02$grdIbtnView`. The file has no URL of its own — it
   * comes back from a POST to the index page carrying __VIEWSTATE and this
   * control's name. See chile-ficha-live.ts.
   */
  control: string;
};

/**
 * Why a 200 from the attachment index is not usable, or undefined if it is.
 *
 * Separate from the parser so "the page is a login wall" and "the page is a
 * real index listing zero files" cannot collapse into the same empty array.
 * A tender genuinely publishing no attachments is a fact about the tender
 * (27 of 60 kept rows on 2026-09-24 put their whole bases in the ficha text
 * instead); a login wall is a fact about our request.
 */
export function chileAttachmentIndexRefusal(html: string): string | undefined {
  if (/\bid="grdAttachment"/i.test(html)) return undefined;
  const keycloak = (html.match(/keycloak/gi) ?? []).length;
  if (keycloak > 0) {
    return (
      `附件页返回的是登录落地页（keycloak 出现 ${keycloak} 次，没有文件表格），HTTP 状态仍是 200。\n` +
      "  最可能的原因不是要登录，而是 URL 少了一层目录：必须是 /Procurement/Modules/Attachment/，\n" +
      "  不是 /Procurement/Attachment/。见 chile-ficha-parser.ts 头部实测对照。"
    );
  }
  return `附件页里没有 id="grdAttachment" 的表格，也没有登录痕迹 —— 页面结构可能变了（${html.length} 字节）。`;
}

/**
 * The rows of the attachment index.
 *
 * Every field is read out of the `grdAttachment_ctlNN_*` span ids, so a
 * reordered or restyled column cannot shift a description into a filename the
 * way positional `<td>` counting would.
 */
export function parseChileAttachmentIndex(html: string): ChileAttachment[] {
  const attachments: ChileAttachment[] = [];
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const control = /name="(grdAttachment\$ctl\d+\$grdIbtnView)"/.exec(row)?.[1];
    const fileName = /<span[^>]*\bid="grdAttachment_ctl\d+_grdLblSourceFileName"[^>]*>([^<]*)</i.exec(row)?.[1];
    if (!control || !fileName) continue;
    const description = /<span[^>]*\bid="grdAttachment_ctl\d+_grdLblFileDescription"[^>]*>([^<]*)</i.exec(row)?.[1];
    const date = /<span[^>]*\bid="grdAttachment_ctl\d+_grdLblFileDate"[^>]*>\s*(\d{2})-(\d{2})-(\d{4})/i.exec(row);
    // The type has no span of its own — it is the one bare cell in the row.
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
    const documentType = cells.map(stripTags).find((text) => text && !text.includes(decodeEntities(fileName)) && !/^\d{2}-\d{2}-\d{4}/.test(text) && text !== stripTags(description ?? ""));
    attachments.push({
      fileName: decodeEntities(fileName).trim(),
      ...(documentType ? { documentType } : {}),
      ...(description ? { description: decodeEntities(description).trim() } : {}),
      ...(date ? { publishedAt: `${date[3]}-${date[2]}-${date[1]}` } : {}),
      control,
    });
  }
  return attachments;
}

/** The hidden fields an ASP.NET postback will not serve a file without. */
export type ChileViewState = { viewState: string; generator: string; action: string };

export function parseChileViewState(html: string): ChileViewState | undefined {
  const viewState = /name="__VIEWSTATE"[^>]*\bvalue="([^"]*)"/i.exec(html)?.[1];
  const generator = /name="__VIEWSTATEGENERATOR"[^>]*\bvalue="([^"]*)"/i.exec(html)?.[1];
  const action = /<form[^>]*\baction="([^"]+)"/i.exec(html)?.[1];
  if (!viewState || !action) return undefined;
  return { viewState: decodeEntities(viewState), generator: decodeEntities(generator ?? ""), action: decodeEntities(action) };
}


/**
 * The tender's current estado as the ficha prints it — `<span
 * id="lblFicha1Estado">Publicada</span>` on the committed fixture
 * (ficha-attachments.html). Read by the status refresh only (ingest-chile.ts
 * refreshChileStatuses); the import takes its estado from the search export.
 */
export function parseChileFichaEstado(html: string): string | undefined {
  const span = /<span[^>]*\bid="lblFicha1Estado"[^>]*>([^<]*)<\/span>/i.exec(html);
  const text = span ? decodeEntities(span[1]).trim() : "";
  return text || undefined;
}

/**
 * The ficha's short estado words, as statuses. The ficha does not use the
 * search export's long texts ("Publicada y disponible para ofertar"), so the
 * two tables are separate. Undefined for a word not listed: the refresh then
 * leaves the stored status alone.
 */
export function chileFichaEstadoStatus(estado: string | undefined): TenderStatus | undefined {
  const value = (estado ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (/^publicada/.test(value)) return "open";
  if (/^cerrada/.test(value)) return "submission_closed";
  if (/^desierta/.test(value)) return "deserted";
  if (/^adjudicada/.test(value)) return "awarded";
  if (/^(revocada|cancelada)/.test(value)) return "cancelled";
  if (/^suspendida/.test(value)) return "suspended";
  return undefined;
}
