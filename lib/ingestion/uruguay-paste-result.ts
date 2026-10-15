/**
 * Client-safe shapes and helpers for the 乌拉圭 tab's 「ARCE 列表粘贴导入」
 * (components/admin/ImportUruguayPasteForm.tsx), split out of
 * import-uruguay-paste.ts so the browser bundle does not pull in server code.
 */
import type { TenderRelevanceTier } from "@/types/tender";

/** A purchase id read from a 「Ver detalles de la compra」 link, with the link's text. */
export type ArceLink = { label: string; purchaseId: string };

/**
 * ARCE's detail links, e.g.
 * https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/1302292
 * (the link the owner copied, 2026-10-15). The id is the call's id_compra —
 * the same id the daily OCDS import stores every Uruguayan row under.
 */
const DETAIL_HREF = /\/consultas\/detalle\/(?:[^"'?#\s]*\/)?id\/(\d+)/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  ordm: "º", ordf: "ª", deg: "°", iquest: "¿", iexcl: "¡", laquo: "«", raquo: "»",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code] ?? whole;
  });
}

/**
 * The detail links in what the browser put on the clipboard as HTML when the
 * admin copied ARCE's list. The plain text loses them, and with them the
 * purchase id; the HTML keeps them. Read with a regex rather than a DOM so the
 * same function runs in the tests.
 */
export function extractArceLinks(html: string): ArceLink[] {
  const links: ArceLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1];
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? "";
    const purchaseId = DETAIL_HREF.exec(decodeEntities(href))?.[1];
    if (!purchaseId) continue;
    const title = /\btitle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? "";
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, " "));
    links.push({ label: normalizeArceLabel(`${text} ${decodeEntities(title)}`), purchaseId });
  }
  return links;
}

/** A file linked from a detail page: the pliego, or a clarification's attachment. */
export type ArceDocLink = { title: string; url: string };

function absolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.comprasestatales.gub.uy${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * The files a detail page links to, from the HTML copied with it: the pliego
 * (「Archivo adjunto … pliego」) and each clarification's attachment. Only
 * links whose text says so, so a page's menus and footer are left out.
 */
export function extractArceDocuments(html: string): ArceDocLink[] {
  const docs: ArceDocLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(/\bhref\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2] ?? "");
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    if (!/pliego|aclaraci[oó]n|archivo adjunto/i.test(text)) continue;
    const url = absolute(href);
    if (!docs.some((doc) => doc.url === url)) docs.push({ title: text, url });
  }
  return docs;
}

/**
 * The same, for a page pasted where the links came through as Markdown —
 * 「[Ver detalles de la compra … | …](https://…/id/1302291)」, the form the
 * owner's own paste of the list took on 2026-10-15. Returns the text with
 * each link reduced to its words, and the links it held.
 */
export function readMarkdownLinks(text: string): { text: string; links: ArceLink[]; documents: ArceDocLink[] } {
  const links: ArceLink[] = [];
  const documents: ArceDocLink[] = [];
  const plain = text.replace(/\[([^\]\n]*)\]\((\S+?)\)/g, (_whole, label: string, href: string) => {
    const purchaseId = DETAIL_HREF.exec(href)?.[1];
    if (purchaseId) links.push({ label: normalizeArceLabel(label), purchaseId });
    else if (/pliego|aclaraci[oó]n|archivo adjunto/i.test(label)) documents.push({ title: label.trim(), url: absolute(href) });
    return label;
  });
  return { text: plain, links, documents };
}

/** Lower case, one space, no 「Ver detalles de la compra」 — the form both a link's text and a list entry are compared in. */
export function normalizeArceLabel(text: string): string {
  return text
    .replace(/﻿/g, "")
    .replace(/ver detalles de la compra/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The detail page of a call, in the form the owner's link has (opens in a visitor's browser). */
export function arceCallUrl(purchaseId: string): string {
  return `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${purchaseId}`;
}

/**
 * What the import does with a listed call, under the platform's usual rules.
 * "short_window" is still written — a call the admin pasted by hand is exempt
 * from the 12-day rule, as for every other paste import.
 */
export type UruguayPasteOutcome = "write" | "short_window" | "manual_keep" | "excluded" | "closed" | "not_open" | "exists" | "no_id";

export type UruguayKeepTier = "flagship" | "significant" | "standard";
export const URUGUAY_KEEP_TIERS: readonly UruguayKeepTier[] = ["standard", "significant", "flagship"];

export type UruguayPasteRow = {
  /** Procedure and number as ARCE lists it, e.g. "Licitación Pública 103682/2026". */
  procedureNumber: string;
  purchaseId?: string;
  url?: string;
  title: string;
  buyer: string;
  publicationDate?: string;
  submissionDeadline?: string;
  tier: TenderRelevanceTier;
  reasonZh: string;
  ruleTier: TenderRelevanceTier;
  outcome: UruguayPasteOutcome;
  outcomeZh: string;
  existingSlug?: string;
};

/** One paste into the detail-page import: the page's text and what the copied HTML linked to. */
export type ArceDetailPaste = { text: string; links: ArceLink[]; documents: ArceDocLink[] };

export type UruguayDetailRow = UruguayPasteRow & { items: number; documents: number; keyDates: number };

export type UruguayDetailResponse = {
  rows: UruguayDetailRow[];
  written?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: number;
};

export type UruguayPasteResponse = {
  rows: UruguayPasteRow[];
  /** Calls outside what the platform reads (Concurso de Precios, other buyers' Licitaciones Abreviadas…), by procedure. */
  notRead: { procedure: string; count: number }[];
  /** Sales and leases of state property (Venta/Arrendamiento): not procurement. */
  notProcurement: number;
  written?: number;
  failed?: { slug: string; error: string }[];
};
