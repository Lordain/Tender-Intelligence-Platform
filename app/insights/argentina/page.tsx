import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("argentina")!;

type SectorIconName = "energy" | "mine" | "rail" | "road" | "port" | "water";

function SectorIcon({ name, className = "size-6" }: { name: SectorIconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "mine" && <><path d="m4 19 5-9 3 5 3-8 5 12H4Z" /><path d="m7 5 10 4M12 3l-2 14" /></>}
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "road" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /></>}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
    </svg>
  );
}

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/argentina",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

const strategyFrameworks = [
  { number: "01", horizon: "2026—2028", title: "国家公共投资计划", text: "国家公共投资计划覆盖1,164个项目，三年列示金额合计约9.53万亿比索。交通运输约3.07万亿比索，能源、燃料与矿业约2.23万亿比索，供排水约0.84万亿比索。" },
  { number: "02", horizon: "30年稳定期", title: "大型投资激励制度", text: "大型投资激励制度面向能源、油气、矿业、基础设施等长周期项目，为获批项目提供30年的税务、海关、外汇和监管稳定框架。已批准金额反映私人项目投资计划，不等于政府采购；设备、工程总承包和服务机会要继续追踪项目业主与承包链。" },
  { number: "03", horizon: "分阶段实施", title: "国家战略网络特许经营", text: "国家公路以Red Federal de Concesiones（联邦特许经营网络）分阶段推进，官方目标覆盖超过9,000公里战略国道；输电扩建计划则列出16项工程、5,610公里500千伏线路。两者都强调私人融资、建设和长期运营。" },
  { number: "04", horizon: "滚动项目管线", title: "铁路、港航与公用事业", text: "铁路安全与更新、Paraná—Paraguay水道、港口集疏运以及阿根廷水务公司供排水并不归入一张统一总规划，而是由主管机关、国有企业和特许经营程序分别推进。判断机会时要看项目阶段、资金来源和正式采购入口。" },
];

const sectorInvestment = [
  { name: "交通运输（含公路与铁路）", share: 32.3, estimate: "约3.07万亿比索", color: "bg-[#59a8d8]" },
  { name: "能源、燃料与矿业", share: 23.4, estimate: "约2.23万亿比索", color: "bg-[#d9a23a]" },
  { name: "供水与排污", share: 8.8, estimate: "约0.84万亿比索", color: "bg-[#5aa8ba]" },
  { name: "科技与创新", share: 4.5, estimate: "约0.43万亿比索", color: "bg-[#67a98d]" },
  { name: "其他功能及金融应用", share: 31.0, estimate: "约2.95万亿比索", color: "bg-[#b5bfc4]" },
];

const sectors: Array<{ icon: SectorIconName; title: string; text: string }> = [
  { icon: "energy", title: "输电扩建与能源配套", text: "国家输电扩建计划列出16项战略工程、超过5,610公里500千伏线路，官方估算投资超过66亿美元。布宜诺斯艾利斯都会区一期输电项目已通过国家公共工程与特许经营平台启动国际、多阶段特许经营招标；油气、锂和可再生能源项目还会带动变电站、管线、道路、水务和营地采购。" },
  { icon: "mine", title: "锂、Vaca Muerta与大型投资项目链", text: "Vaca Muerta是位于Neuquén盆地的页岩油气地质构造和核心产区。截至2026年6月，大型投资激励制度已有16个项目获批，计划投资298.92亿美元。相关机会覆盖矿区和油气工程、供电供水、管线、道路、营地、设备包与长期服务。" },
  { icon: "rail", title: "铁路更新与运营重构", text: "2026年国家公共投资预算分别为国家铁路基础设施公司列示2,000亿比索、国家铁路运营公司列示2,038.62亿比索资本转移。采购方向包括线路、轨道、车站、信号、电气化、变电站、车辆设施及维护。" },
  { icon: "road", title: "国家公路与路网维护", text: "联邦公路特许经营网络目标覆盖超过9,000公里战略国道，并分阶段推进。国家公路局还按路线和区域采购路面恢复、桥涵、安全设施、施工设备及路网养护服务。" },
  { icon: "port", title: "港航、水务与城市服务", text: "Paraná—Paraguay水道和港口项目形成疏浚、导航监测、码头及物流需求；国家公共投资计划三年供排水列示投入约0.84万亿比索，覆盖管网、泵站、处理设施与维护。" },
];

