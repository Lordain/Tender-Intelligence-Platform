import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

type HomepageControlBody = {
  featuredCount?: number;
  tickerCount?: number;
  featuredSlugs?: string[];
  tickerSlugs?: string[];
};

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 50;
}

function validSlugs(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 50
    && value.every((slug) => typeof slug === "string" && slug.length > 0 && slug.length <= 240)
    && new Set(value).size === value.length;
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as HomepageControlBody;
  if (!validCount(body.featuredCount) || !validCount(body.tickerCount)) {
    return NextResponse.json({ error: "显示数量必须是 0–50 的整数。" }, { status: 400 });
  }
  if (!validSlugs(body.featuredSlugs) || !validSlugs(body.tickerSlugs)) {
    return NextResponse.json({ error: "项目清单格式不正确或包含重复项目。" }, { status: 400 });
  }
  const overlap = body.featuredSlugs.find((slug) => body.tickerSlugs!.includes(slug));
  if (overlap) return NextResponse.json({ error: "同一项目不能同时用于免费展示与滚动预览。" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const requestedSlugs = [...body.featuredSlugs, ...body.tickerSlugs];
  if (requestedSlugs.length > 0) {
    const { data, error } = await supabase.from("tenders").select("slug").in("slug", requestedSlugs);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((data?.length ?? 0) !== requestedSlugs.length) {
      return NextResponse.json({ error: "部分项目已不存在，请刷新页面后重新选择。" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("site_settings").upsert([
    { key: "homepage_featured_count", value: body.featuredCount, updated_at: now },
    { key: "homepage_ticker_count", value: body.tickerCount, updated_at: now },
    { key: "homepage_featured_slugs", value: body.featuredSlugs, updated_at: now },
    { key: "homepage_ticker_slugs", value: body.tickerSlugs, updated_at: now },
  ], { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/");
  revalidatePath("/admin/homepage");
  return NextResponse.json({ ok: true });
}
