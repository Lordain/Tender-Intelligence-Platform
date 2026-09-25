/**
 * Live read of Petronect — Petrobras's own procurement portal — for every
 * opportunity currently open for bids.
 *
 * ── Why Petronect and not PNCP or the DOU ────────────────────────────────
 *
 * Petrobras buys under Lei 13.303, not Lei 14.133, and publishes nothing on
 * PNCP: a PNCP search for "petrobras" on 2026-09-25 returned 301 rows, none of
 * them with Petrobras as the buyer. The DOU carries its "AVISO DE LICITAÇÃO"
 * notices, but cut at 403 characters and with no deadline (see dou-watch.ts).
 * Petronect is the portal those notices point to.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * The public page "Lista de Oportunidades Abertas para propostas"
 * (Portal2018/pt/lista_licitacoes_publicadas_ft.html) needs no login, and
 * fills itself from ONE SAP Gateway call made by its own script
 * (petronect.js → prepareGetXMLSet("01")):
 *
 *   GET /sap/opu/odata/SAP/YPCON_GET_XML_SRV/getXMLSet('01')?$format=json
 *
 * The answer is an OData envelope whose `d.EvXml` is a JSON STRING holding
 * `{ TAB: [...] }` — every open opportunity, 309 of them on 2026-09-25, in
 * 2.4 MB. No paging: the page itself filters and sorts client-side over this
 * one array, which is why one request is the whole list rather than a sample.
 *
 * Each row carries its attachments' object ids, and the page's own download
 * URL for them (YPCON_PUB_ATTACHMENT_DOWNLOAD_SRV/attachmentSet('<id>')/$value)
 * served a 37-page edital PDF with no session on 2026-09-25.
 *
 * No amounts, anywhere: Lei 13.303 lets a state company keep its budget
 * confidential, and the header service (YPCON_GET_HEADER_INFO_SRV) has no
 * value field either. See lib/relevance-petronect.ts for what stands in.
 */

const PETRONECT_ORIGIN = "https://www.petronect.com.br";
const OPEN_OPPORTUNITIES_URL = `${PETRONECT_ORIGIN}/sap/opu/odata/SAP/YPCON_GET_XML_SRV/getXMLSet('01')?$format=json`;

/** The public listing a person opens to find an opportunity by its number. There is no per-opportunity URL. */
export const PETRONECT_LIST_URL = `${PETRONECT_ORIGIN}/irj/go/km/docs/pccshrcontent/Site%20Content%20(Legacy)/Portal2018/pt/lista_licitacoes_publicadas_ft.html`;

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 90_000;

export type PetronectAttachment = { DESCRIPTION: string; PHIO_OBJID: string };

/** One row of `TAB`, the fields this repo reads. Names are the source's own. */
export type PetronectOpportunity = {
  OPPORT_NUM: string;
  COMPANY: string;
  COMPANY_DESC: string;
  STATUS_DESC: string;
  OPPORT_TYPE: string;
  POSTING_DATE: string;
  OPPORT_DESCR: string;
  DOU_PUBL_DATE: string;
  START_DATE: string;
  START_HOUR: string;
  END_DATE: string;
  END_HOUR: string;
  /** Abertura das propostas — usually the same instant as END_DATE/END_HOUR. */
  OPEN_DATE: string;
  OPEN_HOUR: string;
  DISPUTE_MODE: string;
  /** "N" — Brazilian suppliers only; "I" — foreign suppliers may bid. */
  NAT_COVERAGE: string;
  DESC_OBJ_CONTRAT: string;
  ANEXOS: PetronectAttachment[];
  ITEMS: unknown[];
  REGIONS: { COUNTRY: string; REGION: string; REGION_DESCRIPTION: string }[];
};

/** The download URL the page itself builds for an attachment. */
export function petronectAttachmentUrl(objectId: string): string {
  return `${PETRONECT_ORIGIN}/sap/opu/odata/SAP/YPCON_PUB_ATTACHMENT_DOWNLOAD_SRV/attachmentSet('${objectId}')/$value`;
}

/**
 * Parses the OData envelope. Exported so the committed fixture exercises the
 * same code as the live call.
 *
 * Throws on a shape it does not recognise rather than returning []: an empty
 * list here would read as "Petrobras has nothing open", which on 2026-09-25
 * was 309 opportunities.
 */
export function parsePetronectEnvelope(body: unknown): PetronectOpportunity[] {
  const evXml = (body as { d?: { EvXml?: unknown } })?.d?.EvXml;
  if (typeof evXml !== "string") throw new Error("Petronect 返回的内容里没有 d.EvXml —— 接口格式可能变了");
  const parsed = JSON.parse(evXml) as { TAB?: unknown };
  if (!Array.isArray(parsed.TAB)) throw new Error("Petronect 的 EvXml 里没有 TAB 数组 —— 接口格式可能变了");
  return parsed.TAB as PetronectOpportunity[];
}

export async function fetchPetronectOpenOpportunities(): Promise<PetronectOpportunity[]> {
  const response = await fetch(OPEN_OPPORTUNITIES_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Petronect 返回 HTTP ${response.status} ${response.statusText}`);
  return parsePetronectEnvelope(await response.json());
}
