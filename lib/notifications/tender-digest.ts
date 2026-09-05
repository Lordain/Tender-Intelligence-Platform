import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

type DigestTender = {
  id: string;
  slug: string;
  title: { zh?: string; es?: string; en?: string };
  country: string;
  industries: string[];
  status: string;
  relevance_tier: string | null;
  created_at: string;
};

type Preference = {
  user_id: string;
  enabled: boolean;
  countries: string[];
  industries: string[];
  statuses: string[];
  relevance_tiers: string[];
};

export type DigestRecipient = Preference & { email: string };

export function notificationsEnabled() {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
}

function matches(tender: DigestTender, preference: Preference) {
  return (
    (preference.countries.length === 0 || preference.countries.includes(tender.country)) &&
    (preference.industries.length === 0 || tender.industries.some((industry) => preference.industries.includes(industry))) &&
    (preference.statuses.length === 0 || preference.statuses.includes(tender.status)) &&
    (preference.relevance_tiers.length === 0 || preference.relevance_tiers.includes(tender.relevance_tier ?? ""))
  );
}

export async function getDigestRecipients(): Promise<DigestRecipient[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("user_id, status, current_period_end")
    .in("status", ["active", "trialing"]);

  const subscribedIds = [...new Set((subscriptions ?? [])
    .filter((subscription) => !subscription.current_period_end || new Date(subscription.current_period_end) >= new Date())
    .map((subscription) => subscription.user_id))];
  if (subscribedIds.length === 0) return [];

  const { data: preferences } = await supabase
    .from("email_notification_preferences")
    .select("user_id, enabled, countries, industries, statuses, relevance_tiers")
    .in("user_id", subscribedIds)
    .eq("enabled", true);

  const enabled = (preferences ?? []) as Preference[];
  if (enabled.length === 0) return [];

  const usersById = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const user of data.users) {
      if (user.email) usersById.set(user.id, user.email);
    }
    if (data.users.length < 1000) break;
  }

  return enabled.flatMap((preference) => {
    const email = usersById.get(preference.user_id);
    return email ? [{ ...preference, email }] : [];
  });
}

export async function getNewTenders(windowStart: Date, windowEnd: Date): Promise<DigestTender[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tenders")
    .select("id, slug, title, country, industries, status, relevance_tier, created_at")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to read new tenders for email digest:", error.message);
    return [];
  }
  return (data ?? []) as DigestTender[];
}

export function matchingTenders(tenders: DigestTender[], preference: Preference) {
  return tenders.filter((tender) => matches(tender, preference)).slice(0, 20);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendTenderDigestEmail(recipient: DigestRecipient, tenders: DigestTender[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) throw new Error("Email delivery is not fully configured");

  const rows = tenders.map((tender) => {
    const title = tender.title.zh || tender.title.es || tender.title.en || "新招标项目";
    const url = new URL(`/tenders/${tender.slug}`, appUrl).toString();
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #e5e9eb"><strong style="color:#071826">${escapeHtml(title)}</strong><br><span style="color:#64717c;font-size:13px">${escapeHtml(tender.country)} · ${escapeHtml(tender.industries.join("、"))}</span><br><a href="${url}" style="display:inline-block;margin-top:10px;background:#ffb21c;color:#071826;padding:9px 14px;border-radius:8px;font-weight:700;text-decoration:none">查看项目</a></td></tr>`;
  }).join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient.email],
      subject: `拉美招投标平台｜${tenders.length} 个符合您配置的新招标项目`,
      html: `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e"><h1 style="color:#071826">您关注的新招标项目</h1><p>以下项目符合您在账户中设置的通知条件：</p><table width="100%" cellspacing="0" cellpadding="0">${rows}</table><p style="margin-top:24px;font-size:12px">通知时间：墨西哥城时间每日 09:00 与 18:00。可在账户页面调整通知条件。</p></main>`,
    }),
  });

  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? "Resend rejected the email");
  return result?.id ?? null;
}
