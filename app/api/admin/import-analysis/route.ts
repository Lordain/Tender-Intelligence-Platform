import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { importBatchAnalysis, type ImportBatchAnalysisResult } from "@/lib/ingestion/import-batch-analysis";
import type { TenderExtraction } from "@/lib/ingestion/extract-requirements";

/**
 * Web-form counterpart to `npm run import:batch-analysis` (see
 * app/admin/import-analysis/page.tsx) — takes one or more
 * analyze-batch.ts export JSON files uploaded through the browser instead
 * of a local file path, and writes through the same
 * lib/ingestion/import-batch-analysis.ts function the CLI script uses.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
  }

  const write = form.get("write") === "true";
  const force = form.get("force") === "true";

  let raws: Record<string, TenderExtraction>[];
  try {
    raws = await Promise.all(
      files.map(async (file) => JSON.parse(await file.text()) as Record<string, TenderExtraction>),
    );
  } catch (err) {
    return NextResponse.json({ error: `failed to parse a file as JSON: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  const documentCount = raws.reduce((sum, r) => sum + Object.keys(r).length, 0);

  let results: ImportBatchAnalysisResult[];
  try {
    results = await importBatchAnalysis(raws, { write, force });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({ fileCount: files.length, documentCount, results });
}
