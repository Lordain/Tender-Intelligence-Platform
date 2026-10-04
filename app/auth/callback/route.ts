import { NextResponse } from "next/server";
import { getSupabaseServerUserClient } from "@/lib/supabase/server-client";
import { safeNextPath } from "@/lib/auth-redirect";

// Handles the redirect back from both magic-link email and Google OAuth —
// both use the PKCE "code" exchange flow under @supabase/ssr.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await getSupabaseServerUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Supabase reports a failed link (expired, already used) as error_code on
  // this redirect; pass it on so /login can say which it was.
  const errorCode = searchParams.get("error_code");
  const detail = errorCode && /^[a-z_]{1,64}$/.test(errorCode) ? `&error_code=${errorCode}` : "";
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed${detail}`);
}
