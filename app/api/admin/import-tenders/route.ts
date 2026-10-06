import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { importNewTenders, type NewTendersSource } from "@/lib/ingestion/import-new-tenders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";

const VALID_SOURCES: NewTendersSource[] = ["comprasmx-open", "proyectos-estrategicos"];

/**
 * Web-form counterpart to `npm run ingest:comprasmx-open` / `npm run
 * ingest:proyectos-estrategicos` (see app/admin/import-tenders/page.tsx)
 * — takes a browser-uploaded export file instead of a local file path,
 * through the same lib/ingestion/import-new-tenders.ts function the CLI
 * scripts use.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const form = await request.formData();
  const source = form.get("source");
  if (typeof source !== "string" || !VALID_SOURCES.includes(source as NewTendersSource)) {
    return NextResponse.json({ error: `source must be one of: ${VALID_SOURCES.join(", ")}` }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  const write = form.get("write") === "true";
  const monthsRaw = form.get("months");
  const months = typeof monthsRaw === "string" && monthsRaw.trim() !== "" ? Number(monthsRaw) : undefined;
  const daysRaw = form.get("days");
  const days = typeof daysRaw === "string" && daysRaw.trim() !== "" ? Number(daysRaw) : undefined;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importNewTenders(source as NewTendersSource, { buffer, fileName: file.name }, { write, months, days });
    // The public list is cached; drop it so this edit shows up now.
    revalidateTenders();
    if (write) {
      await markManualTaskDone(createSupabaseAdminClient(), source === "comprasmx-open" ? "comprasmx" : "proyectos-estrategicos", `上传 ${file.name}，写入 ${result.upsertedCount ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
