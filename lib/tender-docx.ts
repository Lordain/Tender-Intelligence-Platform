/**
 * One tender's detail page as a Word file (user, 2026-10-05: 改成 Word（.docx）
 * 直接下载). Built on the server from the same Tender the member detail page
 * renders, in the same order — overview, key dates, requirements, risks,
 * official entry — so the file says what the page says and nothing the
 * viewer could not already read there. Who may download it is decided by the
 * route (canExportTenderDetail), not here.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { BidDocumentAccess, Tender, TenderRequirement, TenderRiskLevel } from "@/types/tender";
import { localize } from "@/lib/localize";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import { convertToUsd, exchangeRateNote } from "@/lib/currency";
import { undisclosedAmountBand } from "@/lib/chile-amount-band";
import { shortTitleOf } from "@/lib/public-title";
import { tenderSearchGuide } from "@/lib/tender-search-guide";
import { officialSiteAccessNote } from "@/lib/official-site-access";
import {
  GOVERNMENT_LEVEL_LABELS,
  KEY_DATE_TYPE_DESCRIPTIONS,
  keyDateTitle,
  PARTICIPATION_SCOPE_LABELS,
  RELEVANCE_TIER_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_LABELS,
  countryLabel,
  industryLabel,
} from "@/lib/tender-labels";

const INK = "071826";
const MUTED = "64717C";
const ACCENT = "B86E00";
const FONT = { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei", cs: "Arial" };

const RISK_LEVEL_ZH: Record<TenderRiskLevel, string> = { critical: "严重", high: "高", medium: "中", low: "低" };
const RISK_RANK: Record<TenderRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function text(value: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text: value, bold: options.bold, color: options.color, size: options.size });
}

function heading(title: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DBE2E5", space: 4 } },
    children: [text(title, { bold: true, color: INK, size: 28 })],
  });
}

function note(value: string) {
  return new Paragraph({ spacing: { after: 80 }, children: [text(value, { color: MUTED, size: 18 })] });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "E4E9EB" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "E4E9EB" },
  left: NO_BORDER,
  right: NO_BORDER,
};

/** Label / value rows, the 项目概览 grid as a two-column table. */
function factTable(rows: [string, string, string?][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value, detail]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 24, type: WidthType.PERCENTAGE },
          borders: CELL_BORDERS,
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F4F6F7" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [text(label, { bold: true, color: MUTED, size: 19 })] })],
        }),
        new TableCell({
          width: { size: 76, type: WidthType.PERCENTAGE },
          borders: CELL_BORDERS,
          margins: { top: 80, bottom: 80, left: 160, right: 120 },
          children: [
            new Paragraph({ children: [text(value, { bold: true, color: INK, size: 21 })] }),
            ...(detail ? [new Paragraph({ spacing: { before: 40 }, children: [text(detail, { color: MUTED, size: 17 })] })] : []),
          ],
        }),
      ],
    })),
  });
}

function requirementSection(title: string, items: TenderRequirement[]) {
  if (items.length === 0) return [];
  return [
    heading(`${title}（${items.length} 项）`),
    ...items.flatMap((item) => {
      const description = localize(item.description, "zh").trim();
      return [
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 80 },
          children: [
            text(localize(item.title, "zh"), { bold: true, color: INK }),
            text(item.mandatory ? "  强制要求" : "  非强制", { color: item.mandatory ? ACCENT : MUTED, size: 18, bold: item.mandatory }),
          ],
        }),
        ...(description ? [new Paragraph({ indent: { left: 720 }, children: [text(description, { color: "425461" })] })] : []),
        ...(item.sourceReference ? [new Paragraph({ indent: { left: 720 }, children: [text(`来源：${item.sourceReference}`, { color: MUTED, size: 17 })] })] : []),
      ];
    }),
  ];
}

function amountRow(tender: Tender): [string, string, string?] {
  if (tender.estimatedValue !== undefined) {
    return ["预估金额", formatEstimatedValueUsd(tender.estimatedValue, tender.currency, "zh") ?? "未公开", exchangeRateNote(tender.currency, "zh") ?? undefined];
  }
  const band = undisclosedAmountBand(tender);
  return ["预估金额", band?.usd ?? "未公开"];
}

