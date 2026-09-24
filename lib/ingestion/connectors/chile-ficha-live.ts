/**
 * Reads ONE Chilean tender's own ficha: its closing date and its attachments.
 *
 * ── What this door is for ────────────────────────────────────────────────
 *
 * The search CSV has no closing date, and ingest-chile.ts's existing
 * enrichment reads the SEARCH pages to get one — ten cards per request, in the
 * site's own order. That fills whichever rows the site lists first, which is
 * not the relevance-kept set we actually store. This reads the page belonging
 * to the code it was given, so what comes back is about that tender.
 *
 * It also reaches the attachments, which the search cards never carry.
 *
 * ── No account, no session, no browser ───────────────────────────────────
 *
 * Measured 2026-09-24 across all 60 stored Chilean rows: 60/60 fichas served
 * 200 with the tender's own closing date, and ZERO keycloak references
 * anywhere in the chain. 31 of the 60 published attachment files (199 files in
 * total); the other 29 published none, 27 of them because their entire bases
 * are written into the ficha text instead (median 52,000 characters of it).
 *
 * The attachment bytes really do come back: Formularios_Administrativos.docx,
 * 245 KB, a readable Word file whose first line names the tender it belongs
 * to. Nothing in the chain asked who we were.
 *
 * "The attachments need a ChileCompra login" was reported to the user before
 * that was measured, on the strength of a 200 that rendered the site's
 * logged-out landing page. The cause was a relative href resolved one
 * directory too high; see chile-ficha-parser.ts, which holds the comparison
 * and the fixtures. Both wrong explanations offered for that page — "needs an
 * account", then "needs a session cookie" — were guesses about someone else's
 * server, and each cost a round.
 *
 * ── The files have no URL ────────────────────────────────────────────────
 *
 * A file is served by POSTing __VIEWSTATE plus the row's ASP.NET control name
 * back to the index page; there is no GET link to store. That is why nothing
 * here writes to `tender_document_links` — a row there is a URL a download
 * button will fetch, and storing the index PAGE would put HTML behind it, the
 * same mistake antaq-live.ts documents refusing.
 */
import { describeEgressDenial, egressDenial } from "@/lib/ingestion/egress-denial";
import {
  type ChileAttachment,
  type ChileFichaClosing,
  chileAttachmentIndexRefusal,
  parseChileAttachmentIndex,
  parseChileFichaAttachmentUrls,
  parseChileFichaClosingDate,
  parseChileViewState,
} from "@/lib/ingestion/chile-ficha-parser";

const FICHA_BASE = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent":
    "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Deliberate spacing between requests. Not a limit we were given — one we chose; this is someone else's front end. */
export const CHILE_FICHA_REQUEST_SPACING_MS = 1500;

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/**
 * A ficha under ~50 KB is not a ficha.
 *
 * The thinnest real one measured (656-23-O126, a works tender carrying only
 * headline fields) was 132 KB; the median was around 300 KB. An error page or
 * a redirect landing page is an order of magnitude smaller, and would
 * otherwise parse to "no closing date, no attachments" — which reads exactly
 * like a tender that published neither.
 */
const MIN_FICHA_BYTES = 50_000;

export class ChileFichaError extends Error {}
export class ChileFichaEgressBlockedError extends ChileFichaError {}

let lastRequestAt = 0;

