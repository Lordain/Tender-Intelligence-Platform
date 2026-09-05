import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { analyzeUploadedDocument } from "@/lib/ingestion/analyze-uploaded-document";
import { logAdminAlert } from "@/lib/admin-alerts";

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
// Real tender packages run large (multi-hundred-page scanned bid documents
// are the normal case this pipeline is built for — see the module comment
// above), so this is deliberately generous, not a tight cap. It exists only
// to reject a mistaken multi-GB upload before it's ever buffered into
// memory (Buffer.from(await file.arrayBuffer()) below loads the whole file
// at once) or sent to an LLM at real token/dollar cost. If a genuine tender
// document is ever rejected here, raise this constant rather than route
// around the check.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc"];

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set. See .env.example." }, { status: 500 });
  }

  // Checked from the request header before the body is ever parsed —
  // request.formData() below buffers the entire multipart body into memory
  // first, so this is the only point a check can reject an oversized
  // upload before that buffering happens.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `文件过大（超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB），请拆分或压缩后重新上传。` }, { status: 413 });
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

  // Belt-and-suspenders re-check against the actual parsed file (content-
  // length can be absent/inaccurate on some clients) — and a real type
  // check server-side, since the form's accept=".pdf,.docx,.doc" is only a
  // client-side hint an attacker or a mistaken drag-drop can bypass.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `文件过大（超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB），请拆分或压缩后重新上传。` }, { status: 413 });
  }
  const lowerName = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return NextResponse.json({ error: `不支持的文件类型，仅支持 ${ALLOWED_EXTENSIONS.join("/")}` }, { status: 400 });
  }

  const write = form.get("write") === "true";
  const force = form.get("force") === "true";

  if (!process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json(
      { error: "DASHSCOPE_API_KEY isn't set (needed for auto-routing's qwen3.5-plus path). See .env.example." },
      { status: 500 },
    );
  }

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await analyzeUploadedDocument(supabase!, tenderSlug.trim(), { buffer, fileName: file.name }, { write, force });
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "analyze-document", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
