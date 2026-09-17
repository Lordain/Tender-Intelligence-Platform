import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata } from "@/lib/seo";

const insight = getCountryInsight("peru")!;

export const metadata: Metadata = pageMetadata({
  title: "秘鲁国家洞察：竞争力、物流走廊与战略项目机会",
  description:
    "梳理秘鲁2024—2030竞争力规划、2032物流走廊、2026公共投资与PPP项目组合，以及交通、矿业、能源、水务和社会基础设施机会。",
  path: "/insights/peru",
  image: insight.heroImage,
});

type IconName = "rail" | "road" | "port" | "energy" | "water" | "mine" | "health" | "digital";

function SectorIcon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "road" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /></>}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "mine" && <><path d="m4 19 5-9 3 5 3-8 5 12H4Z" /><path d="m7 5 10 4M12 3l-2 14" /></>}
      {name === "health" && <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M9 5V3h6v2M12 9v8M8 13h8" /></>}
      {name === "digital" && <><path d="M5 15a10 10 0 0 1 14 0M8 18a6 6 0 0 1 8 0M12 21h.01" /><path d="M4 5h16v6H4z" /></>}
    </svg>
  );
}

const appPortfolio = [
  { name: "能源与矿业", projects: "19个项目", amount: 30.59, color: "bg-[#c85c43]" },
  { name: "水务与卫生", projects: "6个项目", amount: 25.51, color: "bg-[#59a8d8]" },
  { name: "交通", projects: "8个项目", amount: 15.18, color: "bg-[#d9a23a]" },
  { name: "医疗", projects: "4个项目", amount: 14.08, color: "bg-[#7b63a8]" },
  { name: "教育", projects: "2个项目", amount: 7.47, color: "bg-[#8dc9e8]" },
];

const pipeline = [
  { icon: "port" as const, title: "港口、机场与国家物流走廊", text: "《2032国家运输物流服务与基础设施规划》识别了41条物流走廊，并把公路、铁路、港口、机场和水运作为一个系统来处理。Callao、Chancay、Paita、Matarani和Ilo周边的集疏运、仓储、海关和工业配套，值得与港口本体一起跟踪。" },
  { icon: "rail" as const, title: "城市轨道、铁路与公路特许经营", text: "MTC的跨项目组合覆盖Lima地铁、Anillo Vial Periférico、Huancayo—Huancavelica铁路、区域机场和干线公路。大型项目多采用特许经营、APP或增补合同，供应商既要跟踪政府采购，也要识别中标特许经营公司和EPC承包链。" },
  { icon: "mine" as const, title: "矿业项目与配套基础设施", text: "MINEM的2026矿业投资组合包含66个项目、覆盖19个大区，估算投资640.75亿美元。铜、金、银、锌和铁项目会继续拉动矿山工程、电力、输水、营地、选矿、运输、自动化、环保和备件服务需求。" },
  { icon: "energy" as const, title: "输电、可再生能源与矿区供能", text: "能源项目机会不仅来自独立电站，也来自矿山、港口和工业项目的新增负荷。重点包括输电线路、变电站、光伏、储能、微网、电气设备以及长期运维；项目许可、并网和土地安排需要逐项核验。" },
  { icon: "water" as const, title: "水务、污水处理与灌溉", text: "PROINVERSIÓN的2026组合中，六个卫生与水务项目合计约25.51亿美元。沿海缺水城市、矿业地区、农业灌溉区和快速增长城市都可能出现海水淡化、供水、污水处理、输水和管网项目。" },
  { icon: "health" as const, title: "医疗与教育社会基础设施", text: "2026 APP组合披露四个医疗项目约14.08亿美元、两个教育项目约7.47亿美元，重点涉及Lima、Piura和Cusco等地。除了建设，还可能包含设备、设施管理、维护和长期服务绩效要求。" },
  { icon: "digital" as const, title: "数字化建设与公共投资管理", text: "2024—2030竞争力规划继续推动公共投资数字化、BIM和项目准备能力。对工程咨询、设计软件、数据平台、测绘、监测及项目管理服务商而言，机会往往进入顾问和系统合同，而不是传统土建标段。" },
];

