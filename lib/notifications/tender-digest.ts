import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { escapeHtml } from "@/lib/notifications/escape-html";
import type { DigestRecipient } from "@/lib/notifications/digest-recipients";
import { countryLabel, industryLabel } from "@/lib/tender-labels";

export type DigestTender = {
  id: string;
  slug: string;
  title: { zh?: string; es?: string; en?: string };
  summary: { zh?: string; es?: string; en?: string };
  buyer: string;
  tender_number: string;
  country: string;
  industries: string[];
  status: string;
  relevance_tier: string | null;
  publication_date: string;
  created_at: string;
};

type Preference = {
  user_id: string;
  enabled: boolean;
  countries: string[];
  industries: string[];
  statuses: string[];
  relevance_tiers: string[];
  keywords: string[];
};

export { getDigestRecipients } from "@/lib/notifications/digest-recipients";
export type { DigestRecipient } from "@/lib/notifications/digest-recipients";
export type StatusChange = {
  tender: DigestTender;
  previousStatus: string;
  nextStatus: string;
  changedAt: string;
};

export type DigestPreferenceSummary = Pick<
  DigestRecipient,
  "countries" | "industries" | "statuses" | "relevance_tiers" | "keywords"
>;

export function notificationsEnabled() {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
}

function matches(tender: DigestTender, preference: Preference, statusOverride?: string[]) {
  const statuses = statusOverride ?? [tender.status];
  const searchableText = [
    tender.title.zh, tender.title.es, tender.title.en,
    tender.summary.zh, tender.summary.es, tender.summary.en,
    tender.buyer, tender.tender_number,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  return (
    (preference.countries.length === 0 || preference.countries.includes(tender.country)) &&
    (preference.industries.length === 0 || tender.industries.some((industry) => preference.industries.includes(industry))) &&
    (preference.statuses.length === 0 || statuses.some((status) => preference.statuses.includes(status))) &&
    (preference.relevance_tiers.length === 0 || preference.relevance_tiers.includes(tender.relevance_tier ?? "")) &&
    (preference.keywords.length === 0 || preference.keywords.some((keyword) => searchableText.includes(keyword.toLocaleLowerCase())))
  );
}

export async function getNewTenders(windowStart: Date, windowEnd: Date): Promise<DigestTender[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tenders")
    .select("id, slug, title, summary, buyer, tender_number, country, industries, status, relevance_tier, publication_date, created_at")
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
    .select("previous_status, next_status, changed_at, tenders ( id, slug, title, summary, buyer, tender_number, country, industries, status, relevance_tier, publication_date, created_at )")
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
    return tender ? [{
      tender,
      previousStatus: row.previous_status as string,
      nextStatus: row.next_status as string,
      changedAt: row.changed_at as string,
    }] : [];
  });
}

export function matchingTenders(tenders: DigestTender[], preference: Preference) {
  return tenders.filter((tender) => matches(tender, preference)).slice(0, 20);
}

export function matchingStatusChanges(changes: StatusChange[], preference: Preference) {
  return changes.filter((change) => matches(change.tender, preference, [change.previousStatus, change.nextStatus])).slice(0, 20);
}

const STATUS_EMAIL_LABELS: Record<string, string> = {
  planned: "规划中",
  open: "招标中",
  clarification: "澄清中",
  submission_closed: "已截止",
  awarded: "已中标",
  cancelled: "已取消",
};

const RELEVANCE_EMAIL_LABELS: Record<string, string> = {
  flagship: "大型项目",
  significant: "中型项目",
  standard: "常规项目",
  excluded: "日常服务类（排除）",
};

const EMAIL_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function statusEmailLabel(status: string): string {
  return STATUS_EMAIL_LABELS[status] ?? status;
}

