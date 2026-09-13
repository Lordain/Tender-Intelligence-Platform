import { NextRequest, NextResponse } from "next/server";
import { describeDevice, devicesToRevoke, MAX_ACTIVE_DEVICES, type DeviceRow } from "@/lib/account-devices";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * The device cap, enforced here because nothing else can enforce it: the
 * Supabase admin API can revoke a session only when handed that session's
 * own JWT, which the server never holds for another browser (see migration
 * 0046). So a browser announces itself on every page load and this route
 * decides whether it is still one of the allowed ones.
 *
 * POST is the heartbeat and the enforcement point. GET and DELETE are the
 * escape hatch: without a way for the owner to see and remove their own
 * devices, every "我换电脑了" becomes a manual database edit.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context() {
  const user = await getCurrentUser();
  const admin = createSupabaseAdminClient();
  return user && admin ? { user, admin } : null;
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  // Signed out is not an error here: the heartbeat fires from a component
  // mounted for everyone, and a guest simply has no devices to count.
  if (!ctx) return NextResponse.json({ status: "anonymous" });

  const deviceId = String((await request.json().catch(() => ({}))).deviceId ?? "");
  if (!UUID.test(deviceId)) return NextResponse.json({ error: "缺少设备标识。" }, { status: 400 });

  const now = new Date().toISOString();
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 400);

  // Registering BEFORE counting is what makes the caller safe: its
  // last_seen_at is now the newest, so devicesToRevoke can never choose it.
  // onConflict keeps first_seen_at and clears a previous revocation — a
  // browser that was evicted and comes back is a returning device, not a
  // new one, which is also why rows are kept rather than deleted.
  const { error: upsertError } = await ctx.admin.from("account_devices").upsert(
    { user_id: ctx.user.id, device_id: deviceId, user_agent: userAgent, last_seen_at: now, revoked_at: null },
    { onConflict: "user_id,device_id" },
  );
  if (upsertError) {
    // A failure to register must not sign anybody out. The cap is a revenue
    // guardrail; losing a paying customer's session to a transient database
    // error costs more than the sharing it exists to discourage.
    console.error("account_devices upsert failed:", upsertError.message);
    return NextResponse.json({ status: "ok", limit: MAX_ACTIVE_DEVICES });
  }

  const { data, error } = await ctx.admin.from("account_devices")
    .select("device_id, last_seen_at").eq("user_id", ctx.user.id).is("revoked_at", null);
  if (error) {
    console.error("account_devices read failed:", error.message);
    return NextResponse.json({ status: "ok", limit: MAX_ACTIVE_DEVICES });
  }

  const active = (data ?? []) as DeviceRow[];
  const revoke = devicesToRevoke(active);
  if (revoke.length > 0) {
    await ctx.admin.from("account_devices").update({ revoked_at: now })
      .eq("user_id", ctx.user.id).in("device_id", revoke);
  }

  return NextResponse.json({
    status: "ok",
    active: Math.min(active.length, MAX_ACTIVE_DEVICES),
    limit: MAX_ACTIVE_DEVICES,
    // What the caller's own browser needs to know: it was signed out
    // elsewhere. It is never in `revoke` — see devicesToRevoke — so this
    // only becomes true when another browser evicted it since last beat.
    evicted: revoke.includes(deviceId),
  });
}

export async function GET(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ devices: [] });

  const current = new URL(request.url).searchParams.get("deviceId") ?? "";
  const { data, error } = await ctx.admin.from("account_devices")
    .select("device_id, user_agent, first_seen_at, last_seen_at")
    .eq("user_id", ctx.user.id).is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    limit: MAX_ACTIVE_DEVICES,
    devices: (data ?? []).map((row) => ({
      deviceId: row.device_id,
      label: describeDevice(row.user_agent),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      isCurrent: row.device_id === current,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const deviceId = new URL(request.url).searchParams.get("deviceId") ?? "";
  if (!UUID.test(deviceId)) return NextResponse.json({ error: "缺少设备标识。" }, { status: 400 });

  const { error } = await ctx.admin.from("account_devices").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id).eq("device_id", deviceId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
