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
export type StatusChange = {
  tender: DigestTender;
  previousStatus: string;
  nextStatus: string;
};

export function notificationsEnabled() {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
}

function matches(tender: DigestTender, preference: Preference, statusOverride?: string[]) {
  const statuses = statusOverride ?? [tender.status];
  return (
    (preference.countries.length === 0 || preference.countries.includes(tender.country)) &&
    (preference.industries.length === 0 || tender.industries.some((industry) => preference.industries.includes(industry))) &&
    (preference.statuses.length === 0 || statuses.some((status) => preference.statuses.includes(status))) &&
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

export async function getStatusChanges(windowStart: Date, windowEnd: Date): Promise<StatusChange[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tender_status_history")
    .select("previous_status, next_status, tenders ( id, slug, title, country, industries, status, relevance_tier, created_at )")
    .gte("changed_at", windowStart.toISOString())
    .lt("changed_at", windowEnd.toISOString())
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to read tender status changes for email digest:", error.message);
    return [];
  }
  return (data ?? []).flatMap((row) => {
    const tender = row.tenders as unknown as DigestTender | null;
    return tender ? [{ tender, previousStatus: row.previous_status as string, nextStatus: row.next_status as string }] : [];
  });
}

export function matchingTenders(tenders: DigestTender[], preference: Preference) {
  return tenders.filter((tender) => matches(tender, preference)).slice(0, 20);
}

export function matchingStatusChanges(changes: StatusChange[], preference: Preference) {
  return changes.filter((change) => matches(change.tender, preference, [change.previousStatus, change.nextStatus])).slice(0, 20);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendTenderDigestEmail(recipient: DigestRecipient, tenders: DigestTender[], statusChanges: StatusChange[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) throw new Error("Email delivery is not fully configured");

  const tenderRows = tenders.map((tender) => {
    const title = tender.title.zh || tender.title.es || tender.title.en || "新招标项目";
    const url = new URL(`/tenders/${tender.slug}`, appUrl).toString();
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #e5e9eb"><strong style="color:#071826">${escapeHtml(title)}</strong><br><span style="color:#64717c;font-size:13px">${escapeHtml(tender.country)} · ${escapeHtml(tender.industries.join("、"))}</span><br><a href="${url}" style="display:inline-block;margin-top:10px;background:#ffb21c;color:#071826;padding:9px 14px;border-radius:8px;font-weight:700;text-decoration:none">查看项目</a></td></tr>`;
  }).join("");
  const statusRows = statusChanges.map(({ tender, previousStatus, nextStatus }) => {
    const title = tender.title.zh || tender.title.es || tender.title.en || "招标项目";
    const url = new URL(`/tenders/${tender.slug}`, appUrl).toString();
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #e5e9eb"><strong style="color:#071826">${escapeHtml(title)}</strong><br><span style="color:#64717c;font-size:13px">状态更新：${escapeHtml(previousStatus)} → ${escapeHtml(nextStatus)}</span><br><a href="${url}" style="display:inline-block;margin-top:10px;background:#ffb21c;color:#071826;padding:9px 14px;border-radius:8px;font-weight:700;text-decoration:none">查看项目</a></td></tr>`;
  }).join("");
  const subjectParts = [tenders.length > 0 ? `${tenders.length} 个新标` : "", statusChanges.length > 0 ? `${statusChanges.length} 项状态更新` : ""].filter(Boolean).join("，");
  const sections = `${tenders.length > 0 ? `<h2 style="color:#071826;font-size:18px">新发布项目</h2><table width="100%" cellspacing="0" cellpadding="0">${tenderRows}</table>` : ""}${statusChanges.length > 0 ? `<h2 style="color:#071826;font-size:18px;margin-top:28px">项目状态更新</h2><table width="100%" cellspacing="0" cellpadding="0">${statusRows}</table>` : ""}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient.email],
      subject: `拉美招投标平台｜${subjectParts}`,
      html: `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e"><h1 style="color:#071826">您的招标动态</h1><p>以下内容符合您在账户中设置的通知条件：</p>${sections}<p style="margin-top:24px;font-size:12px">通知时间：墨西哥城时间每日 09:00 与 18:00。可在账户页面调整通知条件。</p></main>`,
    }),
  });

  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? "Resend rejected the email");
  return result?.id ?? null;
}
