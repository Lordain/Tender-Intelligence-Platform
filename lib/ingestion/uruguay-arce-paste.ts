import type { ArceRelease } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { normalizeArceLabel, type ArceLink } from "@/lib/ingestion/uruguay-paste-result";

/**
 * ARCE's 「Llamados vigentes」 list as the admin copies it from
 * comprasestatales.gub.uy in their own browser (user, 2026-10-15: 现在就做,
 * after ARCE started refusing our servers on 2026-10-14). Every entry ends
 * with its link's text:
 *
 *   Licitación Pública 103682/2026  Administración Nacional de Usinas y … | …
 *   Administración Nacional de Usinas y Trasmisiones Eléctricas | …
 *   Cables subterráneos y conexiones a Montevideo D
 *
 *    Recepción de ofertas hasta: 23/10/2026 13:00hs
 *   Publicado: 23/06/2026 15:15hs | Última Modificación: 09/10/2026 09:28hs
 *   Ver detalles de la compra Licitación Pública 103682/2026 | Administración …
 *
 * The plain text has no purchase id; it comes from the links in the HTML the
 * browser copies alongside (extractArceLinks), or from a detail URL pasted
 * into the text itself.
 */
export type ArceListCall = {
  /** "Licitación Pública 103682/2026", "PFI - Licitación pública internacional 27250/2026" */
  procedureNumber: string;
  /** The procedure without its number: "Licitación Pública", "Venta/Arrendamiento Licitación Abreviada" */
  procedure: string;
  buyer: string;
  description: string;
  /** Montevideo wall-clock time, "2026-10-23T13:00:00" (uruguayTime reads it as -03:00). */
  deadline?: string;
  published?: string;
  purchaseId?: string;
};

const DETAIL_LINE = /^Ver detalles de la compra (.+?) \| (.+)$/;
const DETAIL_URL = /comprasestatales\.gub\.uy\/consultas\/detalle\/(?:\S*\/)?id\/(\d+)/i;
const STOP_LINE = /^(Recepci[oó]n de ofertas hasta|Publicado:|Fecha Publicaci[oó]n:)/i;

function montevideoTime(text: string, label: RegExp): string | undefined {
  const match = new RegExp(`${label.source}\\s*:?\\s*(\\d{2})/(\\d{2})/(\\d{4})\\s+(\\d{2}):(\\d{2})`, "i").exec(text);
  if (!match) return undefined;
  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

export function parseArceList(text: string): ArceListCall[] {
  const calls: ArceListCall[] = [];
  let block: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/﻿/g, "").replace(/\s+/g, " ").trim();
    const end = DETAIL_LINE.exec(line);
    if (!end) {
      if (line) block.push(line);
      continue;
    }
    const procedureNumber = end[1].trim();
    const buyer = end[2].trim();
    const start = block.map((l) => l.startsWith(`${procedureNumber} `) || l === procedureNumber).lastIndexOf(true);
    const own = start >= 0 ? block.slice(start) : block;
    const description: string[] = [];
    for (const entry of own.slice(start >= 0 ? 1 : 0)) {
      if (STOP_LINE.test(entry)) break;
      if (entry === buyer || DETAIL_URL.test(entry)) continue;
      description.push(entry);
    }
    const joined = own.join("\n");
    calls.push({
      procedureNumber,
      procedure: procedureNumber.replace(/\s+\S+\/\d{2,4}$/, "").trim(),
      buyer,
      description: description.join(" ").replace(/^["“]|["”]$/g, "").trim(),
      deadline: montevideoTime(joined, /Recepci[oó]n de ofertas hasta/),
      published: montevideoTime(joined, /(?:Publicado|Fecha Publicaci[oó]n)/),
      purchaseId: DETAIL_URL.exec(joined)?.[1],
    });
    block = [];
  }
  return calls;
}

