/**
 * Which Colombian rows get the 待补文件 官方文件 list instead of 官方入口.
 *
 * Offline. The rule is "only when there is no official page" (user,
 * 2026-09-25: 如果没有官方入口才做), so the check that matters most is that a
 * real SECOP page is never mistaken for the fallback.
 */
import { mapSecopRowToTender } from "../lib/ingestion/colombia-mapper";
import { secopProcessApiUrl, secopProcessIdWithoutOfficialPage } from "../lib/secop-links";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const REAL_PAGE = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.9876543&isFromPublicArea=True";

check("the fallback URL is recognised, with its process id", secopProcessIdWithoutOfficialPage(secopProcessApiUrl("CO1.REQ.11032432")) === "CO1.REQ.11032432");
check("a real SECOP page is not the fallback", secopProcessIdWithoutOfficialPage(REAL_PAGE) === undefined);
check("the bare login page is not treated as the fallback either", secopProcessIdWithoutOfficialPage("https://community.secop.gov.co/STS/Users/Login/Index") === undefined);
check("another country's link is left alone", secopProcessIdWithoutOfficialPage("https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=1") === undefined);
check("an empty or missing link is left alone", secopProcessIdWithoutOfficialPage("") === undefined && secopProcessIdWithoutOfficialPage(undefined) === undefined);
check("a fallback without a well-formed id is left alone", secopProcessIdWithoutOfficialPage(secopProcessApiUrl(undefined)) === undefined);

// End to end through the mapper: the two ways a real row arrives.
const row = {
  nit_entidad: "800094386",
  entidad: "MUNICIPIO DE PUERTO COLOMBIA",
  id_del_proceso: "CO1.REQ.11032432",
  id_del_portafolio: "CO1.BDOS.10847424",
  referencia_del_proceso: "LP009-2026",
  nombre_del_procedimiento: "AMPLIACION CONDUCCION PLANTA DE TRATAMIENTO DE AGUA POTABLE LAS FLORES",
  descripci_n_del_procedimiento: "AMPLIACION CONDUCCION PLANTA DE TRATAMIENTO DE AGUA POTABLE LAS FLORES",
  fecha_de_publicacion_del: "2026-09-23T00:00:00.000",
  precio_base: "18640628309",
  modalidad_de_contratacion: "Licitación pública Obra Publica",
  fecha_de_recepcion_de: "2026-10-23T00:00:00.000",
  estado_del_procedimiento: "Borrador",
  tipo_de_contrato: "Obra",
};
const draft = mapSecopRowToTender({ ...row, urlproceso: { url: "https://community.secop.gov.co/STS/Users/Login/Index" } }, "SECOP II — Colombia Compra Eficiente");
const published = mapSecopRowToTender({ ...row, estado_del_procedimiento: "Publicado", urlproceso: { url: REAL_PAGE } }, "SECOP II — Colombia Compra Eficiente");
check("a Borrador row (login-page urlproceso) gets the 官方文件 list", draft != null && secopProcessIdWithoutOfficialPage(draft.sourceUrl) === "CO1.REQ.11032432", draft?.sourceUrl);
check("the same row once published keeps its 官方入口", published != null && published.sourceUrl === REAL_PAGE && secopProcessIdWithoutOfficialPage(published.sourceUrl) === undefined, published?.sourceUrl);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exitCode = 1;
