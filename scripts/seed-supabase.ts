/**
 * Upserts the bundled mock tenders (data/tenders.ts) into Supabase.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role
 * key is required, not just the anon key, since RLS only grants public
 * read access — writes must bypass it).
 *
 * Usage: npm run db:seed
 */
import { tenders } from "../data/tenders";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. See .env.example.",
    );
    process.exit(1);
  }

  for (const tender of tenders) {
    const { qualifications, experienceRequirements, requiredDocuments, keyDates, risks, ...tenderFields } =
      tender;

    const { error: tenderError } = await supabase.from("tenders").upsert(
      {
        id: tenderFields.id,
        slug: tenderFields.slug,
        tender_number: tenderFields.tenderNumber,
        title: tenderFields.title,
        summary: tenderFields.summary,
        buyer: tenderFields.buyer,
        country: tenderFields.country,
        government_level: tenderFields.governmentLevel,
        industry: tenderFields.industry,
        subcategory: tenderFields.subcategory ?? null,
        scope_type: tenderFields.scopeType,
        procedure_type: tenderFields.procedureType,
        publication_date: tenderFields.publicationDate,
        submission_deadline: tenderFields.submissionDeadline ?? null,
        award_date: tenderFields.awardDate ?? null,
        estimated_value: tenderFields.estimatedValue ?? null,
        currency: tenderFields.currency ?? null,
        location: tenderFields.location ?? null,
        status: tenderFields.status,
        relevance_tier: tenderFields.relevance.tier,
        relevance_label: tenderFields.relevance.label,
        relevance_reason: tenderFields.relevance.reason,
        source_name: tenderFields.sourceName,
        source_url: tenderFields.sourceUrl,
        created_at: tenderFields.createdAt,
        updated_at: tenderFields.updatedAt,
      },
      { onConflict: "id" },
    );

    if (tenderError) {
      console.error(`Failed to upsert tender ${tender.slug}:`, tenderError.message);
      continue;
    }

    // Child rows are replaced wholesale on each run rather than diffed —
    // simplest way to stay idempotent for a seed script.
    await supabase.from("tender_requirements").delete().eq("tender_id", tender.id);
    await supabase.from("tender_key_dates").delete().eq("tender_id", tender.id);
    await supabase.from("tender_risks").delete().eq("tender_id", tender.id);

    const requirementRows = [
      ...qualifications.map((r, i) => ({ ...r, kind: "qualification" as const, sort_order: i })),
      ...experienceRequirements.map((r, i) => ({ ...r, kind: "experience" as const, sort_order: i })),
      ...requiredDocuments.map((r, i) => ({ ...r, kind: "document" as const, sort_order: i })),
    ].map((r) => ({
      id: r.id,
      tender_id: tender.id,
      kind: r.kind,
      title: r.title,
      description: r.description,
      mandatory: r.mandatory,
      source_reference: r.sourceReference ?? null,
      sort_order: r.sort_order,
    }));

    if (requirementRows.length > 0) {
      const { error } = await supabase.from("tender_requirements").insert(requirementRows);
      if (error) console.error(`Failed to insert requirements for ${tender.slug}:`, error.message);
    }

    if (keyDates.length > 0) {
      const { error } = await supabase.from("tender_key_dates").insert(
        keyDates.map((d) => ({
          id: d.id,
          tender_id: tender.id,
          type: d.type,
          date: d.date,
          mandatory: d.mandatory ?? null,
          notes: d.notes ?? null,
        })),
      );
      if (error) console.error(`Failed to insert key dates for ${tender.slug}:`, error.message);
    }

    if (risks.length > 0) {
      const { error } = await supabase.from("tender_risks").insert(
        risks.map((r) => ({
          id: r.id,
          tender_id: tender.id,
          level: r.level,
          title: r.title,
          description: r.description,
          source_reference: r.sourceReference ?? null,
        })),
      );
      if (error) console.error(`Failed to insert risks for ${tender.slug}:`, error.message);
    }

    console.log(`Seeded: ${tender.slug}`);
  }

  console.log(`Done. Seeded ${tenders.length} tenders.`);
}

main();
