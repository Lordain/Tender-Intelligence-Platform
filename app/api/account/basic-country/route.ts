import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const schema = z.object({ country: z.enum(["Mexico", "Brazil", "Colombia", "Peru", "Chile"]) });

export async function POST(request: Request) {
  const [user, entitlement] = await Promise.all([getCurrentUser(), getViewerEntitlement()]);
  if (!user || entitlement.role !== "subscriber" || entitlement.plan !== "basic" || entitlement.subscriptionOwnerUserId !== user.id) {
    return NextResponse.json({ error: "仅基础个人版订阅者可以选择国家。" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择一个有效国家。" }, { status: 400 });
  if (entitlement.selectedCountry) return NextResponse.json({ country: entitlement.selectedCountry });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "服务暂不可用。" }, { status: 503 });
  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("id").eq("user_id", user.id).eq("plan", "basic")
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (subscriptionError || !subscription) return NextResponse.json({ error: "未找到有效订阅。" }, { status: 409 });
  const { error } = await admin.from("basic_plan_countries").insert({ subscription_id: subscription.id, country: parsed.data.country });
  if (error && error.code !== "23505") return NextResponse.json({ error: "国家保存失败。" }, { status: 500 });
  const { data } = await admin.from("basic_plan_countries").select("country").eq("subscription_id", subscription.id).single();
  return NextResponse.json({ country: data?.country ?? null });
}
