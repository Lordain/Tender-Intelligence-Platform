import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  renderTenderDigestEmail,
  type DigestTender,
  type StatusChange,
} from "@/lib/notifications/tender-digest";

const sampleTenders: DigestTender[] = [
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
    industries: ["水务", "土建"],
    status: "open",
    relevance_tier: "flagship",
    publication_date: "2026-09-06",
    created_at: new Date(0).toISOString(),
  },
];

const sampleStatusChanges: StatusChange[] = [
  {
    tender: sampleTenders[0],
    previousStatus: "open",
    nextStatus: "clarification",
    changedAt: "2026-09-07T15:20:00Z",
  },
];

export default function AdminEmailPreviewPage() {
  const preview = renderTenderDigestEmail(
    sampleTenders,
    sampleStatusChanges,
    "https://www.latintender.com",
    {
      countries: ["Mexico"],
      industries: ["transportation", "ict_telecom", "water"],
      statuses: ["open", "clarification"],
      relevance_tiers: ["flagship", "significant"],
      keywords: ["轨道交通", "EPC", "供水"],
    },
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Email preview"
        title="通知邮件预览"
        description="这里与真实邮件共用同一份模板；展示的是模拟数据，不会发送邮件或修改通知设置。"
      />

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#78868e]">邮件标题</p>
        <p className="mt-2 text-base font-black text-[#071826]">{preview.subject}</p>
      </section>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="rounded-2xl border border-[#dbe2e5] bg-[#e8eceb] p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black text-[#071826]">桌面端</h2>
            <span className="text-xs text-[#64717c]">640px 邮件宽度</span>
          </div>
          <iframe title="桌面端通知邮件预览" srcDoc={preview.html} sandbox="" className="h-[960px] w-full rounded-xl border border-[#cfd8dc] bg-white" />
        </section>

        <section className="rounded-2xl border border-[#dbe2e5] bg-[#e8eceb] p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black text-[#071826]">手机端</h2>
            <span className="text-xs text-[#64717c]">390px</span>
          </div>
          <iframe title="手机端通知邮件预览" srcDoc={preview.html} sandbox="" className="mx-auto h-[960px] w-full max-w-[390px] rounded-xl border border-[#cfd8dc] bg-white" />
        </section>
      </div>
    </div>
  );
}
