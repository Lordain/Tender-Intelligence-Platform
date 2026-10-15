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
