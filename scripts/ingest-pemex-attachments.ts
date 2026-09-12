/**
 * Records PEMEX tender document references (file name + real source URL)
 * against already-ingested PEMEX tenders. By default this stays
 * metadata-only, the same posture ingest-tender-documents.ts takes for
 * Compras MX documents (which are behind an anti-bot gate this platform
 * doesn't try to defeat) — but PEMEX's own portal has no such gate (see
 * README.md), so pass --download to also fetch the real bytes, the same
 * way ingest-colombia-documents.ts does for SECOP II.
 *
 * Input is a JSON array of { Id, Title, files: [{FileName,
 * ServerRelativeUrl}] } — see README.md for the browser Console snippet
 * that produces one per PEMEX subsidiary list.
 *
 * Downloaded bytes are saved locally (under --out, default
 * ./downloads/pemex/<tender-slug>/) so they're immediately ready for
 * `npm run extract:document` — same as Colombia's connector, they are NOT
 * uploaded anywhere or served back to this platform's own users;
 * `tender_documents.storage_url` stays unset either way (see
 * colombia-documents-connector.ts's header comment for the product
 * reasoning: this site never offers tender document downloads to users).
 *
 * Usage:
 *   npm run ingest:pemex-attachments -- path/to/attachments.json [--write]
 *   npm run ingest:pemex-attachments -- path/to/attachments.json --write --download [--out <dir>]
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readPemexAttachmentsFile, downloadPemexDocument } from "../lib/ingestion/connectors/pemex-attachments-file";
import { detectDocumentType } from "../lib/ingestion/document-intake";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { slugify } from "../lib/ingestion/text-utils";

const PEMEX_SITE_ORIGIN = "https://www.pemex.com";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function record(entries: ReturnType<typeof readPemexAttachmentsFile>, shouldDownload: boolean, outDir: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  if (shouldDownload && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let recorded = 0;
  let alreadyOnFile = 0;
  let failed = 0;
  let skippedTenders = 0;

  for (const entry of entries) {
    const tenderNumber = entry.Title?.trim();
    if (!tenderNumber) {
      console.error(`  skipped item ${entry.Id}: no Title/tenderNumber in this export`);
      skippedTenders++;
      continue;
    }

    const slug = `pemex-${slugify(tenderNumber)}`;
    const { data: tender } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();
    if (!tender) {
      console.error(`  skipped item ${entry.Id}: no ingested tender matches ${tenderNumber} (${slug}) — run ingest:pemex first`);
      skippedTenders++;
      continue;
    }

    for (const file of entry.files) {
      const sourceUrl = `${PEMEX_SITE_ORIGIN}${file.ServerRelativeUrl}`;

      // No downloaded bytes in metadata-only mode, so content_hash can't be
      // the dedup key the way it is in ingest-tender-documents.ts — the
      // real source URL is the next-best stable identity for "already on
      // file" either way (also cheap: avoids re-downloading on a re-run).
      const { data: existing } = await supabase
        .from("tender_documents")
        .select("id")
        .eq("source_url", sourceUrl)
        .maybeSingle();
      if (existing) {
        console.log(`  already on file: ${file.FileName}`);
        alreadyOnFile++;
        continue;
      }

      let contentHash: string | undefined;
      let extractionStatus: "pending" | "not_extractable" = "pending";

      if (shouldDownload) {
        try {
          const bytes = await downloadPemexDocument(sourceUrl);
          const tenderDir = join(outDir, slug);
          if (!existsSync(tenderDir)) mkdirSync(tenderDir, { recursive: true });
          writeFileSync(join(tenderDir, file.FileName), bytes);
          contentHash = createHash("sha256").update(bytes).digest("hex");
          extractionStatus = file.FileName.toLowerCase().endsWith(".pdf") ? "pending" : "not_extractable";
        } catch (err) {
          console.error(`  failed to download ${file.FileName}: ${(err as Error).message}`);
          failed++;
          continue;
        }
      }

      const { error } = await supabase.from("tender_documents").insert({
        tender_id: tender.id as string,
        file_name: file.FileName,
        document_type: detectDocumentType("", file.FileName),
        source_url: sourceUrl,
        content_hash: contentHash,
        extraction_status: extractionStatus,
      });

      if (error) {
        console.error(`  failed ${file.FileName}: ${error.message}`);
        failed++;
      } else {
        console.log(`  ${shouldDownload ? "downloaded + recorded" : "recorded"}: ${file.FileName} -> ${tenderNumber}`);
        recorded++;
      }
    }
  }

  console.log(
    `\nDone. Recorded ${recorded}, already on file ${alreadyOnFile}, failed ${failed}, tender(s) skipped ${skippedTenders}.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const shouldDownload = args.includes("--download");
  const filePath = args.find((a) => !a.startsWith("--"));
  const outDir = argValue(args, "--out") ?? join("downloads", "pemex");

  if (!filePath) {
    console.error("Usage: npm run ingest:pemex-attachments -- <attachments.json> [--write] [--download] [--out <dir>]");
    process.exit(1);
  }

  const entries = readPemexAttachmentsFile(filePath);
  const totalFiles = entries.reduce((sum, e) => sum + e.files.length, 0);
  console.log(`Found ${totalFiles} document reference(s) across ${entries.length} tender(s) in this export.`);

  for (const entry of entries.slice(0, 5)) {
    console.log(`  ${entry.Title ?? entry.Id}: ${entry.files.map((f) => f.FileName).join(", ") || "(no files)"}`);
  }
  if (entries.length > 5) console.log(`  ... and ${entries.length - 5} more`);

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to record these in Supabase, add --download to also fetch the real bytes) — nothing was written.");
    return;
  }

  if (shouldDownload) {
    console.log(`\n(downloading real file bytes to ${outDir}/<tender-slug>/ as we go)`);
  }

  console.log();
  await record(entries, shouldDownload, outDir);
}

main();
