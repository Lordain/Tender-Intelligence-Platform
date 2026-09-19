/**
 * The deployment door probe, run from a terminal instead of a browser tab.
 *
 * Exists for one reason: the nightly ingest does not run on Vercel. It runs
 * on a GitHub Actions runner (.github/workflows/daily-ingest.yml), which is a
 * different network from Vercel's and from the user's laptop. On 2026-09-19
 * the Vercel route opened two doors the laptop cannot open —
 * `dadosabertos.aneel.gov.br` (which never completes a TCP handshake from the
 * laptop) and `dados.antt.gov.br` (which serves the laptop an F5 rejection
 * page). Both are CKAN APIs; both are exactly what a connector would read.
 *
 * Writing that connector against Vercel's answer would be a guess about a
 * third machine. This script is how the third machine gets asked — from
 * .github/workflows/probe-brazil-doors.yml, on demand.
 *
 * Read-only. No Supabase, no model calls, no writes.
 */
import { knockAllDoors, renderDoorReport } from "@/lib/ingestion/brazil-doors";

const WHERE = process.argv.slice(2).join(" ").trim() || "本机";

async function main() {
  console.log(renderDoorReport(await knockAllDoors(), WHERE));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
