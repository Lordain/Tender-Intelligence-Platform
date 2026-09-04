import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { analyzeUploadedDocument } from "@/lib/ingestion/analyze-uploaded-document";

/**
 * Web-form counterpart to the two-step CLI flow (npm run ingest:documents
 * + npm run extract:document) — see app/admin/analyze-document/page.tsx
 * and lib/ingestion/analyze-uploaded-document.ts for the full story.
 *
 * A real extraction call can take anywhere from several seconds to a
 * couple of minutes (PDF chunking on an oversized scanned document is
 * the slow case) — this stays a single synchronous request/response
 * since this runs on the admin's own `next dev` server, not a rate-
 * limited serverless function.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set. See .env.example." }, { status: 500 });
  }

  const form = await request.formData();
  const tenderSlug = form.get("tenderSlug");
  if (typeof tenderSlug !== "string" || !tenderSlug.trim()) {
    return NextResponse.json({ error: "tenderSlug is required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  const precise = form.get("precise") === "true";
  const write = form.get("write") === "true";
  const force = form.get("force") === "true";

  if (!precise && !process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json(
      { error: "DASHSCOPE_API_KEY isn't set (needed for auto-routing's qwen3.5-plus path — check '精度分析' to skip it and force claude-opus-5). See .env.example." },
      { status: 500 },
    );
  }

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await analyzeUploadedDocument(supabase!, tenderSlug.trim(), { buffer, fileName: file.name }, { precise, write, force });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
