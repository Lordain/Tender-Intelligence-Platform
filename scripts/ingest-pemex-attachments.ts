/**
 * Records PEMEX tender document references (file name + real source URL)
 * against already-ingested PEMEX tenders — the metadata half of "click and
 * download every needed document automatically" for PEMEX. Deliberately
 * does NOT download the files themselves; it records where they are, the
 * same posture ingest-tender-documents.ts takes for Compras MX documents
 * (which are behind an anti-bot gate this platform doesn't try to defeat).
 * PEMEX's own portal has no such gate (see README.md), so a follow-up tool
 * could fetch the bytes directly — not built yet, out of scope for this
 * pass.
 *
 * Input is a JSON array of { Id, Title, files: [{FileName,
 * ServerRelativeUrl}] } — see README.md for the browser Console snippet
 * that produces one per PEMEX subsidiary list.
 *
 * Usage:
 *   npm run ingest:pemex-attachments -- path/to/attachments.json [--write]
 */
import { readPemexAttachmentsFile } from "../lib/ingestion/connectors/pemex-attachments-file";
import { detectDocumentType } from "../lib/ingestion/document-intake";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { slugify } from "../lib/ingestion/text-utils";

const PEMEX_SITE_ORIGIN = "https://www.pemex.com";

async function record(entries: ReturnType<typeof readPemexAttachmentsFile>) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

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

      // No downloaded bytes at this stage, so content_hash can't be the
      // dedup key the way it is in ingest-tender-documents.ts — the real
      // source URL is the next-best stable identity for "already on file."
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

      const { error } = await supabase.from("tender_documents").insert({
        tender_id: tender.id as string,
        file_name: file.FileName,
        document_type: detectDocumentType("", file.FileName),
        source_url: sourceUrl,
        extraction_status: "pending",
      });

      if (error) {
        console.error(`  failed ${file.FileName}: ${error.message}`);
        failed++;
      } else {
        console.log(`  recorded: ${file.FileName} -> ${tenderNumber}`);
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
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: npm run ingest:pemex-attachments -- <attachments.json> [--write]");
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
    console.log("\ndry run (pass --write to record these in Supabase) — nothing was written.");
    return;
  }

  console.log();
  await record(entries);
}

main();
