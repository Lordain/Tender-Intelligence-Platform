import { NextResponse } from "next/server";
import { getViewerEntitlement } from "@/lib/access-control-server";

export async function GET() {
  return NextResponse.json(await getViewerEntitlement());
}
