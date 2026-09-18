import { readFileSync } from "node:fs";
import { parseAneelLotes, type AneelLote } from "@/lib/ingestion/aneel-lote-parser";

/**
 * Reads a saved copy of ANEEL's transmission-auction page.
 *
 * `www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm`
 * sits behind a Cloudflare challenge that a script cannot pass and a real
 * browser can — measured both ways on 2026-09-18 — so the page arrives as a
 * file the user saved, exactly like the Compras MX, Ecopetrol and Proyectos
 * México exports. __fixtures__/aneel-edital-transmissao-2026.html is a real
 * capture of Leilão 001/2026 and every rule below was written against it.
 *
 * ── Three things the page carries that the pasted text did not ────────────
 *
 *  1. **The auction's identity**: "LEILÃO DE TRANSMISSÃO ANEEL Nº 001/2026",
 *     restated in the Objeto cell as "Leilão nº 1/2026-ANEEL". Zero-padded in
 *     one place and not the other, so the number is normalised to an integer.
 *  2. **A year selector, 1999 to 2026**, posting back to the same URL. That is
 *     the whole pagination story: every past auction is one POST away, which
 *     matters because it means history is enumerable rather than scattered.
 *  3. **Document links, and this is where the money is.** The page itself
 *     carries no RAP ceiling and no investment estimate. Two links do:
 *     `documentos_editais.cfm?IdProgramaEdital=<id>` (the edital and its
 *     annexes) and `frmcdt.cfm?leilao=<n>&ano=<year>` (reports R1–R5, which
 *     are ANEEL's per-lot technical and economic studies). `estimatedValue`
 *     has to come from one of those, so their ids are extracted rather than
 *     left in the prose.
 *
 * ── The encoding is not optional ──────────────────────────────────────────
 *
 * The file is **ISO-8859-1/Windows-1252**, not UTF-8: it is ColdFusion output
 * with no charset declaration, and `file(1)` says "ISO-8859 text". Decoding it
 * as UTF-8 throws on the first "ç" and, worse, a lenient decoder turns every
 * accented character into U+FFFD — which would corrupt "Leilão", "São Paulo"
 * and "Ceará" into strings that still look like text and no longer match
 * anything. It is decoded as windows-1252 explicitly, and a test asserts the
 * accents survive.
 */

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * HTML to text, keeping the line breaks that carry meaning.
 *
 * `<br>` is the only structure this page has — the lots are one long cell
 * separated by `<br><BR>` — so it must become a newline before tags are
 * stripped. Doing it the other way round glues ten lots into one line and the
 * lot parser then sees a single block.
 */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(?:p|tr|div|li)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

export type AneelEditalDocumentLinks = {
  /** `IdProgramaEdital` — the auction's internal id; the edital and its annexes hang off it. */
  programaEditalId: string | null;
  /** The popup URL listing the edital documents, rebuilt from that id. */
  documentosUrl: string | null;
  /** Reports R1–R5 — ANEEL's per-lot studies, where the investment estimate lives. */
  relatoriosUrl: string | null;
  /** The public consultation that preceded the auction, when the page links one. */
  consultaPublicaUrl: string | null;
};

export type AneelEdital = {
  /** As printed at the top: "LEILÃO DE TRANSMISSÃO ANEEL Nº 001/2026". */
  heading: string | null;
  /** 1 for "001/2026" and for "nº 1/2026-ANEEL" alike. */
  auctionNumber: number | null;
  year: number | null;
  /** The Objeto cell, whole. */
  objeto: string | null;
  /** States named in the Objeto, as written. */
  objetoStates: string[];
  lotes: AneelLote[];
  links: AneelEditalDocumentLinks;
  /** Every year the page's own selector offers — the list of auctions reachable by one POST. */
  availableYears: number[];
};

const DOCUMENTOS_BASE = "https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/documentos_editais.cfm";

/** Accepts a path or the raw bytes, so the CLI and an admin upload share one reader. */
export function readAneelEditalFile(file: string | Buffer): AneelEdital {
  const buffer = typeof file === "string" ? readFileSync(file) : file;
  // Explicitly windows-1252 — see the header. Never UTF-8, and never a
  // lenient UTF-8 decode, which would replace every accent with U+FFFD.
  const html = new TextDecoder("windows-1252").decode(buffer);

  const text = htmlToText(html);
  // Stop at the newline, not at "<": by this point the tags are gone, so a
  // `[^<]*` tail runs to the end of the document and returns the whole page as
  // the heading — which still looks like a string and passes every truthiness
  // check downstream.
  const heading = /LEIL[ÃA]O\s+DE\s+TRANSMISS[ÃA]O\s+ANEEL[^\n]*/i.exec(text)?.[0]?.trim() ?? null;

  // "Nº 001/2026" at the top, "nº 1/2026-ANEEL" in the Objeto. Same auction,
  // two spellings; the first match of either wins and the padding is dropped.
  const numbered = /(?:LEIL[ÃA]O[^0-9]{0,40}|n[ºo°.]\s*)(\d{1,3})\s*\/\s*(\d{4})/i.exec(text);
  const auctionNumber = numbered ? Number(numbered[1]) : null;
  const year = numbered ? Number(numbered[2]) : null;

  // The two cells this page is made of. Anchored on their own labels rather
  // than on cell order, because a ColdFusion template's column count changes
  // between years and the labels have not.
  const empreendimentos = /Empreendimentos\s*<\/td>([\s\S]*?)<\/tr>/i.exec(html)?.[1] ?? "";
  const objetoCell = /Objeto\s*<\/TD>\s*<TD[^>]*>([\s\S]*?)<\/TD>/i.exec(html)?.[1] ?? "";
  const objeto = objetoCell ? htmlToText(objetoCell).replace(/\n+/g, " ").trim() : null;

  const statesClause = /instala[çc][õo]es\s+localizadas\s+nos?\s+estados?\s+(?:de|do|da|dos|das)\s+([^.]+)/i.exec(objeto ?? "");
  const objetoStates = statesClause
    ? statesClause[1].split(/\s*,\s*|\s+e\s+/i).map((part) => part.trim()).filter((part) => part.length > 1)
    : [];

  const programaEditalId = /IdProgramaEdital=(\d+)/i.exec(html)?.[1] ?? null;
  const relatorios = /frmcdt\.cfm\?leilao=(\d+)&(?:amp;)?ano=(\d+)/i.exec(html);

  return {
    heading,
    auctionNumber,
    year,
    objeto,
    objetoStates,
    lotes: parseAneelLotes(htmlToText(empreendimentos)),
    links: {
      programaEditalId,
      documentosUrl: programaEditalId ? `${DOCUMENTOS_BASE}?IdProgramaEdital=${programaEditalId}` : null,
      relatoriosUrl: relatorios ? `https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/frmcdt.cfm?leilao=${relatorios[1]}&ano=${relatorios[2]}` : null,
      consultaPublicaUrl: /href="(https:\/\/antigo\.aneel\.gov\.br\/web\/guest\/consultas-publicas[^"]*)"/i.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null,
    },
    availableYears: [...html.matchAll(/<option value="(\d{4})"/gi)].map(([, value]) => Number(value)).sort((a, b) => b - a),
  };
}
