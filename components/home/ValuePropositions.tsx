/**
 * Why us, drawn as the pipeline it is (user, 2026-10-04: 把我们做的关键动作做成
 * 节点，然后一步一步讲，先从收集20多个平台的信息汇集我们平台，然后经过处理，变成
 * 高价值的情报; then 把各平台做成圆点，分散分布，然后汇集到一个出口 … 也可以动画化).
 *
 * No country count anywhere in the copy (user, 2026-10-04: 不用强调6国，因为我们
 * 不断在增加国家); the platform count reads "30 多个" (user, 2026-10-10: 改成
 * 30多个平台，因为我们还在加，就避免再改了 — 29 on that day).
 *
 * Every claim here is something the platform does today. The dots are the
 * official sources the importers read — 25 named here, 26 counting ANEEL's two
 * auction feeds separately, on 2026-10-10 (PanamaCompra and SOCE added when
 * Panama and Ecuador opened, SICOES when Bolivia did). The "30 多个" copy is
 * deliberately ahead of this list; the dots are the sources, not a count.
 *
 * The motion is decoration on a picture that already says everything when
 * still: particles travel each path into the exit, the dots breathe, a light
 * runs along the step track. Under prefers-reduced-motion all of it stops and
 * the particles are not drawn (app/globals.css, .whyus-*).
 */

import { Reveal } from "@/components/home/Reveal";

type Dot = { name: string; x: number; y: number };

/**
 * Short names, not full ones (user, 2026-10-04: 平台的名称可以缩写展示): ChileCompra
 * for Mercado Público, SHCP for Hacienda's Proyectos Estratégicos, BORA for the
 * Boletín Oficial de la República Argentina, Metro SCL for Metro de Santiago,
 * DGCP for the Dominican Republic's Portal Transaccional (2026-10-04).
 * Rows chosen by hand so the longer names sit in the sparser rows.
 *
 * Desktop is two wide rows, not three narrow ones (user, 2026-10-04: 太高了，
 * 可以做宽一点，但是矮一点 … 把点位放宽一点，但是层数少一点). 12 over 10 so the
 * second row falls between the dots of the first; 13 over 10 since DGCP joined
 * (2026-10-04) — 12 over 11 lined the two rows up; 14 over 11 since SOCE and
 * PanamaCompra (2026-10-06), the short name in the crowded row; 14 over 12
 * since SICOES (2026-10-10), the second row reordered so a long name always
 * sits between two short ones (Metro SCL and PanamaCompra touched at 12 a row).
 */
const DESKTOP_ROWS = [
  ["ComprasMX", "PNCP", "SECOP II", "ChileCompra", "SEACE", "COMPR.AR", "PEMEX", "DGCP", "Petrobras", "UPME", "SOCE", "Codelco", "CFE", "DOU"],
  ["Petroperú", "ANEEL", "CONTRAT.AR", "ADIF", "ProInversión", "SHCP", "Metro SCL", "BORA", "PanamaCompra", "Cemig", "SICOES", "ANTAQ"],
];
// Five a row since SOCE and PanamaCompra (2026-10-06): each long name sits
// between two short ones, since a 360px row of five leaves ~62px a dot.
// SICOES (2026-10-10) makes the row of the shortest names six.
const MOBILE_ROWS = [
  ["ComprasMX", "SOCE", "ChileCompra", "PNCP", "SECOP II"],
  ["PEMEX", "DOU", "PanamaCompra", "CFE", "SEACE"],
  ["Petrobras", "BORA", "Codelco", "COMPR.AR", "DGCP"],
  ["ANEEL", "ADIF", "SICOES", "Cemig", "ANTAQ", "Petroperú"],
  ["Metro SCL", "UPME", "CONTRAT.AR", "SHCP", "ProInversión"],
];
const PLATFORM_COUNT = DESKTOP_ROWS.flat().length;

/** Fixed offsets so the dots read as scattered rather than as a table — and render identically on server and client. */
const JITTER = [
  [0, 0], [-10, 12], [12, -9], [-6, 7], [9, -12], [-12, 5], [5, 10], [11, -5],
] as const;

