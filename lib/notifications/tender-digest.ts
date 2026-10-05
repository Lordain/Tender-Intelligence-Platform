import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { escapeHtml } from "@/lib/notifications/escape-html";
import type { DigestRecipient } from "@/lib/notifications/digest-recipients";
import { countryLabel, industryLabel } from "@/lib/tender-labels";
import { isStagedCountry } from "@/lib/staged-countries";
import { isDueInSlot, recipientWindowStart, type DigestSlot } from "@/lib/notifications/digest-slot";
import { PLAN_NAMES } from "@/lib/billing-catalog";

export type DigestTender = {
  id: string;
  public_slug: string;
  title: { zh?: string; es?: string; en?: string };
  summary: { zh?: string; es?: string; en?: string };
  /** Searched by keyword only — see matches(). Optional so older fixtures need not carry them. */
  title_zh_short?: string | null;
  one_line_summary?: string | null;
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
  // Chinese and source-language title and summary, the condensed Chinese
  // title and the 一句话总结 (user, 2026-10-02: 搜索包括(中文+外语)标题、摘要、
  // 一句话总结) — the same fields /tenders searches for a member.
  const searchableText = [
    tender.title.zh, tender.title.es, tender.title.en, tender.title_zh_short,
    tender.summary.zh, tender.summary.es, tender.summary.en,
    tender.one_line_summary,
    tender.buyer, tender.tender_number,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  return (
    // A staged country is not on the site yet, so it is not in anyone's mail either.
    !isStagedCountry(tender.country) &&
    (preference.countries.length === 0 || preference.countries.includes(tender.country)) &&
    (preference.industries.length === 0 || tender.industries.some((industry) => preference.industries.includes(industry))) &&
    (preference.statuses.length === 0 || statuses.some((status) => preference.statuses.includes(status))) &&
    (preference.relevance_tiers.length === 0 || preference.relevance_tiers.includes(tender.relevance_tier ?? "")) &&
    (preference.keywords.length === 0 || preference.keywords.some((keyword) => searchableText.includes(keyword.toLocaleLowerCase())))
  );
}

const DIGEST_TENDER_COLUMNS = "id, public_slug, title, summary, title_zh_short, one_line_summary, buyer, tender_number, country, industries, status, relevance_tier, publication_date, created_at";
const DIGEST_PAGE_SIZE = 500;
/**
 * Far above anything a digest window holds (the busiest 7 days on record,
 * 2026-09, was 188 new tenders), and there only so a runaway window cannot
 * page forever. Reaching it is an error, not a truncation: see below.
 */
const DIGEST_MAX_ROWS = 20_000;
const DIGEST_READ_ATTEMPTS = 3;

/**
 * Read a whole digest window, page by page, or throw.
 *
 * Both readers used to take `.limit(200)` and turn a read error into `[]`.
 * The cap was applied BEFORE any recipient's filters, so on a busy week the
 * 200 newest rows could all be from other countries and a Basic subscriber's
 * country simply vanished from their mail; and a failed read produced the
 * same run as a quiet day — "no updates", heartbeat ok, nobody told
 * (2026-09-26 review). The Monday weekly window was already at 188 rows.
 *
 * Now every page is read, each page is retried, and anything that still
 * fails throws. The cron route's catch turns that into a failed heartbeat and
 * a 每日摘要任务整体失败 alert, and the slot can be run again: sending
 * nothing and saying so beats sending a digest that silently lacks rows.
 */
export async function readDigestPages<T>(
  label: string,
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += DIGEST_PAGE_SIZE) {
    let page: T[] | null = null;
    let lastError = "";
    for (let attempt = 1; attempt <= DIGEST_READ_ATTEMPTS && page === null; attempt += 1) {
      const { data, error } = await readPage(from, from + DIGEST_PAGE_SIZE - 1);
      if (error) {
        lastError = error.message;
        if (attempt < DIGEST_READ_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      } else {
        page = data ?? [];
      }
    }
    if (page === null) throw new Error(`${label}读取失败（已重试 ${DIGEST_READ_ATTEMPTS} 次）：${lastError}`);
    rows.push(...page);
    if (page.length < DIGEST_PAGE_SIZE) return rows;
    if (rows.length >= DIGEST_MAX_ROWS) throw new Error(`${label}超过 ${DIGEST_MAX_ROWS} 条，时间窗口可能有误，本轮未发送`);
  }
}

function requireAdminClient() {
  const supabase = createSupabaseAdminClient();
  // Not `return []`: without the service role nothing can be read, and an
  // empty list here would be reported as a quiet day.
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY 未设置，无法读取摘要数据");
  return supabase;
}

export async function getNewTenders(windowStart: Date, windowEnd: Date): Promise<DigestTender[]> {
  const supabase = requireAdminClient();
  // `id` breaks ties so a row sharing its created_at with a page boundary is
  // neither skipped nor read twice (one import writes many rows per instant).
  return readDigestPages<DigestTender>("新项目", (from, to) => supabase
    .from("tenders")
    .select(DIGEST_TENDER_COLUMNS)
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to) as unknown as PromiseLike<{ data: DigestTender[] | null; error: { message: string } | null }>);
}

