import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * The invitee's side of an enterprise seat. An invitation only becomes an
 * entitlement when the person named on it accepts here, from a signed-in
 * session for that address — the invitation itself carries no token and
 * grants nothing (see migration 0025 and lib/notifications/enterprise-invite.ts).
 */
async function viewer() {
  const [user, admin] = [await getCurrentUser(), createSupabaseAdminClient()];
  return user?.email && admin ? { user, admin, email: user.email.toLowerCase() } : null;
}

export async function GET() {
  const context = await viewer();
  if (!context) return NextResponse.json({ invitations: [] });

  // Found by address, not by the bound member_user_id: the signup trigger only
  // binds people who registered AFTER being invited, so an invitation has to
  // stay findable by someone who already had an account when it was written.
  // Finding it is not accepting it — POST below is where consent happens.
  //
  // ilike, not an .or() filter string: interpolating an address into
  // PostgREST's filter grammar would make its own punctuation meaningful.
  // ilike's wildcards can only widen the match, and the exact comparison
  // below narrows it back to this account.
  const { data, error } = await context.admin
    .from("enterprise_members")
    .select("id, email, owner_user_id, created_at")
    .eq("status", "pending")
    .ilike("email", context.email)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).filter((row) => String(row.email).toLowerCase() === context.email);
  if (rows.length === 0) return NextResponse.json({ invitations: [] });

  // Show who is inviting them. company_name is what an owner sets in 账户管理;
  // fall back to the owner's address so the card is never anonymous.
  const ownerIds = [...new Set(rows.map((row) => row.owner_user_id as string))];
  const { data: profiles } = await context.admin.from("profiles").select("id, company_name").in("id", ownerIds);
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id as string, (profile.company_name as string | null) ?? ""]));

  const invitations = await Promise.all(rows.map(async (row) => {
    const ownerId = row.owner_user_id as string;
    let invitedBy = nameById.get(ownerId) || "";
    if (!invitedBy) {
      const { data: owner } = await context.admin.auth.admin.getUserById(ownerId);
      invitedBy = owner.user?.email ?? "企业版主账号";
    }
    return { id: row.id as string, invitedBy, createdAt: row.created_at as string };
  }));

  return NextResponse.json({ invitations });
}

export async function POST(request: NextRequest) {
  const context = await viewer();
  if (!context) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = body.action === "accept" ? "accepted" : body.action === "decline" ? "declined" : null;
  if (!id || !action) return NextResponse.json({ error: "缺少邀请 ID 或操作类型。" }, { status: 400 });

  const { data: invitation } = await context.admin
    .from("enterprise_members")
    .select("id, email, status")
    .eq("id", id)
    .maybeSingle();
  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ error: "邀请不存在或已处理。" }, { status: 404 });
  }
  // The authorization check: only the mailbox the invitation names may answer
  // it, and only while signed in as that address.
  if (String(invitation.email).toLowerCase() !== context.email) {
    return NextResponse.json({ error: "该邀请不属于当前账号。" }, { status: 403 });
  }

  const { error } = await context.admin
    .from("enterprise_members")
    .update({ status: action, member_user_id: context.user.id, responded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    // enterprise_members_accepted_member_idx: one accepted seat per person.
    const alreadySeated = error.code === "23505";
    return NextResponse.json(
      { error: alreadySeated ? "您已经加入了另一个企业版账号，请先退出后再接受。" : error.message },
      { status: alreadySeated ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, status: action });
}
