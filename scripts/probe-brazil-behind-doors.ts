/**
 * Reads what is behind the doors `probe:brazil-doors` found open.
 *
 * Run it on the machine that would host the connector — the runner, via
 * .github/workflows/probe-brazil-doors.yml — for the same reason the door
 * probe runs there: reachability is a property of the egress, and the links
 * this prints are scored against which hosts THAT egress can open.
 *
 * Read-only. No Supabase, no model calls, no writes.
 */
import { lookBehindDoors } from "@/lib/ingestion/brazil-behind-doors";

const WHERE = process.argv.slice(2).join(" ").trim() || "本机";

async function main() {
  console.log(await lookBehindDoors(WHERE));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
