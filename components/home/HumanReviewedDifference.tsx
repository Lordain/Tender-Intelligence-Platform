const differences = [
  {
    number: "01",
    title: "项目筛选",
    automated: "自动聚合容易带来大量零散、金额很小或日常采购项目，企业仍需逐条筛选。",
    latinTender: "结合规则筛选与人工复核，优先保留值得企业评估的项目，减少前期筛选时间。",
  },
  {
    number: "02",
    title: "信息覆盖",
    automated: "遇到反爬虫或难以自动抓取的政府网站，可能遗漏项目，也可能缺少关键日期。",
    latinTender: "人工查找自动化未覆盖的项目，核对并补充关键日期等重要信息。",
  },
  {
    number: "03",
    title: "标书分析",
    automated: "如果只处理公告页面，附件中的参与条件、文件要求和风险点可能看不到。",
    latinTender: "对平台上的每个项目手动下载标书，再结合 AI 分析梳理参与要求、所需文件和风险点。",
  },
] as const;

export function HumanReviewedDifference() {
  return (
    <section id="human-reviewed" aria-labelledby="human-reviewed-heading" className="scroll-mt-20 border-t border-[#e7e1d6] bg-[#f7f4ee] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[94rem]">
        <div className="grid gap-8 border-b border-[#dbe2e5] pb-9 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Human + AI</p>
            <h2 id="human-reviewed-heading" className="mt-3 text-3xl font-black leading-[1.22] tracking-[0.02em] text-[#071826] sm:text-4xl">
              自动化提速，<br className="hidden sm:block" />人工把关关键环节
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#64717c] lg:justify-self-end">
            项目筛选、信息补充和标书分析，我们把人工工作放在最影响判断的地方。
          </p>
        </div>

        <div className="mt-9 overflow-hidden rounded-[1.75rem] border border-[#dbe2e5] bg-white shadow-[0_22px_60px_-48px_rgba(6,27,43,.35)]">
          <div className="hidden grid-cols-[0.55fr_1.2fr_5rem_1.2fr] items-center gap-4 bg-[#0c2637] px-7 py-6 text-center text-sm font-black md:grid">
            <span className="text-white/65">对比维度</span>
            <span className="text-white">AI招投标网站</span>
            <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-[#ffb21c] bg-[#ffb21c] text-xs tracking-wide text-[#071826]">VS</span>
            <span className="text-[#ffcd67]">拉美招投标信息平台</span>
          </div>
          {differences.map((item) => (
            <article key={item.number} className="grid items-center gap-5 border-b border-[#e5eaec] px-6 py-8 text-center last:border-b-0 md:grid-cols-[0.55fr_1.2fr_5rem_1.2fr] md:gap-4 md:px-7 md:py-9">
              <div>
                <span className="block font-mono text-xs font-black tracking-wider text-[#b86e00]">{item.number}</span>
                <h3 className="mt-2 text-lg font-black text-[#071826]">{item.title}</h3>
              </div>
              <div className="mx-auto max-w-lg">
                <p className="mb-2 text-xs font-black text-[#6b7a84] md:hidden">AI招投标网站</p>
                <p className="text-sm leading-7 text-[#64717c]">{item.automated}</p>
              </div>
              <span aria-hidden="true" className="mx-auto flex size-9 items-center justify-center rounded-full border border-[#d7dfe2] bg-[#f5f8f8] text-[0.65rem] font-black tracking-wide text-[#a26813] md:hidden">VS</span>
              <span aria-hidden="true" className="hidden h-10 w-px justify-self-center bg-[#dbe2e5] md:block" />
              <div className="mx-auto max-w-lg">
                <p className="mb-2 text-xs font-black text-[#a96100] md:hidden">拉美招投标信息平台</p>
                <p className="text-sm font-bold leading-7 text-[#173649]">{item.latinTender}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-4xl text-center text-base font-bold leading-8 text-[#173649]">
          重点不是让企业被海量信息淹没，而是找到与业务匹配的项目，掌握项目与标书中的关键要求，再判断是否值得继续投入。
        </p>
      </div>
    </section>
  );
}