function layout(rows: string[][], width: number, rowY: number[], margin: number): Dot[] {
  return rows.flatMap((row, r) => {
    const spacing = (width - margin * 2) / row.length;
    return row.map((name, i) => {
      const [dx, dy] = JITTER[(i + r * 3) % JITTER.length]!;
      return { name, x: margin + spacing * (i + 0.5) + dx, y: rowY[r]! + dy };
    });
  });
}

type Scene = {
  width: number;
  height: number;
  exit: { x: number; y: number; r: number };
  labelSize: number;
  dots: Dot[];
};

const DESKTOP: Scene = {
  width: 1600,
  height: 350,
  exit: { x: 800, y: 246, r: 44 },
  labelSize: 16,
  dots: layout(DESKTOP_ROWS, 1600, [34, 112], 30),
};
const MOBILE: Scene = {
  width: 360,
  height: 530,
  exit: { x: 180, y: 408, r: 36 },
  labelSize: 11,
  dots: layout(MOBILE_ROWS, 360, [22, 82, 142, 202, 262], 26),
};

function pathTo(dot: Dot, exit: Scene["exit"]): string {
  const endY = exit.y - exit.r - 6;
  const drop = endY - dot.y;
  return `M${dot.x.toFixed(1)} ${dot.y.toFixed(1)} C${dot.x.toFixed(1)} ${(dot.y + drop * 0.55).toFixed(1)} ${exit.x} ${(endY - drop * 0.45).toFixed(1)} ${exit.x} ${endY}`;
}

