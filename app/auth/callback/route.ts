import { NextResponse } from "next/server";
import { getSupabaseServerUserClient } from "@/lib/supabase/server-client";

// Handles the redirect back from both magic-link email and Google OAuth —
// both use the PKCE "code" exchange flow under @supabase/ssr.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await getSupabaseServerUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
