/**
 * Why us, drawn as the pipeline it is (user, 2026-10-04: 把我们做的关键动作做成
 * 节点，然后一步一步讲，先从收集20多个平台的信息汇集我们平台，然后经过处理，变成
 * 高价值的情报).
 *
 * Every claim here is something the platform does today. "20+" is the count
 * of distinct official sources the importers read (Compras MX, DOF/CFE,
 * PEMEX, Proyectos Estratégicos; PNCP, DOU, Petronect, Cemig, ANEEL ×2,
 * ANTAQ; SECOP II, UPME; SEACE/OECE, Petroperú, ProInversión; Mercado
 * Público, Codelco, Metro de Santiago; COMPR.AR, CONTRAT.AR, ADIF, Boletín
 * Oficial) — 23 on 2026-10-04. Raise it only when that list grows.
 */

const sources = [
  { country: "墨西哥", platforms: ["Compras MX", "PEMEX", "CFE"] },
  { country: "巴西", platforms: ["PNCP", "Petrobras", "ANEEL"] },
  { country: "哥伦比亚", platforms: ["SECOP II", "UPME"] },
  { country: "秘鲁", platforms: ["SEACE", "Petroperú"] },
  { country: "智利", platforms: ["Mercado Público", "Codelco"] },
  { country: "阿根廷", platforms: ["COMPR.AR", "CONTRAT.AR"] },
] as const;

type StepIcon = "collect" | "filter" | "translate" | "document" | "bell";

const steps: { number: string; icon: StepIcon; title: string; detail: string; result: string }[] = [
  {
    number: "01",
    icon: "collect",
    title: "每日汇集",
    detail: "每天自动读取 6 国 20 多个官方采购平台的新公告，汇集到一个入口。",
    result: "不用再逐个网站翻",
  },
  {
    number: "02",
    icon: "filter",
    title: "筛掉噪音",
    detail: "规则筛选加人工复核，去掉日常服务、小额采购和来不及投标的项目。",
    result: "只留值得评估的",
  },
  {
    number: "03",
    icon: "translate",
    title: "中文整理",
    detail: "生成中文标题和摘要，标注行业，按金额分成常规、中型、大型。",
    result: "一眼看懂是什么、多大",
  },
  {
    number: "04",
    icon: "document",
    title: "标书拆解",
    detail: "下载标书，提炼资质、业绩、所需文件、风险点和关键日期。",
    result: "先看清门槛再投入",
  },
  {
    number: "05",
    icon: "bell",
    title: "按需送达",
    detail: "按国家、行业、关键词订阅，新项目和进展变化通过邮件提醒。",
    result: "不错过投标窗口",
  },
];

const deliverables = ["中文标题与摘要", "行业与规模分级", "资质·风险·关键日期", "新项目邮件提醒"] as const;

function Icon({ name }: { name: StepIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
      {name === "collect" && (
        <g {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
          <path d="M17 15.5 19.5 18 17 20.5" />
        </g>
      )}
      {name === "filter" && <path {...common} d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z" />}
      {name === "translate" && (
        <g {...common}>
          <path d="M4 6h8M8 4v2M10.5 6c-.6 3.4-2.8 6-6 7.5M6 9.2c1 1.6 2.4 2.9 4.2 3.8" />
          <path d="M13 20l3.5-8 3.5 8M14.3 17h4.4" />
        </g>
      )}
      {name === "document" && (
        <g {...common}>
          <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" />
          <path d="M14 3.5V8h4M9.5 12h6M9.5 15h6M9.5 18h3.5" />
        </g>
      )}
      {name === "bell" && (
        <g {...common}>
          <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
        </g>
      )}
    </svg>
  );
}

export function ValuePropositions() {
  return (
    <section id="how-it-works" className="bg-[#fffdf9] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <div className="grid gap-8 border-b border-[#dbe2e5] pb-9 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Why us</p>
            <h2 className="mt-3 text-[min(7.2vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] text-[#071826] sm:text-4xl"><span className="block whitespace-nowrap">从 20 多个平台的公告，</span><span className="block whitespace-nowrap">到一份能直接用的中文情报</span></h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#64717c] lg:justify-self-end">不替企业做决定，而是把分散、陌生且难以快速判断的政府招标信息，一步步整理成团队能够高效使用的中文情报。</p>
        </div>

        {/* Stage 1 — the raw input: scattered portals, other languages. */}
        <div className="mt-10 rounded-[1.75rem] border border-dashed border-[#cfd8dc] bg-white/70 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="text-sm font-black text-[#071826]">起点：分散在 6 国 20 多个官方平台的原始公告</p>
            <p className="text-xs text-[#75838c]">西语、葡语 · 格式各异 · 每天数千条</p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
            {sources.map((group) => (
              <li key={group.country} className="rounded-2xl bg-[#f3f6f7] px-3.5 py-3">
                <p className="text-xs font-black text-[#315063]">{group.country}</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.platforms.map((platform) => (
                    <span key={platform} className="whitespace-nowrap rounded-md border border-[#dbe2e5] bg-white px-2 py-0.5 font-mono text-[0.7rem] font-bold text-[#52636e]">{platform}</span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* The funnel: many sources narrowing into the pipeline. */}
        <div aria-hidden="true" className="mb-6 flex justify-center lg:mb-8">
          <svg viewBox="0 0 240 56" className="h-12 w-60 text-[#ffb21c]" preserveAspectRatio="none">
            <path d="M0 0h240L150 56H90z" fill="currentColor" opacity="0.16" />
            <path d="M120 6v40m-7-8 7 8 7-8" fill="none" stroke="#b86e00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Stage 2 — what we do, node by node. */}
        <ol className="relative grid gap-0 lg:grid-cols-5 lg:gap-6">
          {/* The track the nodes sit on: vertical on phones, horizontal from lg. */}
          <span aria-hidden="true" className="absolute bottom-6 left-[1.6rem] top-6 w-px bg-gradient-to-b from-[#ffb21c] to-[#b86e00] lg:hidden" />
          <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[1.6rem] hidden h-px bg-gradient-to-r from-[#ffd27a] via-[#ffb21c] to-[#b86e00] lg:block" />
          {steps.map((step) => (
            <li key={step.number} className="relative flex gap-5 pb-8 last:pb-0 lg:flex-col lg:items-center lg:pb-0 lg:text-center">
              <span className="relative z-10 flex size-[3.2rem] shrink-0 items-center justify-center rounded-full border-2 border-[#ffb21c] bg-[#fffdf9] text-[#b86e00] shadow-[0_0_0_6px_#fffdf9]">
                <Icon name={step.icon} />
              </span>
              <div className="min-w-0 lg:mt-5">
                <p className="font-mono text-xs font-black tracking-wider text-[#b86e00]">STEP {step.number}</p>
                <h3 className="mt-1 text-xl font-black text-[#071826]">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#64717c]">{step.detail}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-bold text-[#7a5310]">
                  <span aria-hidden="true">→</span>
                  {step.result}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div aria-hidden="true" className="flex justify-center py-4">
          <svg viewBox="0 0 24 40" className="h-10 w-6"><path d="M12 2v32m-7-8 7 8 7-8" fill="none" stroke="#b86e00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        {/* Stage 3 — what the customer gets. */}
        <div className="rounded-[1.75rem] bg-[#0c2637] px-6 py-7 text-center sm:px-10 sm:py-9">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffcd67]">你拿到的</p>
          <p className="mt-2 text-xl font-black text-white sm:text-2xl">一份可以直接判断「投不投」的中文项目情报</p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2.5">
            {deliverables.map((item) => (
              <li key={item} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-bold text-white/85">{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