const regions = [
  { number: "01", title: "西北与库约资源带", places: "Jujuy、Salta、Catamarca、La Rioja、San Juan、Mendoza", focus: "锂、铜、油气与可再生能源项目带动矿区道路、输电、供水、营地和加工设施。高海拔、缺水、跨省许可与社区关系会改变履约成本。" },
  { number: "02", title: "东北与Litoral物流带", places: "Misiones、Corrientes、Chaco、Formosa、Entre Ríos、Santa Fe", focus: "水电、林农产业、铁路、公路、港口和Paraná—Paraguay水道相互连接。设备企业应同步跟踪港航运营方、铁路采购与省级项目。" },
  { number: "03", title: "中部都市与Pampas核心区", places: "Buenos Aires、CABA、Córdoba、Santa Fe、La Pampa、San Luis", focus: "AMBA输电、城市水务、干线公路、铁路、港口、公共建筑与数字系统最为集中，也最常出现国家、省、市和特许经营主体并行。" },
  { number: "04", title: "Patagonia能源与连接区", places: "Neuquén、Río Negro、Chubut、Santa Cruz、Tierra del Fuego", focus: "Vaca Muerta油气、风电、输电、管线、港口和长距离交通形成工程链。偏远物流、气候、营地和长期运维能力是报价关键。" },
];

const opportunities: Array<{ icon: SectorIconName; sector: string; scope: string; buyers: string }> = [
  { icon: "energy", sector: "电网与能源", scope: "500千伏线路、变电站、保护控制、储能、油气与矿区供电", buyers: "能源秘书处、CAMMESA、特许经营项目公司、能源与矿业业主" },
  { icon: "rail", sector: "铁路与交通", scope: "轨道、道岔、信号通信、牵引供电、车站、车辆设施和维护", buyers: "ADIF、铁路运营主体、交通秘书处及中标承包商" },
  { icon: "road", sector: "公路与工程", scope: "路面恢复、桥涵、收费与智能交通系统、安全设施、施工设备和养护", buyers: "Vialidad Nacional、省级公路部门、特许经营公司" },
  { icon: "mine", sector: "矿业与油气", scope: "矿山与油田工程、管线、泵阀、自动化、水处理、营地和物流", buyers: "大型投资激励制度项目业主、矿业与油气公司、工程总承包商" },
  { icon: "water", sector: "港航与水务", scope: "疏浚、导航监测、码头设备、供排水管网、泵站与处理设施", buyers: "港航主管机关、港口和水道运营方、AySA及地方公用事业" },
];

const sources = [
  { label: "国家公共投资计划2026—2028", href: "https://www.argentina.gob.ar/sites/default/files/pnip_2026-2028.pdf", note: "三年滚动公共投资框架、2026年首年配置、重点行业、地区与主要项目。" },
  { label: "国家公共投资计划2026—2028统计附表（附件一）", href: "https://www.argentina.gob.ar/sites/default/files/anexos_pnip_2026-2028_0.xlsx", note: "逐项目列示2026年年度预算及2027、2028年规划预算；三年合计和行业金额据此计算。" },
  { label: "国家公共投资计划2026—2028优先级规则", href: "https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-18-2025-412107/texto", note: "已开工项目以及就业、出口、能源平衡、技术发展和已完成技术评估的项目优先。" },
  { label: "2026年国家预算法第27.798号法律", href: "https://www.argentina.gob.ar/normativa/nacional/ley-27798-422000/texto", note: "用于核对国家公共投资计划第一年的正式预算落地，不代表整个多年期投资规模。" },
  { label: "国家公共投资项目数据库查询（2026预算）", href: "https://www.argentina.gob.ar/jefatura/presupuestaria/inversion-publica/consulta-de-proyectos-y-seguimiento-de-ejecucion/proyectos", note: "可按省份、机关、项目状态和2026年金额核对具体公共投资项目。" },
  { label: "经济部：大型投资激励制度批准与评估项目进展", href: "https://www.argentina.gob.ar/node/504545", note: "截至2026年6月披露16个已批准项目、298.92亿美元；评估中项目不计入已批准金额。" },
  { label: "大型投资激励制度法律框架（第27.742号法律）", href: "https://www.argentina.gob.ar/normativa/nacional/ley-27742-401266/texto", note: "适用行业、长期投资条件及获批项目30年稳定期。" },
  { label: "能源部门：国家输电扩建计划与AMBA I", href: "https://www.argentina.gob.ar/node/510027", note: "16项战略工程、5,610公里500千伏线路和超过66亿美元计划规模；AMBA I进入招标。" },
  { label: "Resolución 202/2026：AMBA I特许经营招标", href: "https://www.argentina.gob.ar/normativa/nacional/norma-428810", note: "确认国际、多阶段公开招标的法律与采购口径。" },
  { label: "国家铁路基础设施公司招标门户", href: "https://plataforma.adifsa.com.ar/portal_licitaciones", note: "线路、车站、信号、电气与配套项目的正式文件和澄清公告。" },
  { label: "Red Federal de Concesiones：联邦公路特许经营网络", href: "https://www.argentina.gob.ar/transporte/vialidad-nacional/red-federal-de-concesiones", note: "超过9,000公里战略国道及各实施阶段、路段和采购程序。" },
  { label: "铁路紧急行动计划进展", href: "https://www.argentina.gob.ar/noticias/avanza-el-plan-de-accion-de-la-emergencia-ferroviaria", note: "轨道、信号、车辆和关键设施的滚动更新方向。" },
  { label: "政府公告：Hidrovía特许经营进展", href: "https://www.argentina.gob.ar/noticias/avanza-el-proceso-de-licitacion-de-la-hidrovia-se-evaluaron-las-ofertas-de-la-etapa-1", note: "用于核对水道特许经营的正式评审阶段，不代表下游合同已发布。" },
  { label: "阿根廷水务公司2026行动计划与预算", href: "https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-495-2026-424845/texto", note: "供排水运营、维护和投资的官方预算依据。" },
  { label: "阿根廷中央银行参考汇率", href: "https://www.bcra.gob.ar/principales-variables/", note: "美元参考值按2026年9月15日1美元＝1,506.6836阿根廷比索静态折算；不代表未来年度的官方美元预算。" },
];

