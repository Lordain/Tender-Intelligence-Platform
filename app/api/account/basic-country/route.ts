import { NextResponse } from "next/server";
import { z } from "zod";
import { BASIC_PLAN_COUNTRY_LIMIT } from "@/lib/access-control";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const country = z.enum(["Mexico", "Brazil", "Colombia", "Peru", "Chile", "Argentina", "Dominican Republic", "Panama", "Ecuador", "Bolivia"]);
const schema = z.object({ countries: z.array(country).min(1).max(BASIC_PLAN_COUNTRY_LIMIT) });

/**
 * Adds countries to a 基础个人版 subscription, up to BASIC_PLAN_COUNTRY_LIMIT.
 * A pick is permanent for the subscription: countries already chosen are kept,
 * and only the remaining slots can be filled.
 */
export async function POST(request: Request) {
  const [user, entitlement] = await Promise.all([getCurrentUser(), getViewerEntitlement()]);
  if (!user || entitlement.role !== "subscriber" || entitlement.plan !== "basic" || entitlement.subscriptionOwnerUserId !== user.id) {
    return NextResponse.json({ error: "仅基础个人版订阅者可以选择国家。" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择有效的国家。" }, { status: 400 });
  const chosen = entitlement.selectedCountries;
  const added = [...new Set(parsed.data.countries)].filter((item) => !chosen.includes(item));
  if (added.length === 0) return NextResponse.json({ countries: chosen });
  if (chosen.length + added.length > BASIC_PLAN_COUNTRY_LIMIT) {
    return NextResponse.json({ error: `基础个人版最多选择 ${BASIC_PLAN_COUNTRY_LIMIT} 个国家。` }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "服务暂不可用。" }, { status: 503 });
  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("id").eq("user_id", user.id).eq("plan", "basic")
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (subscriptionError || !subscription) return NextResponse.json({ error: "未找到有效订阅。" }, { status: 409 });
  // One insert, so both countries land or neither does. The (subscription_id,
  // slot) key turns a concurrent request for the same slot into 23505.
  const { error } = await admin.from("basic_plan_countries").insert(
    added.map((item, index) => ({ subscription_id: subscription.id, country: item, slot: chosen.length + index + 1 })),
  );
  if (error && error.code !== "23505") return NextResponse.json({ error: "国家保存失败。" }, { status: 500 });
  const { data } = await admin.from("basic_plan_countries").select("country, selected_at").eq("subscription_id", subscription.id).order("selected_at");
  const countries = (data ?? []).map((row) => row.country as string);
  if (error && !added.every((item) => countries.includes(item))) {
    return NextResponse.json({ error: "国家选择已更新，请刷新页面后再试。", countries }, { status: 409 });
  }
  // The daily reminder used to be pinned to the one country (saved as
  // [that country]); left as is, it would never mention the new one. Clearing
  // it means every country the plan covers — the subscriber can narrow it
  // again on /notifications.
  if (chosen.length > 0) await admin.from("email_notification_preferences").update({ countries: [] }).eq("user_id", user.id);
  return NextResponse.json({ countries });
}
