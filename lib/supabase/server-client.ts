import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Per-request Supabase client scoped to the signed-in user's session (via
 * cookies), for Server Components / Route Handlers that need to know who's
 * logged in. Distinct from lib/supabase/server.ts, which is a cached
 * service-role admin client used for public tender reads. Not cached —
 * cookies() is request-scoped and must be read fresh each time.
 */
export async function getSupabaseServerUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called from a Server Component in some cases (e.g. during
            // static rendering), where cookies can't be written — middleware.ts
            // handles refreshing the session cookie in that case instead.
          }
        },
      },
    },
  );
}

export async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = await getSupabaseServerUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
