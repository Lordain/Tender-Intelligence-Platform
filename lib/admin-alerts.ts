import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin-facing alert log (2026-09-04, per the user's request: "如 token
 * 消耗完了，或者 API 连接有问题"). A real Anthropic/DashScope
 * quota/rate-limit error or a network failure from one of the admin web
 * tools (translate-tenders, analyze-document — the two API routes that
 * call an LLM directly) gets recorded here instead of only ever showing
 * as a one-off error box on whatever page happened to be open.
 * AdminShell reads unresolved rows and renders a banner on every
 * /admin/* page.
 *
 * Deliberately NOT wired into every CLI script — those already print
 * their own errors straight to the terminal the person running them is
 * watching, which is a fine notification channel on its own. This only
 * covers the two web-triggered paths that could otherwise fail silently
 * for an admin who isn't staring at that exact page when it happens.
 */
export type AdminAlertKind = "quota" | "connection" | "other";

const QUOTA_PATTERNS = [
  /insufficient[_ ]?quota/i,
  /rate[_ ]?limit/i,
  /429/,
  /credit balance/i,
  /balance is too low/i,
  /overloaded/i,
];

const CONNECTION_PATTERNS = [
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /enotfound/i,
  /fetch failed/i,
  /network/i,
  /timeout/i,
  /getaddrinfo/i,
];

export function classifyApiError(err: unknown): { kind: AdminAlertKind; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (QUOTA_PATTERNS.some((p) => p.test(message))) return { kind: "quota", message };
  if (CONNECTION_PATTERNS.some((p) => p.test(message))) return { kind: "connection", message };
  return { kind: "other", message };
}

/** Best-effort — an alert failing to log should never mask the original error being handled. */
export async function logAdminAlert(supabase: SupabaseClient | null, source: string, err: unknown): Promise<void> {
  if (!supabase) return;
  const { kind, message } = classifyApiError(err);
  try {
    await supabase.from("admin_alerts").insert({ kind, message: message.slice(0, 2000), source });
  } catch {
    // logging the alert is itself best-effort — swallow
  }
}
