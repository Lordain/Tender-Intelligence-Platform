import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const eventSchema = z.object({
  eventType: z.enum(["page_view", "tender_open", "filter_apply", "tender_save", "tender_unsave"]),
  sessionId: z.uuid(),
  path: z.string().max(500).optional(),
  tenderId: z.uuid().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const ALLOWED_FILTER_DIMENSIONS = new Set(["country", "industry", "scope", "status", "tier", "sort", "view", "search"]);

export async function POST(request: NextRequest) {
  if (/bot|crawler|spider|slurp|preview/i.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.json({ accepted: false }, { status: 202 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const { eventType, sessionId, path, tenderId } = parsed.data;
  let properties = parsed.data.properties ?? {};

  if (eventType === "filter_apply") {
    const dimension = typeof properties.dimension === "string" ? properties.dimension : "";
    const values = Array.isArray(properties.values)
      ? properties.values.filter((value): value is string => typeof value === "string").slice(0, 20).map((value) => value.slice(0, 100))
      : [];
    if (!ALLOWED_FILTER_DIMENSIONS.has(dimension) || values.length === 0) {
      return NextResponse.json({ error: "Invalid filter event" }, { status: 400 });
    }
    properties = { dimension, values };
  } else {
    properties = {};
  }

  if (["tender_open", "tender_save", "tender_unsave"].includes(eventType) && !tenderId) {
    return NextResponse.json({ error: "Tender is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ accepted: false }, { status: 503 });
  }

  const user = await getCurrentUser().catch(() => null);
  const { error } = await supabase.from("analytics_events").insert({
    event_type: eventType,
    session_id: sessionId,
    user_id: user?.id ?? null,
    path: path?.slice(0, 500) ?? null,
    tender_id: tenderId ?? null,
    properties,
  });

  if (error) return NextResponse.json({ accepted: false }, { status: 503 });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