const regions = [
  { number: "01", title: "北部资源与物流带", states: "Tumbes、Piura、Lambayeque、La Libertad、Cajamarca、Áncash", focus: "矿业、农业出口、公路、Paita港、区域机场、水务和灌溉。Cajamarca是矿业投资重点，沿海地区则更强调港口物流、农业供应链和城市公共服务。" },
  { number: "02", title: "Lima—Callao与中部枢纽", states: "Lima、Callao、Junín、Pasco、Huánuco、Ica、Huancavelica、Ayacucho", focus: "Lima地铁、外围环路、Callao港与机场、中部铁路、公路、工业物流、医疗和水务。采购主体集中、项目体量大，但竞争、许可和城市施工组织也更复杂。" },
  { number: "03", title: "南部矿业能源走廊", states: "Arequipa、Apurímac、Cusco、Moquegua、Tacna、Puno", focus: "铜矿及扩建、矿区供电与输水、公路铁路、Matarani和Ilo港口、旅游交通及公共服务。南部矿业项目集中，社会许可、社区关系与高海拔施工能力至关重要。" },
  { number: "04", title: "亚马孙与东部连接区", states: "Loreto、Ucayali、San Martín、Amazonas、Madre de Dios", focus: "河运与内河码头、Hidrovía Amazónica、数字连接、离网能源、水务、卫生和偏远地区公共服务。合同可能更分散，但对物流组织和长期运维的要求更高。" },
];

const opportunityRows: Array<{ icon: IconName; sector: string; scope: string; buyers: string }> = [
  { icon: "road", sector: "交通与大型工程", scope: "公路桥隧、轨道、站场、机场、收费和智能交通、施工设备", buyers: "MTC、PROVÍAS、PROINVERSIÓN、特许经营公司" },
  { icon: "mine", sector: "矿业供应链", scope: "矿山工程、选矿、输水供电、输送、自动化、环保、备件与维护", buyers: "矿业项目业主、EPC承包商和矿区服务公司" },
  { icon: "port", sector: "港口与物流", scope: "码头、疏浚、装卸、仓储、冷链、海关设施和集疏运连接", buyers: "APN、港口运营商、物流园区及地方项目主体" },
  { icon: "energy", sector: "电力与新能源", scope: "输变电、光伏、储能、微网、保护控制、工程及运维", buyers: "MINEM、COES、配电企业和项目开发商" },
  { icon: "water", sector: "水务与灌溉", scope: "海水淡化、供排水、污水处理、输水、泵站及智慧水务", buyers: "住房部、地方政府、公用事业公司及农业主管机构" },
  { icon: "health", sector: "医疗与教育", scope: "医院学校建设、医疗设备、设施管理、维护和数字化服务", buyers: "卫生部、教育部、EsSalud、区域政府及APP项目公司" },
];

