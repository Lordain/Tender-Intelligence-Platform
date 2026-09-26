import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { findStaleCronJobs } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure, resolveOpsFailure } from "@/lib/notifications/ops-alert";

const NO_PERIOD_END_SOURCE = "subscriptions:no-period-end";

/**
 * A live subscription with no current_period_end is entitled for as long as
 * it stays live — isSubscriptionEntitled() treats a missing end as "no end".
 * Stripe always sends one, so such a row can only come from a hand edit or a
 * legacy import; there were none on 2026-09-26. The rule is deliberately NOT
 * tightened (that would cut off whoever such a row belongs to without anyone
 * looking first); instead the row is surfaced here, on the banner every admin
 * page already shows, so a person decides. Resolves itself once fixed.
 */
async function flagSubscriptionsWithoutPeriodEnd(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan, status")
    .in("status", ["active", "trialing"])
    .is("current_period_end", null)
    .limit(20);
  if (error) return;
  if (!data || data.length === 0) {
    await resolveOpsFailure(supabase, NO_PERIOD_END_SOURCE);
    return;
  }
  await reportOpsFailure(supabase, {
    source: NO_PERIOD_END_SOURCE,
    title: "有效订阅缺少到期日",
    message: `${data.length}${data.length === 20 ? "+" : ""} 条 active/trialing 订阅没有 current_period_end，会被视为永久有效。请在 Supabase 核对并补上到期日：${data.map((row) => `${row.id}（${row.plan}/${row.status}）`).join("，")}`,
  });
}

/**
 * Backs AdminAlertBanner.tsx (rendered in AdminShell on every /admin/*
 * page) — GET returns unresolved admin_alerts rows, PATCH marks one
 * resolved. See lib/admin-alerts.ts for what writes these rows.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ alerts: [] });

  await flagSubscriptionsWithoutPeriodEnd(supabase);

  // Two different questions, answered together because one banner shows both:
  // what failed (admin_alerts), and what should have run and did not
  // (cron_heartbeats, migration 0041). A stale job has no row to dismiss —
  // it stops being reported when the job runs again, not when an admin
  // acknowledges it.
  const [alerts, staleJobs] = await Promise.all([
    supabase
      .from("admin_alerts")
      .select("id, kind, message, source, created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    findStaleCronJobs(supabase),
  ]);

  if (alerts.error) return NextResponse.json({ error: alerts.error.message }, { status: 500 });
  return NextResponse.json({ alerts: alerts.data ?? [], staleJobs });
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { id?: string; resolveAll?: boolean };

  if (body.resolveAll) {
    const { error } = await supabase.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).is("resolved_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