/** 这个项目的标书怎么拿 (BidDocumentAccessCard), its folded 公告原文 included. */
function bidDocumentAccess(access: BidDocumentAccess) {
  const lines: string[] = [];
  if (access.downloadUrl) lines.push(`在采购单位网站下载：${access.downloadUrl}${access.downloadNeedsForm ? "（需先在网站上填一份在线表格）" : ""}`);
  if (access.byEmail) lines.push(access.free ? "免费索取电子版：书面或邮件申请后，采购单位用邮件发送" : "书面或邮件申请后，采购单位用邮件发送电子版（公告未写费用）");
  if (access.fee) {
    const local = `${access.fee.amount.toLocaleString("en-US")} ${access.fee.currency === "GYD" ? "圭亚那元" : access.fee.currency}`;
    const usd = convertToUsd(access.fee.amount, access.fee.currency);
    const fee = usd === null ? local : `${local}（约 ${Math.max(1, Math.round(usd))} 美元）`;
    lines.push(`购买${access.flashDrive ? " U 盘电子版" : "完整招标文件"}：${fee}，不退款${access.collectInPerson ? "；付款后到采购单位领取" : ""}`);
  } else if (access.collectInPerson) {
    lines.push("到采购单位领取");
  }
  if (access.courier) lines.push("不在当地的，可以申请寄送：须提供一家圭亚那当地快递公司的到付账号，运费由收件方承担");
  if (access.inspection) lines.push("可以先到采购单位办公室查阅招标文件");
  if (access.requestTitle) lines.push(`书面申请须注明：${access.requestTitle}`);
  if (access.emails.length > 0) lines.push(`公告中列出的邮箱：${access.emails.join("、")}`);
  return [
    new Paragraph({ spacing: { before: 200 }, children: [text("这个项目的标书怎么拿", { bold: true, color: INK })] }),
    note(`官方平台只发布招标公告，完整招标文件${access.downloadUrl ? "可以在网上下载，也可以" : "要"}按下面的方式向采购单位获取：`),
    ...lines.map((line) => new Paragraph({ bullet: { level: 0 }, children: [text(line)] })),
    note(`${access.fromSibling ? "这一标段的公告是扫描件，以上按同一项目其他标段的公告整理。" : ""}以上由本站根据招标公告整理；地址、办公时间等细节见公告原文，以公告为准。`),
    ...(access.excerpt ? [new Paragraph({ spacing: { before: 80 }, children: [text("公告原文（英文）", { bold: true, color: MUTED, size: 18 })] }), note(access.excerpt)] : []),
  ];
}

/**
 * 官方正式投标入口, as SourcePanel shows it: the platform, the link, the
 * procurement number, the access note for sites China cannot reach, and the
 * search steps for platforms with no shareable project page (user,
 * 2026-10-05: 不要有最下面的「相关在招项目」，但要有官方入口).
 */
function officialEntry(tender: Tender) {
  const guide = tenderSearchGuide(tender);
  const accessNote = officialSiteAccessNote(tender);
  return [
    heading("官方正式投标入口"),
    note("如有兴趣参标，请自行在官方平台核对文件与要求，并按官方流程完成投标。"),
    factTable([
      ["官方投标平台", tender.sourceName],
      ["招标编号", tender.tenderNumber],
    ]),
    new Paragraph({
      spacing: { before: 160 },
      children: [
        text("前往官方投标入口 ↗  ", { bold: true, color: ACCENT }),
        new ExternalHyperlink({ link: tender.sourceUrl, children: [new TextRun({ text: tender.sourceUrl, style: "Hyperlink" })] }),
      ],
    }),
    ...(accessNote ? [note(accessNote)] : []),
    ...(tender.bidDocumentAccess ? bidDocumentAccess(tender.bidDocumentAccess) : []),
    ...(guide
      ? [
        new Paragraph({
          spacing: { before: 200 },
          children: [text(`这个平台要自己检索标书  ${guide.platform}`, { bold: true, color: INK })],
        }),
        note(`${guide.intro ?? "官方没有可以直接分享的项目页面，需要用上面的招标编号在检索页查一次。"}按下面 ${guide.steps.length} 步走：`),
        ...guide.steps.map((step, index) => new Paragraph({ indent: { left: 360 }, children: [text(`${index + 1}. ${step}`)] })),
        ...(guide.url
          ? [new Paragraph({ spacing: { before: 80 }, children: [text(`${guide.platform.split(" — ")[0]} 检索页：`, { bold: true }), new ExternalHyperlink({ link: guide.url, children: [new TextRun({ text: guide.url, style: "Hyperlink" })] })] })]
          : []),
        ...(guide.note ? [note(guide.note)] : []),
      ]
      : []),
    note("本站是信息服务，不接收投标文件或代办投标。请前往上述官方渠道完成正式流程，并以官方文件和要求为准。"),
  ];
}