function Convergence({ scene, idPrefix, className }: { scene: Scene; idPrefix: string; className: string }) {
  const { exit } = scene;
  return (
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className={className} role="img" aria-label={`${PLATFORM_COUNT} 个官方采购平台的公告汇集到拉美招投标信息平台`}>
      <defs>
        <radialGradient id={`${idPrefix}-glow`}>
          <stop offset="0%" stopColor="#ffb21c" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffb21c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${idPrefix}-line`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={exit.y}>
          <stop offset="0%" stopColor="#ffb21c" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#e39a10" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <circle cx={exit.x} cy={exit.y} r={exit.r * 2.6} fill={`url(#${idPrefix}-glow)`} />

      <g fill="none" stroke={`url(#${idPrefix}-line)`} strokeWidth={1.3}>
        {scene.dots.map((dot, i) => (
          <path key={dot.name} id={`${idPrefix}-p${i}`} d={pathTo(dot, exit)} />
        ))}
      </g>

      <g className="whyus-particles" fill="#b86e00">
        {scene.dots.map((dot, i) => {
          const dur = `${3.4 + (i % 5) * 0.5}s`;
          // Negative begin: every particle is already mid-flight on first
          // paint, rather than all of them waiting at the SVG origin.
          const begin = `-${((i * 0.73) % 3.4).toFixed(2)}s`;
          return (
            <circle key={dot.name} r={3}>
              <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
                <mpath href={`#${idPrefix}-p${i}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={dur} begin={begin} repeatCount="indefinite" />
            </circle>
          );
        })}
      </g>

      {scene.dots.map((dot, i) => (
        <g key={dot.name}>
          <circle cx={dot.x} cy={dot.y} r={10} fill="#ffb21c" opacity={0.14} />
          <circle className="whyus-dot" style={{ animationDelay: `${((i * 0.41) % 3.6).toFixed(2)}s` }} cx={dot.x} cy={dot.y} r={4.5} fill="#ffffff" stroke="#e39a10" strokeWidth={2} />
          <text x={dot.x} y={dot.y + scene.labelSize + 9} textAnchor="middle" fontSize={scene.labelSize} fontWeight={700} fill="#52636e" stroke="#fffdf9" strokeWidth={4} paintOrder="stroke" className="font-mono">
            {dot.name}
          </text>
        </g>
      ))}

      <circle className="whyus-exit-ring" cx={exit.x} cy={exit.y} r={exit.r} fill="none" stroke="#ffb21c" strokeWidth={2} />
      <circle cx={exit.x} cy={exit.y} r={exit.r} fill="#0c2637" stroke="#ffb21c" strokeWidth={2.5} />
      {/* The site's own mark and name (user, 2026-10-04: 把一个入口改成 Logo + 拉美招投标信息平台). The dark variant is the one drawn on navy, as in the header. */}
      <image href="/brand/logo-dark-ui.webp" x={exit.x - exit.r * 0.72} y={exit.y - exit.r * 0.72} width={exit.r * 1.44} height={exit.r * 1.44} />
      <text x={exit.x} y={exit.y + exit.r + exit.r * 0.72} textAnchor="middle" fontSize={exit.r * 0.46} fontWeight={900} letterSpacing="0.06em" fill="#071826">拉美招投标信息平台</text>
    </svg>
  );
}

type StepIcon = "collect" | "filter" | "translate" | "document" | "bell";

const steps: { number: string; icon: StepIcon; title: string; detail: string; result: string }[] = [
  {
    number: "01",
    icon: "collect",
    title: "每日汇集",
    detail: "每天更新拉美各国 30 多个官方采购平台的新公告，汇集到一个平台。",
    result: "多源信息一站聚合，告别低效逐站检索",
  },
  {
    number: "02",
    icon: "filter",
    title: "筛掉噪音",
    detail: "人工筛选，滤掉日常服务及小额项目，仅保留具备投标价值的项目。",
    result: "只聚焦有效商机",
  },
  {
    number: "03",
    icon: "translate",
    title: "中文整理",
    detail: "整理成中文信息，按国家、行业、项目规模分类。",
    result: "一眼看懂是什么、值不值得跟",
  },
  {
    number: "04",
    icon: "document",
    title: "标书拆解",
    detail: "分析标书，提炼资质、业绩、所需文件、风险点与关键日期。",
    result: "先看清门槛，再投入",
  },
  {
    number: "05",
    icon: "bell",
    title: "按需送达",
    detail: "按国家、行业、关键词订阅，新项目和进展变化通过邮件提醒。",
    result: "及时把握投标窗口",
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
    <section id="how-it-works" className="overflow-hidden bg-[#fffdf9] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <Reveal className="grid gap-8 border-b border-[#dbe2e5] pb-9 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Why us</p>
            {/* User's wording, 2026-10-04. The first line is split in two on phones, where it would not fit. */}
            <h2 className="mt-3 text-[min(6.6vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] text-[#071826] sm:text-4xl"><span className="block whitespace-nowrap"><span className="block sm:inline">从每天 30 多个平台</span><span className="text-[#b86e00]">上万条</span>信息，</span><span className="block whitespace-nowrap">到一份能直接判断的中文情报</span></h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#64717c] lg:justify-self-end">不替企业做决定，而是把分散、陌生且难以快速判断的政府招标信息，一步步整理成团队能够高效使用的中文情报。</p>
        </Reveal>

        {/* Stage 1 — scattered official portals converging into one entry. */}
        <Reveal className="mt-10 text-center">
          <p className="text-sm font-black text-[#071826]">拉美各国 30 多个官方采购平台</p>
          <p className="mt-1 text-xs text-[#75838c]">西语、葡语 · 格式各异</p>
          {/* Highlighted on request (user, 2026-10-04); wording changed from 数千条 to 上万条 on request.
              The buyer count is distinct publishing entities over the last year or month: SECOP II
              10,611, PNCP 7,188 in September 2026 alone, ChileCompra ~850, plus estimates for
              SEACE, Compras MX and COMPR.AR. Approved as 2 万多个 by the user, 2026-10-04. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <p className="inline-flex items-baseline gap-1.5 rounded-full bg-[#071826] px-4 py-1.5 text-white shadow-[0_8px_24px_-12px_rgba(7,24,38,.6)]">
              <span className="text-xs font-bold text-white/70">每天</span>
              <span className="whyus-shimmer text-lg font-black">上万条</span>
              <span className="text-xs font-bold text-white/70">新公告</span>
            </p>
            <p className="inline-flex items-baseline gap-1.5 rounded-full bg-[#071826] px-4 py-1.5 text-white shadow-[0_8px_24px_-12px_rgba(7,24,38,.6)]">
              <span className="text-xs font-bold text-white/70">覆盖</span>
              <span className="whyus-shimmer text-lg font-black">2 万多个</span>
              <span className="text-xs font-bold text-white/70">政府采购单位</span>
            </p>
          </div>
        </Reveal>
        <Reveal delayMs={150}>
          <Convergence scene={DESKTOP} idPrefix="wyd" className="mx-auto mt-4 hidden w-full max-w-[96rem] lg:block" />
          <Convergence scene={MOBILE} idPrefix="wym" className="mx-auto mt-4 block w-full max-w-sm lg:hidden" />
        </Reveal>

        <div aria-hidden="true" className="mx-auto -mt-4 h-10 w-px bg-linear-to-b from-[#ffb21c] to-[#ffb21c]/20" />

        {/* Stage 2 — what we do, node by node. */}
        <ol className="relative mt-2 grid gap-0 lg:grid-cols-5 lg:gap-6">
          {/* The track the nodes sit on: vertical on phones, horizontal from lg with a light running along it. */}
          <span aria-hidden="true" className="absolute bottom-6 left-[1.6rem] top-6 w-px bg-linear-to-b from-[#ffb21c] to-[#b86e00] lg:hidden" />
          <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[1.55rem] hidden h-0.5 overflow-hidden rounded-full bg-[#ffe3a6] lg:block">
            <span className="whyus-track-sweep absolute inset-y-0 left-0 w-1/5 bg-linear-to-r from-transparent via-[#b86e00] to-transparent" />
          </span>
          {/* The five steps arrive one after another, each icon popping a beat after its text (user, 2026-10-04: 动画方案 3). */}
          {steps.map((step, index) => (
            <Reveal as="li" delayMs={index * 140} key={step.number} className="relative flex gap-5 pb-8 last:pb-0 lg:flex-col lg:items-center lg:pb-0 lg:text-center">
              <span className="reveal-pop relative z-10 flex size-[3.2rem] shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#ffc247] to-[#e39a10] text-[#071826] shadow-[0_0_0_6px_#fffdf9,0_10px_24px_-10px_rgba(184,110,0,.7)]">
                <Icon name={step.icon} />
              </span>
              <div className="min-w-0 lg:mt-5">
                <p className="font-mono text-xs font-black tracking-wider text-[#b86e00]">STEP {step.number}</p>
                <h3 className="mt-1 text-xl font-black text-[#071826]">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#64717c]">{step.detail}</p>
                {/* rounded-2xl, not rounded-full: between lg and xl the longer lines (多源信息一站聚合，告别低效逐站检索) wrap to two, and a pill stretched over two lines reads as a blob. */}
                <p className="mt-3 inline-flex max-w-full items-baseline gap-1.5 rounded-2xl bg-[#fff4d8] px-3 py-1 text-left text-xs font-bold leading-5 text-[#7a5310]">
                  <span aria-hidden="true">→</span>
                  {/* Breaks only after ， or 、, never inside a phrase (一眼看懂是什 / 么 at 1024 px). */}
                  <span>
                    {step.result.split(/(?<=[，、])/).map((part) => (
                      <span key={part} className="whitespace-nowrap">{part}</span>
                    ))}
                  </span>
                </p>
              </div>
            </Reveal>
          ))}
        </ol>

        <div aria-hidden="true" className="flex justify-center py-5">
          <svg viewBox="0 0 24 40" className="h-10 w-6"><path d="M12 2v32m-7-8 7 8 7-8" fill="none" stroke="#b86e00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        {/* Stage 3 — what the customer gets. */}
        <Reveal delayMs={200} className="relative overflow-hidden rounded-[1.75rem] bg-[#0c2637] px-6 py-8 text-center sm:px-10 sm:py-10">
          <span aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-[#ffb21c]/20 blur-3xl" />
          <p className="relative text-xs font-black uppercase tracking-[0.2em] text-[#ffcd67]">你拿到的</p>
          <p className="relative mt-2 text-xl font-black text-white sm:text-2xl">一份可以直接判断「投不投」的中文项目情报</p>
          <ul className="relative mt-5 flex flex-wrap justify-center gap-2.5">
            {deliverables.map((item) => (
              <li key={item} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-bold text-white/85">{item}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
