/**
 * What the translator is told about a row before it translates it.
 *
 * titleIsTruncated decides whether a title gets rewritten from the summary
 * instead of translated. A wrong `true` rewrites a title that was fine —
 * silently, since the output still reads well — so the edge cases are worth
 * pinning down.
 *
 * Usage: npm run test:translation-inputs
 */
import { findDroppedIdentifiers, stripUnverifiedParentheticals, titleIsTruncated } from "../lib/ingestion/translate-titles";
import { mapBatchResultsToSlugs } from "../lib/ingestion/translate-titles-qwen";

let passed = 0;
let failed = 0;

function checkText(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n       expected ${expected}\n       actual   ${actual}`);
  }
}

function check(name: string, actual: boolean, expected: boolean): void {
  if (actual === expected) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n       expected ${expected}, got ${actual}`);
  }
}

const FULL =
  "EJECUTAR A PRECIOS UNITARIOS Y A MONTO AGOTABLE LA ACTUALIZACIÓN Y/O COMPLEMENTACIÓN Y/O AJUSTES A LOS ESTUDIOS Y DISEÑOS, Y LAS OBRAS DE CONSTRUCCIÓN Y/O CONSERVACIÓN DE LAS VÍAS Y ESPACIO PÚBLICO ASOCIADO A LA INFRAESTRUCTURA DE TRANSPORTE DE LA LOCALIDAD DE CIUDAD BOLÍVAR";
const CUT = "EJECUTAR A PRECIOS UNITARIOS Y A MONTO AGOTABLE LA ACTUALIZACIÓN Y/O COMPLEMENTACIÓN Y/O AJUSTES A LOS ESTUDIOS Y DISEÑOS, Y LAS OBRAS DE CONSTRUCCIÓN Y/O…";

// The real shape this was built for, from the 50-row review batch.
check("an ellipsis-cut title with a complete summary", titleIsTruncated(CUT, FULL), true);
check("a three-dot cut counts the same", titleIsTruncated(`${CUT.slice(0, -1)}...`, FULL), true);
check("trailing whitespace after the ellipsis still counts", titleIsTruncated(`${CUT}   `, FULL), true);

// Most rows: the summary is a verbatim copy of the title, nothing to gain.
check("an untruncated title is left alone", titleIsTruncated(FULL, FULL), false);
check("title equal to summary, both complete", titleIsTruncated("CONSTRUCCION DE TANQUE", "CONSTRUCCION DE TANQUE"), false);

// Nothing better to rewrite from.
check("summary cut too — no complete text to use", titleIsTruncated(CUT, `${FULL.slice(0, 120)}…`), false);
check("summary shorter than the cut title", titleIsTruncated(CUT, "OBRAS"), false);
check("summary is empty", titleIsTruncated(CUT, ""), false);

// An ellipsis the source meant, not a cut, still needs a longer summary to act on.
check("mid-sentence ellipsis is not a trailing cut", titleIsTruncated("OBRAS … VARIAS", FULL), false);

// Cut with no ellipsis at all — the last word is the only evidence left.
const LONG_FULL = `${FULL} Y DEMÁS ACTIVIDADES CONEXAS AL PROYECTO`;
check("cut on a preposition", titleIsTruncated("MEJORAMIENTO DE VIAS TERCIARIAS DEL MUNICIPIO DE", LONG_FULL), true);
check("cut on a conjunction", titleIsTruncated("ESTO EN ATENCIÓN AL CON", LONG_FULL), true);
check("cut on an article", titleIsTruncated("PAVIMENTACIÓN DE LA VÍA QUE CONDUCE A LA", LONG_FULL), true);
check("a trailing period does not hide the dangling word", titleIsTruncated("OBRAS CIVILES EN EL MUNICIPIO DE.", LONG_FULL), true);

// A complete title that merely ends on a content word is left alone.
check("complete title ending on a noun", titleIsTruncated("CONSTRUCCIÓN DE PLANTA DE BOMBEO ANCÓN", LONG_FULL), false);
check("Compras MX cut mid-word, summary equally cut", titleIsTruncated("EQUIPAMIENTO DE MOBILIARIO Y EQUIPO MÉDICO DEL HOSPITAL GENERAL DE ZONA DE 144 C", "EQUIPAMIENTO DE MOBILIARIO Y EQUIPO MÉDICO DEL HOSPITAL GENERAL DE ZONA DE 144 C"), false);

// ── stripUnverifiedParentheticals ──────────────────────────────────────────
// The real failure: one letter dropped from a name whose whole job is to be
// searched for.
checkText(
  "a misspelt original is removed",
  stripUnverifiedParentheticals("卡塔考斯（Catacos）区级救护车采购", "ADQUISICION DE AMBULANCIA URBANA A NIVEL DISTRITAL EN MARCAVELICA Y CATACAOS-PIURA"),
  "卡塔考斯区级救护车采购",
);
checkText(
  "the correctly copied ones survive the same pass",
  stripUnverifiedParentheticals("皮乌拉（Piura）马卡维利卡（Marcavelica）", "... EN MARCAVELICA Y CATACAOS-PIURA"),
  "皮乌拉（Piura）马卡维利卡（Marcavelica）",
);

// Case and accents move legitimately: sources shout, and strip diacritics.
checkText(
  "restoring an accent the source dropped is kept",
  stripUnverifiedParentheticals("梅斯卡拉帕河（Río Mezcalapa）岸防护", "CONSTRUCCION DE LA PROTECCION MARGINAL, RIO MEZCALAPA, HUIMANGUILLO"),
  "梅斯卡拉帕河（Río Mezcalapa）岸防护",
);
checkText(
  "an all-caps source matches a title-cased copy",
  stripUnverifiedParentheticals("塔瓦斯科州（Tabasco）", "..., HUIMANGUILLO, TABASCO."),
  "塔瓦斯科州（Tabasco）",
);

