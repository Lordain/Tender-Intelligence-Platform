/**
 * Takes a folder of tender documents a human already downloaded from
 * Compras MX and files them against the right tenders automatically —
 * no sorting or data entry by hand, and no renaming required (though it
 * helps: see intakeDocument()'s file-name-first matching, 2026-09-03,
 * for an attachment whose own text never repeats the procedure number).
 * PDF, .docx, and legacy .doc are all supported (2026-09-03 — many real
 * tender attachments turn out to be Word files, current or legacy
 * format, not PDF).
 *
 * This deliberately does NOT download anything: the Compras MX document
 * endpoint is behind the same anti-automation gate as its search API
 * (see lib/ingestion/document-intake.ts and lib/ingestion/README.md).
 *
 * Usage:
 *   npm run ingest:documents -- path/to/folder            (dry run — report only)
 *   npm run ingest:documents -- path/to/folder --write    (records them in Supabase)
 */
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { intakeDocument, type TenderDocumentIntake } from "../lib/ingestion/document-intake";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { slugify } from "../lib/ingestion/text-utils";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

function findDocuments(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && SUPPORTED_EXTENSIONS.includes(extname(path).toLowerCase()))
    .sort();
}

async function record(intakes: TenderDocumentIntake[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  for (const intake of intakes) {
    if (!intake.tenderNumber) {
      console.error(`  skipped ${intake.fileName}: no procedure number found in its text`);
      continue;
    }

    const slug = `comprasmx-${slugify(intake.tenderNumber)}`;
    const { data: tender } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();

    if (!tender) {
      console.error(`  skipped ${intake.fileName}: no ingested tender matches ${intake.tenderNumber} (${slug})`);
      continue;
    }

    // content_hash is the reuse key: the same file re-dropped is a no-op
    // rather than a second extraction, per the analyze-once principle.
    const { data: existing } = await supabase
      .from("tender_documents")
      .select("id, extraction_status")
      .eq("content_hash", intake.contentHash)
      .maybeSingle();

    if (existing) {
      console.log(`  already on file: ${intake.fileName} (${existing.extraction_status})`);
      continue;
    }

    const { error } = await supabase.from("tender_documents").insert({
      tender_id: tender.id as string,
      file_name: intake.fileName,
      document_type: intake.documentType,
      content_hash: intake.contentHash,
      extraction_status: "pending",
    });

    if (error) console.error(`  failed ${intake.fileName}: ${error.message}`);
    else console.log(`  recorded: ${intake.fileName} -> ${intake.tenderNumber} (${intake.documentType})`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const dir = args.find((a) => !a.startsWith("--"));

  if (!dir) {
    console.error("Usage: npm run ingest:documents -- <folder> [--write]");
    process.exit(1);
  }

  const documents = findDocuments(dir);
  if (documents.length === 0) {
    console.log(`No PDF/DOCX/DOC files found in ${dir}.`);
    return;
  }

  console.log(`Found ${documents.length} document(s) in ${dir}.\n`);
  const intakes = await Promise.all(documents.map(intakeDocument));

  for (const intake of intakes) {
    console.log(intake.fileName);
    console.log(
      `  tender:   ${intake.tenderNumber ?? "NOT FOUND"}${
        intake.tenderNumberSource === "filename" ? " (from file name)" : intake.tenderNumber ? ` (appears ${intake.tenderNumberOccurrences}x in text)` : ""
      }`,
    );
    console.log(`  expediente: ${intake.expedienteCode ?? "—"}`);
    console.log(`  type:     ${intake.documentType}`);
    console.log(`  text:     ${intake.textLength.toLocaleString()} chars, ${(intake.byteSize / 1024).toFixed(0)} KB`);
    console.log(`  sha256:   ${intake.contentHash.slice(0, 16)}…`);
    console.log();
  }

  const unmatched = intakes.filter((i) => !i.tenderNumber);
  console.log(`Matched ${intakes.length - unmatched.length} of ${intakes.length} document(s) to a procedure number.`);

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to record these in Supabase) — nothing was written.");
    return;
  }

  console.log();
  await record(intakes);
}

main();