/**
 * Gives each call the id of its link. Matched by the link's text
 * (「Ver detalles de la compra <procedure number> | <buyer>」, which is also the
 * last line of the entry); if the links carry no such text, by position, but
 * only when there is exactly one link per call.
 */
export function attachArcePurchaseIds(calls: ArceListCall[], links: ArceLink[]): ArceListCall[] {
  const byLabel = new Map<string, string>();
  for (const link of links) if (link.label && !byLabel.has(link.label)) byLabel.set(link.label, link.purchaseId);
  const byPosition = links.length === calls.length;
  return calls.map((call, index) => {
    if (call.purchaseId) return call;
    const label = normalizeArceLabel(`${call.procedureNumber} | ${call.buyer}`);
    const id = byLabel.get(label) ?? [...byLabel].find(([key]) => key.includes(label))?.[1] ?? (byPosition ? links[index].purchaseId : undefined);
    return id ? { ...call, purchaseId: id } : call;
  });
}

/** Sales and leases of state property, listed among the calls: not procurement. */
export function isArceSaleOrLease(call: ArceListCall): boolean {
  return /^venta\s*\/\s*arrendamiento\b/i.test(call.procedure);
}

/**
 * A listed call in the shape the daily import reads from ARCE's OCDS feed, so
 * the same mapper and the same rules (isIngestedArceTender, the general
 * relevance rules) decide it. "PFI - " (an internationally financed call) is
 * dropped from the procedure so a 「PFI - Licitación pública internacional」
 * reads as the Licitación Pública it is; the number keeps it.
 */
export function arceListCallToRelease(call: ArceListCall): ArceRelease {
  const id = call.purchaseId ?? "0";
  return {
    ocid: `ocds-yfs5dr-${id}`,
    id: `llamado-${id}`,
    date: call.published ?? "",
    buyer: { name: call.buyer },
    tender: {
      id,
      title: call.procedureNumber,
      description: call.description,
      status: "active",
      procurementMethodDetails: call.procedure.replace(/^PFI\s*-\s*/i, ""),
      tenderPeriod: { startDate: call.published, endDate: call.deadline },
    },
  };
}

/**
 * A call's detail page as the admin copies it — the second step, for the
 * calls the list's screening says are worth opening (user, 2026-10-15: 应该是
 * 2层设计吧？1层是分析哪些项目值得录入，1层是录标书). On top of the list's
 * fields it carries the items, the opening and the clarification deadline:
 *
 *   InicioConsulta de PublicacionesPFI - Licitación pública internacional 27250/2026 Administración de las Obras Sanitarias del Estado | …
 *   PFI - Licitación pública internacional 27250/2026 Administración de las Obras Sanitarias del Estado | …
 *   CONSTRUCCION DE UNA PRESA SOBRE EL ARROYO CASUPA Y OBRAS ANEXAS
 *    Recepción de ofertas hasta: 23/11/2026 14:00hs
 *   Fecha Publicación: 29/06/2026 15:10hs
 *   Acto de Apertura:23/11/2026 14:00hs
 *   Aclaraciones hasta el:23/10/2026
 *   …
 *   Ítems del llamado
 *   Ítem Nº 1  CONSTRUCCION DE REPRESA PARA ABASTECIMIENTO DE AGUA POTABLE (Cód. Artículo 122722)
 *   Cantidad:1,00 UNIDAD
 *
 * The contact block (an office's e-mail and phone) is not kept.
 */
export type ArceDetailItem = { description: string; code?: string; quantity?: number; unit?: string };

export type ArceDetail = ArceListCall & {
  opening?: string;
  /** "Aclaraciones hasta el": the last day to ask questions, as a date. */
  questionsUntil?: string;
  items: ArceDetailItem[];
};

const BREADCRUMB = /^Inicio\s*Consulta de Publicaciones\s*/i;
const PAGE_FOOTER = /^Agencia Reguladora de Compras Estatales$/i;
/** "Licitación Pública 2/2025 Ministerio de …": the procedure ends at its number. */
const HEADER = /^(.*?\S*\d+\/\d{2,4})\s+(.+)$/;

