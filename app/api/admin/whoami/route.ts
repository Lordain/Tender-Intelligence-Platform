import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";

/**
 * Lets a CLIENT component (AuthNav.tsx) know whether the current visitor is
 * an admin, so it can show/hide the "后台管理" nav link — without ever
 * shipping ADMIN_EMAILS itself to the browser bundle. Every real write
 * action still goes through getAdminUser() at its own route/layout (see
 * app/admin/tenders/layout.tsx and every app/api/admin/tenders/... route) —
 * this endpoint only decides whether to show a link, so it deliberately
 * never 403s; an unauthenticated or non-admin caller just gets `false`.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ isAdmin: isAdminEmail(user?.email) });
}
