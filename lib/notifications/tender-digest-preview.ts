import "server-only";

import {
  renderTenderDigestEmail,
  type DigestPreferenceSummary,
  type DigestTender,
  type StatusChange,
} from "@/lib/notifications/tender-digest";

export const previewTenders: DigestTender[] = [
  {
    id: "preview-1",
    slug: "preview-metro-equipment",
    title: { zh: "墨西哥城地铁车辆通信设备采购", es: "Adquisición de equipos de comunicación", en: "" },
    summary: { zh: "采购地铁车辆通信与控制设备。", es: "", en: "" },
    buyer: "墨西哥城公共交通系统",
    tender_number: "STC-2026-0148",
    country: "墨西哥",
    industries: ["交通", "ICT"],
    status: "open",
    relevance_tier: "significant",
    publication_date: "2026-09-07",
    created_at: new Date(0).toISOString(),
  },
  {
    id: "preview-2",
    slug: "preview-water-infrastructure",
    title: { zh: "供水管网更新与泵站改造工程", es: "Rehabilitación de red de agua", en: "" },
    summary: { zh: "更新城市供水管网并改造泵站。", es: "", en: "" },
    buyer: "国家水务委员会",
    tender_number: "CONAGUA-LO-2026-032",
    country: "墨西哥",
    industries: ["水工程", "土建"],
    status: "open",
    relevance_tier: "flagship",
    publication_date: "2026-09-06",
    created_at: new Date(0).toISOString(),
  },
];

export const previewStatusChanges: StatusChange[] = [
  {
    tender: previewTenders[0],
    previousStatus: "open",
    nextStatus: "clarification",
    changedAt: "2026-09-07T15:20:00Z",
  },
];

export const previewPreference: DigestPreferenceSummary = {
  countries: ["Mexico"],
  industries: ["transportation", "ict_telecom", "water"],
  statuses: ["open", "clarification"],
  relevance_tiers: ["flagship", "significant"],
  keywords: ["轨道交通", "EPC", "供水"],
};

export function renderTenderDigestPreview() {
  return renderTenderDigestEmail(
    previewTenders,
    previewStatusChanges,
    process.env.APP_URL || "https://www.latintender.com",
    previewPreference,
  );
}