export async function buildTenderDocx(tender: Tender, pageUrl: string, exportedAt: Date): Promise<Buffer> {
  const title = shortTitleOf(tender);
  const summary = localize(tender.summary, "zh").trim();
  const tags = [
    countryLabel(tender.country, "zh"),
    tender.relevance.tier !== "excluded" ? localize(RELEVANCE_TIER_LABELS[tender.relevance.tier], "zh") : null,
    ...tender.industries.map((industry) => industryLabel(industry, "zh")),
    localize(STATUS_LABELS[tender.status], "zh"),
  ].filter(Boolean).join(" · ");

  const facts: [string, string, string?][] = [
    ["招标编号", tender.tenderNumber],
    ["采购人", tender.buyer],
    ["地点", tender.location ?? countryLabel(tender.country, "zh")],
    ["政府层级", localize(GOVERNMENT_LEVEL_LABELS[tender.governmentLevel], "zh")],
    ["标的类型", localize(SCOPE_TYPE_LABELS[tender.scopeType], "zh")],
    ["采购方式", tender.procedureType],
    ...(tender.participationScope ? [["参与范围", localize(PARTICIPATION_SCOPE_LABELS[tender.participationScope], "zh")] as [string, string]] : []),
    amountRow(tender),
  ];
  if (tender.status === "awarded") {
    if (tender.awardDate) facts.push(["中标日期", formatDate(tender.awardDate, "zh")]);
    if (tender.awardedTo) facts.push(["中标人", tender.awardedTo]);
    if (tender.awardedValue !== undefined) facts.push(["中标金额", formatEstimatedValueUsd(tender.awardedValue, tender.currency, "zh") ?? "未公开"]);
  }

  // 发布 and 提交截止 from their own fields, as the timeline does; the rest
  // of the schedule from keyDates, oldest first, without repeating those two.
  const dates: [string, string, string?][] = [
    [tender.publicationDateIsEstimated ? "发布（预计）" : "发布", formatDate(tender.publicationDate, "zh")],
    ...(tender.submissionDeadline ? [["提交截止", formatDate(tender.submissionDeadline, "zh")] as [string, string]] : []),
    ...[...tender.keyDates]
      .filter((date) => date.type !== "publication" && date.type !== "submission")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((date): [string, string, string?] => [
        keyDateTitle(date, "zh"),
        formatDate(date.date, "zh"),
        // The page folds these explanations under the timeline; the file
        // prints every one (user, 2026-10-05: 折叠的内容要全显示).
        (date.type === "milestone" ? date.notes?.es && `原文：${date.notes.es}` : localize(date.notes ?? KEY_DATE_TYPE_DESCRIPTIONS[date.type], "zh")) || undefined,
      ]),
  ];

  const risks = [...tender.risks].sort((a, b) => RISK_RANK[a.level] - RISK_RANK[b.level]);

  const doc = new Document({
    creator: "拉美招投标信息平台",
    title,
    styles: { default: { document: { run: { font: FONT, size: 21, color: "2B3F4C" } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 6 } },
          spacing: { after: 240 },
          children: [
            text("拉美招投标信息平台", { bold: true, color: INK, size: 24 }),
            text("    项目详情 · latintender.com", { color: MUTED, size: 18 }),
          ],
        }),
        new Paragraph({ spacing: { after: 80 }, children: [text(tags, { color: ACCENT, bold: true, size: 19 })] }),
        new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [text(title, { bold: true, color: INK, size: 36 })] }),
        ...(tender.title.es && tender.title.es !== title
          ? [new Paragraph({ spacing: { after: 200 }, children: [text("原文  ", { bold: true, color: MUTED, size: 18 }), text(tender.title.es, { color: MUTED, size: 19 })] })]
          : []),
        ...(tender.oneLineSummary ? [heading("一句话看懂"), new Paragraph({ children: [text(tender.oneLineSummary, { bold: true, color: INK, size: 23 })] })] : []),
        ...(summary && summary !== title && summary !== tender.title.es ? [heading("项目摘要"), new Paragraph({ children: [text(summary)] })] : []),
        heading("项目概览"),
        factTable(facts),
        heading("关键日期"),
        factTable(dates),
        ...requirementSection("资质要求", tender.qualifications),
        ...requirementSection("经验要求", tender.experienceRequirements),
        ...requirementSection("所需文件", tender.requiredDocuments),
        ...(risks.length > 0
          ? [
            heading(`风险提示（${risks.length} 项）`),
            ...risks.flatMap((risk) => {
              const description = localize(risk.description, "zh").trim();
              return [
                new Paragraph({
                  bullet: { level: 0 },
                  spacing: { before: 80 },
                  children: [text(`[${RISK_LEVEL_ZH[risk.level]}] `, { bold: true, color: risk.level === "critical" || risk.level === "high" ? "A3261F" : ACCENT }), text(localize(risk.title, "zh"), { bold: true, color: INK })],
                }),
                ...(description ? [new Paragraph({ indent: { left: 720 }, children: [text(description, { color: "425461" })] })] : []),
              ];
            }),
          ]
          : []),
        ...officialEntry(tender),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 360 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DBE2E5", space: 6 } },
          children: [
            text(`导出时间：${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long", timeStyle: "short" }).format(exportedAt)}（北京时间）  `, { color: MUTED, size: 17 }),
            new ExternalHyperlink({ link: pageUrl, children: [new TextRun({ text: pageUrl, style: "Hyperlink", size: 17 })] }),
          ],
        }),
        note("本文件由拉美招投标信息平台导出，仅供订阅账号内部参考，信息以官方原文为准。"),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
