import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EmailPreviewTestSender } from "@/components/admin/EmailPreviewTestSender";
import { renderTenderDigestPreview } from "@/lib/notifications/tender-digest-preview";

export default function AdminEmailPreviewPage() {
  const preview = renderTenderDigestPreview();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Email preview"
        title="通知邮件预览"
        description="这里与真实邮件共用同一份模板；展示的是模拟数据。只有管理员可以从本页发送测试邮件。"
      />

      <EmailPreviewTestSender />

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
