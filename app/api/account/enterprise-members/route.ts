import { NextRequest, NextResponse } from "next/server";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { sendEnterpriseInviteEmail } from "@/lib/notifications/enterprise-invite";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * The owner's side of enterprise seats. Adding an address here creates an
 * INVITATION, not a seat: it grants nothing until the person signed in as
 * that address accepts it in /api/account/invitations. See migration 0025 —
 * before it, typing an address here was enough to hand whoever registered
 * with it a full subscriber entitlement.
 */
async function ownerContext() {
  const [user, entitlement] = await Promise.all([getCurrentUser(), getViewerEntitlement()]);
  const admin = createSupabaseAdminClient();
  return user && admin && entitlement.isEnterpriseOwner ? { user, admin } : null;
}

export async function GET() {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const { data, error } = await context.admin.from("enterprise_members").select("id, email, member_user_id, status, responded_at, created_at").eq("owner_user_id", context.user.id).order("created_at");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ members: data ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const email = String((await request.json()).email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
  if (email === context.user.email?.toLowerCase()) return NextResponse.json({ error: "该邮箱已是企业主账号。" }, { status: 400 });

  // A declined invitation does not hold a seat — the owner can remove it and
  // invite someone else — so only pending and accepted rows count.
  const { count } = await context.admin.from("enterprise_members").select("id", { count: "exact", head: true })
    .eq("owner_user_id", context.user.id).in("status", ["pending", "accepted"]);
  if ((count ?? 0) >= 2) return NextResponse.json({ error: "企业版最多包含 3 个账号（主账号 + 2 个成员）。" }, { status: 400 });

  let existingUserId: string | null = null;
  for (let page = 1; !existingUserId; page += 1) {
    const { data: users, error: usersError } = await context.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) break;
    existingUserId = users.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
    if (users.users.length < 1000) break;
  }

  // member_user_id binds the invitation to an account so the invitee can find
  // it. Status stays 'pending' — binding is not consent.
  const { data, error } = await context.admin.from("enterprise_members")
    .insert({ owner_user_id: context.user.id, email, member_user_id: existingUserId, status: "pending" })
    .select("id, email, member_user_id, status, responded_at, created_at").single();
  if (error) {
    return NextResponse.json({ error: error.code === "23505" ? "该邮箱已添加。" : error.message }, { status: 400 });
  }

  const { data: profile } = await context.admin.from("profiles").select("company_name").eq("id", context.user.id).maybeSingle();
  const invitedBy = (profile?.company_name as string | null)?.trim() || context.user.email || "企业版主账号";
  // Best effort: the invitation row is already written, and the invitee sees
  // it in 账户管理 whether or not this reaches them.
  const notified = await sendEnterpriseInviteEmail(email, invitedBy);

  return NextResponse.json({ member: data, notified });
}

export async function DELETE(request: NextRequest) {
  const context = await ownerContext();
  if (!context) return NextResponse.json({ error: "仅企业版主账号可以管理成员。" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少成员 ID。" }, { status: 400 });
  const { error } = await context.admin.from("enterprise_members").delete().eq("id", id).eq("owner_user_id", context.user.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
