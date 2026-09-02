/**
 * Runs Layer 2 extraction (lib/ingestion/extract-requirements.ts) on a
 * single downloaded PDF and either prints the result or writes it to
 * Supabase — populating qualifications/experienceRequirements/
 * requiredDocuments/risks for the tender it belongs to.
 *
 * Requires ANTHROPIC_API_KEY. LIVE-TESTED (2026-09-02) — see the header comment in
 * lib/ingestion/extract-requirements.ts.
 *
 * Usage:
 *   npm run extract:document -- path/to/file.pdf <tender-slug>              (dry run — prints the extraction)
 *   npm run extract:document -- path/to/file.pdf <tender-slug> --write      (writes to Supabase)
 */
import { intakeDocument } from "../lib/ingestion/document-intake";
import { extractTenderRequirements, toTenderFields } from "../lib/ingestion/extract-requirements";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

async function writeToSupabase(slug: string, contentHash: string, fields: ReturnType<typeof toTenderFields>) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (tenderError || !tender) {
    console.error(`No ingested tender found for slug "${slug}": ${tenderError?.message ?? "not found"}`);
    process.exit(1);
  }
  const tenderId = tender.id as string;

  for (const kind of ["qualification", "experience", "document"] as const) {
    await supabase.from("tender_requirements").delete().eq("tender_id", tenderId).eq("kind", kind);
  }
  await supabase.from("tender_risks").delete().eq("tender_id", tenderId);

  const requirementRows = [
    ...fields.qualifications.map((r, i) => ({ kind: "qualification" as const, sort_order: i, ...r })),
    ...fields.experienceRequirements.map((r, i) => ({ kind: "experience" as const, sort_order: i, ...r })),
    ...fields.requiredDocuments.map((r, i) => ({ kind: "document" as const, sort_order: i, ...r })),
  ];
  if (requirementRows.length > 0) {
    await supabase.from("tender_requirements").insert(
      requirementRows.map((r) => ({
        tender_id: tenderId,
        kind: r.kind,
        title: r.title,
        description: r.description,
        mandatory: r.mandatory,
        source_reference: r.sourceReference,
        sort_order: r.sort_order,
      })),
    );
  }

  if (fields.risks.length > 0) {
    await supabase.from("tender_risks").insert(
      fields.risks.map((r) => ({
        tender_id: tenderId,
        level: r.level,
        title: r.title,
        description: r.description,
        source_reference: r.sourceReference,
      })),
    );
  }

  await supabase
    .from("tender_documents")
    .update({ extraction_status: "extracted", extracted_at: new Date().toISOString() })
    .eq("content_hash", contentHash);

  console.log(
    `Wrote ${fields.qualifications.length} qualifications, ${fields.experienceRequirements.length} experience requirements, ${fields.requiredDocuments.length} required documents, ${fields.risks.length} risks for ${slug}.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [pdfPath, tenderSlug] = positional;

  if (!pdfPath || !tenderSlug) {
    console.error("Usage: npm run extract:document -- <file.pdf> <tender-slug> [--write]");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }

  const intake = intakeDocument(pdfPath);
  console.log(`Document: ${intake.fileName} (${intake.documentType}), tender number in text: ${intake.tenderNumber ?? "not found"}`);

  const extraction = await extractTenderRequirements(pdfPath, {
    tenderNumber: intake.tenderNumber ?? tenderSlug,
    title: intake.fileName,
    buyer: "",
  });
  const fields = toTenderFields(extraction, tenderSlug);

  console.log(JSON.stringify(fields, null, 2));

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to record these in Supabase) — nothing was written.");
    return;
  }

  await writeToSupabase(tenderSlug, intake.contentHash, fields);
}

main();
