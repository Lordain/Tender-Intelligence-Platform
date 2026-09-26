import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("colombia")!;

export const metadata: Metadata = pageMetadata({
  title: "哥伦比亚国家洞察：交通重构、能源转型与区域机会",
  description:
    "梳理哥伦比亚国家投资计划、交通基础设施长期路线图，以及铁路、公路、港口、电网、水务和数字基础设施的区域机会。",
  path: "/insights/colombia",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

type IconName = "rail" | "road" | "port" | "energy" | "water" | "digital" | "industry";

function SectorIcon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "road" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /></>}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "digital" && <><path d="M5 15a10 10 0 0 1 14 0M8 18a6 6 0 0 1 8 0M12 21h.01" /><path d="M4 5h16v6H4z" /></>}
      {name === "industry" && <><path d="M3 21V10l6 3V9l6 4V5h4v16H3Z" /><path d="M7 17h2m3 0h2m3 0h2" /></>}
    </svg>
  );
}

const transportPortfolio = [
  { name: "铁路复兴", period: "2026—2055", amount: "276.3万亿哥伦比亚比索（约883亿美元）", share: 85.99, color: "bg-[#0f8b72]" },
  { name: "和平公路", period: "2026—2035", amount: "18.2万亿哥伦比亚比索（约58.2亿美元）", share: 5.66, color: "bg-[#d89416]" },
  { name: "Zipaquirá区域铁路", period: "2027—2039", amount: "17万亿哥伦比亚比索（约54.3亿美元）", share: 5.29, color: "bg-[#48a7a0]" },
  { name: "机场基础设施", period: "2026—2030", amount: "4.4万亿哥伦比亚比索（约14.1亿美元）", share: 1.37, color: "bg-[#6f87c9]" },
  { name: "河运与港口", period: "跨周期", amount: "4.13万亿哥伦比亚比索（约13.2亿美元）", share: 1.29, color: "bg-[#df6f52]" },
  { name: "公共交通电动化", period: "2026—2043", amount: "1.28万亿哥伦比亚比索（约4.09亿美元）", share: 0.4, color: "bg-[#8f73bd]" },
];

const pipeline = [
  { icon: "rail" as const, title: "铁路与多式联运", text: "交通部把铁路复兴列为长期路线图的主体，已明确跟踪跨洋铁路、Villavicencio—Puerto Gaitán、Buenaventura—Palmira、La Tebaida—La Dorada、Bogotá—Belencito等走廊。项目阶段从预可研、可研到既有线路恢复不等，不能把路线图金额直接理解为已开放招标金额。" },
  { icon: "road" as const, title: "公路特许经营与区域道路", text: "截至2026年9月，30个4G项目整体执行率达到93.32%，其中17个已进入运营维护；六个5G项目执行率为27.68%，投资规模约16.71万亿哥伦比亚比索（约53.4亿美元）。未来机会会逐步从主线建设转向剩余土建、机电、收费系统、养护和运营服务。" },
  { icon: "port" as const, title: "港口、河运与跨洋走廊", text: "Buenaventura、Barranquilla、加勒比沿岸港口及Magdalena河航运仍是物流重点。官方长期组合同时纳入Chocó跨洋铁路及两端港口、河道疏浚、码头和集疏运连接，工程往往涉及交通、环境和地方社区多方协调。" },
  { icon: "energy" as const, title: "输电、可再生能源与电气化", text: "矿能部已采用2025—2039输电扩张计划，并继续推进2024—2038计划中的重点工程。需求集中在输电线路、变电站、并网、储能、分布式光伏及非互联系统供电；加勒比风光资源区与中部负荷中心之间的送出能力尤其值得跟踪。" },
  { icon: "water" as const, title: "水务与环境基础设施", text: "2026—2030年已披露的重点组合包括46个水务项目、约3.5万亿哥伦比亚比索（约11.2亿美元），覆盖18个省和42个市镇；另有大量项目处于评估和可行性审查阶段。采购主体既有中央部委，也有省市政府、公用事业公司和专项基金。" },
  { icon: "digital" as const, title: "数字连接与偏远地区覆盖", text: "Amazonía光纤计划以及太平洋、Urabá、La Guajira等地的宽带覆盖项目，把骨干网、最后一公里、数据传输设备和运维服务纳入区域融合议程。数字基础设施常采用专项基金和多年期服务合同，与传统土建采购逻辑并不完全相同。" },
];

