/**
 * Dumps ONE DOF notice exactly as the import sees it: the label/value table
 * parseDofNoticeDetailHtml() pulls out of the page, and what
 * mapDofSearchNotaToTender() then makes of it.
 *
 * Written 2026-09-18 while chasing dof-5799003, which reached the database
 * with a fallo date that had already passed while its own bid deadline was
 * six weeks away — a schedule no real procedure runs. The mapper no longer
 * reads fallo as an outcome, so that row is fixed either way; this exists to
 * answer the question underneath it, which the fix does not: is the date
 * WRONG (a parsing bug that would be corrupting the timeline and the deadline
 * too), or is it real and DOF simply printed something odd?
 *
 * Reaching for a script rather than reading the HTML by hand because the
 * three CFE "Área Contratante" offices already known use three different
 * table shapes (see dof-notice-detail.ts) — what matters is what the parser
 * makes of the page, not what the page looks like.
 *
 *   npm run probe:dof-notice -- 5799003 15/09/2026
 *   npm run probe:dof-notice -- 5799003 15/09/2026 "PEMEX"   (other buyer)
 */
import { fetchDofNoticeDetail } from "../lib/ingestion/connectors/dof-notice-detail";
import { mapDofSearchNotaToTender } from "../lib/ingestion/dof-search-mapper";

async function main() {
  const [codNota, fecha] = process.argv.slice(2);
  if (!codNota || !fecha) {
    console.error("用法：npm run probe:dof-notice -- <codNota> <DD/MM/YYYY> [买方名]\n例：npm run probe:dof-notice -- 5799003 15/09/2026");
    process.exit(1);
  }

  console.log(`https://dof.gob.mx/nota_detalle.php?codigo=${codNota}&fecha=${fecha}\n`);

  const result = await fetchDofNoticeDetail(Number(codNota), fecha);
  if (result.status !== "found") {
    console.error(`抓取失败：${result.status}${result.status === "error" ? ` — ${result.message}` : ""}`);
    process.exit(1);
  }

  const { procedureNumber, title, fieldsByLabel } = result.detail;
  // The real search endpoint supplies the buyer; the detail page does not, so
  // the probe takes it as an optional third argument and otherwise says so
  // rather than inventing a name that would end up in the printed output.
  const buyerGuess = process.argv[4] ?? "COMISION FEDERAL DE ELECTRICIDAD";

  console.log(`procedureNumber: ${procedureNumber ?? "(none)"}`);
  console.log(`title:           ${title ?? "(none)"}\n`);
  console.log("解析出来的字段表（左边是 DOF 的原始标签，右边是原始取值）：");
  for (const [label, value] of Object.entries(fieldsByLabel)) {
    console.log(`  ${label.padEnd(46).slice(0, 46)} | ${value}`);
  }

  // Run it through the real mapper, with a search stub shaped like the one the
  // search endpoint returns, so the key dates and status below are the same
  // ones an import would write — not a re-derivation that could disagree.
  //
  // Both stub fields matter and the first version of this script got one
  // wrong: `codOrgaUno` is the DOF SECTION NAME, which the mapper tests
  // against /CONVOCATORIAS PARA CONCURSOS/ before doing anything else, and a
  // section code there made every probe report "这条不会被导入" about notices
  // that had in fact been imported. `titulo` must carry the "- REF:<n>" shape
  // too, since that is what the buyer is parsed out of.
  const tender = mapDofSearchNotaToTender(
    {
      codNota: Number(codNota),
      titulo: `${buyerGuess} - REF:${codNota}`,
      fecha: fecha.split("/").reverse().join("/"),
      codOrgaUno: "CONVOCATORIAS PARA CONCURSOS",
    } as Parameters<typeof mapDofSearchNotaToTender>[0],
    "Diario Oficial de la Federación (DOF) — búsqueda avanzada",
    result.detail,
  );

  if (!tender) {
    console.log("\nmapDofSearchNotaToTender() 返回 null —— 这条不会被导入。");
    return;
  }

  console.log("\nmapper 得出的结果：");
  console.log(`  status:             ${tender.status}`);
  console.log(`  publicationDate:    ${tender.publicationDate?.slice(0, 10) ?? "—"}`);
  console.log(`  submissionDeadline: ${tender.submissionDeadline?.slice(0, 10) ?? "—"}`);
  console.log("  keyDates:");
  for (const keyDate of tender.keyDates) {
    console.log(`    ${keyDate.type.padEnd(14)} ${keyDate.date.slice(0, 10)}  ${keyDate.notes?.es ?? ""}`);
  }
}

main();
