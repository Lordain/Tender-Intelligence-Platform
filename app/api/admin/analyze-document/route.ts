import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { analyzeUploadedDocument } from "@/lib/ingestion/analyze-uploaded-document";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * Web-form counterpart to the two-step CLI flow (npm run ingest:documents
 * + npm run extract:document) — see components/admin/BatchAnalyzeDocument
 * Form.tsx and lib/ingestion/analyze-uploaded-document.ts for the full
 * story. Accepts one or more "file" entries for the same tenderSlug
 * (2026-09-06) — a single tender's own document package is routinely
 * split across several PDFs (Pliego + Anexos), analyzed together as one
 * merged result rather than one call per file silently overwriting the
 * last one's.
 *
 * A real extraction call can take anywhere from several seconds to a
 * couple of minutes (PDF chunking on an oversized scanned document is
 * the slow case) — this stays a single synchronous request/response
 * since this runs on the admin's own `next dev` server, not a rate-
 * limited serverless function.
 */
// Real tender packages run large (multi-hundred-page scanned bid documents
// are the normal case this pipeline is built for — see the module comment
// above), so this is deliberately generous per file, not a tight cap. It
// exists only to reject a mistaken multi-GB upload before it's ever
// buffered into memory (Buffer.from(await file.arrayBuffer()) below loads
// each file at once) or sent to an LLM at real token/dollar cost. If a
// genuine tender document is ever rejected here, raise this constant
// rather than route around the check.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// A tender's own document package (Pliego + its Anexos) is a handful of
// files, not dozens. This is the ceiling that actually matters for cost:
// every accepted file is one more real LLM call at real token spend, and
// nothing else downstream limits how many arrive in a single request.
const MAX_FILES_PER_REQUEST = 10;
// Whole-request ceiling, checked pre-parse from the content-length header.
// Not MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST — request.formData() below
// buffers the ENTIRE multipart body into this process's memory at once,
// so this is a memory ceiling, deliberately far below what the per-file
// limits would multiply out to.
const MAX_TOTAL_UPLOAD_BYTES = 150 * 1024 * 1024;
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
  if (contentLength > MAX_TOTAL_UPLOAD_BYTES) {
    return NextResponse.json({ error: `文件总大小过大（超过 ${MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024}MB），请拆分或压缩后重新上传。` }, { status: 413 });
  }

  const form = await request.formData();
  const tenderSlug = form.get("tenderSlug");
  if (typeof tenderSlug !== "string" || !tenderSlug.trim()) {
    return NextResponse.json({ error: "tenderSlug is required" }, { status: 400 });
  }

  const uploadedFiles = form.getAll("file");
  if (uploadedFiles.length === 0 || !uploadedFiles.every((f): f is File => f instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }
  if (uploadedFiles.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `一次最多分析 ${MAX_FILES_PER_REQUEST} 个文件（本次 ${uploadedFiles.length} 个）——每个文件都是一次真实的模型调用。` },
      { status: 400 },
    );
  }

  // Belt-and-suspenders re-check against the actual parsed files (content-
  // length can be absent/inaccurate on some clients) — and a real type
  // check server-side, since the form's accept=".pdf,.docx,.doc" is only a
  // client-side hint an attacker or a mistaken drag-drop can bypass.
  for (const file of uploadedFiles) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `「${file.name}」过大（超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB），请拆分或压缩后重新上传。` }, { status: 413 });
    }
    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ error: `「${file.name}」类型不支持，仅支持 ${ALLOWED_EXTENSIONS.join("/")}` }, { status: 400 });
    }
  }

  const write = form.get("write") === "true";
  const force = form.get("force") === "true";

  if (!process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json(
      { error: "DASHSCOPE_API_KEY isn't set (needed for auto-routing's Qwen path). See .env.example." },
      { status: 500 },
    );
  }

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });
  }

  const files = await Promise.all(
    uploadedFiles.map(async (file) => ({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name })),
  );

  try {
    const result = await analyzeUploadedDocument(supabase!, tenderSlug.trim(), files, { write, force });
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "analyze-document", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