const sources = [
  { label: "CNCF：国家竞争力与生产力计划2024—2030", href: "https://www.cnc.gob.pe/plan-de-competitividad/plan-de-competitividad", note: "75项措施、37个责任机构及至2030年7月的实施节点。" },
  { label: "MEF：国家可持续基础设施计划2022—2025", href: "https://www.mef.gob.pe/es/inversion-privada-sp-21801/6082-plan-nacional-de-infraestructura-sostenible-para-la-competitividad-2022-2025", note: "72个优先项目、1,466.22亿索尔（约435.6亿美元）及十个领域。" },
  { label: "MEF：2026公共预算", href: "https://www.gob.pe/institucion/mef/noticias/1299969-presupuesto-publico-2026-es-aprobado-tras-consenso-entre-gobierno-y-congreso-para-fortalecer-obras-y-servicios-esenciales", note: "2,575.62亿索尔（约765.2亿美元）预算总额及中央、区域和地方分配。" },
  { label: "MEF：2026预算投资说明", href: "https://www.gob.pe/institucion/mef/noticias/1240904-titular-del-mef-propuesta-de-presupuesto-publico-2026-permitira-al-peru-mantener-el-camino-de-desarrollo-y-cierre-de-brechas", note: "2026年投资安排、工程续建比例及部门重点。" },
  { label: "PROINVERSIÓN：2026 APP与资产项目组合", href: "https://www.gob.pe/institucion/proinversion/noticias/1363835-proinversion-impulsa-cartera-de-44-proyectos-y-8-adendas-por-cerca-de-us-20-mil-millones-para-el-2026", note: "44个项目、8项增补合同、197.97亿美元及主要行业分布。" },
  { label: "MTC：2032国家运输物流规划", href: "https://www.gob.pe/institucion/mtc/normas-legales/4081616-362-2023-mtc-01", note: "已批准的2032物流服务与基础设施规划及原始文件。" },
  { label: "MTC：41条物流走廊及基础设施缺口", href: "https://www.gob.pe/institucion/mtc/noticias/1404135-mtc-expone-cartera-de-proyectos-multimodales-para-impulsar-la-competitividad-nacional", note: "41条物流走廊、超过920亿索尔（约273.3亿美元）的交通物流缺口及区域项目。" },
  { label: "MINEM：2026矿业投资项目组合", href: "https://www.gob.pe/institucion/minem/noticias/1415102-minem-publica-cartera-de-proyectos-de-inversion-minera-2026-que-representa-inversiones-superiores-a-us-64-mil-millones", note: "66个项目、19个大区及640.75亿美元投资。" },
  { label: "SBS：官方会计汇率", href: "https://www.sbs.gob.pe/app/pp/SISTIP_PORTAL/Paginas/Publicacion/TipoCambioContable.aspx", note: "2026年9月16日参考汇率：1美元＝3.3660秘鲁索尔。" },
];