const regions = [
  { number: "01", title: "加勒比与北部能源物流带", states: "La Guajira、Atlántico、Bolívar、Magdalena、Cesar、Córdoba、Sucre", focus: "风电与光伏送出、电网扩建、港口、Magdalena河航运、机场及铁路连接。La Guajira能源项目和Barranquilla—Cartagena港口工业体系是两条主要线索。" },
  { number: "02", title: "中部安第斯与首都经济圈", states: "Bogotá D.C.、Cundinamarca、Boyacá、Santander、Antioquia、Tolima、Caldas、Risaralda、Quindío", focus: "区域铁路、城市交通、干线公路、输变电、机场扩容、工业和水务。人口与产业密度高，项目金额大，但招标主体和实施层级也最复杂。" },
  { number: "03", title: "太平洋与西南走廊", states: "Chocó、Valle del Cauca、Cauca、Nariño", focus: "Buenaventura港、跨洋铁路前期研究、Pasto交通走廊、和平公路、水务与数字连接。地形、环境许可和社区协商会显著影响工期与成本。" },
  { number: "04", title: "Orinoquía—Amazonía连接区", states: "Meta、Casanare、Arauca、Guaviare、Putumayo、Caquetá、Amazonas", focus: "Villavicencio—Puerto Gaitán铁路研究、河运、偏远地区电力、Amazonía光纤、水务和公共服务。机会分散，但对专业设备、离网方案和本地服务要求更高。" },
];

const opportunityRows: Array<{ icon: IconName; sector: string; scope: string; buyers: string }> = [
  { icon: "rail", sector: "铁路与城市轨道", scope: "可研设计、轨道、桥隧、信号通信、车辆、站场、施工设备", buyers: "交通部、ANI、地方政府、区域交通项目主体" },
  { icon: "road", sector: "公路与特许经营", scope: "桥梁隧道、路面、机电、收费系统、养护、运营设备", buyers: "ANI、INVÍAS、省市政府及特许经营公司" },
  { icon: "port", sector: "港口与河运", scope: "疏浚、码头、装卸、航道维护、仓储与集疏运连接", buyers: "交通部、ANI、Cormagdalena、港口公司" },
  { icon: "energy", sector: "能源与电网", scope: "光伏风电、储能、输变电、微网、监控保护及工程服务", buyers: "矿能部、UPME、公用事业公司和项目开发商" },
  { icon: "water", sector: "水务与环境", scope: "供水、污水处理、泵站、管网、固废和流域治理", buyers: "住房部、Findeter、地方政府及公用事业公司" },
  { icon: "digital", sector: "数字基础设施", scope: "光纤、无线接入、数据设备、偏远地区连接和长期运维", buyers: "MinTIC、Fondo Único TIC、地方政府与运营商" },
  { icon: "industry", sector: "再工业化与本地供应链", scope: "设备制造、技术转移、工业园区、医疗和国防相关产业合作", buyers: "MinCIT、Colombia Productiva、国有和私营龙头企业" },
];

