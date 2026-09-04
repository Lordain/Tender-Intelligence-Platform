const values = [
  {
    number: "01",
    title: "多平台汇集",
    summary: "把分散信息集中到一个入口",
    detail: "整合多个政府采购平台的公开招标信息，聚焦经过筛选的重点项目，减少团队反复检索和整理的时间。",
  },
  {
    number: "02",
    title: "机会及时触达",
    summary: "更快掌握新项目与关键进展",
    detail: "持续追踪新发布的招标机会，并通过通知提醒重要更新，帮助团队在有限窗口期内及时启动评估。",
  },
  {
    number: "03",
    title: "标书重点拆解",
    summary: "先看清要求，再决定是否投入",
    detail: "提炼计划交标时间、资质要求和潜在风险点，帮助中国企业更高效地判断项目是否值得参与。",
  },
] as const;

export function ValuePropositions() {
  return (
    <section id="how-it-works" className="bg-[#fffdf9] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[94rem]">
        <div className="grid gap-8 border-b border-[#dbe2e5] pb-9 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Why us</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#071826] sm:text-4xl">从发现项目到投标判断，<br className="hidden sm:block" />关键信息一步到位</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#64717c] lg:justify-self-end">不替企业做决定，而是把分散、陌生且难以快速判断的政府招标信息，整理成团队能够高效使用的中文情报。</p>
        </div>

        <div className="grid divide-y divide-[#dbe2e5] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {values.map((value, index) => (
            <article key={value.number} className={`py-9 text-center lg:px-8 lg:py-11 ${index === 0 ? "lg:pl-0" : ""} ${index === values.length - 1 ? "lg:pr-0" : ""}`}>
              <div className="flex flex-col items-center text-[#b86e00]">
                <span className="font-mono text-[2.25rem] font-black leading-none tracking-[-0.08em]">{value.number}</span>
                <span className="mt-4 h-px w-12 bg-current" />
              </div>
              <h3 className="mt-7 text-2xl font-black text-[#071826]">{value.title}</h3>
              <p className="mt-2 text-sm font-bold text-[#315063]">{value.summary}</p>
              <p className="mt-5 text-sm leading-7 text-[#64717c]">{value.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
