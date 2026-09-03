const questions = [
  ["平台上的招标信息来自哪里？", "平台整理公开可访问的政府采购信息，主要来源包括 Compras MX、CFE、PEMEX 与相关官方发布渠道。每个项目详情页都会尽可能保留原始来源链接，重要决定应以官方文件为准。"],
  ["中文项目名称和摘要是官方文本吗？", "不是。中文内容用于帮助团队快速理解，属于对西班牙语公开信息的结构化整理。遇到金额、资格、日期或技术规格等关键条款时，请回到西班牙语原文核对。"],
  ["“计划交标时间”和官方截止时间有什么区别？", "计划交标时间来自当前已获取的公开文件或公告。采购单位可能发布澄清、延期或更正，因此临近提交前仍需检查最新公告与补充文件。"],
  ["平台会判断中国企业一定有资格投标吗？", "不会。平台提供初步筛选与信息整理，不构成资格保证。是否允许境外企业参与、是否需要本地实体或联合体，应以每个项目的正式规则为准。"],
  ["为什么部分项目暂时没有附件或完整资质要求？", "不同官方平台的文件开放方式并不一致，部分附件可能延迟发布、需要登录获取或以补充公告形式出现。平台会在后续更新中补充已公开的文件与结构化字段。"],
  ["如何报告信息有误或需要进一步澄清？", "请记录项目名称、标书编号、疑问字段以及对应的官方文件页码，再通过平台运营方公布的支持渠道提交。这样可以更快完成复核，同时避免仅凭翻译文本做判断。"],
] as const;

export default function ClarificationsPage() {
  return (
    <div className="bg-[#f7f4ee]">
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
