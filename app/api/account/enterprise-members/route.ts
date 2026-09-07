import { NextRequest, NextResponse } from "next/server";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

async function ownerContext() {
  const [user, entitlement] = await Promise.all([getCurrentUser(), getViewerEntitlement()]);
  const admin = createSupabaseAdminClient();
  return user && admin && entitlement.isEnterpriseOwner ? { user, admin } : null;
}

export async function GET() {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const { data, error } = await context.admin.from("enterprise_members").select("id, email, member_user_id, created_at").eq("owner_user_id", context.user.id).order("created_at");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ members: data ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const email = String((await request.json()).email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
  if (email === context.user.email?.toLowerCase()) return NextResponse.json({ error: "该邮箱已是企业主账号。" }, { status: 400 });
  const { count } = await context.admin.from("enterprise_members").select("id", { count: "exact", head: true }).eq("owner_user_id", context.user.id);
  if ((count ?? 0) >= 2) return NextResponse.json({ error: "企业版最多包含 3 个账号（主账号 + 2 个成员）。" }, { status: 400 });
  let existingUserId: string | null = null;
  for (let page = 1; !existingUserId; page += 1) {
    const { data: users, error: usersError } = await context.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) break;
    existingUserId = users.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
    if (users.users.length < 1000) break;
  }
  const { data, error } = await context.admin.from("enterprise_members").insert({ owner_user_id: context.user.id, email, member_user_id: existingUserId }).select("id, email, member_user_id, created_at").single();
  return error ? NextResponse.json({ error: error.code === "23505" ? "该邮箱已添加。" : error.message }, { status: 400 }) : NextResponse.json({ member: data });
}

export async function DELETE(request: NextRequest) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少成员 ID。" }, { status: 400 });
  const { error } = await context.admin.from("enterprise_members").delete().eq("id", id).eq("owner_user_id", context.user.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