const sources = [
  { label: "DNP：国家发展计划2022—2026", href: "https://www.dnp.gov.co/plan-nacional-desarrollo/pnd-2022-2026", note: "国家发展计划、五大转型与多年投资计划入口。" },
  { label: "DNP：多年投资计划法案说明", href: "https://colaboracion.dnp.gov.co/CDT/portalDNP/PND-2023/05022023_Exposicion-de-motivos-PND-2022-2026.pdf", note: "1,154.8万亿哥伦比亚比索总额及各项转型分配，按2022年不变价。" },
  { label: "交通部：跨周期交通投资路线图", href: "https://mintransporte.gov.co/publicaciones/12195/la-hoja-de-ruta-del-gobierno-del-cambio-proyecta-inversiones-en-transporte-5-veces-superiores-a-las-vias-4g/", note: "321.3万亿哥伦比亚比索（约1,027亿美元）交通组合、六个投资方向及时间跨度。" },
  { label: "ANI：4G和5G项目进度", href: "https://www.ani.gov.co/ca/w/la-ani-lleva-los-proyectos-4g-al-93-32-%25-de-ejecuci%C3%B3n-con-inversiones-por-%2467-23-billones", note: "30个4G项目、六个5G项目、投资金额与2026年9月执行进度。" },
  { label: "交通部：跨洋铁路走廊可研", href: "https://mintransporte.gov.co/publicaciones/12352/colombia-avanza-hacia-la-factibilidad-del-corredor-ferreo-interoceanico-una-apuesta-estrategica-para-conectar-el-pacifico-y-el-caribe/", note: "222.3公里Chocó跨洋铁路及两端港口的当前研究阶段。" },
  { label: "矿能部：输电扩张计划", href: "https://minenergia.gov.co/es/misional/energia-electrica-2/planes-expansion/", note: "2025—2039输电扩张计划及历史计划入口。" },
  { label: "住房部：2026—2030水务重点项目", href: "https://minvivienda.gov.co/sites/default/files/2025-11/20251119_informe_de_rendicion_de_cuentas_2025_vf.pdf", note: "46个项目、18个省、42个市镇及3.5万亿哥伦比亚比索（约11.2亿美元）投资。" },
  { label: "MinTIC：Amazonía光纤计划", href: "https://www.mintic.gov.co/portal/715/w3-article-438101.html", note: "Amazonas与Putumayo的光纤节点、招标及区域连接目标。" },
  { label: "MinCIT：国家再工业化政策", href: "https://www.mincit.gov.co/prensa/noticias/industria/gobierno-se-articula-y-avanza-reindustrializacion", note: "健康、农业食品、国防、绿色工业和技术能力方向。" },
  { label: "哥伦比亚金融监管局：TRM", href: "https://www.superfinanciera.gov.co/CargaDriver/", note: "2026年9月17日参考汇率：1美元＝3,128.46哥伦比亚比索。" },
];

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function ColombiaInsightPage() {
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
    <article className="bg-[#f5f3ed] text-[#08261f]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <header className="relative isolate overflow-hidden bg-[#082820] text-white">
        <Image src={insight.heroImage} alt={insight.heroImageAlt} fill priority sizes="100vw" className="object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06231d] via-[#06231d]/90 to-[#06231d]/16" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="inline-flex items-center gap-2 text-sm font-bold text-white/65 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#e7b43c] px-3 py-1 text-xs font-black text-[#08261f]">哥伦比亚</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/62">Cross-cycle investment outlook</span>
            </div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">哥伦比亚国家洞察：<br className="hidden sm:block" />交通重构、能源转型与区域机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/76 sm:text-lg">从即将收官的国家发展计划，看到已经进入规划、可研、建设和运营阶段的跨周期项目，判断哪些机会会继续影响下一轮政府采购。</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/62">
              <span>作者：<strong className="text-white">拉美招投标指南针</strong></span>
            </div>
          </div>
        </div>
        <InsightHeroCredit insight={insight} />
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { number: "01", title: "国家投资计划", value: "1,154.8万亿", unit: "哥伦比亚比索", secondary: "约3,691亿美元", description: "2023—2026年多年投资计划总额" },
            { number: "02", title: "交通战略项目组合", value: "321.3万亿", unit: "哥伦比亚比索", secondary: "约1,027亿美元", description: "铁路、公路、机场、港口等跨周期路线图" },
            { number: "03", title: "已获CONPES优先", value: "38.6万亿", unit: "哥伦比亚比索", secondary: "约123亿美元", description: "已有政策文件支持推进的交通项目" },
            { number: "04", title: "道路特许经营项目", value: "36", unit: "个4G与5G项目", description: "30个4G项目和6个5G项目" },
          ].map(({ number, title, value, unit, secondary, description }) => (
            <div key={number} className="relative flex min-h-60 flex-col overflow-hidden rounded-2xl border border-[#d3dfd9] bg-[#fffdf8] p-5 text-center shadow-[0_12px_30px_rgba(8,38,31,0.05)] sm:p-6">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0f8b72] via-[#e7b43c] to-[#df6f52]" />
              <div className="flex items-center justify-center gap-2"><span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#0f806a]">{number}</span><span className="h-3 w-px bg-[#d3dfd9]" /><h2 className="text-xs font-black tracking-[0.07em] text-[#3d5c53]">{title}</h2></div>
              <div className="mt-6"><p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#08715e] sm:text-4xl">{value}</p><p className="mt-2 text-sm font-black text-[#213e35]">{unit}</p>{secondary ? <p className="mt-1 text-xs font-bold text-[#7c6a3f]">（{secondary}）</p> : null}</div>
              <div className="mx-auto mt-auto w-10 border-t-2 border-[#e7b43c] pt-4" /><p className="text-xs leading-5 text-[#687a73]">{description}</p>
            </div>
          ))}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d7bf70] bg-[#fff6d9] p-5 sm:p-6">
          <p className="font-black text-[#5d4a15]">先理解时间和统计口径</p>
          <p className="mt-2 text-sm leading-7 text-[#675b37]">哥伦比亚正处于国家规划换届衔接期。1,154.8万亿哥伦比亚比索（约3,691亿美元）是2023—2026年国家多年投资计划的全领域口径，并非全部用于基础设施；321.3万亿哥伦比亚比索（约1,027亿美元）则是2025年公布、实施期延伸到2055年的交通战略项目组合。本文把已立法规划、已获CONPES支持、可研项目和在建项目分开解释，不把远期路线图等同于已批预算。</p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl bg-[#082820] p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e7b43c]">本页目录</p>
              <nav className="mt-4 space-y-1 text-sm">{[["overview","规划框架"],["sectors","交通投资"],["pipeline","工程方向"],["regions","区域分布"],["opportunities","企业机会"],["entry","进入路径"],["sources","资料来源"]].map(([id,label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/66 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav>
            </div>
          </aside>

          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Planning framework</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">真正值得跟踪的是跨政府周期的项目管线</h2>
              <div className="mt-5 space-y-4 text-sm leading-8 text-[#526a62] sm:text-base">
                <p>《国家发展计划2022—2026》把1,154.8万亿哥伦比亚比索（约3,691亿美元，按2022年不变价）分配到社会保障、区域融合、生产转型、气候行动、水资源和粮食安全等领域。它提供了政策方向，但不能直接当作工程采购预算。</p>
                <p>对工程、设备和企业服务供应商，更具有可操作性的，是已经形成专项路线图的项目：铁路复兴、公路特许经营、港口河运、输电扩张、水务多年期资金和偏远地区数字连接。其中不少项目的研究、建设或运营周期已经延伸到2030年以后。</p>
                <p>因此，判断机会时要先识别项目所处阶段：政策设想、预可研、可研、CONPES优先、预算承诺、招标、建设和运营维护分别对应完全不同的进入方式。</p>
              </div>
            </section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Transport investment mix</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">交通路线图中，铁路占据绝对主导</h2>
              <p className="mt-4 text-sm leading-7 text-[#64766f]">以下使用交通部2025年公布的321.3万亿哥伦比亚比索（约1,027亿美元）项目组合。各方向实施期不同，金额代表路线图规模，不代表资金已经一次性到位。</p>
              <div className="mt-7 space-y-5">{transportPortfolio.map((item) => <div key={item.name}><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><p className="font-black">{item.name} <span className="ml-2 text-[#0f806a]">{item.period}</span></p><p className="font-bold text-[#64766f]">{item.amount}</p></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e3ebe7]"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.max(item.share, 0.8)}%` }} /></div></div>)}</div>
              <div className="mt-10 border-t border-[#d6e0db] pt-8">
                <h3 className="text-xl font-black">投资趋势分析</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-3">{[
                  ["01","公路建设转向收尾与运营","4G逐步进入运营维护，5G仍在建设，机会结构正从大规模土建转向机电、养护和服务。"],
                  ["02","铁路重新成为长期主线","铁路金额占交通组合约86%，但大量项目仍处于研究和结构化阶段，需要提前跟踪而非等正式招标。"],
                  ["03","区域融合带动组合采购","港口、河运、电网、数字连接和水务正在偏远地区叠加，单项合同更小，但项目连续性可能更强。"],
                ].map(([n,t,d]) => <div key={n} className="rounded-2xl bg-[#eef3f0] p-5"><p className="font-mono text-xs font-black text-[#0f806a]">{n}</p><h4 className="mt-3 font-black">{t}</h4><p className="mt-2 text-sm leading-7 text-[#586d65]">{d}</p></div>)}</div>
              </div>
            </section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Project pipeline</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">已经可以看到哪些工程方向？</h2>
              <div className="mt-7 grid gap-4">{pipeline.map(({icon,title,text}) => <div key={title} className="grid gap-4 rounded-2xl bg-[#eef3f0] p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#0f8b72] text-white"><SectorIcon name={icon} /></span><div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586d65]">{text}</p></div></div>)}</div>
            </section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Regional opportunity map</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">四类区域，采购逻辑并不相同</h2>
              <figure className="mt-7 overflow-hidden rounded-2xl border border-[#d6e0db] bg-[#0b2e27]">
                <Image src="/insights/colombia-infrastructure-regions.webp" alt="哥伦比亚四类重点基础设施投资区域示意图" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" />
                <div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/80 sm:grid-cols-2">{[["bg-[#d9a62e]","加勒比与北部能源物流带"],["bg-[#0f8b72]","中部安第斯与首都经济圈"],["bg-[#df6f52]","太平洋与西南走廊"],["bg-[#6f78c9]","Orinoquía—Amazonía连接区"]].map(([color,label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div>
                <figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">区域和走廊仅用于表达重点投资方向，不代表具体项目线路、项目边界或已获批准的投资范围。</figcaption>
              </figure>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#d6e0db] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#0f806a]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a7028]">{region.states}</p><p className="mt-3 text-sm leading-7 text-[#586d65]">{region.focus}</p></div>)}</div>
              <div className="mt-6 border-l-4 border-[#0f8b72] bg-[#edf7f2] px-5 py-4 text-sm leading-7 text-[#49675d]">哥伦比亚项目的区域差异尤其重要：中部项目更成熟、竞争更充分；边远地区往往更需要专业技术，却也更依赖物流组织、社区沟通、环境许可和本地履约能力。</div>
            </section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#d6e0db] bg-[#fffdf8]">
              <div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Opportunity map</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">中国企业可以从哪些位置进入？</h2><p className="mt-4 text-sm leading-7 text-[#64766f]">大型特许经营项目并不是唯一入口。设备供货、专项工程、可研设计、运维服务和技术合作更适合多数初次进入哥伦比亚市场的企业。</p></div>
              <div className="overflow-x-auto border-t border-[#d6e0db]"><table className="min-w-[780px] w-full text-left text-sm"><thead className="bg-[#eaf1ed] text-xs uppercase tracking-[0.08em] text-[#5d726a]"><tr><th className="px-6 py-4">行业</th><th className="px-6 py-4">潜在供应链机会</th><th className="px-6 py-4">优先跟踪主体</th></tr></thead><tbody className="divide-y divide-[#dde6e1]">{opportunityRows.map(({icon,sector,scope,buyers}) => <tr key={sector} className="align-top"><th className="px-6 py-5 font-black"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#dff0e9] text-[#0f806a]"><SectorIcon name={icon} className="size-5" /></span>{sector}</span></th><td className="px-6 py-5 leading-7 text-[#586d65]">{scope}</td><td className="px-6 py-5 leading-7 text-[#586d65]">{buyers}</td></tr>)}</tbody></table></div>
            </section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Market entry</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">把国家方向转化为可执行动作</h2>
              <ol className="mt-7 space-y-6">{[
                ["先区分项目阶段","把政策路线图、预可研、可研、CONPES、已招标和在建项目分开管理，避免把远期构想误判为近期商机。"],
                ["建立采购主体地图","中央项目可涉及ANI、INVÍAS、UPME、MinTIC等；地方项目还会进入省市政府、公用事业公司和专门项目主体。"],
                ["提前理解SECOP与专项平台","公开采购通常需要在SECOP查询，但特许经营、国有企业和地方公用事业项目还可能使用自己的信息入口。"],
                ["把本地合规放进成本模型","税务、劳动、环保、社区协商、进口、保函和西班牙语文件都会影响报价与工期，不能等中标后再处理。"],
                ["优先寻找互补型伙伴","当地设计院、施工商、运营商和区域服务团队可以补足资质、项目经验、关系网络和售后覆盖。"],
              ].map(([title,detail],index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#082820] font-mono text-sm font-black text-[#e7b43c]">{index+1}</span><div className="border-b border-[#dde6e1] pb-6 last:border-0 last:pb-0"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586d65]">{detail}</p></div></li>)}</ol>
              <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-[#eaf1ed] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="font-black">准备开始查找哥伦比亚政府采购项目？</p><p className="mt-1 text-sm leading-6 text-[#64766f]">SECOP II参标指南整理了项目查询、平台注册和参与判断的关键步骤。</p></div><Link href="/guides/colombia-secop-ii" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#082820] px-5 text-sm font-black text-white transition hover:bg-[#155244]">查看SECOP II参标指南 →</Link></div>
            </section>

            <section className="rounded-3xl bg-[#082820] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#e7b43c]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续查看正在发布的哥伦比亚项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">国家洞察用于确定方向，具体项目页用于核对采购方、当前状态、截止日期和参与要求。</p><InsightOpenTenders country="Colombia" accentText="text-[#e7b43c]" accentBorder="hover:border-[#e7b43c]" /><Link href="/countries/colombia" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#e7b43c] px-6 font-black text-[#08261f] transition hover:bg-[#f2c95e]">浏览哥伦比亚招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#d6e0db] bg-[#fffdf8] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f806a]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">资料来源与使用说明</h2>
              <p className="mt-4 text-sm leading-7 text-[#64766f]">本文优先使用DNP、交通部、ANI、矿能部、住房部、MinTIC、MinCIT和金融监管局公开资料。规划跨越多个政府周期，项目金额、阶段和实施方案应以主管机构后续文件为准。</p>
              <div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#d6e0db] px-4 py-4 transition hover:border-[#48a98f] hover:bg-[#f0f8f4]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71827b]">{source.note}</p></div><span className="shrink-0 font-black text-[#0f806a] transition-transform group-hover:translate-x-0.5">↗</span></div></a>)}</div>
              <div className="mt-6 rounded-xl border border-[#d6e0db] bg-[#f1f5f3] px-4 py-4 text-xs leading-6 text-[#71827b]"><strong className="text-[#526a62]">美元换算口径：</strong>本文统一按2026年9月17日TRM，即1美元＝3,128.46哥伦比亚比索换算，仅用于理解金额量级，不构成报价或财务依据。</div>
              <p className="mt-6 text-xs leading-6 text-[#87958f]">本文不构成投资、法律、税务或投标资格意见。具体项目的采购文件、更正、许可和合同条件具有最终效力。</p>
            </section>
          </div>
        </div>
      </main>
    </article>
  );
}
