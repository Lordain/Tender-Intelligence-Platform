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
import { titleIsTruncated } from "../lib/ingestion/translate-titles";

let passed = 0;
let failed = 0;

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

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