type StatusHistoryRow = { previous_status: string; next_status: string; changed_at: string; tenders: unknown };

export async function getStatusChanges(windowStart: Date, windowEnd: Date): Promise<StatusChange[]> {
  const supabase = requireAdminClient();
  const rows = await readDigestPages<StatusHistoryRow>("项目状态变化", (from, to) => supabase
    .from("tender_status_history")
    .select(`id, previous_status, next_status, changed_at, tenders ( ${DIGEST_TENDER_COLUMNS} )`)
    .gte("changed_at", windowStart.toISOString())
    .lt("changed_at", windowEnd.toISOString())
    .order("changed_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to) as unknown as PromiseLike<{ data: StatusHistoryRow[] | null; error: { message: string } | null }>);
  return rows.flatMap((row) => {
    const tender = row.tenders as DigestTender | null;
    return tender ? [{
      tender,
      previousStatus: row.previous_status,
      nextStatus: row.next_status,
      changedAt: row.changed_at,
    }] : [];
  });
}

export function matchingTenders(tenders: DigestTender[], preference: Preference) {
  return tenders.filter((tender) => matches(tender, preference)).slice(0, 20);
}

export function matchingStatusChanges(changes: StatusChange[], preference: Preference) {
  return changes.filter((change) => matches(change.tender, preference, [change.previousStatus, change.nextStatus])).slice(0, 20);
}

export type PlannedDigest = { recipient: DigestRecipient; tenders: DigestTender[]; statusChanges: StatusChange[] };

/**
 * Who gets mail in this slot and what it contains — every rule the cron route
 * used to apply inline, in the same order, so the send loop can be split
 * across a first run and a resume without either one deciding differently.
 * Reserved-domain (test) addresses are left to the caller, which counts them.
 */
export function planDigestSends(
  slot: DigestSlot,
  recipients: DigestRecipient[],
  tenders: DigestTender[],
  statusChanges: StatusChange[],
): PlannedDigest[] {
  return recipients.flatMap((recipient) => {
    if (!isDueInSlot(slot, recipient.cadence)) return [];
    const start = recipientWindowStart(slot, recipient.cadence);
    const matches = matchingTenders(tenders.filter((tender) => new Date(tender.created_at) >= start), recipient);
    const updates = matchingStatusChanges(statusChanges.filter((change) => new Date(change.changedAt) >= start), recipient);
    return matches.length === 0 && updates.length === 0 ? [] : [{ recipient, tenders: matches, statusChanges: updates }];
  });
}

const STATUS_EMAIL_LABELS: Record<string, string> = {
  planned: "规划中",
  open: "招标中",
  clarification: "澄清中",
  submission_closed: "已截止",
  awarded: "已中标",
  cancelled: "已取消",
  suspended: "暂停中",
  deserted: "流标",
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

function emailTenderTitle(tender: DigestTender, limited: boolean): string {
  if (!limited) return tender.title.zh || tender.title.es || tender.title.en || "新招标项目";
  const industries = tender.industries.slice(0, 2).map((value) => industryLabel(value, "zh")).join("、");
  return `${countryLabel(tender.country, "zh")} · ${industries || "政府采购"}项目`;
}

function renderTenderRows(tenders: DigestTender[], appUrl: string, limited: boolean): string {
  return tenders.map((tender) => {
    const title = emailTenderTitle(tender, limited);
    const url = escapeHtml(new URL(`/tenders/${tender.public_slug}`, appUrl).toString());
    const meta = [tender.country, ...tender.industries].filter(Boolean).join(" · ");
    return `<tr><td style="padding:0 0 12px">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe2e5;border-radius:14px;background:#fffdf9">`
      + `<tr><td style="padding:20px">`
      + `<div style="font-size:17px;font-weight:800;line-height:1.55;color:#071826">${escapeHtml(title)}</div>`
      + `<div style="margin-top:9px;font-size:13px;line-height:1.6;color:#64717c">${escapeHtml(meta)}</div>`
      + (limited ? "" : `<div style="margin-top:5px;font-size:13px;line-height:1.6;color:#64717c">${escapeHtml(tender.buyer)} · ${escapeHtml(tender.tender_number)}</div>`)
      + `<div style="margin-top:5px;font-size:13px;line-height:1.6;color:#64717c">发布日期：${escapeHtml(formatEmailDate(tender.publication_date))}</div>`
      + `<a href="${url}" style="display:inline-block;margin-top:15px;border-radius:9px;background:#ffb21c;padding:10px 16px;font-size:13px;font-weight:800;text-decoration:none;color:#071826">查看项目 →</a>`
      + `</td></tr></table></td></tr>`;
  }).join("");
}

function renderStatusRows(statusChanges: StatusChange[], appUrl: string, limited: boolean): string {
  return statusChanges.map(({ tender, previousStatus, nextStatus, changedAt }) => {
    const title = emailTenderTitle(tender, limited);
    const url = escapeHtml(new URL(`/tenders/${tender.public_slug}`, appUrl).toString());
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

/**
 * The free weekly roundup says what the reader is on and how to hear sooner
 * (user, 2026-10-05: 周通知的邮件，要强调当前的账户类型，通知频率。如果要提升，
 * 建议怎么做). Without it a free reader sees a week-old award and concludes the
 * platform is slow, when paying readers had it the same day. Feature wording
 * follows the pricing page (components/pricing/PricingPlans.tsx); times are
 * the cron slots in vercel.json, in Mexico City and Beijing time.
 */
const WEEKLY_PLAN_FACTS: [string, string][] = [
  ["当前账户", "免费版"],
  ["通知频率", "每周 1 次，每周一 9:00 发送（墨西哥城时间；北京时间周一 23:00），汇总过去 7 天"],
  ["本邮件范围", "隐藏项目名称、采购单位和编号；关键词条件不生效"],
];

const UPGRADE_OPTIONS: { name: string; recommended?: boolean; cadence: string; detail: string }[] = [
  { name: PLAN_NAMES.basic, cadence: "每日 1 次提醒", detail: "选择 1 个国家，查看该国全部项目详情和标书分析" },
  { name: PLAN_NAMES.professional, recommended: true, cadence: "每日 2 次提醒（墨西哥城 9:00、18:00）", detail: "全部国家完整中文详情，可自定义提醒关键词" },
  { name: PLAN_NAMES.enterprise, cadence: "每日 2 次提醒，3 个账号各自设置", detail: "全部国家完整详情，另含每月行业分析报告" },
];

function renderWeeklyPlanNotice(pricingUrl: string): string {
  const rows = WEEKLY_PLAN_FACTS.map(([label, value]) =>
    `<tr><td style="width:84px;padding:4px 10px 4px 0;vertical-align:top;font-size:12px;font-weight:700;color:#8a5700">${label}</td><td style="padding:4px 0;font-size:13px;line-height:1.6;color:#071826">${escapeHtml(value)}</td></tr>`).join("");
  return `<div style="margin:0 0 18px;border:1px solid #f3d38b;border-radius:12px;background:#fff7e3;padding:16px 18px">`
    + `<div style="margin-bottom:7px;font-size:13px;font-weight:800;color:#071826">您的账户与通知频率</div>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`
    + `<div style="margin-top:8px;font-size:12px;line-height:1.6;color:#64717c">付费版用户在项目入库后最快当天、最晚次日就会收到同样的提醒。<a href="${pricingUrl}" style="font-weight:700;color:#8a5700">了解如何更早收到 →</a></div>`
    + `</div>`;
}

function renderUpgradeSection(pricingUrl: string): string {
  const rows = UPGRADE_OPTIONS.map((option) =>
    `<tr><td style="padding:12px 0;border-top:1px solid #e5e9eb;vertical-align:top">`
      + `<div style="font-size:14px;font-weight:800;color:#071826">${escapeHtml(option.name)}${option.recommended ? ` <span style="display:inline-block;margin-left:4px;border-radius:999px;background:#ffb21c;padding:2px 8px;font-size:11px;color:#071826">推荐</span>` : ""}</div>`
      + `<div style="margin-top:4px;font-size:13px;font-weight:700;color:#b86e00">${escapeHtml(option.cadence)}</div>`
      + `<div style="margin-top:3px;font-size:13px;line-height:1.6;color:#64717c">${escapeHtml(option.detail)}</div>`
      + `</td></tr>`).join("");
  return `<div style="margin-top:28px;border:1px solid #dbe2e5;border-radius:14px;background:#fffdf9;padding:20px">`
    + `<div style="font-size:18px;font-weight:800;color:#071826">想更早收到项目提醒？</div>`
    + `<div style="margin-top:6px;margin-bottom:6px;font-size:13px;line-height:1.7;color:#64717c">升级后不用等到每周一：新项目和状态变化按天提醒，并显示完整项目名称、采购单位和编号。</div>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`
    + `<a href="${pricingUrl}" style="display:inline-block;margin-top:8px;border-radius:9px;background:#061b2b;padding:11px 18px;font-size:13px;font-weight:800;text-decoration:none;color:#ffffff">查看订阅方案 →</a>`
    + `</div>`;
}

/** The single source of truth used by both Resend delivery and the admin preview page. */
/**
 * The plain-text half of the message.
 *
 * Not an accessibility nicety: an HTML-only body is one of the oldest and
 * strongest spam signals there is, because legitimate bulk senders have sent
 * multipart/alternative for twenty years and bulk spammers historically did
 * not. Real evidence on this project (2026-09-13): the same sending domain,
 * the same Resend account, two messages — the digest reached the Gmail inbox
 * and the enterprise invite went to 垃圾邮件. Both were HTML-only.
 *
 * Written from the same data as the HTML rather than stripped out of it, so
 * it reads like something a person would send instead of a tag-stripped
 * skeleton — which filters score separately and no better.
 */
function renderTenderDigestText(
  tenders: DigestTender[],
  statusChanges: StatusChange[],
  appUrl: string,
  limited: boolean,
): string {
  const line = (tender: DigestTender) =>
    [
      `- ${emailTenderTitle(tender, limited)}`,
      ...(limited ? [] : [`  ${tender.country}｜${tender.buyer}｜${tender.tender_number}`]),
      `  ${new URL(`/tenders/${tender.public_slug}`, appUrl).toString()}`,
    ].join("\n");

  const blocks: string[] = limited
    ? ["您的每周招标汇总", "以下是过去 7 天符合您通知条件的项目。", WEEKLY_PLAN_FACTS.map(([label, value]) => `${label}：${value}`).join("\n")]
    : ["您的招标动态", "以下内容符合您当前设置的通知条件。"];
  if (tenders.length > 0) {
    blocks.push(`新发布项目（${tenders.length} 个）`, tenders.map(line).join("\n\n"));
  }
  if (statusChanges.length > 0) {
    blocks.push(
      `项目状态更新（${statusChanges.length} 个）`,
      statusChanges.map((change) => `${line(change.tender)}\n  状态：${change.previousStatus} → ${change.nextStatus}`).join("\n\n"),
    );
  }
  if (limited) {
    blocks.push(
      "想更早收到项目提醒？升级后不用等到每周一，并显示完整项目名称、采购单位和编号：",
      UPGRADE_OPTIONS.map((option) => `- ${option.name}${option.recommended ? "（推荐）" : ""}：${option.cadence}；${option.detail}`).join("\n"),
      `查看订阅方案：${new URL("/pricing", appUrl).toString()}`,
    );
  }
  blocks.push(
    `修改通知条件或退订：${new URL("/notifications", appUrl).toString()}`,
    "拉美招投标信息平台自动通知，请勿直接回复本邮件。",
  );
  return blocks.join("\n\n");
}

export function renderTenderDigestEmail(
  tenders: DigestTender[],
  statusChanges: StatusChange[],
  appUrl: string,
  preference: DigestPreferenceSummary,
  limited = false,
): { subject: string; html: string; text: string } {
  const subjectParts = [
    tenders.length > 0 ? `${tenders.length} 个新标` : "",
    statusChanges.length > 0 ? `${statusChanges.length} 项状态更新` : "",
  ].filter(Boolean).join("，") || "招标动态";
  const pricingUrl = escapeHtml(new URL("/pricing", appUrl).toString());
  const settingsUrl = escapeHtml(new URL("/notifications", appUrl).toString());
  const tenderSection = tenders.length > 0
    ? `<h2 style="margin:0 0 14px;font-size:18px;color:#071826">新发布项目 <span style="display:inline-block;margin-left:6px;border-radius:999px;background:#fff0ca;padding:3px 9px;font-size:12px;color:#8a5700">${tenders.length} 个</span></h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderTenderRows(tenders, appUrl, limited)}</table>`
    : "";
  const statusSection = statusChanges.length > 0
    ? `<h2 style="margin:28px 0 14px;font-size:18px;color:#071826">项目状态更新 <span style="display:inline-block;margin-left:6px;border-radius:999px;background:#fff0ca;padding:3px 9px;font-size:12px;color:#8a5700">${statusChanges.length} 个</span></h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderStatusRows(statusChanges, appUrl, limited)}</table>`
    : "";

  return {
    subject: `拉美招投标信息平台｜${limited ? "每周汇总：" : ""}${subjectParts}`,
    text: renderTenderDigestText(tenders, statusChanges, appUrl, limited),
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
      + `<body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#52636e">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;background:#f4f1eb"><tr><td align="center">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border-radius:18px;background:#ffffff">`
      + `<tr><td style="padding:28px 32px;background:#061b2b;color:#ffffff"><div style="font-size:12px;font-weight:800;letter-spacing:.18em;color:#ffb21c">TENDER ALERT</div><div style="margin-top:10px;font-size:23px;font-weight:800">拉美招投标信息平台</div><div style="margin-top:7px;font-size:13px;color:#a9b8bf">为您筛选值得关注的拉美政府采购机会</div></td></tr>`
      + `<tr><td style="padding:30px 32px"><h1 style="margin:0;font-size:26px;line-height:1.4;color:#071826">${limited ? "您的每周招标汇总" : "您的招标动态"}</h1><p style="margin:10px 0 18px;font-size:15px;line-height:1.7;color:#64717c">${limited ? "以下是过去 7 天符合您通知条件的项目。" : "以下内容符合您当前设置的通知条件。"}</p>`
      + (limited ? renderWeeklyPlanNotice(pricingUrl) : "")
      + `<div style="margin:0 0 28px;border-radius:12px;background:#f1f4f4;padding:16px 18px"><div style="margin-bottom:7px;font-size:13px;font-weight:800;color:#071826">当前通知设置</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${renderPreferenceSummary(preference)}</table></div>`
      + `${tenderSection}${statusSection}`
      + (limited ? renderUpgradeSection(pricingUrl) : "")
      + `<div style="margin-top:26px;border-radius:12px;background:#f1f4f4;padding:16px;font-size:12px;line-height:1.7;color:#70808a">您可以随时前往 <a href="${settingsUrl}" style="font-weight:700;color:#24465a">通知设置</a> 调整条件或停止接收。</div>`
      + `</td></tr><tr><td style="border-top:1px solid #e5e9eb;padding:20px 32px;font-size:11px;color:#87949c">本邮件由 latintender.com 根据您的通知设置自动发送。</td></tr>`
      + `</table></td></tr></table></body></html>`,
  };
}

/**
 * Resend's answer when an Idempotency-Key it already holds (24 hours) comes
 * back with a different payload. For the digest that means the first attempt
 * for this recipient and slot DID reach Resend — a resumed run is only
 * rebuilding the mail from rows that changed since (a title translated in
 * between) — so the caller treats it as already sent rather than as a failure.
 */
export class DigestAlreadySentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigestAlreadySentError";
  }
}

/** Another request with the same key is still in flight (two runs overlapping): leave the row to that one. */
export class DigestSendInFlightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigestSendInFlightError";
  }
}

export async function sendTenderDigestEmail(
  recipient: DigestRecipient,
  tenders: DigestTender[],
  statusChanges: StatusChange[],
  options: { test?: boolean; idempotencyKey?: string } = {},
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) throw new Error("Email delivery is not fully configured");

  const email = renderTenderDigestEmail(tenders, statusChanges, appUrl, recipient, recipient.cadence === "weekly");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // One key per recipient per slot: a retry of the same slot — a resumed
      // run, or a request that timed out after Resend accepted it — returns
      // the first response instead of mailing the person twice.
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [recipient.email],
      subject: options.test ? `【测试】${email.subject}` : email.subject,
      html: email.html,
      // multipart/alternative — see renderTenderDigestText.
      text: email.text,
      headers: {
        // Recurring mail to a list of subscribers is exactly what these are
        // for, and since Google's 2024 bulk-sender rules a one-click
        // unsubscribe is effectively required rather than polite. The URL is
        // the real preferences page, which already has the switch.
        "List-Unsubscribe": `<${new URL("/notifications", appUrl).toString()}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  const result = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (response.status === 409 && result?.name === "invalid_idempotent_request") {
    throw new DigestAlreadySentError(result.message ?? "Idempotency key already used");
  }
  if (response.status === 409 && result?.name === "concurrent_idempotent_requests") {
    throw new DigestSendInFlightError(result.message ?? "Same idempotency key in flight");
  }
  if (!response.ok) throw new Error(result?.message ?? "Resend rejected the email");
  return result?.id ?? null;
}
