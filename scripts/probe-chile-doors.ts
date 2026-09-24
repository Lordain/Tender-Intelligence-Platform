/**
 * Chile, phase 1: measure before writing anything.
 *
 * The last three sources (Brazil PNCP, ANTAQ, DOU) were each built by probing
 * first and coding second, and in two of the three the probe changed the plan
 * entirely. Chile gets the same treatment: no connector, no mapper, no
 * npm script that writes a row, until this has answered where the door is,
 * whether it wants credentials, and what one real record looks like.
 *
 * Read-only in every sense — no Supabase, no model calls, no writes to the
 * database. `--save` writes captured RESPONSES to
 * lib/ingestion/__fixtures__/chile/, which is the point: every mapper in this
 * repo is tested against real captured payloads and never invented ones, and
 * those payloads have to come from somewhere.
 *
 * Usage:
 *   npm run probe:chile-doors                  (knock, print, keep nothing)
 *   npm run probe:chile-doors -- --save        (also save every real response as a fixture)
 *   npm run probe:chile-doors -- "GitHub 跑批机"   (name the machine in the report)
 *
 * If the platform owner has a Mercado Público ticket, put it in
 * CHILE_MERCADOPUBLICO_TICKET and the ticket-only door runs too. Without one
 * that door is SKIPPED and says so. This script does not obtain, guess or
 * work around a credential.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { knockAllChileDoors, renderChileReport, type DoorResult } from "@/lib/ingestion/chile-doors";

const FIXTURE_DIR = path.join(process.cwd(), "lib", "ingestion", "__fixtures__", "chile");

/**
 * Saved with the door id in the name, and saved for FAILURES too.
 *
 * The failures are not noise here. On 2026-09-24 the only thing this probe
 * could capture was the egress gateway's own refusal — and that payload is
 * what pins the finding that a 403 in this container is not a 403 from Chile.
 * A fixture directory that held only successes would have nothing in it and
 * nothing to test against.
 */
function saveFixture(result: DoorResult): string | null {
  if (result.body === undefined) return null;
  // A control door that ANSWERED is calibration, not evidence about Chile,
  // and on the first run that rule was missing — the run committed GitHub's
  // 563KB homepage to the fixture directory. A control that was DENIED is
  // kept, because that payload is the finding.
  if (result.confidence === "control" && result.verdict !== "egress_denied") return null;
  const extension = (result.contentType ?? "").includes("json")
    ? "json"
    : (result.contentType ?? "").includes("html")
      ? "html"
      : "txt";
  const file = path.join(FIXTURE_DIR, `${result.id.toLowerCase()}-${result.verdict}.${extension}`);
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(file, result.body, "utf-8");
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const where = args.filter((arg) => !arg.startsWith("--")).join(" ").trim() || "本机";
  const ticket = process.env.CHILE_MERCADOPUBLICO_TICKET?.trim() || undefined;

  console.log(`敲 ${where} 这一侧的门……${ticket ? "（读到了 CHILE_MERCADOPUBLICO_TICKET，要凭证的那个门会一起问）" : "（没有配 ticket，要凭证的门会跳过）"}\n`);

  const saved: string[] = [];
  const results = await knockAllChileDoors(ticket, (result) => {
    // Printed as they come rather than at the end: a run that stalls on a
    // 20-second timeout should show which door it is stuck on, not look hung.
    console.log(`  ${result.id.padEnd(5)}${result.verdict.padEnd(20)}${result.ms}ms`);
    if (save) {
      const file = saveFixture(result);
      if (file) saved.push(file);
    }
  });

  console.log("\n" + renderChileReport(results, where));

  if (save) {
    console.log("");
    if (saved.length === 0) {
      // Not a silent no-op. Zero fixtures after a --save run is itself the
      // finding: nothing answered with a body worth keeping.
      console.log("--save：一个响应体都没存下来 —— 这一轮没有任何门给出正文。");
    } else {
      console.log(`--save：存了 ${saved.length} 份真实响应：`);
      for (const file of saved) console.log(`  ${path.relative(process.cwd(), file)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
