/**
 * Why us, drawn as the pipeline it is (user, 2026-10-04: 把我们做的关键动作做成
 * 节点，然后一步一步讲，先从收集20多个平台的信息汇集我们平台，然后经过处理，变成
 * 高价值的情报; then 把各平台做成圆点，分散分布，然后汇集到一个出口 … 也可以动画化).
 *
 * No country count anywhere in the copy (user, 2026-10-04: 不用强调6国，因为我们
 * 不断在增加国家); the platform count stays "20 多个".
 *
 * Every claim here is something the platform does today. The dots are the
 * official sources the importers read — 22 named here, 23 counting ANEEL's two
 * auction feeds separately, on 2026-10-04. Keep the rows below and the "20 多个"
 * copy in step with that list.
 *
 * The motion is decoration on a picture that already says everything when
 * still: particles travel each path into the exit, the dots breathe, a light
 * runs along the step track. Under prefers-reduced-motion all of it stops and
 * the particles are not drawn (app/globals.css, .whyus-*).
 */

type Dot = { name: string; x: number; y: number };

/**
 * Short names, not full ones (user, 2026-10-04: 平台的名称可以缩写展示): ChileCompra
 * for Mercado Público, SHCP for Hacienda's Proyectos Estratégicos, BORA for the
 * Boletín Oficial de la República Argentina, Metro SCL for Metro de Santiago.
 * Rows chosen by hand so the longer names sit in the sparser rows.
 */
const DESKTOP_ROWS = [
  ["ComprasMX", "PNCP", "SECOP II", "ChileCompra", "SEACE", "COMPR.AR", "PEMEX", "Petrobras"],
  ["UPME", "Codelco", "Petroperú", "CONTRAT.AR", "CFE", "ANEEL", "ProInversión"],
  ["Metro SCL", "ADIF", "SHCP", "DOU", "Cemig", "ANTAQ", "BORA"],
];
const MOBILE_ROWS = [
  ["ComprasMX", "ChileCompra", "PNCP", "SECOP II"],
  ["PEMEX", "SEACE", "UPME", "DOU", "CFE"],
  ["Petrobras", "BORA", "Codelco", "COMPR.AR"],
  ["ANEEL", "ADIF", "Cemig", "ANTAQ", "Petroperú"],
  ["Metro SCL", "CONTRAT.AR", "ProInversión", "SHCP"],
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
  width: 1200,
  height: 500,
  exit: { x: 600, y: 356, r: 46 },
  labelSize: 13,
  dots: layout(DESKTOP_ROWS, 1200, [44, 128, 212], 40),
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
          <text x={dot.x} y={dot.y + scene.labelSize + 9} textAnchor="middle" fontSize={scene.labelSize} fontWeight={700} fill="#52636e" className="font-mono">
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
    detail: "每天自动读取拉美各国 20 多个官方采购平台的新公告，汇集到一个平台。",
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
    <section id="how-it-works" className="overflow-hidden bg-[#fffdf9] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <div className="grid gap-8 border-b border-[#dbe2e5] pb-9 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Why us</p>
            {/* User's wording, 2026-10-04. The first line is split in two on phones, where it would not fit. */}
            <h2 className="mt-3 text-[min(6.6vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] text-[#071826] sm:text-4xl"><span className="block whitespace-nowrap"><span className="block sm:inline">从每天 20 多个平台</span><span className="text-[#b86e00]">数千条</span>信息，</span><span className="block whitespace-nowrap">到一份能直接判断的中文情报</span></h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#64717c] lg:justify-self-end">不替企业做决定，而是把分散、陌生且难以快速判断的政府招标信息，一步步整理成团队能够高效使用的中文情报。</p>
        </div>

        {/* Stage 1 — scattered official portals converging into one entry. */}
        <div className="mt-10 text-center">
          <p className="text-sm font-black text-[#071826]">拉美各国 20 多个官方采购平台</p>
          <p className="mt-1 text-xs text-[#75838c]">西语、葡语 · 格式各异</p>
          {/* Highlighted on request (user, 2026-10-04: 每天数千条 <- 这个地方要Highlight). */}
          <p className="mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-[#071826] px-4 py-1.5 text-white shadow-[0_8px_24px_-12px_rgba(7,24,38,.6)]">
            <span className="text-xs font-bold text-white/70">每天</span>
            <span className="text-lg font-black text-[#ffcd67]">数千条</span>
            <span className="text-xs font-bold text-white/70">新公告</span>
          </p>
        </div>
        <Convergence scene={DESKTOP} idPrefix="wyd" className="mx-auto mt-4 hidden w-full max-w-6xl md:block" />
        <Convergence scene={MOBILE} idPrefix="wym" className="mx-auto mt-4 block w-full max-w-sm md:hidden" />

        <div aria-hidden="true" className="mx-auto -mt-4 h-10 w-px bg-linear-to-b from-[#ffb21c] to-[#ffb21c]/20" />

        {/* Stage 2 — what we do, node by node. */}
        <ol className="relative mt-2 grid gap-0 lg:grid-cols-5 lg:gap-6">
          {/* The track the nodes sit on: vertical on phones, horizontal from lg with a light running along it. */}
          <span aria-hidden="true" className="absolute bottom-6 left-[1.6rem] top-6 w-px bg-linear-to-b from-[#ffb21c] to-[#b86e00] lg:hidden" />
          <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[1.55rem] hidden h-0.5 overflow-hidden rounded-full bg-[#ffe3a6] lg:block">
            <span className="whyus-track-sweep absolute inset-y-0 left-0 w-1/5 bg-linear-to-r from-transparent via-[#b86e00] to-transparent" />
          </span>
          {steps.map((step) => (
            <li key={step.number} className="relative flex gap-5 pb-8 last:pb-0 lg:flex-col lg:items-center lg:pb-0 lg:text-center">
              <span className="relative z-10 flex size-[3.2rem] shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#ffc247] to-[#e39a10] text-[#071826] shadow-[0_0_0_6px_#fffdf9,0_10px_24px_-10px_rgba(184,110,0,.7)]">
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

        <div aria-hidden="true" className="flex justify-center py-5">
          <svg viewBox="0 0 24 40" className="h-10 w-6"><path d="M12 2v32m-7-8 7 8 7-8" fill="none" stroke="#b86e00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        {/* Stage 3 — what the customer gets. */}
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0c2637] px-6 py-8 text-center sm:px-10 sm:py-10">
          <span aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-[#ffb21c]/20 blur-3xl" />
          <p className="relative text-xs font-black uppercase tracking-[0.2em] text-[#ffcd67]">你拿到的</p>
          <p className="relative mt-2 text-xl font-black text-white sm:text-2xl">一份可以直接判断「投不投」的中文项目情报</p>
          <ul className="relative mt-5 flex flex-wrap justify-center gap-2.5">
            {deliverables.map((item) => (
              <li key={item} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-bold text-white/85">{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
