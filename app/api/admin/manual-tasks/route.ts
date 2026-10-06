import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { MANUAL_TASKS, markManualTaskDone, readManualTasks, type ManualTaskId } from "@/lib/ops/manual-tasks";

/**
 * The admin's daily manual-import checklist (lib/ops/manual-tasks.ts). GET
 * says which are done today; POST {id} is 「今天看过了」 — the admin checked
 * the source and found nothing worth importing.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  return NextResponse.json({ tasks: await readManualTasks(createSupabaseAdminClient()) });
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const task = MANUAL_TASKS.find((entry) => entry.id === body.id);
  if (!task) return NextResponse.json({ error: "unknown task" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });
  await markManualTaskDone(supabase, task.id as ManualTaskId, "看过了，没有需要导入的");
  return NextResponse.json({ tasks: await readManualTasks(supabase) });
}
