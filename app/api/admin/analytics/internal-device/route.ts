import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { INTERNAL_TRAFFIC_COOKIE, internalTrafficCookieOptions } from "@/lib/analytics-internal";

export async function POST() {
  const admin = await getAdminUser().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const response = NextResponse.json({ marked: true });
  response.cookies.set(INTERNAL_TRAFFIC_COOKIE, "1", internalTrafficCookieOptions());
  return response;
}

export async function DELETE() {
  const admin = await getAdminUser().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const response = NextResponse.json({ marked: false });
  response.cookies.set(INTERNAL_TRAFFIC_COOKIE, "", internalTrafficCookieOptions(0));
  return response;
}

