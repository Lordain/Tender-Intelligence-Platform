import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { DEADLINE_IN_DOCUMENTS_LABEL } from "@/lib/deadline-labels";
import { SUPPORT_EMAIL, SUPPORT_WECHAT } from "@/lib/support";
import { PUBLIC_AFTER_DEADLINE_DAYS } from "@/lib/access-control";

export const metadata: Metadata = pageMetadata({
  title: "问题澄清",
  description:
    "说明五国数据来源、更新频率、中文整理的边界，以及投标判断中最容易被误解的问题。",
  path: "/clarifications",
});

const questions = [
  ["可以直接在本站提交投标吗？", "不可以。本站是招投标信息整理与分析服务，不是采购机构、招标代理或官方投标系统，不接收投标文件，也不代办投标。请通过项目详情页标明的官方投标入口核对要求，并在采购方指定的官方渠道完成正式流程。"],
  ["平台上的招标信息来自哪里？", "平台整理墨西哥、巴西、哥伦比亚、秘鲁和智利五国公开可访问的政府与国有企业采购信息。主要来源包括：墨西哥的 Compras MX、CFE、PEMEX；巴西的 PNCP、Petronect（巴西国家石油公司采购平台）、Cemig、ANEEL、ANTAQ 与联邦官方公报（DOU）；哥伦比亚的 SECOP II 与 UPME；秘鲁的 SEACE 与 Petroperú；智利的 Mercado Público 与 Codelco。每个项目详情页都会尽可能保留原始来源链接，重要决定应以官方文件为准。"],
  ["项目多久更新一次？", "平台每天更新。部分来源每日自动导入，其余来源由团队定期检索并人工复核后补充；已有项目的状态、日期和附件也会随官方更新而调整。"],
  ["中文项目名称和摘要是官方文本吗？", "不是。中文内容用于帮助团队快速理解，属于对西班牙语或葡萄牙语（巴西项目）公开信息的结构化整理。遇到金额、资格、日期或技术规格等关键条款时，请回到西班牙语或葡萄牙语原文核对。"],
  ["「大型项目」「中型项目」标签是什么意思？", "这是平台根据项目预估金额、工程类型和建设规模综合标注的参考标签，用于帮助快速识别规模较大、值得优先评估的项目；未标注的为常规项目。标签不是官方分类，项目实际规模以招标文件为准。"],
  ["“计划交标时间”和官方截止时间有什么区别？", "计划交标时间来自当前已获取的公开文件或公告。采购单位可能发布澄清、延期或更正，因此临近提交前仍需检查最新公告与补充文件。"],
  [`计划交标时间显示「${DEADLINE_IN_DOCUMENTS_LABEL}」是什么意思？`, "部分采购方（例如一些国有企业）不在公告页面公布截止时间，只写在招标文件中。遇到这种情况，平台不会猜测日期，而是提示您到招标文件中查看；平台取得文件并核实后，会补充具体日期。"],
  [`为什么截止 ${PUBLIC_AFTER_DEADLINE_DAYS} 天后的项目可以免费查看完整信息？`, `项目截止投标 ${PUBLIC_AFTER_DEADLINE_DAYS} 天后，平台会向所有访客免费公开该项目的全部整理内容，包括资格要求、所需文件、风险提示和关键日期，方便您了解同类项目的要求、为今后投标做准备。正在招标的项目，完整分析仍仅向会员开放。`],
  ["平台会判断中国企业一定有资格投标吗？", "不会。平台提供初步筛选与信息整理，不构成资格保证。是否允许境外企业参与、是否需要本地实体或联合体，应以每个项目的正式规则为准。"],
  ["为什么部分项目暂时没有附件或完整资质要求？", "不同官方平台的文件开放方式并不一致，部分附件可能延迟发布、需要登录获取或以补充公告形式出现。平台会在后续更新中补充已公开的文件与结构化字段。"],
  ["如何报告信息有误或需要进一步澄清？", `请记录项目名称、标书编号、疑问字段以及对应的官方文件页码，发送邮件至 ${SUPPORT_EMAIL}，或添加微信 ${SUPPORT_WECHAT} 联系我们。这样可以更快完成复核，同时避免仅凭翻译文本做判断。`],
] as const;

// FAQPage structured data, so a search result can show these answers
// directly (2026-09-25). Built from the same list the page renders.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: questions.map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function ClarificationsPage() {
  return (
    <div className="bg-[#f7f4ee]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffb21c]">Clarifications</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">问题澄清</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">说明数据来源、中文整理边界与投标判断中最容易误解的问题。</p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="rounded-2xl bg-[#fff0c9] p-6 lg:self-start">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#966000]">阅读提示</p>
            <p className="mt-3 text-sm leading-7 text-[#5b4a25]">平台帮助团队更快发现和理解机会，但不会取代官方文件、当地法律意见或采购单位的正式答复。</p>
          </aside>
          <section className="space-y-3">
            {questions.map(([question, answer], index) => (
              <details key={question} open={index === 0} className="group rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 open:border-[#c9b16e]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-black text-[#071826]">
                  <span>{question}</span><span className="text-xl font-light text-[#b86e00] transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-4 border-t border-[#e4e8e9] pt-4 text-sm leading-7 text-[#52636e]">{answer}</p>
              </details>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
