/**
 * Fetches ONE real DOF notice detail page and prints what
 * parseDofNoticeDetailHtml() extracted from it — a quick way to check
 * several real notices (different buyers — CFE, PEMEX, IMP...) before
 * trusting this parser inside a real mapper. See
 * lib/ingestion/connectors/dof-notice-detail.ts for why this exists: the
 * DOF search endpoint's own results (dof-search-mapper.ts) carry no real
 * content, only "<BUYER> - REF:<number>" — the real title/dates live on
 * each notice's own page, confirmed real for one CFE example so far, not
 * yet for PEMEX.
 *
 * codNota and fecha both come straight off a real DOF search result JSON
 * (the same file ingest:dof-search reads): `codNota` as-is, `fecha`
 * converted from that file's "YYYY/MM/DD" to this page's own "DD/MM/YYYY".
 *
 * Usage:
 *   npm run inspect:dof-notice -- <codNota> <fecha DD/MM/YYYY>
 *   npm run inspect:dof-notice -- 5797664 01/09/2026
 */
import { fetchDofNoticeDetail } from "../lib/ingestion/connectors/dof-notice-detail";

async function main() {
  const [codNotaArg, fecha] = process.argv.slice(2);
  const codNota = Number(codNotaArg);

  if (!Number.isInteger(codNota) || !fecha) {
    console.error("Usage: npm run inspect:dof-notice -- <codNota> <fecha DD/MM/YYYY>");
    process.exit(1);
  }

  const result = await fetchDofNoticeDetail(codNota, fecha);

  if (result.status === "error") {
    console.error(`error: ${result.message}`);
    process.exit(1);
  }
  if (result.status === "not_found") {
    console.log("not_found — either the expected table shape wasn't there, or this notice has no table01 at all (e.g. it's not a tender notice).");
    return;
  }

  console.log(JSON.stringify(result.detail, null, 2));
}

main();