/** Static analysis plus a live, country-filtered tender panel. */
export const revalidate = 300;

export default function ArgentinaInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    datePublished: "2026-09-29",
    dateModified: "2026-09-30",
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image src={insight.heroImage} alt={insight.heroImageAlt} fill priority sizes="100vw" className="object-cover opacity-65" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/90 to-[#031521]/12" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="text-sm font-bold text-white/70 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-5xl">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#d9a23a] px-3 py-1 text-xs font-black text-[#071826]">阿根廷</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/65">Infrastructure & procurement outlook</span></div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">阿根廷国家洞察：<br className="hidden sm:block" />2026—2028公共投资与长期战略项目机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/80 sm:text-lg">从三年公共投资计划、30年大型投资激励制度及分阶段特许经营管线，识别能源、交通、矿业与公用事业的长期方向。</p>
            <p className="mt-8 text-sm text-white/65">作者：<strong className="text-white">拉美招投标指南针</strong></p>
          </div>
        </div>
        <InsightHeroCredit insight={insight} />
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="阿根廷公共投资关键数字">
          {[
            { number: "01", title: "2026—2028列示投资", value: "9.53万亿", unit: "阿根廷比索", secondary: "约63.3亿美元", description: "含2027、2028年规划预算" },
            { number: "02", title: "公共投资项目", value: "1,164个", unit: "包括2026—2028年项目", description: "国家公共投资项目池" },
            { number: "03", title: "三年交通投入", value: "3.07万亿", unit: "阿根廷比索", description: "含公路与其他运输功能" },
            { number: "04", title: "三年能源投入", value: "2.23万亿", unit: "阿根廷比索", description: "能源、燃料与矿业功能" },
          ].map(({ number, title, value, unit, secondary, description }) => <div key={number} className="relative flex min-h-60 flex-col overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,.05)] sm:p-6"><span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c85c43] via-[#d9a23a] to-[#59a8d8]" /><div className="flex items-center justify-center gap-2"><span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#b54f39]">{number}</span><span className="h-3 w-px bg-[#dbe2e5]" /><p className="text-xs font-black tracking-[0.07em] text-[#445762]">{title}</p></div><div className="mt-6"><p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#a94835] sm:text-4xl">{value}</p><p className="mt-2 text-sm font-black text-[#253d4b]">{unit}</p>{secondary ? <p className="mt-1 text-xs font-bold text-[#8a672e]">（{secondary}）</p> : null}</div><div className="mx-auto mt-auto w-10 border-t-2 border-[#d9a23a] pt-4" /><p className="text-xs leading-5 text-[#6b7981]">{description}</p></div>)}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d9a23a] bg-[#fff3cf] p-5 text-sm leading-7 text-[#6d5a31] sm:p-6"><strong className="text-[#6d4900]">金额说明：</strong>三年列示投资约9.53万亿比索（约63.3亿美元）。2026年为年度预算，2027、2028年为规划预算；实际采购金额以项目公告和招标文件为准。</div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#d9a23a]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview", "投资总览"], ["sectors", "行业预算"], ["strategy", "多年期框架"], ["pipeline", "重点工程管线"], ["regions", "区域分布"], ["opportunities", "企业机会"], ["entry", "进入路径"], ["sources", "资料来源"]].map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>
          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Investment framework</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">三年列示约9.53万亿比索，覆盖1,164个项目</h2><div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base"><p>阿根廷《国家公共投资计划2026—2028》列示三年投资约9.53万亿比索（约63.3亿美元），其中2026年约3.79万亿、2027年约3.89万亿、2028年约1.85万亿比索。</p><p>项目池包括1,164个公共投资项目。交通运输约3.07万亿比索，能源、燃料与矿业约2.23万亿比索，供排水约0.84万亿比索；交通与能源合计占三年列示投资约55.7%。</p><p>对供应商和承包商而言，机会会从主合同延伸至输变电设备、轨道和信号系统、道路桥梁、工程机械、管材泵阀、自动化、检测和本地施工服务。</p></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{[["2026", "3.79万亿比索", "年度预算"], ["2027", "3.89万亿比索", "规划预算"], ["2028", "1.85万亿比索", "规划预算"]].map(([year, amount, status]) => <div key={year} className="rounded-2xl bg-[#f1f3f2] px-5 py-4"><p className="text-xs font-black tracking-[.12em] text-[#b54f39]">{year}</p><p className="mt-2 text-lg font-black text-[#061b2b]">{amount}</p><p className="mt-1 text-xs text-[#64717c]">{status}</p></div>)}</div></section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Allocation by sector</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">2026—2028年项目投入：交通与能源为主</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">下列金额包括2026年年度预算及2027、2028年规划预算，用于观察三年资金方向；实际采购金额以项目公告和招标文件为准。</p><div className="mt-7 space-y-5">{sectorInvestment.map((sector) => <div key={sector.name}><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><p className="font-black">{sector.name} <span className="ml-2 text-[#b54f39]">{sector.share}%</span></p><p className="font-bold text-[#64717c]">{sector.estimate}</p></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e6ecef]"><div className={`h-full rounded-full ${sector.color}`} style={{ width: `${Math.max(sector.share, 0.6)}%` }} /></div></div>)}</div><div className="mt-10 border-t border-[#dbe2e5] pt-8"><h3 className="text-xl font-black">预算结构怎么看？</h3><div className="mt-5 grid gap-4 md:grid-cols-3">{[["01", "交通与能源占比过半", "三年附表中，交通运输与能源、燃料及矿业合计约5.30万亿比索，值得优先核对项目清单与采购进度。"], ["02", "项目池覆盖三年方向", "1,164个公共投资项目涵盖2026—2028年安排；项目可能拆分为多个采购标段，也可能仍处于规划阶段。"], ["03", "区分资金与采购机会", "附表包括转移支付、金融应用及国防等项目，不能把全部列示金额视为开放给一般工程企业的订单。"]].map(([number, title, text]) => <div key={number} className="rounded-2xl bg-[#f1f3f2] p-5"><p className="font-mono text-xs font-black text-[#b54f39]">{number}</p><h4 className="mt-3 font-black">{title}</h4><p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p></div>)}</div></div></section>

            <section id="strategy" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Multi-year strategy</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">三年公共投资之外，四条长期主线继续形成项目</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">国家公共投资计划回答联邦政府三年项目管线的金额；以下制度和特许经营计划补充其以外的投资机会，口径不能与国家公共投资计划直接相加。</p><div className="mt-7 grid gap-4 sm:grid-cols-2">{strategyFrameworks.map((framework) => <div key={framework.number} className="rounded-2xl border border-[#dbe2e5] bg-[#fafbf9] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><span className="font-mono text-sm font-black text-[#b54f39]">{framework.number}</span><span className="rounded-full bg-[#fff0d2] px-3 py-1 text-xs font-black text-[#8a5b11]">{framework.horizon}</span></div><h3 className="mt-4 text-lg font-black">{framework.title}</h3><p className="mt-3 text-sm leading-7 text-[#586873]">{framework.text}</p></div>)}</div></section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Project pipeline</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">值得持续跟踪的五类项目方向</h2><div className="mt-7 grid gap-4">{sectors.map((sector) => <div key={sector.title} className="grid gap-3 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[2.8rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#c85c43] text-white"><SectorIcon name={sector.icon} className="size-6" /></span><div><h3 className="font-black">{sector.title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{sector.text}</p></div></div>)}</div></section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Regional opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四类业务观察区，项目逻辑不同</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">按省份和主要产业链归纳，便于理解采购与履约条件；不是正式行政或投资分区。</p><figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]"><Image src="/insights/argentina-infrastructure-regions.webp" alt="阿根廷四类基础设施机会区域示意图，区分西北库约、东北Litoral、中部Pampas与Patagonia" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" /><div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/82 sm:grid-cols-2">{[["bg-[#d9a23a]", "西北与库约资源带"], ["bg-[#59a8d8]", "东北与Litoral物流带"], ["bg-[#c85c43]", "中部都市与Pampas核心区"], ["bg-[#7b63a8]", "Patagonia能源与连接区"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div><figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">地图仅用于说明业务观察区域，不代表行政边界、项目准确位置、投资范围或政治立场。</figcaption></figure><div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#b54f39]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a672e]">{region.places}</p><p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p></div>)}</div><div className="mt-6 border-l-4 border-[#c85c43] bg-[#fff2ec] px-5 py-4 text-sm leading-7 text-[#66562f]">阿根廷是联邦制国家。国家平台之外，省级和市级采购、国有企业及项目公司也可能各用独立入口；本地税务、专业签字和许可要求应逐省核对。</div></section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]"><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">中国企业可关注的潜在项目机会</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">直接投标、与本地企业组成联合体、进入特许经营或工程总承包供应链，适用门槛不同；以每项最新文件为准。</p></div><div className="overflow-x-auto border-t border-[#dbe2e5]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#edf1f2] text-xs tracking-[.06em] text-[#62727b]"><tr><th className="px-5 py-4">行业</th><th className="px-5 py-4">潜在项目机会</th><th className="px-5 py-4">重点跟踪主体</th></tr></thead><tbody className="divide-y divide-[#e2e7e9]">{opportunities.map((row) => <tr key={row.sector} className="align-top"><th className="px-5 py-5 font-black"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fff0d2] text-[#a94835]"><SectorIcon name={row.icon} className="size-5" /></span>{row.sector}</span></th><td className="px-5 py-5 leading-7 text-[#586873]">{row.scope}</td><td className="px-5 py-5 leading-7 text-[#586873]">{row.buyers}</td></tr>)}</tbody></table></div></section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Market entry</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">把市场方向转成参标动作</h2><ol className="mt-7 space-y-5">{[["分清发布入口", "货物与服务看国家货物与服务采购平台；工程与特许经营看国家公共工程与特许经营平台；铁路看国家铁路基础设施公司门户；省级项目和企业采购还需跟踪各自入口。"], ["把阶段写进机会清单", "区分预算、大型投资激励制度批准、规划、正式公告、投标、授标和建设，避免把投资新闻当作采购通知。"], ["先下载最新完整标书", "核对境外资格、澄清公告、担保、币种、调价、税费、付款与本地履约条件。"], ["选择合适的参与结构", "直接投标门槛过高时，评估联合体、当地代表、设备供货、专项工程或工程总承包分包，但不预设每个项目都强制本地合作。"]].map(([title, detail], index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#d9a23a]">{index + 1}</span><div className="border-b border-[#e2e7e9] pb-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p></div></li>)}</ol><div className="mt-7 flex flex-wrap gap-3"><Link href="/guides/argentina-comprar" className="inline-flex min-h-12 items-center rounded-xl bg-[#061b2b] px-5 text-sm font-black text-white transition hover:bg-[#123a54]">查看国家货物与服务采购平台指南 →</Link><Link href="/guides/argentina-contratar" className="inline-flex min-h-12 items-center rounded-xl border border-[#061b2b] px-5 text-sm font-black text-[#061b2b] transition hover:bg-[#edf1f2]">查看国家公共工程与特许经营平台指南 →</Link></div></section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#d9a23a]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续核对正在发布的阿根廷项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">国家洞察帮助识别方向；项目页用于核对采购方、状态、关键日期及完整标书要求。</p><InsightOpenTenders country="Argentina" accentText="text-[#d9a23a]" accentBorder="hover:border-[#d9a23a]" /><Link href="/countries/argentina" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#d9a23a] px-6 font-black text-[#071826] transition hover:bg-[#e8b957]">浏览阿根廷招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">资料来源与使用说明</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">本文优先使用阿根廷国家内阁办公室、经济部、能源秘书处、交通秘书处、国家公路局、阿根廷电力批发市场管理公司、国家铁路基础设施公司及阿根廷中央银行公开资料。金额和项目状态会变化，实际参与前应重新核对主管机构公告和项目原始文件。</p><div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#c27863] hover:bg-[#fff2ec]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p></div><span className="font-black text-[#b54f39]">↗</span></div></a>)}</div><p className="mt-6 text-xs leading-6 text-[#8d8186]">本文不是投资、法律、税务或投标资格意见。项目进度、预算、资格与合同条件，以主管机构和采购文件的最新有效版本为准。</p></section>
          </div>
        </div>
      </main>
    </article>
  );
}
