/**
 * Fetches real SECOP II (Colombia) tender documents for one process and
 * records them against an already-ingested tender in Supabase — see
 * lib/ingestion/connectors/colombia-documents-connector.ts for the
 * confirmed real source and the pre-award/post-award filtering logic.
 *
 * Unlike every other document-intake script in this project, this one
 * downloads the real file bytes itself (confirmed genuinely
 * unauthenticated — no anti-bot gate like Compras MX, no login like
 * Ecopetrol's supplier portal) rather than requiring a human to download
 * them first. Files are saved locally (under --out, default
 * ./downloads/colombia/<tender-slug>/) so they're immediately ready for
 * `npm run extract:document` — they are NOT uploaded anywhere or served
 * back to this platform's own users; `tender_documents.storage_url` is
 * deliberately left unset (see the connector's header comment).
 *
 * Only PDF documents get `extraction_status: "pending"` — extraction
 * (extract-requirements.ts) reads a PDF as a base64 `document` content
 * block; other real formats seen in this dataset (.xlsx, .zip) are
 * downloaded and recorded but marked "not_extractable" until a
 * non-PDF extraction path is built.
 *
 * Usage:
 *   npm run ingest:colombia-documents -- --proceso CO1.BDOS.10288373 --tender-slug secop-xxxxx           (dry run — lists real documents, downloads nothing)
 *   npm run ingest:colombia-documents -- --proceso CO1.BDOS.10288373 --tender-slug secop-xxxxx --write   (downloads files, records tender_documents rows)
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  fetchSecopDocumentsForProcess,
  downloadSecopDocument,
  isPreAwardDocument,
} from "../lib/ingestion/connectors/colombia-documents-connector";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const procesoId = argValue(args, "--proceso");
  const tenderSlug = argValue(args, "--tender-slug");
  const outDir = argValue(args, "--out") ?? join("downloads", "colombia", tenderSlug ?? procesoId ?? "unknown");

  if (!procesoId || !tenderSlug) {
    console.error("Usage: npm run ingest:colombia-documents -- --proceso <CO1.BDOS.xxxxxxx> --tender-slug <secop-xxxxx> [--out <dir>] [--write]");
    process.exit(1);
  }

  const allRows = await fetchSecopDocumentsForProcess(procesoId);
  console.log(`Found ${allRows.length} real document(s) for proceso=${procesoId}.`);

  const preAward = allRows.filter(isPreAwardDocument);
  const skipped = allRows.length - preAward.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} post-award document(s) (carry a contract number — not useful for bid/no-bid analysis).`);
  }

  for (const row of preAward) {
    console.log(`  ${row.nombre_archivo} (${row.tamanno_archivo} bytes, .${row.extensi_n})`);
  }

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to download these files and record them) — nothing was downloaded or written.");
    return;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data: tender } = await supabase.from("tenders").select("id").eq("slug", tenderSlug).maybeSingle();
  if (!tender) {
    console.error(`No ingested tender matches slug "${tenderSlug}" — run the relevant ingest:colombia* script first.`);
    process.exit(1);
  }
  const tenderId = tender.id as string;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let downloaded = 0;
  let alreadyOnFile = 0;
  let failed = 0;

  for (const row of preAward) {
    const sourceUrl = row.url_descarga_documento?.url;
    const fileName = row.nombre_archivo;
    if (!sourceUrl || !fileName) {
      console.error(`  skipped: missing download URL or file name for id_documento=${row.id_documento}`);
      failed++;
      continue;
    }

    const { data: existing } = await supabase.from("tender_documents").select("id").eq("source_url", sourceUrl).maybeSingle();
    if (existing) {
      console.log(`  already on file: ${fileName}`);
      alreadyOnFile++;
      continue;
    }

    try {
      const bytes = await downloadSecopDocument(sourceUrl);
      writeFileSync(join(outDir, fileName), bytes);

      const contentHash = createHash("sha256").update(bytes).digest("hex");
      const isPdf = (row.extensi_n ?? "").toLowerCase() === "pdf";

      const { error } = await supabase.from("tender_documents").insert({
        tender_id: tenderId,
        file_name: fileName,
        document_type: "unknown", // Colombian document-type classification not built yet — thin real evidence so far (see connector's header comment)
        source_url: sourceUrl,
        content_hash: contentHash,
        extraction_status: isPdf ? "pending" : "not_extractable",
      });

      if (error) {
        console.error(`  failed to record ${fileName}: ${error.message}`);
        failed++;
      } else {
        console.log(`  downloaded + recorded: ${fileName} -> ${join(outDir, fileName)}`);
        downloaded++;
      }
    } catch (err) {
      console.error(`  failed to download ${fileName}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. Downloaded ${downloaded}, already on file ${alreadyOnFile}, failed ${failed}.`);
}

main();
