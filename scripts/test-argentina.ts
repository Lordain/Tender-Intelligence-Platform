/**
 * Argentina (staged 2026-09-27, opened 2026-09-29): the four connectors' parsers, the mapper, the
 * two Argentine rule settings, and the staged-country gate. Offline — runs on
 * the pages saved on 2026-09-27 under lib/ingestion/__fixtures__/argentina/.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeFetchError,
  formAction,
  hiddenFields,
  isOpenCallProcedure,
  nextPageArgument,
  openWithRetry,
  parseCircularDocuments,
  parsePortalCirculars,
  parsePortalDocumentUrl,
  parsePortalDocuments,
  parsePortalGrid,
  parsePortalProcess,
  portalDocumentUrl,
  type ArgentinaPortalRecord,
} from "../lib/ingestion/connectors/argentina-portal-live";
import { officialSiteAccessNote } from "../lib/official-site-access";
import { ADIF_PORTAL_URL, parseAdifActivePanels } from "../lib/ingestion/connectors/adif-live";
import { parseBoletinEdition, parseBoletinNotice, type BoletinListing } from "../lib/ingestion/connectors/boletin-oficial-live";
import {
  adifDocumentLinks,
  argentineDateTime,
  argentineNumber,
  boletinBudget,
  boletinGovernmentLevel,
  boletinObject,
  boletinOpeningDate,
  boletinSkipReason,
  mapAdifTenderToTender,
  mapBoletinNoticeToTender,
  mapPortalRecordToTender,
  portalDocumentLinks,
} from "../lib/ingestion/argentina-mapper";
import { comprarRowWanted, ingestArgentina } from "../lib/ingestion/ingest-argentina";
import { classifyStoredTender } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import { isStagedCountry } from "../lib/staged-countries";
import { sourceLanguageFor } from "../lib/ingestion/source-language";

const FIXTURES = join(__dirname, "../lib/ingestion/__fixtures__/argentina");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date("2026-09-27T20:00:00Z");

function tier(input: { title: string; country?: string; value?: number; currency?: string; scopeType?: "works" | "equipment" | "services" | "consulting" | "unknown"; procedureType?: string }) {
  return classifyStoredTender({
    title: input.title,
    summary: input.title,
    buyer: "Organismo",
    country: input.country ?? "Argentina",
    governmentLevel: "federal",
    scopeType: input.scopeType ?? "unknown",
    procedureType: input.procedureType ?? "Licitación Pública",
    tenderNumber: "1-0001-LPU26",
    ...(input.value !== undefined ? { estimatedValue: input.value, currency: input.currency ?? "USD" } : {}),
    sourceName: "test",
  }).relevance.tier;
}

function notice(id: string, category = "OBRAS - CIVILES") {
  const listing: BoletinListing = {
    edition: "20260925",
    category,
    organism: "",
    procedure: "",
    url: `https://www.boletinoficial.gob.ar/detalleAviso/tercera/${id}/20260901`,
    noticeId: id,
  };
  return parseBoletinNotice(fixture(`bo-aviso-${id}.html`), listing);
}

async function main() {
  // --- COMPR.AR / CONTRAT.AR ---------------------------------------------------
  const comprarPage = fixture("comprar-apertura-proxima-p1-2026-09-27.html");
  const comprarRows = parsePortalGrid(comprarPage);
  check("COMPR.AR list page has ten rows", comprarRows.length, 10);
  check("COMPR.AR row fields", comprarRows[6], {
    processNumber: "84/77-0606-LPU26",
    name: "SERVICIO DE ACTUALIZACIÓN Y MANTENIMIENTO DEL SISTEMA DE COMANDO Y CONTROL SITEA",
    procedureType: "Licitación Pública",
    openingText: "28/09/2026 08:00 Hrs.",
    state: "Publicado",
    unit: "84/77 - Departamento Contaduría y Finanzas (EMGE)",
    saf: "374 - Estado Mayor General del Ejercito",
    eventTarget: "ctl00$CPH1$GridListaPliegosAperturaProxima$ctl08$lnkNumeroProceso",
  });
  check("COMPR.AR pager goes to page 2", nextPageArgument(comprarPage, "ctl00$CPH1$GridListaPliegosAperturaProxima"), "Page$2");
  check("postback carries the view state", Object.keys(hiddenFields(comprarPage)).includes("__VIEWSTATE"), true);
  check("postback goes to the form's own action", formAction(comprarPage, "https://comprar.gob.ar/Compras.aspx?qs=W1HXHGHtH10="), "https://comprar.gob.ar/Compras.aspx?qs=W1HXHGHtH10%3d&AspxAutoDetectCookieSupport=1");

  const contratarPage = fixture("contratar-apertura-proxima-2026-09-27.html");
  const contratarRows = parsePortalGrid(contratarPage);
  check("CONTRAT.AR has the three open calls", contratarRows.map((row) => row.processNumber), ["46-0023-LPU26", "504/2-0004-LPU26", "34-0003-LPU26"]);
  check("CONTRAT.AR one page only", nextPageArgument(contratarPage, "ctl00$CPH1$GridListaPliegos"), null);
  check(
    "open-call procedures",
    ["Licitación Pública", "Licitacion Pública", "Concurso Público", "Licitación Privada", "Contratación Directa"].map(isOpenCallProcedure),
    [true, true, true, false, false],
  );

  const sitea = parsePortalProcess(fixture("comprar-pliego-84-77-0606-LPU26.html"))!;
  check("COMPR.AR process: number, scope, opening", [sitea.processNumber, sitea.scope, sitea.openingText, sitea.publishedText], [
    "84/77-0606-LPU26",
    "Nacional",
    "28/09/2026 08:00 Hrs.",
    "14/09/2026 08:00 Hrs.",
  ]);
  check("COMPR.AR process: expediente without &nbsp", sitea.expediente, "EX-2026-79829779- -APN-DCYF#EA");
  check("COMPR.AR process: annex listed", sitea.annexes[0], { name: "ET 02-CIDESO-26.pdf", type: "Especificaciones Tecnicas", description: "ESPECIFICACIÓN TÉCNCIA NRO 02-CIDESO-26" });

  const rfc = parsePortalProcess(fixture("contratar-pliego-504-0001-LPU26.html"))!;
  check("CONTRAT.AR multi-stage: first opening is the deadline", rfc.openingText, "22/05/2026 13:00 Hrs.");
  check("CONTRAT.AR concession: international, 20 years, 8 sections", [rfc.scope, rfc.durationText, rfc.items.length], ["Internacional", "20 Años", 8]);

  const record: ArgentinaPortalRecord = { portal: "comprar", row: comprarRows[6], url: "https://comprar.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=x", process: sitea };
  const siteaTender = mapPortalRecordToTender(record, NOW);
  check("COMPR.AR slug", siteaTender.slug, "argentina-comprar-84-77-0606-lpu26");
  check("COMPR.AR buyer is the SAF, not the purchasing office", siteaTender.buyer, "Estado Mayor General del Ejercito");
  check("COMPR.AR deadline in Buenos Aires time", siteaTender.submissionDeadline, "2026-09-28T11:00:00.000Z");
  check("COMPR.AR source link is the process page", siteaTender.sourceUrl, record.url);
  check("COMPR.AR national scope", siteaTender.participationScope, "national");
  check("software maintenance is still routine, ICT or not", siteaTender.relevance.tier, "excluded");

  // COMPR.AR Mendoza (2026-10-04): the same product, the province as buyer.
  const mendozaTender = mapPortalRecordToTender({ ...record, portal: "mendoza", url: "https://comprar.mendoza.gov.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=x" }, NOW);
  check("Mendoza slug", mendozaTender.slug, "argentina-mendoza-84-77-0606-lpu26");
  check("Mendoza is a provincial buyer, named as such", [mendozaTender.governmentLevel, mendozaTender.buyer], ["state", "Estado Mayor General del Ejercito（Gobierno de Mendoza）"]);
  check("Mendoza source name", mendozaTender.sourceName, "COMPR.AR Mendoza — Compras Públicas de la Provincia de Mendoza (Argentina)");

  const rfcTender = mapPortalRecordToTender({ portal: "contratar", row: contratarRows[0], url: "https://x", process: rfc }, NOW);
  check("CONTRAT.AR concession is works, international", [rfcTender.scopeType, rfcTender.participationScope], ["works", "international_open"]);
  check("closed by date → submission_closed", rfcTender.status, "submission_closed");

  // --- ADIF ------------------------------------------------------------------
  const adif = parseAdifActivePanels(fixture("adif-portal-activas-2026-09-27.html"));
  check("ADIF: the 14 procedures the portal marks active", adif.length, 14);
  check("ADIF panel fields", [adif[5].procedureType, adif[5].number, adif[5].kind, adif[5].openingDate], ["Licitación Pública Nacional", "29/2026", "Contratación", "02/11/2026"]);
  check("ADIF files are absolute and unversioned", adif[0].files[0].url, "https://plataforma.adifsa.com.ar/uploads/archivo_adjunto/licitacion/20260924_103734-6ab4277e54034.pdf".replace("6ab4277e54034", "6ab5279ea95e4"));
  const turnouts = mapAdifTenderToTender(adif[5], NOW);
  check("ADIF slug and number", [turnouts.slug, turnouts.tenderNumber], ["argentina-adif-lpn-29-2026", "ADIF LPN 29/2026"]);
  check("ADIF source link is its tender list page, not a PDF", turnouts.sourceUrl, ADIF_PORTAL_URL);
  check("the ADIF notice PDF is still among the documents", adifDocumentLinks(adif[5]).some((link) => link.documentType === "Aviso"), true);
  check("ADIF turnouts: unpriced rail work kept", turnouts.relevance.tier, "standard");
  check("ADIF documents saved as links", adifDocumentLinks(adif[5]).length, adif[5].files.length);
  const adifTiers = adif.map((row) => mapAdifTenderToTender(row, NOW).relevance.tier);
  check("ADIF: 6 of 14 kept (track, turnouts, sleepers, substation, ATS; not supervision or licences)", adifTiers.filter((value) => value !== "excluded").length, 6);
  check("ADIF supervision contract is consulting → excluded", mapAdifTenderToTender(adif[1], NOW).relevance.tier, "excluded");
  check("ADIF Microsoft licences excluded", mapAdifTenderToTender(adif[0], NOW).relevance.tier, "excluded");

  // --- Boletín Oficial ---------------------------------------------------------
  const edition = parseBoletinEdition(fixture("bo-tercera-2026-09-25.html"), "20260925");
  check("Boletín edition of 2026-09-25 lists 76 notices", edition.length, 76);
  check("Boletín listing fields", edition[0], {
    edition: "20260925",
    category: "SUMINISTROS - EFECTOS VARIOS",
    organism: "ESTADO MAYOR CONJUNTO DE LAS FUERZAS ARMADAS",
    procedure: "Licitación Pública 0022/2026",
    url: "https://www.boletinoficial.gob.ar/detalleAviso/tercera/2417990/20260925",
    noticeId: "2417990",
  });

  const agp = notice("2416823");
  check("Boletín notice heading", [agp.organism, agp.procedure, agp.publishedDate], ["ADMINISTRACIÓN GENERAL DE PUERTOS S.A.U.", "Licitación Pública 11-2026", "01/09/2026"]);
  check("dollar budget wins over the peso add-on", boletinBudget(agp.text), { amount: 7464119.6, currency: "USD" });
  check("opening date dd-mm-yyyy", boletinOpeningDate(agp.text), "2026-09-24T15:00:00.000Z");
  check("object from OBJETO: “…”", boletinObject(agp.text).startsWith("PROVISIÓN DE BOMBAS E INSTALACIÓN"), true);
  check("port company is a public company", boletinGovernmentLevel(agp.organism), "public_company");
  const agpTender = mapBoletinNoticeToTender(agp, new Date("2026-09-02T12:00:00Z"));
  // 2026-10-10: a port job is transport, and transport/works 中型 starts at
  // US$10M (lib/relevance.ts TRANSPORT_WORKS_SIGNIFICANT_VALUE_USD).
  check("AGP pumps: US$7.5M → 常规 (transport/works bands)", agpTender.relevance.tier, "standard");
  check("Boletín slug is organism + procedure (stable across editions)", agpTender.slug, "argentina-bo-administracion-general-de-puertos-s-a-u-licitacion-publica-11-2026");

  const neuquen = notice("2417086");
  check("Neuquén: the budget, not the 1% guarantee", boletinBudget(neuquen.text), { amount: 3782127146.19, currency: "ARS" });
  check("province is state level", boletinGovernmentLevel(neuquen.organism), "state");
  check("IDB loan named in the summary", mapBoletinNoticeToTender(neuquen, NOW).summary.es.includes("Banco Interamericano de Desarrollo"), true);

  check("skip: ADIF notice (its own portal)", boletinSkipReason(notice("2416129")), "ADIF 门户已有");
  check("skip: COMPR.AR-generated notice (UOC line)", boletinSkipReason(notice("2416131")), "COMPR.AR / CONTRAT.AR 已有");
  check("skip: an extension is not a call", boletinSkipReason(notice("2416139")), "修改、延期或暂停通知，不是新招标");
  check("skip: awards", boletinSkipReason({ ...agp, category: "ADJUDICACIONES - ADJUDICACIONES" }), "不是招标公告（授标、评标、出售等）");
  check("keep: Yacyretá call", boletinSkipReason(notice("2416616")), null);

  check("spelled opening date", boletinOpeningDate("APERTURA: 13 de Octubre de 2026 – 14:00hs."), "2026-10-13T17:00:00.000Z");
  check("spelled opening date with 'del'", boletinOpeningDate("Apertura de ofertas: 3 de noviembre del 2026, a las 11:00, en la Sede"), "2026-11-03T14:00:00.000Z");
  check("Argentine number", [argentineNumber("7.464.119,60"), argentineNumber("1.004.444.050,00"), argentineNumber(".")], [7464119.6, 1004444050, null]);
  check("date without time is noon local", argentineDateTime("13/10/2026"), "2026-10-13T15:00:00.000Z");

  // --- Rules: Argentina's two settings, and nobody else's --------------------------
  check("ARS rate", Math.round(convertToUsd(1513, "ARS") ?? 0), 1);
  check("unpriced, no sector → excluded (as Mexico)", tier({ title: "Adquisición de mobiliario de oficina para la sede central" }), "excluded");
  check("unpriced water main → kept", tier({ title: "Construcción de acueducto troncal y planta de bombeo", scopeType: "works" }) !== "excluded", true);
  check("power equipment under the floor → kept", tier({ title: "Provisión de transformadores de potencia para subestación", value: 300_000, scopeType: "equipment" }), "standard");
  check("ICT under the floor → kept (user: also ICT)", tier({ title: "Adquisición de equipamiento de red de fibra óptica y conmutadores", value: 200_000, scopeType: "equipment" }) !== "excluded", true);
  check("railway sleepers under the floor → kept", tier({ title: "Adquisición de durmientes de hormigón para Línea Roca", value: 150_000, scopeType: "equipment" }), "standard");
  check("office furniture under the floor → excluded", tier({ title: "Adquisición de mobiliario de oficina", value: 300_000, scopeType: "equipment" }), "excluded");
  check("Mexico unchanged: transformers under the floor → excluded", tier({ title: "Provisión de transformadores de potencia para subestación", value: 300_000, scopeType: "equipment", country: "Mexico" }), "excluded");
  check("Peru unchanged: rail sleepers under the floor → excluded", tier({ title: "Adquisición de durmientes de hormigón para Línea Roca", value: 150_000, scopeType: "equipment", country: "Peru" }), "excluded");
  // False friends from the first live dry run (2026-09-28).
  check("bottled water is not water infrastructure", tier({ title: "ADQUISICION DE AGUA MINERAL ENVASADA E 43 RIO TURBIO", procedureType: "Licitación Privada" }), "excluded");
  check("water dispensers are not water infrastructure", tier({ title: "Provisión de dispensers y botellones de agua potable", scopeType: "equipment" }), "excluded");
  check("workers' insurance on Yacyretá's left bank is not water", tier({ title: "CONTRATACIÓN DE UNA ASEGURADORA DE RIESGO DEL TRABAJO (A.R.T) PARA EL PERSONAL DE LA ENTIDAD BINACIONAL YACYRETÁ (MARGEN IZQUIERDA)" }), "excluded");
  check("a road buyer's spare parts are not a road", tier({ title: "Adquisición de repuestos de balanzas", procedureType: "Licitación Pública" }), "excluded");
  check("Neuquén's paved carriageway is a road", tier({ title: "Obra Básica Y Calzada Pavimentada De Av. Interurbana Río Colorado / Trenque Lauquen", scopeType: "works" }) !== "excluded", true);
  check("a real river work still counts", tier({ title: "Obras de defensa costera y dragado en el río Paraná", scopeType: "works" }) !== "excluded", true);
  // Software licences only (user, 2026-09-28: 只买软件许可 → 排除).
  check("software licences are not an ICT project", tier({ title: "Adquisición de licencias de suite de software cartográfico e hidrográfico", procedureType: "Licitación Pública" }), "excluded");
  check("a VMware upgrade is not an ICT project", tier({ title: "Actualización/upgrade del Vmware VSPHERE 8 ENTERPRISE PLUS - Implementación y Soporte Técnico", procedureType: "Licitación Pública" }), "excluded");
  check("software development still counts as ICT", tier({ title: "Reingenieria de software SINTRA", procedureType: "Licitación Pública" }) !== "excluded", true);
  check("direct award still excluded in a sector", tier({ title: "Provisión de transformadores de potencia", procedureType: "Contratación Directa" }), "excluded");

  check("COMPR.AR: open calls always opened", comprarRowWanted(comprarRows[1]), true);
  check("COMPR.AR: a private tender for awnings is not opened", comprarRowWanted(comprarRows[0]), false);

  // --- Reaching a portal (2026-09-28: both refused the runner for 40 s) ------------
  const refused = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
  check("the cause behind fetch failed is named", describeFetchError(refused), "fetch failed（ECONNRESET read ECONNRESET）");
  check("a timeout says so", describeFetchError(Object.assign(new Error("aborted"), { name: "TimeoutError" })), "超时（60 秒无响应）");
  {
    const waits: number[] = [];
    let calls = 0;
    const opened = await openWithRetry(async () => {
      calls += 1;
      if (calls < 3) throw refused;
      return "list page";
    }, [120_000, 300_000], async (ms) => { waits.push(ms); });
    check("an unreachable portal is tried again after 2 and 5 minutes", [opened, calls, waits], ["list page", 3, [120_000, 300_000]]);
    let message = "";
    await openWithRetry(async () => { throw refused; }, [1, 1], async () => {}).catch((err: Error) => { message = err.message; });
    check("a portal that never answers reports every attempt's cause", message, "3 次都连不上：fetch failed（ECONNRESET read ECONNRESET）；fetch failed（ECONNRESET read ECONNRESET）；fetch failed（ECONNRESET read ECONNRESET）");
    let once = "";
    await openWithRetry(async () => { throw refused; }, [], async () => {}).catch((err: Error) => { once = err.message; });
    check("the admin button (no pauses) fails at once with the cause", once, "fetch failed（ECONNRESET read ECONNRESET）");
  }

  // --- Bid documents: the process page's download buttons (2026-09-29, 做成自动下载) ---
  {
    const comprarDocs = parsePortalDocuments(fixture("comprar-pliego-84-77-0606-LPU26.html"));
    check("COMPR.AR: general conditions, clauses, annex, act — one each", comprarDocs.map((d) => [d.kind, d.fileName]), [
      ["Condiciones generales", "Condiciones generales DI-2024-79130471-APN-ONC#JGM.pdf"],
      ["Cláusulas particulares", "Clausulas Particulares PLIEG-2026-86673810-APN-DCYF#EA.pdf"],
      ["Anexo", "ESPECIFICACIÓN TÉCNCIA NRO 02-CIDESO-26 - ET 02-CIDESO-26.pdf"],
      ["Acto administrativo", "Autorización pliego DI-2026-87836487-APN-DGID#EA.pdf"],
    ]);
    check("COMPR.AR: the GEDO disposition button (answers with a page) is not a document", comprarDocs.some((d) => d.eventTarget.endsWith("lnkGEDODisposicion")), false);

    const contratarHtml = fixture("contratar-pliego-34-0003-LPU26.html");
    const contratarDocs = parsePortalDocuments(contratarHtml);
    check("CONTRAT.AR: repeater annexes and UC_CondicionesGenerales are read", [
      contratarDocs.filter((d) => d.kind === "Anexo").length,
      contratarDocs.some((d) => d.kind === "Condiciones generales"),
    ], [11, true]);
    check("CONTRAT.AR: an annex named by GEDO number carries its description", contratarDocs.find((d) => d.kind === "Anexo")?.fileName, "PLIEGO DE ESPECIFICACIONES TÉCNICAS - TOMO I - PLIEG-2026-75056788-APN-SSEE%MEC.pdf");
    const processUrl = "https://contratar.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=abc";
    const circulars = parsePortalCirculars(contratarHtml, processUrl);
    check("CONTRAT.AR: circulars, each with its own page", [circulars.length, circulars[0]], [2, { number: "1", url: "https://contratar.gob.ar/PLIEGO/VistaPreviaCircularCiudadano.aspx?qs=N8jBG/m/v4MD7eGHdrQQtGipkHUv9vZI" }]);
    const circularDocs = parseCircularDocuments(fixture("contratar-circular-34-0003-LPU26.html"), circulars[0]);
    check("a circular's attachment is a document on the circular's page", circularDocs.map((d) => [d.kind, d.fileName, d.pageUrl, d.eventTarget]), [
      ["Circular", "Circular 1 - plieg202687691515apnse#mec.pdf", circulars[0].url, "ctl00$CPH1$UCVistaPreviaCircular$DatosCircular$gvAnexosCircularAclaratoria$ctl02$ctl00"],
    ]);

    const link = portalDocumentUrl(processUrl, "ctl00$CPH1$UCVistaPreviaPliego$UCAnexos$rptAnexos$MiClaveUnica1$btnVerAnexo");
    check("a stored link round-trips to page and button", parsePortalDocumentUrl(link), { pageUrl: processUrl, eventTarget: "ctl00$CPH1$UCVistaPreviaPliego$UCAnexos$rptAnexos$MiClaveUnica1$btnVerAnexo" });
    check("only the two portals' links are replayed", [
      parsePortalDocumentUrl("https://example.com/x#documento=a"),
      parsePortalDocumentUrl("https://prod1.seace.gob.pe/file.pdf"),
    ], [null, null]);

    const links = portalDocumentLinks({ portal: "contratar", url: processUrl, row: contratarRows[0], process: { ...rfc, documents: [...contratarDocs, ...circularDocs] } });
    check("links: one per document, the circular's on its own page", [links.length, parsePortalDocumentUrl(links.at(-1)!.sourceUrl)?.pageUrl], [contratarDocs.length + 1, circulars[0].url]);
    check("links: every file name keeps its extension within 120 characters", links.every((l) => /\.(pdf|docx?|xlsx?|zip)$/.test(l.fileName) && l.fileName.length <= 120), true);

    check("detail page: an access note for COMPR.AR and CONTRAT.AR only", [
      officialSiteAccessNote({ sourceUrl: processUrl })?.startsWith("CONTRAT.AR（contratar.gob.ar）"),
      officialSiteAccessNote({ sourceUrl: "https://comprar.gob.ar/PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=x" })?.startsWith("COMPR.AR"),
      officialSiteAccessNote({ sourceUrl: ADIF_PORTAL_URL }),
    ], [true, true, null]);
  }

  // --- Staging and language ------------------------------------------------------
  check("Argentina is open (2026-09-29), Guyana still staged", [isStagedCountry("Argentina"), isStagedCountry("Guyana")], [false, true]);
  check("open countries are not staged", ["Mexico", "Brazil", "Colombia", "Peru", "Chile"].map(isStagedCountry), [false, false, false, false, false]);
  check("Argentina is Spanish", sourceLanguageFor("Argentina"), "es");

  // --- The run, on the saved pages ---------------------------------------------------
  const result = await ingestArgentina(null, {
    write: false,
    now: NOW,
    fetchers: {
      portal: async (id) =>
        id === "contratar"
          ? { portal: id, listed: contratarRows, records: [{ portal: id, row: contratarRows[0], url: "https://x", process: rfc }], failed: [] }
          : { portal: id, listed: comprarRows, records: [record], failed: [] },
      adif: async () => adif,
      boletinEditions: async () => [
        { ...edition[0], category: "OBRAS - CIVILES", url: "https://www.boletinoficial.gob.ar/detalleAviso/tercera/2416616/20260826", noticeId: "2416616" },
        { ...edition[0], category: "OBRAS - CIVILES", url: "https://www.boletinoficial.gob.ar/detalleAviso/tercera/2416131/20260818", noticeId: "2416131" },
        { ...edition[0], category: "ADJUDICACIONES - ADJUDICACIONES" },
      ],
      boletinNotice: async (listing) => notice(listing.noticeId, listing.category),
    },
  });
  const bySource = Object.fromEntries(result.sources.map((source) => [source.id, [source.listed, source.kept]]));
  check("run: per-source counts", bySource, { comprar: [10, 0], contratar: [3, 0], adif: [14, 6], boletin: [3, 0], mendoza: [10, 0] });
  check("run: closed calls are not rows", result.rows.some((row) => row.tender.slug === "argentina-contratar-504-0001-lpu26"), false);
  check("run: kept are all Argentine and open", result.kept.every((tender) => tender.country === "Argentina" && tender.status === "open"), true);

  // 2026-09-29: COMPR.AR/CONTRAT.AR calls published before the 3-day window are not rows; ADIF (no publication date) still is.
  const windowRun = (now: Date, days?: number) =>
    ingestArgentina(null, {
      write: false,
      now,
      sources: ["comprar", "adif"],
      ...(days === undefined ? {} : { days }),
      fetchers: { portal: async (id) => ({ portal: id, listed: comprarRows, records: [record], failed: [] }), adif: async () => adif },
    });
  const hasSitea = (run: Awaited<ReturnType<typeof windowRun>>) => run.rows.some((row) => row.tender.slug === siteaTender.slug);
  const adifCount = (run: Awaited<ReturnType<typeof windowRun>>) => run.rows.filter((row) => row.source === "adif").length;
  const windowed = await windowRun(NOW);
  const unwindowed = await windowRun(NOW, 0);
  check("window: a call published 14/09 is skipped on 27/09", hasSitea(windowed), false);
  check("window: and read with --days 0", hasSitea(unwindowed), true);
  check("window: the next day it is kept", hasSitea(await windowRun(new Date("2026-09-15T12:00:00Z"))), true);
  check("window: ADIF rows are not windowed", [adifCount(windowed) > 0, adifCount(windowed)], [true, adifCount(unwindowed)]);

  // Mexico's no-amount equipment whitelist, extended to Argentina's open calls
  // (user, 2026-10-06: OK). A 60-day delivery no longer drops it either.
  const biomedical = "ADQUISICIÓN DE EQUIPOS BIOMEDICOS PARA EL H GRL 601 - HMC. Plazo de entrega: 60 días";
  check("whitelist: biomedical equipment, open call, 60-day delivery → kept", tier({ title: biomedical }), "standard");
  check("whitelist: air conditioning equipment, open call → kept", tier({ title: "Adquisición de equipos de aire acondicionado para el Hospital Posadas" }), "standard");
  check("whitelist: fire suppression system, open call → kept", tier({ title: "Adquisición e instalación de sistema de detección y supresión de incendios" }), "standard");
  check("whitelist: not for a Licitación Privada", tier({ title: biomedical, procedureType: "Licitación Privada" }), "excluded");
  check("whitelist: not the upkeep of the same equipment", tier({ title: "Servicio de mantenimiento de equipos de aire acondicionado" }), "excluded");
  check("whitelist: not the consumables", tier({ title: "Adquisición de insumos y consumibles para equipo médico" }), "excluded");
  check("whitelist: Mexico unchanged — a national call stays out", tier({ title: biomedical, country: "Mexico" }), "excluded");

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
