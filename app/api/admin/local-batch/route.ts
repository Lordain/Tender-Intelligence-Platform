import { NextResponse } from "next/server";
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { analyzeLocalFolder } from "@/lib/ingestion/analyze-local-folder";
import { revalidateTenders } from "@/lib/cache-tags";

export const runtime = "nodejs";
/**
 * Local-only by design. This route reads a folder path off the SERVER's own
 * filesystem, which is the whole point when the server is `npm run dev` on
 * the operator's laptop — the 100MB tender document is already there — and
 * exactly what must never exist on a deployed instance, where the path would
 * address Vercel's filesystem and the endpoint would be an arbitrary-path
 * file reader behind nothing but an admin cookie.
 *
 * Checked at request time rather than by not shipping the file: a build-time
 * exclusion is easy to get wrong and silent when it is.
 */
function localOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "本地批量分析只能在本机运行（npm run dev），线上部署没有你的文件。" },
      { status: 404 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = localOnly();
  if (blocked) return blocked;

  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { folderPath?: string; write?: boolean; force?: boolean };
  const folderPath = body.folderPath?.trim();
  if (!folderPath) return NextResponse.json({ error: "请填写文件夹路径。" }, { status: 400 });
  // Absolute only: a relative path resolves against the dev server's own
  // working directory, which is somewhere in the repo and never where the
  // downloaded documents are — the resulting "0 files found" would look like
  // a matching bug rather than a typo.
  if (!isAbsolute(folderPath)) {
    return NextResponse.json({ error: "请使用完整路径（例如 D:\\\\tenders\\\\2026-09）。" }, { status: 400 });
  }
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    return NextResponse.json({ error: `找不到文件夹：${folderPath}` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  try {
    const result = await analyzeLocalFolder(supabase, folderPath, {
      write: body.write === true,
      force: body.force === true,
    });
    if (body.write === true) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