function formatEmailDate(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}年${Number(dateOnly[2])}月${Number(dateOnly[3])}日`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : EMAIL_DATE_FORMATTER.format(date);
}

function preferenceValue(values: string[], allLabel: string, format: (value: string) => string = (value) => value): string {
  return values.length > 0 ? values.map(format).join("、") : allLabel;
}

function renderPreferenceSummary(preference: DigestPreferenceSummary): string {
  const rows = [
    ["国家", preferenceValue(preference.countries, "全部国家", (value) => countryLabel(value, "zh"))],
    ["行业", preferenceValue(preference.industries, "全部行业", (value) => industryLabel(value, "zh"))],
    ["项目阶段", preferenceValue(preference.statuses, "全部阶段", statusEmailLabel)],
    ["项目规模", preferenceValue(preference.relevance_tiers, "全部规模", (value) => RELEVANCE_EMAIL_LABELS[value] ?? value)],
    ["关键词", preferenceValue(preference.keywords, "不限关键词")],
  ];
  return rows.map(([label, value]) => `<tr><td style="width:74px;padding:4px 10px 4px 0;vertical-align:top;font-size:12px;font-weight:700;color:#64717c">${label}</td><td style="padding:4px 0;font-size:12px;line-height:1.55;color:#071826">${escapeHtml(value)}</td></tr>`).join("");
}

function renderTenderRows(tenders: DigestTender[], appUrl: string): string {
  return tenders.map((tender) => {
    const title = tender.title.zh || tender.title.es || tender.title.en || "新招标项目";
    const url = escapeHtml(new URL(`/tenders/${tender.slug}`, appUrl).toString());
    const meta = [tender.country, ...tender.industries].filter(Boolean).join(" · ");
    return `<tr><td style="padding:0 0 12px">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe2e5;border-radius:14px;background:#fffdf9">`
      + `<tr><td style="padding:20px">`
      + `<div style="font-size:17px;font-weight:800;line-height:1.55;color:#071826">${escapeHtml(title)}</div>`
      + `<div style="margin-top:9px;font-size:13px;line-height:1.6;color:#64717c">${escapeHtml(meta)}</div>`
      + `<div style="margin-top:5px;font-size:13px;line-height:1.6;color:#64717c">${escapeHtml(tender.buyer)} · ${escapeHtml(tender.tender_number)}</div>`
      + `<div style="margin-top:5px;font-size:13px;line-height:1.6;color:#64717c">发布日期：${escapeHtml(formatEmailDate(tender.publication_date))}</div>`
      + `<a href="${url}" style="display:inline-block;margin-top:15px;border-radius:9px;background:#ffb21c;padding:10px 16px;font-size:13px;font-weight:800;text-decoration:none;color:#071826">查看项目 →</a>`
      + `</td></tr></table></td></tr>`;
  }).join("");
}

function renderStatusRows(statusChanges: StatusChange[], appUrl: string): string {
  return statusChanges.map(({ tender, previousStatus, nextStatus, changedAt }) => {
    const title = tender.title.zh || tender.title.es || tender.title.en || "招标项目";
    const url = escapeHtml(new URL(`/tenders/${tender.slug}`, appUrl).toString());
    return `<tr><td style="padding:0 0 12px">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe2e5;border-radius:14px;background:#fffdf9">`
      + `<tr><td style="padding:20px">`
      + `<div style="font-size:17px;font-weight:800;line-height:1.55;color:#071826">${escapeHtml(title)}</div>`
      + `<div style="margin-top:10px;font-size:13px;color:#64717c">状态更新：<strong style="color:#405563">${escapeHtml(statusEmailLabel(previousStatus))}</strong> → <strong style="color:#b86e00">${escapeHtml(statusEmailLabel(nextStatus))}</strong></div>`
      + `<div style="margin-top:6px;font-size:13px;color:#64717c">更新日期：${escapeHtml(formatEmailDate(changedAt))}</div>`
      + `<a href="${url}" style="display:inline-block;margin-top:15px;border-radius:9px;background:#ffb21c;padding:10px 16px;font-size:13px;font-weight:800;text-decoration:none;color:#071826">查看项目 →</a>`
      + `</td></tr></table></td></tr>`;
  }).join("");
}