// Parentheses that are not copied names are none of this function's business.
checkText(
  "a Chinese aside is left alone",
  stripUnverifiedParentheticals("闭路电视系统（CCTV）的供应", "SUMINISTRO DE CIRCUITOS CERRADOS DE TELEVISION CCTV"),
  "闭路电视系统（CCTV）的供应",
);
checkText(
  "a parenthetical holding Chinese is left alone even when absent from the source",
  stripUnverifiedParentheticals("道路改善（二期）", "MEJORAMIENTO DE VIA"),
  "道路改善（二期）",
);
checkText(
  "a chainage marker the source states is kept",
  stripUnverifiedParentheticals("桥梁建设（KM 6+512）", "CONSTRUCCIÓN DEL PUENTE UBICADO EN EL KM 6+512"),
  "桥梁建设（KM 6+512）",
);
checkText(
  "a chainage marker the source never states is dropped",
  stripUnverifiedParentheticals("桥梁建设（K5+500）", "CONSTRUCCION DEL PUENTE"),
  "桥梁建设",
);

checkText(
  "nothing to do when there are no parentheses",
  stripUnverifiedParentheticals("重型机械采购", "ADQUISICIÓN DE MAQUINARIA PESADA"),
  "重型机械采购",
);

// ── findDroppedIdentifiers ─────────────────────────────────────────────────
// The real loss: a works-order number gone from a sentence that still reads
// perfectly well.
checkText(
  "a leading works-order code that vanished",
  findDroppedIdentifiers("中低压配电网改造", "OP088.- REHABILITACIÓN DE RED DE DISTRIBUCIÓN ELECTRICA EN MEDIA Y BAJA TENSIÓN").join("|"),
  "OP088",
);
checkText(
  "the same code carried through is not flagged",
  findDroppedIdentifiers("OP088 中低压配电网改造", "OP088.- REHABILITACIÓN DE RED...").join("|"),
  "",
);
checkText(
  "an equipment tag that survived",
  findDroppedIdentifiers("TG-5汽轮发电机组修复", "REHABILITACIÓN DEL TURBOGENERADOR TG-5").join("|"),
  "",
);
checkText(
  "a chainage that was dropped",
  findDroppedIdentifiers("道路改善工程", "MEJORAMIENTO ... (K0+000 AL K0+758)").join("|"),
  "K0+000|K0+758",
);
checkText(
  "a chainage that survived",
  findDroppedIdentifiers("在San Seb道路KM 6+512处建设桥梁", "CONSTRUCCIÓN DEL PUENTE UBICADO EN EL KM 6+512").join("|"),
  "",
);

// Bare numbers are ordinary words a translation may render differently.
checkText(
  "a quantity is not an identifier",
  findDroppedIdentifiers("采购22辆罐车", "ADQS. DE 22 VEHS. CISTERNA").join("|"),
  "",
);
checkText(
  "a year is not an identifier",
  findDroppedIdentifiers("道路铺装", "PAVIMENTACIÓN 2026").join("|"),
  "",
);
checkText(
  "a bare token under three characters is ignored",
  findDroppedIdentifiers("建设工程", "OBRA T1").join("|"),
  "",
);

// Each code reported once however often the source repeats it.
checkText(
  "a repeated code is reported once",
  findDroppedIdentifiers("工程", "OP088 ... OP088 ... OP088").join("|"),
  "OP088",
);

// ── mapBatchResultsToSlugs ─────────────────────────────────────────────────
// The severe failure mode: a right translation stored against the wrong
// tender. Nothing in a review of the Chinese would show it.
const BATCH = [
  { slug: "secop-a", titleEs: "A", summaryEs: "A" },
  { slug: "secop-b", titleEs: "B", summaryEs: "B" },
  { slug: "secop-c", titleEs: "C", summaryEs: "C" },
];
const r = (id: string, zh: string) => ({ id, titleZh: zh, summaryZh: zh });

checkText(
  "ids map back in order",
  mapBatchResultsToSlugs(BATCH, [r("1", "甲"), r("2", "乙"), r("3", "丙")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-a=甲|secop-b=乙|secop-c=丙",
);
// The prompt says order need not match, so this is the normal case, not an edge.
checkText(
  "ids map back out of order",
  mapBatchResultsToSlugs(BATCH, [r("3", "丙"), r("1", "甲"), r("2", "乙")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-c=丙|secop-a=甲|secop-b=乙",
);
checkText(
  "a missing id leaves the others correctly paired",
  mapBatchResultsToSlugs(BATCH, [r("1", "甲"), r("3", "丙")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-a=甲|secop-c=丙",
);
checkText(
  "an id past the end of the batch is dropped, not wrapped",
  mapBatchResultsToSlugs(BATCH, [r("1", "甲"), r("9", "戊")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-a=甲",
);
checkText(
  "a zero or negative id is dropped",
  mapBatchResultsToSlugs(BATCH, [r("0", "零"), r("-1", "负"), r("2", "乙")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-b=乙",
);
checkText(
  "a non-numeric id is dropped rather than coerced",
  mapBatchResultsToSlugs(BATCH, [r("secop-a", "甲"), r("2", "乙")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-b=乙",
);
checkText(
  "a duplicated id keeps the first and drops the rest",
  mapBatchResultsToSlugs(BATCH, [r("2", "乙"), r("2", "别的")]).map((x) => `${x.slug}=${x.titleZh}`).join("|"),
  "secop-b=乙",
);
checkText(
  "an empty result set maps to nothing",
  mapBatchResultsToSlugs(BATCH, []).map((x) => x.slug).join("|"),
  "",
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
