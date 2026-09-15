/**
 * Does the Chinese-supplier matcher keep the real companies and drop the
 * coincidences?
 *
 * Every case below is a real supplier name from the first live run
 * (2026-09-15): 672 contracts, 147 companies, roughly seven of them actually
 * Chinese. That run is the whole reason this file exists — the first matcher
 * word-checked only CHINA/CHINESE, on the reasoning that no Spanish word
 * contains "HUAWEI". True, and beside the point: the noise comes from the
 * SHORT tokens, and short brand names turn out to be substrings of ordinary
 * Spanish words and Colombian given names everywhere.
 *
 * A name-based guess cannot be perfect and is not trying to be. Two of the
 * cases below are kept deliberately even though they are wrong — a Colombian
 * firm really is called BYD MULTIPROYECTOS, and DAHUA really is somebody's
 * surname. Nothing in a name can separate those, which is why the script
 * prints why each row matched and tells the reader to judge. What this test
 * pins is the part that IS decidable: a token has to be a word.
 *
 * Offline: no network, no Supabase, no model calls.
 */
import { survivesWordCheck, CHINESE_ENTITY_SUFFIX } from "./find-chinese-suppliers";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

/** [supplier, token, should it survive the word check] */
const CASES: [string, string, boolean][] = [
  // The real ones, all from the live run.
  ["CHINA CIVIL ENGINEERING CONSTRUCTION CORPORATION", "CHINA", true],
  ["CHINA  UNITED ENGINEERING CORPORATION LIMITED", "CHINA", true],
  ["HEFEI JA SOLAR TECHNOLOGY CO., LTD", "JA SOLAR", true],
  ["CHINT ELECTRIC CO,. LTD", "CHINT", true],
  ["Chint Colombia S.A.S", "CHINT", true],
  ["BYD Motor colombia S.A.S", "BYD", true],
  ["SANY COLOMBIA SAS", "SANY", true],
  ["CAMARA COLOMBO CHINA DE INVERSION Y COMERCIO", "CHINA", true],
  ["Beijing ByteDance Technology Co., Ltd.", "BEIJING", true],

  // The noise. GREE alone produced ~100 of the 147 companies.
  ["GREEN SERVICES AND SOLUTIONS S.A.S.", "GREE", false],
  ["Cs. SCI Doctrina", "TRINA", false],
  ["CLINICA VETRINARIA VISION DE COLOMBIA S.A.S", "TRINA", false],
  ["VITRINA WEB", "TRINA", false],
  ["NUTRINAR ANDRADE SAS", "TRINA", false],
  ["SICMECI S.A.S", "CMEC", false],
  ["UNION TEMPORAL TECMECMOTRIZ 2026", "CMEC", false],
  ["EMPRESA DE SUMINISTROS, LOGÍSTICA Y ASESORÍAS INTEGRALES AZTECA SAS", "ZTE", false],
  ["PREZTEL SAS", "ZTE", false],
  ["Worldbiohaztec Colombia SAS", "ZTE", false],
  ["Juanita Catleya Baquero Rueda", "CATL", false],
  ["CHERYL KATIANA OROZCO ARIZA", "CHERY", false],
  ["ROSANY ELITH IDARRAGA ROA", "SANY", false],
  ["DENTCLASS", "TCL", false],
  ["NETCLOUD SAS", "TCL", false],
  ["FOTONES INGENIERIA SOSTENIBLE SAS", "FOTON", false],
  ["MARIA ALEJANDRA PANTOJA SOLARTE", "JA SOLAR", false],
  ["CCCCC", "CCCC", false],

  // Irreducible from a name. Kept, and that is the honest answer.
  ["BYD MULTIPROYECTOS SAS", "BYD", true],
  ["CONSORCIO TRINA", "TRINA", true],
  ["PAULA ANDREA PEREZ DAHUA", "DAHUA", true],
];

for (const [supplier, token, expected] of CASES) {
  const got = survivesWordCheck(supplier, token);
  check(
    `${expected ? "keeps" : "drops"} ${token.padEnd(9)} ${supplier.slice(0, 46)}`,
    got === expected,
    `got ${got ? "keep" : "drop"}`,
  );
}

// The second signal, independent of any keyword: a mainland legal-entity
// suffix. "CO,. LTD" with the comma and period transposed is real — it is how
// Chint Electric is spelled in SECOP — so the pattern tolerates any mix of
// separators rather than matching one tidy spelling.
for (const name of [
  "CHINT ELECTRIC CO,. LTD",
  "HEFEI JA SOLAR TECHNOLOGY CO., LTD",
  "CHINA  UNITED ENGINEERING CORPORATION LIMITED",
  "Beijing ByteDance Technology Co., Ltd.",
]) {
  check(`entity suffix promotes ${name.slice(0, 40)}`, CHINESE_ENTITY_SUFFIX.test(name));
}
for (const name of ["SANY COLOMBIA SAS", "GREEN SERVICES AND SOLUTIONS S.A.S.", "BYD MULTIPROYECTOS SAS"]) {
  check(`entity suffix does NOT fire on ${name.slice(0, 40)}`, !CHINESE_ENTITY_SUFFIX.test(name));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