/** The single source of truth used by both Resend delivery and the admin preview page. */
export function renderTenderDigestEmail(
  tenders: DigestTender[],
  statusChanges: StatusChange[],
  appUrl: string,
  preference: DigestPreferenceSummary,
): { subject: string; html: string } {
  const subjectParts = [
    tenders.length > 0 ? `${tenders.length} 个新标` : "",
    statusChanges.length > 0 ? `${statusChanges.length} 项状态更新` : "",
  ].filter(Boolean).join("，") || "招标动态";
  const settingsUrl = escapeHtml(new URL("/notifications", appUrl).toString());
  const tenderSection = tenders.length > 0
    ? `<h2 style="margin:0 0 14px;font-size:18px;color:#071826">新发布项目 <span style="display:inline-block;margin-left:6px;border-radius:999px;background:#fff0ca;padding:3px 9px;font-size:12px;color:#8a5700">${tenders.length} 个</span></h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderTenderRows(tenders, appUrl)}</table>`
    : "";
  const statusSection = statusChanges.length > 0
    ? `<h2 style="margin:28px 0 14px;font-size:18px;color:#071826">项目状态更新 <span style="display:inline-block;margin-left:6px;border-radius:999px;background:#fff0ca;padding:3px 9px;font-size:12px;color:#8a5700">${statusChanges.length} 个</span></h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderStatusRows(statusChanges, appUrl)}</table>`
    : "";

  return {
    subject: `拉美招投标平台｜${subjectParts}`,
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
      + `<body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#52636e">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;background:#f4f1eb"><tr><td align="center">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border-radius:18px;background:#ffffff">`
      + `<tr><td style="padding:28px 32px;background:#061b2b;color:#ffffff"><div style="font-size:12px;font-weight:800;letter-spacing:.18em;color:#ffb21c">TENDER ALERT</div><div style="margin-top:10px;font-size:23px;font-weight:800">拉美招投标平台</div><div style="margin-top:7px;font-size:13px;color:#a9b8bf">为您筛选值得关注的拉美政府采购机会</div></td></tr>`
      + `<tr><td style="padding:30px 32px"><h1 style="margin:0;font-size:26px;line-height:1.4;color:#071826">您的招标动态</h1><p style="margin:10px 0 18px;font-size:15px;line-height:1.7;color:#64717c">以下内容符合您当前设置的通知条件。</p>`
      + `<div style="margin:0 0 28px;border-radius:12px;background:#f1f4f4;padding:16px 18px"><div style="margin-bottom:7px;font-size:13px;font-weight:800;color:#071826">当前通知设置</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderPreferenceSummary(preference)}</table></div>`
      + `${tenderSection}${statusSection}`
      + `<div style="margin-top:26px;border-radius:12px;background:#f1f4f4;padding:16px;font-size:12px;line-height:1.7;color:#70808a">通知时间：墨西哥城时间每日 09:00 与 18:00。您可以随时前往 <a href="${settingsUrl}" style="font-weight:700;color:#24465a">通知设置</a> 调整条件或停止接收。</div>`
      + `</td></tr><tr><td style="border-top:1px solid #e5e9eb;padding:20px 32px;font-size:11px;color:#87949c">本邮件由 latintender.com 根据您的通知设置自动发送。</td></tr>`
      + `</table></td></tr></table></body></html>`,
  };
}

export async function sendTenderDigestEmail(recipient: DigestRecipient, tenders: DigestTender[], statusChanges: StatusChange[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) throw new Error("Email delivery is not fully configured");

  const email = renderTenderDigestEmail(tenders, statusChanges, appUrl, recipient);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient.email],
      subject: email.subject,
      html: email.html,
    }),
  });

  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? "Resend rejected the email");
  return result?.id ?? null;
}