export default function PeruInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    dateModified: "2026-09-17",
    datePublished: "2026-09-17",
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image src={insight.heroImage} alt="秘鲁太平洋港口、安第斯交通走廊、矿业与能源基础设施" fill priority sizes="100vw" className="object-cover opacity-58" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/90 to-[#031521]/18" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="inline-flex items-center gap-2 text-sm font-bold text-white/68 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#d9a23a] px-3 py-1 text-xs font-black text-[#071826]">秘鲁</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/62">Competitiveness & logistics outlook</span></div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">秘鲁国家洞察：<br className="hidden sm:block" />竞争力、物流走廊与战略项目机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/78 sm:text-lg">从2024—2030竞争力规划、2032物流走廊和2026项目组合出发，识别交通、矿业、能源、水务与社会基础设施的可执行机会。</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/64"><span>作者：<strong className="text-white">拉美招投标指南针</strong></span></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { number: "01", title: "2026公共投资安排", value: "561.57亿", unit: "秘鲁索尔", secondary: "约166.8亿美元", description: "年度预算文件中的投资支出口径" },
            { number: "02", title: "APP与资产项目", value: "44+8", unit: "项目与增补合同", secondary: "目标197.97亿美元", description: "PROINVERSIÓN 2026年推动组合" },
            { number: "03", title: "矿业投资储备", value: "66", unit: "个矿业项目", secondary: "合计640.75亿美元", description: "分布于全国19个大区" },
            { number: "04", title: "国家物流网络", value: "41", unit: "条物流走廊", secondary: "规划延伸至2032年", description: "连接公路、铁路、港口、机场与水运" },
          ].map(({ number, title, value, unit, secondary, description }) => (
            <div key={number} className="relative flex min-h-60 flex-col overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,0.05)] sm:p-6">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c85c43] via-[#d9a23a] to-[#59a8d8]" />
              <div className="flex items-center justify-center gap-2"><span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#b54f39]">{number}</span><span className="h-3 w-px bg-[#dbe2e5]" /><h2 className="text-xs font-black tracking-[0.07em] text-[#445762]">{title}</h2></div>
              <div className="mt-6"><p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#a94835] sm:text-4xl">{value}</p><p className="mt-2 text-sm font-black text-[#253d4b]">{unit}</p><p className="mt-1 text-xs font-bold text-[#87642a]">（{secondary}）</p></div>
              <div className="mx-auto mt-auto w-10 border-t-2 border-[#d9a23a] pt-4" /><p className="text-xs leading-5 text-[#6b7981]">{description}</p>
            </div>
          ))}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d9a23a] bg-[#fff3cf] p-5 sm:p-6">
          <p className="font-black text-[#6c421c]">先理解规划周期与政治变化</p>
          <p className="mt-2 text-sm leading-7 text-[#725e47]">秘鲁没有一个可以覆盖全部行业的单一“2026—2030基础设施总盘子”。本文采用的是2024—2030竞争力规划、2032物流规划、2026财政预算和主管机构项目组合。秘鲁近年来总统及内阁更替较频繁，可能影响政策排序、审批和项目节奏；因此，本文更重视已经通过法律、合同、部委规划或正式项目组合确认的事项。具体采购仍应以MEF、PROINVERSIÓN、OECE和各主管机构最新公告为准。</p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#d9a23a]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview","规划框架"],["sectors","投资组合"],["pipeline","工程方向"],["regions","区域分布"],["opportunities","企业机会"],["entry","进入路径"],["sources","资料来源"]].map(([id,label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/68 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>

          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Planning framework</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">真正稳定的主线来自制度、合同与长期物流规划</h2>
              <div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base">
                <p>《国家竞争力与生产力计划2024—2030》包含75项措施，由37个公共机构承担至少一个实施节点，覆盖基础设施、人才、贸易、融资、制度、数字化、劳动力市场和可持续发展。它更像改革路线图，不是可直接相加的工程预算。</p>
                <p>基础设施项目的历史基线来自PNISC 2022—2025：72个优先项目，投资1,466.22亿索尔（约435.6亿美元），横跨交通、通信、水务、电力、油气、环境、生产、农业灌溉、教育和医疗。即使规划期结束，仍在建设、特许经营或运营中的项目不会随政府换届自动消失。</p>
                <p>2026年公共预算总额为2,575.62亿索尔（约765.2亿美元），其中投资支出安排为561.57亿索尔（约166.8亿美元）。但企业还应同步跟踪APP、Proyectos en Activos和Obras por Impuestos，因为秘鲁重大基础设施并不只通过传统财政采购落地。</p>
              </div>
            </section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">2026 transaction portfolio</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">2026年APP组合，水务、能源和交通最值得关注</h2>
              <p className="mt-4 text-sm leading-7 text-[#64717c]">PROINVERSIÓN计划推动44个项目和8项合同增补，目标投资197.97亿美元。下列为官方单独披露的主要行业金额，并非各行业占全部组合的百分比。</p>
              <div className="mt-7 rounded-2xl border border-[#e0e6e8] bg-[#fafbf9] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#64717c]"><span>横条表示披露投资金额</span><span className="rounded-full bg-[#e8edef] px-3 py-1 text-[#445762]">单位：亿美元｜统一刻度 0—31</span></div>
                <div className="mt-3 grid grid-cols-4 text-[10px] font-bold text-[#8a969d]"><span>0</span><span className="text-center">10</span><span className="text-center">20</span><span className="text-right">31</span></div>
                <div className="mt-2 space-y-5">{appPortfolio.map((item) => <div key={item.name}><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><p className="font-black">{item.name} <span className="ml-2 text-[#b54f39]">{item.projects}</span></p><p className="font-bold text-[#445762]">{item.amount.toFixed(2)}亿美元</p></div><div className="relative mt-2 h-3 overflow-hidden rounded-full bg-[#e6ecef]"><div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-3"><i className="border-r border-white/70" /><i className="border-r border-white/70" /><i /></div><div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.amount / 31) * 100}%` }} /></div></div>)}</div>
                <p className="mt-5 border-t border-[#e0e6e8] pt-4 text-xs leading-6 text-[#71808a]">读图示例：水务与卫生披露金额为25.51亿美元，因此横条延伸至约25.5的位置。横条不是百分比，也不能据此推算完整行业占比。</p>
              </div>
              <div className="mt-10 border-t border-[#dbe2e5] pt-8"><h3 className="text-xl font-black">投资趋势分析</h3><div className="mt-5 grid gap-4 md:grid-cols-3">{[
                ["01","港口不再是孤立资产","Chancay、Callao及区域港口正与公路、铁路、仓储、工业园和海关能力形成组合需求。"],
                ["02","矿业项目带动第二层采购","矿山本体之外，输电、供水、道路、营地、环保和自动化更适合专业供应商提前进入。"],
                ["03","建设与长期服务并重","APP和社会基础设施项目越来越强调运营绩效，设备维护、设施管理与数字监测会形成多年需求。"],
              ].map(([n,t,d]) => <div key={n} className="rounded-2xl bg-[#f1f3f2] p-5"><p className="font-mono text-xs font-black text-[#b54f39]">{n}</p><h4 className="mt-3 font-black">{t}</h4><p className="mt-2 text-sm leading-7 text-[#586873]">{d}</p></div>)}</div></div>
            </section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Project pipeline</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">已经可以看到哪些工程方向？</h2>
              <div className="mt-7 grid gap-4">{pipeline.map(({icon,title,text}) => <div key={title} className="grid gap-4 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#c85c43] text-white"><SectorIcon name={icon} /></span><div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p></div></div>)}</div>
            </section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Regional opportunity map</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">四类区域，形成不同的采购组合</h2>
              <figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]"><Image src="/insights/peru-infrastructure-regions.webp" alt="秘鲁四类重点基础设施投资区域示意图" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" /><div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/82 sm:grid-cols-2">{[["bg-[#d9a23a]","北部资源与物流带"],["bg-[#59a8d8]","Lima—Callao与中部枢纽"],["bg-[#c85c43]","南部矿业能源走廊"],["bg-[#7b63a8]","亚马孙与东部连接区"]].map(([color,label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div><figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">区域划分用于表达投资方向和供应链逻辑，不代表具体矿权、项目线路或行政边界上的精确投资范围。</figcaption></figure>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#b54f39]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a672e]">{region.states}</p><p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p></div>)}</div>
              <div className="mt-6 border-l-4 border-[#c85c43] bg-[#fff2ec] px-5 py-4 text-sm leading-7 text-[#66562f]">在秘鲁，“项目所在大区”会直接影响物流、高海拔施工、社区关系、水资源、地方政府协调和售后覆盖。企业判断机会时，应把区域履约条件与技术条件放在同一张成本表中。</div>
            </section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]">
              <div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Opportunity map</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">中国企业可以从哪些位置进入？</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">直接争取大型特许经营权并不是唯一选择。设备供货、专项工程、EPC分包、项目设计、运营维护和当地联合履约，通常更适合作为第一阶段入口。</p></div>
              <div className="overflow-x-auto border-t border-[#dbe2e5]"><table className="min-w-[780px] w-full text-left text-sm"><thead className="bg-[#edf1f2] text-xs uppercase tracking-[0.08em] text-[#62727b]"><tr><th className="px-6 py-4">行业</th><th className="px-6 py-4">潜在供应链机会</th><th className="px-6 py-4">优先跟踪主体</th></tr></thead><tbody className="divide-y divide-[#e2e7e9]">{opportunityRows.map(({icon,sector,scope,buyers}) => <tr key={sector} className="align-top"><th className="px-6 py-5 font-black"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f8ded7] text-[#b54f39]"><SectorIcon name={icon} className="size-5" /></span>{sector}</span></th><td className="px-6 py-5 leading-7 text-[#586873]">{scope}</td><td className="px-6 py-5 leading-7 text-[#586873]">{buyers}</td></tr>)}</tbody></table></div>
            </section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Market entry</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">把国家方向转化为可执行动作</h2>
              <ol className="mt-7 space-y-6">{[
                ["先分清采购机制","传统公共采购、APP、Proyectos en Activos和Obras por Impuestos的主体、回报方式、文件和风险完全不同。"],
                ["把项目阶段拆开管理","规划、预投资、可研、结构化、招标、建设和运营分别对应不同客户与进入动作，不要只盯公告截止日。"],
                ["建立采购主体与承包链地图","除OECE/SEACE外，还需跟踪MEF、PROINVERSIÓN、MTC、MINEM、区域政府、公用事业公司、特许经营商和EPC企业。"],
                ["提前解决RNP与本地履约","核对境外企业RNP登记、授权代表、西班牙语文件、担保、税务、进口、劳动与当地分支安排。"],
                ["把政治风险转化为节点核验","政府人事变化后，重新确认预算、主管机构、合同状态、许可和最新时间表，不因一项政治声明立即调整全部市场判断。"],
              ].map(([title,detail],index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#d9a23a]">{index+1}</span><div className="border-b border-[#e2e7e9] pb-6 last:border-0 last:pb-0"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p></div></li>)}</ol>
              <div className="mt-8 grid gap-4 md:grid-cols-2"><div className="flex flex-col items-start rounded-2xl bg-[#eef2f2] p-5 sm:p-6"><p className="font-black">常规公共采购怎么参与？</p><p className="mt-1 text-sm leading-6 text-[#64717c]">查看RNP、SEACE／PLADICOP和境外企业参与路径。</p><Link href="/guides/peru-seace-oece" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#061b2b] px-5 text-sm font-black text-white transition hover:bg-[#123a54]">查看秘鲁SEACE指南 →</Link></div><div className="flex flex-col items-start rounded-2xl bg-[#fff0d4] p-5 sm:p-6"><p className="font-black">以工程抵税项目怎么进入？</p><p className="mt-1 text-sm leading-6 text-[#64717c]">先判断是出资企业还是施工、设备和服务执行方。</p><Link href="/guides/peru-obras-por-impuestos" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c85c43] px-5 text-sm font-black text-white transition hover:bg-[#b44f39]">查看Obras por Impuestos指南 →</Link></div></div>
            </section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#d9a23a]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续查看正在发布的秘鲁项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/66">国家洞察用于判断中长期方向；项目页用于核对采购方、程序状态、截止日期、资格和文件要求。</p><Link href="/tenders?country=Peru" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#d9a23a] px-6 font-black text-[#071826] transition hover:bg-[#e8b957]">浏览秘鲁招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b54f39]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">资料来源与使用说明</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">本文优先使用MEF、CNCF、PROINVERSIÓN、MTC、MINEM及SBS公开资料。不同资料分别表示规划、预算、交易组合或行业储备，存在范围重叠，不能直接相加。</p>
              <div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#c27863] hover:bg-[#fff2ec]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p></div><span className="shrink-0 font-black text-[#b54f39] transition-transform group-hover:translate-x-0.5">↗</span></div></a>)}</div>
              <div className="mt-6 rounded-xl border border-[#dbe2e5] bg-[#f4f6f6] px-4 py-4 text-xs leading-6 text-[#71808a]"><strong className="text-[#52636e]">美元换算口径：</strong>本文统一按2026年9月16日SBS会计汇率，即1美元＝3.3660秘鲁索尔换算，仅用于理解金额量级，不构成报价或财务依据。</div>
              <div className="mt-4 rounded-xl border border-[#e1bd75] bg-[#fff3d9] px-4 py-4 text-xs leading-6 text-[#78613a]"><strong>政治连续性提示：</strong>秘鲁总统、内阁和部门负责人变化可能影响项目优先级与执行速度。长期规划不等于项目必然按期实施；已签合同、已获预算、已进入采购或具有多年度法律依据的项目，通常比单次政策宣布更具有可跟踪性。</div>
              <p className="mt-6 text-xs leading-6 text-[#8d8186]">本文不构成投资、法律、税务或投标资格意见。具体项目的采购文件、更正、许可、合同和主管机构最新决定具有最终效力。</p>
            </section>
          </div>
        </div>
      </main>
    </article>
  );
}
