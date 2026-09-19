/**
 * Follows the two reachable Brazilian routes down to their data.
 *
 * Runs on the runner for the same reason every probe in this pair does: what
 * it prints about reachability is a property of the egress, and the runner is
 * the egress a connector would live on.
 *
 * Read-only. No Supabase, no model calls, no writes.
 */
import { digPipeline } from "@/lib/ingestion/brazil-pipeline-dig";

const WHERE = process.argv.slice(2).join(" ").trim() || "本机";

async function main() {
  console.log(await digPipeline(WHERE));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
