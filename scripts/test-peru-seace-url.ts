/**
 * Pins what counts as a SEACE link and what must be left alone.
 *
 * The over-reach risk here is the expensive one: correctedSeaceSourceUrl()
 * runs over every Peru row and, through the mapper, over every import. A
 * pattern loose enough to match a Mexican or Colombian deep link would
 * replace real per-tender URLs with a Peruvian search page — destroying
 * exactly the links the other connectors work to produce. Those cases are
 * tested first for that reason.
 */
import {
  SEACE_PUBLIC_SEARCH_URL,
  correctedSeaceSourceUrl,
  isSeaceFichaUrl,
  isSeaceSearchUrl,
} from "@/lib/peru-seace-url";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`✗ ${name}\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// The exact URL from the user's screenshot, 2026-09-18.
const REAL_FICHA =
  "https://prod2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml?id=03805553-5c4a-4caa-9add-8b726c38b536&ptoRetorno=LOCAL";

// --- must never be touched -------------------------------------------------
const UNTOUCHED = [
  "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/detalle/FP-2026-001",
  "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.123456",
  "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/abc",
  "https://pncp.gov.br/compras/57356434000146/2026/66",
  "https://www.gob.pe/institucion/mtc/",
  "https://example.com/seace.gob.pe/fichaSeleccion",
  "not a url at all",
  "",
];
for (const url of UNTOUCHED) {
  check(`不动：${url.slice(0, 52) || "(空)"}`, correctedSeaceSourceUrl(url), null);
}
check("不动：null", correctedSeaceSourceUrl(null), null);
check("不动：undefined", correctedSeaceSourceUrl(undefined), null);
// A hostname that merely ENDS in the right letters must not match.
check("不动：seace.gob.pe.attacker.test", correctedSeaceSourceUrl("https://seace.gob.pe.attacker.test/buscadorPublico/x.xhtml"), null);

// --- ficha links -----------------------------------------------------------
check("识别出截图里那条 ficha 链接", isSeaceFichaUrl(REAL_FICHA), true);
check("ficha 链接改成检索页", correctedSeaceSourceUrl(REAL_FICHA), SEACE_PUBLIC_SEARCH_URL);
check(
  "prodapp2 上的 ficha 链接同样改",
  correctedSeaceSourceUrl("https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml?id=abc"),
  SEACE_PUBLIC_SEARCH_URL,
);
check("检索页不是 ficha", isSeaceFichaUrl(SEACE_PUBLIC_SEARCH_URL), false);

// --- host normalization ----------------------------------------------------
check("认得检索页", isSeaceSearchUrl(SEACE_PUBLIC_SEARCH_URL), true);
check(
  "prodapp2 检索页归一到 prod2",
  correctedSeaceSourceUrl("https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml"),
  SEACE_PUBLIC_SEARCH_URL,
);
// The no-op case has to report null, not the same string: the fix script
// counts what it changed, and a row counted as changed that was already
// correct reads as work that did not happen.
check("已经是规范链接 → null（不是回显自己）", correctedSeaceSourceUrl(SEACE_PUBLIC_SEARCH_URL), null);

console.log(failures === 0 ? `\n全部通过。` : `\n${failures} 项未通过。`);
process.exit(failures === 0 ? 0 : 1);
