import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EmailPreviewTestSender } from "@/components/admin/EmailPreviewTestSender";
import { renderTenderDigestPreview } from "@/lib/notifications/tender-digest-preview";
import { EmailConfigStatus } from "@/components/admin/EmailConfigStatus";
import { describeEmailConfig, describeEmailEnvironment } from "@/lib/notifications/email-config";

export default async function AdminEmailPreviewPage() {
  // describeEmailConfig() reads process.env, and this panel is worthless
  // unless it reports the LIVE deployment's values — a build-time snapshot
  // would be the exact kind of lie the panel exists to prevent. The parent
  // layout already reads cookies() today, which forces this route dynamic,
  // but relying on a parent's dynamic API for THIS page's correctness is
  // fragile: enabling Cache Components later would let the page segment
  // prerender again and silently freeze these values. `connection()` states
  // the requirement locally. (Note `export const dynamic` is not the answer
  // in Next 16 — it is removed under Cache Components; see
  // node_modules/next/dist/docs/.../route-segment-config/index.md.)
  await connection();

  const preview = renderTenderDigestPreview();
  const emailConfig = describeEmailConfig();
  const emailEnvironment = describeEmailEnvironment();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Email preview"
        title="通知邮件预览"
        description="这里与真实邮件共用同一份模板；展示的是模拟数据。只有管理员可以从本页发送测试邮件。"
      />

      {/* Above the test sender: a passing test does not mean customers get mail. */}
      <EmailConfigStatus checks={emailConfig} environment={emailEnvironment} />

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