function montevideoDate(text: string, label: RegExp): string | undefined {
  const match = new RegExp(`${label.source}\\s*:?\\s*(\\d{2})/(\\d{2})/(\\d{4})(?!\\s+\\d{2}:)`, "i").exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}T23:59:00` : undefined;
}

function decimal(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function parseDetailPage(lines: string[]): ArceDetail | null {
  // The page's own heading, the line after the breadcrumb (or the first line, when the breadcrumb was not selected).
  const headerIndex = lines.findIndex((line) => HEADER.test(line) && !BREADCRUMB.test(line));
  if (headerIndex < 0) return null;
  const header = HEADER.exec(lines[headerIndex])!;
  const procedureNumber = header[1].trim();
  const buyer = header[2].trim();

  const description: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (STOP_LINE.test(line) || /^Pliego$/i.test(line)) break;
    if (line === lines[headerIndex]) continue;
    description.push(line);
  }

  const items: ArceDetailItem[] = [];
  const start = lines.findIndex((line) => /^Ítems del llamado$/i.test(line));
  if (start >= 0) {
    for (let i = start + 1; i < lines.length; i += 1) {
      if (PAGE_FOOTER.test(lines[i])) break;
      const item = /^Ítem N[ºo°]\s*\d+\s+(.+?)(?:\s*\(C[oó]d\. Art[ií]culo\s*(\d+)\))?$/i.exec(lines[i]);
      if (!item) continue;
      const amount = /^Cantidad:\s*([\d.,]+)\s*(.*)$/i.exec(lines[i + 1] ?? "");
      items.push({ description: item[1].trim(), ...(item[2] ? { code: item[2] } : {}), ...(amount ? { quantity: decimal(amount[1]), unit: amount[2].trim() || undefined } : {}) });
    }
  }

  const joined = lines.join("\n");
  return {
    procedureNumber,
    procedure: procedureNumber.replace(/\s+\S+\/\d{2,4}$/, "").trim(),
    buyer,
    description: description.join(" ").replace(/^["“]|["”]$/g, "").trim(),
    deadline: montevideoTime(joined, /Recepci[oó]n de ofertas hasta/),
    published: montevideoTime(joined, /(?:Fecha Publicaci[oó]n|Publicado)/),
    opening: montevideoTime(joined, /Acto de Apertura/),
    questionsUntil: montevideoDate(joined, /Aclaraciones hasta el/),
    items,
    purchaseId: DETAIL_URL.exec(joined)?.[1],
  };
}

/** The detail pages in a paste: one per breadcrumb, or the whole text when none was selected. */
export function parseArceDetailPages(text: string): ArceDetail[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/﻿/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const starts = lines.flatMap((line, index) => (BREADCRUMB.test(line) ? [index] : []));
  const pages = starts.length === 0 ? [lines] : starts.map((at, i) => lines.slice(at, starts[i + 1] ?? lines.length));
  return pages.map(parseDetailPage).filter((page): page is ArceDetail => page !== null);
}

/** A detail page in the OCDS shape the daily import reads, items and files included. */
export function arceDetailToRelease(detail: ArceDetail, documents: { title: string; url: string }[] = []): ArceRelease {
  const release = arceListCallToRelease(detail);
  return {
    ...release,
    tender: {
      ...release.tender,
      items: detail.items.map((item, index) => ({
        id: String(index + 1),
        description: item.description,
        ...(item.code ? { classification: { id: item.code, description: item.description } } : {}),
        ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
        ...(item.unit ? { unit: { name: item.unit } } : {}),
      })),
      documents: documents.map((doc, index) => ({
        id: String(index + 1),
        title: doc.title,
        url: doc.url,
        documentType: /pliego/i.test(doc.title) ? "biddingDocuments" : "clarifications",
      })),
    },
  };
}
