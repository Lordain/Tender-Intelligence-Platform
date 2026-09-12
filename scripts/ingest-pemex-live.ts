/**
 * CLI for PEMEX's live "Concursos Abiertos" lists — thin wrapper around
 * lib/ingestion/import-pemex-live.ts, which the admin 墨西哥 tab's
 * "PEMEX 直接拉取" section calls too, so the button and the terminal write
 * through exactly the same path.
 *
 * This exists because `npm run ingest:pemex` is a DIFFERENT thing and the
 * difference is not guessable from the name: that one ingests a JSON capture
 * already sitting on disk (the browser-Console technique in
 * lib/ingestion/README.md), and running it with no file just prints a usage
 * line — which is exactly what happened when it was reached for as "the PEMEX
 * import" (2026-09-12). The live path had no CLI at all; now the naming says
 * which is which, the same way Peru has ingest:peru (file) and
 * ingest:peru-live.
 *
 * Document links come along for the ride on a --write run: PEMEX publishes the
 * Convocatoria, Bases and annexes as real attachments, and those feed
 * 批量下载标书 on /admin/documents-needed.
 *
 * Usage:
 *   npm run ingest:pemex-live                                   (every list, dry run)
 *   npm run ingest:pemex-live -- --write
 *   npm run ingest:pemex-live -- --list Concursos-Abiertos-PTI --write
 *   npm run ingest:pemex-live -- --months 12 --write
 *   npm run ingest:pemex-live -- --list Concursos-e-invitaciones --buyer "..." --write
 */
import { importPemexLive } from "../lib/ingestion/import-pemex-live";
import { KNOWN_BUYER_NAMES, PEMEX_LIST_TITLES, type PemexListTitle } from "../lib/ingestion/pemex-sources";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const months = Number(argValue(args, "--months") ?? 6);

  const requested = argValue(args, "--list");
  if (requested && !PEMEX_LIST_TITLES.includes(requested as PemexListTitle)) {
    console.error(`--list must be one of:\n  ${PEMEX_LIST_TITLES.join("\n  ")}`);
    process.exit(1);
  }
  const lists = (requested ? [requested as PemexListTitle] : [...PEMEX_LIST_TITLES]);

  const buyerOverride = argValue(args, "--buyer");
  if (buyerOverride && !requested) {
    console.error("--buyer only makes sense with --list (each list has its own buyer).");
    process.exit(1);
  }

  let totalUpserted = 0;
  let totalLinks = 0;

  for (const listTitle of lists) {
    const buyer = buyerOverride ?? KNOWN_BUYER_NAMES[listTitle];
    if (!buyer) {
      console.error(`  ${listTitle}: no known buyer name — pass --list ${listTitle} --buyer "..."`);
      continue;
    }

    process.stdout.write(`${listTitle} (${buyer})… `);
    try {
      const result = await importPemexLive(listTitle, buyer, { write, months });
      const parts = [
        `${result.totalItems} item(s)`,
        `mapped ${result.mappedCount}`,
        `within ${months}mo ${result.keptAfterRecencyCount}`,
      ];
      if (write) {
        parts.push(`upserted ${result.upsertedCount ?? 0}`, `skipped ${result.skippedExcludedCount ?? 0}`);
        totalUpserted += result.upsertedCount ?? 0;
        if (result.documentLinks) {
          parts.push(`links ${result.documentLinks.links} on ${result.documentLinks.tenders} tender(s)`);
          totalLinks += result.documentLinks.links;
          if (result.documentLinks.failedItems > 0) parts.push(`${result.documentLinks.failedItems} attachment lookup(s) failed`);
        }
        if (result.failed && result.failed.length > 0) parts.push(`${result.failed.length} FAILED`);
      }
      console.log(parts.join(", "));
      // Printed per list rather than collected: a failure on one subsidiary
      // says which one, and the other six still ran.
      for (const failure of result.failed?.slice(0, 5) ?? []) console.error(`    ${failure.slug}: ${failure.error}`);
    } catch (err) {
      console.log("");
      console.error(`  ${listTitle} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!write) {
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase, and no document links were captured.");
    return;
  }
  console.log(`\nUpserted ${totalUpserted} tender(s); captured ${totalLinks} document link(s).`);
}

main();