async function pace(): Promise<void> {
  const wait = lastRequestAt + CHILE_FICHA_REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function request(url: string, init: RequestInit = {}): Promise<{ response: Response; body: Buffer }> {
  // `cache: "no-store"` because Next patches global fetch: a held response — a
  // refusal included — replayed as this call's answer is the shape of bug that
  // makes a fix look like it did not work.
  const build = (): RequestInit => ({ ...init, cache: "no-store", headers: { ...HEADERS, ...(init.headers ?? {}) } });

  await pace();
  let response = await fetch(url, build());
  for (let attempt = 1; attempt < MAX_ATTEMPTS && RETRYABLE_STATUSES.has(response.status); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    await pace();
    response = await fetch(url, build());
  }
  const body = Buffer.from(await response.arrayBuffer());

  // FIRST, before the status means anything: a gateway refusal is a fact about
  // this container, not about Mercado Público.
  const denial = egressDenial(response.headers, body.toString("utf8").slice(0, 4000));
  if (denial) throw new ChileFichaEgressBlockedError(`${describeEgressDenial(denial)}\n  URL：${url}`);
  return { response, body };
}

export type ChileFichaResult = {
  code: string;
  closing?: ChileFichaClosing;
  /** One entry per file, each carrying the index page it must be POSTed back to. */
  attachments: (ChileAttachment & { indexUrl: string })[];
  /**
   * Why an attachment index could not be read, per index page. Kept apart from
   * `attachments` so "this tender published no files" (a fact about the
   * tender, true of 29 of 60 rows) never gets confused with "we could not
   * read its files" (a fact about us).
   */
  refusals: string[];
  fichaBytes: number;
};

export async function fetchChileFicha(code: string): Promise<ChileFichaResult> {
  const { response, body } = await request(FICHA_BASE + encodeURIComponent(code));
  if (!response.ok) throw new ChileFichaError(`智利 ficha ${code}：HTTP ${response.status}`);
  const html = body.toString("utf8");
  if (html.length < MIN_FICHA_BYTES) {
    throw new ChileFichaError(
      `智利 ficha ${code}：HTTP 200 但只有 ${html.length} 字节，真实 ficha 最小也有 132KB —— 这不是项目页。\n` +
        `  前 200 字：${html.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  }

  const attachments: (ChileAttachment & { indexUrl: string })[] = [];
  const refusals: string[] = [];
  for (const indexUrl of parseChileFichaAttachmentUrls(html)) {
    const page = await request(indexUrl, { headers: { Referer: response.url } });
    const indexHtml = page.body.toString("utf8");
    const refusal = chileAttachmentIndexRefusal(indexHtml);
    if (refusal) {
      refusals.push(`${code}：${refusal}`);
      continue;
    }
    for (const file of parseChileAttachmentIndex(indexHtml)) attachments.push({ ...file, indexUrl });
  }

  return { code, closing: parseChileFichaClosingDate(html), attachments, refusals, fichaBytes: html.length };
}

export type ChileDownloadedFile = { fileName: string; contentType?: string; bytes: Buffer };

/**
 * The bytes of one attachment.
 *
 * Re-reads the index page for a fresh __VIEWSTATE rather than caching one: ASP.NET
 * rejects a stale view state, and a rejection arrives as HTML with HTTP 200 —
 * which, saved to disk under a .docx name, is a corrupt file nobody notices
 * until someone opens it. Hence the content-type check below rather than trust
 * in the status code.
 */
export async function downloadChileAttachment(
  attachment: ChileAttachment & { indexUrl: string },
): Promise<ChileDownloadedFile> {
  const page = await request(attachment.indexUrl);
  const state = parseChileViewState(page.body.toString("utf8"));
  if (!state) throw new ChileFichaError(`附件页没有 __VIEWSTATE，无法回发下载：${attachment.fileName}`);

  const form = new URLSearchParams({
    __VIEWSTATE: state.viewState,
    __VIEWSTATEGENERATOR: state.generator,
    // An <input type="image"> posts coordinates, not a value. Omit them and
    // ASP.NET does not raise the click at all — it returns the page again,
    // with HTTP 200.
    [`${attachment.control}.x`]: "8",
    [`${attachment.control}.y`]: "8",
  });

  const { response, body } = await request(attachment.indexUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: attachment.indexUrl },
    body: form.toString(),
  });

  // Three ways this 200 is not a file, and none of them is the status code.
  //
  //  - text/html      the page again: a __VIEWSTATE ASP.NET would not accept.
  //  - text/plain, 0B measured 2026-09-24, posting a view state fetched
  //                   without this module's own headers. A zero-byte body is
  //                   the busca door's documented trap (busca-descargar-empty.bin)
  //                   arriving at a second door — and it is the dangerous one,
  //                   because an empty file saved under a .docx name and
  //                   recorded in tender_documents reads as "we hold this
  //                   document" on /admin/documents-needed until someone opens it.
  //  - any text/*     a message about a file is not a file.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new ChileFichaError(
      `下载 ${attachment.fileName} 返回的是网页（${contentType}，${body.length} 字节），不是文件。\n` +
        "  ASP.NET 的 __VIEWSTATE 过期就是这个样子：HTTP 200，内容是页面。没有写盘。",
    );
  }
  if (body.length === 0) {
    throw new ChileFichaError(
      `下载 ${attachment.fileName} 返回 HTTP 200 但是零字节（${contentType || "没有 content-type"}）。\n` +
        "  空文件写进 tender_documents 会让 /admin/documents-needed 显示「已有标书」，直到有人去打开它。没有写盘。",
    );
  }
  if (/^text\//i.test(contentType)) {
    throw new ChileFichaError(
      `下载 ${attachment.fileName} 返回的是文本（${contentType}，${body.length} 字节），不是文件。没有写盘。`,
    );
  }
  // The INDEX's filename wins, not Content-Disposition's.
  //
  // The server sends UTF-8 bytes in that header without declaring a charset,
  // so a correct reader decodes "Interés" as "InterÃ©s" — measured on
  // 1895-33-LE26. The index page is served as declared UTF-8 and holds the
  // same name spelled correctly, so the mojibake is avoidable rather than
  // something to transliterate away. The header is kept only as a fallback
  // for a row whose index cell was empty.
  const disposition = response.headers.get("content-disposition") ?? "";
  const served = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]?.trim();
  return {
    fileName: attachment.fileName || (served ?? "sin-nombre"),
    ...(contentType ? { contentType } : {}),
    bytes: body,
  };
}
