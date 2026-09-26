import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { pageMetadata } from "@/lib/seo";

const insight = getCountryInsight("mexico")!;

export const metadata: Metadata = pageMetadata({
  title: "墨西哥国家洞察：2026—2030战略投资与项目机会",
  description:
    "基于墨西哥2026年官方资料，拆解5.6万亿比索基础设施投资基准、行业配置、重点项目、区域分布及中国企业可参与空间。",
  path: "/insights/mexico",
  image: insight.heroImage,
});

const sectorInvestment = [
  { name: "能源", share: 54.15, estimate: "约3.03万亿比索（约1,761亿美元）", color: "bg-[#f5a20b]" },
  { name: "铁路", share: 15.63, estimate: "约8,753亿比索（约508亿美元）", color: "bg-[#4e9ad4]" },
  { name: "公路", share: 13.94, estimate: "约7,806亿比索（约453亿美元）", color: "bg-[#6db8e8]" },
  { name: "港口", share: 6.48, estimate: "约3,629亿比索（约211亿美元）", color: "bg-[#e2702a]" },
  { name: "医疗卫生", share: 6.23, estimate: "约3,489亿比索（约203亿美元）", color: "bg-[#67a98d]" },
  { name: "水务", share: 2.83, estimate: "约1,585亿比索（约92亿美元）", color: "bg-[#5aa8ba]" },
  { name: "教育", share: 0.34, estimate: "约190亿比索（约11亿美元）", color: "bg-[#a58ac4]" },
  { name: "机场", share: 0.04, estimate: "约22亿比索（约1.3亿美元）", color: "bg-[#8998a1]" },
];

type InfrastructureIconName = "energy" | "rail" | "road" | "port" | "water" | "industry" | "ict" | "health";

function InfrastructureIcon({ name, className = "size-6" }: { name: InfrastructureIconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "road" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /></>}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "industry" && <><path d="M3 21V10l6 3V9l6 4V5h4v16H3Z" /><path d="M7 17h2m3 0h2m3 0h2" /></>}
      {name === "ict" && <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8m-4-4v4M7 9h2m2 0h2m2 0h2" /></>}
      {name === "health" && <><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3Z" /><path d="M12 8v8m-4-4h8" /></>}
    </svg>
  );
}

const regions = [
  {
    number: "01",
    title: "北部边境与制造业带",
    states: "Sonora、Chihuahua、Coahuila、Nuevo León、Tamaulipas",
    focus: "电力扩容、跨境铁路与公路、工业用水、物流园区和先进制造配套。首批发展极包括Hermosillo、San Jerónimo（Juárez）和Altamira。",
  },
  {
    number: "02",
    title: "中部与Bajío工业带",
    states: "Estado de México、Hidalgo、Querétaro、Guanajuato、San Luis Potosí、Jalisco、Michoacán、Puebla、Tlaxcala",
    focus: "客运铁路、干线公路、电网、工业园区和汽车及先进制造供应链。这里连接首都圈、Bajío与北部边境，是多种基础设施叠加最明显的区域。",
  },
  {
    number: "03",
    title: "墨西哥湾与东南部",
    states: "Veracruz、Tabasco、Campeche、Yucatán、Quintana Roo、Oaxaca、Chiapas",
    focus: "港口、石化与天然气、水务、旅游交通、Tren Maya货运化以及跨洋走廊。CIIT把Coatzacoalcos、Salina Cruz、Dos Bocas与Puerto Chiapas纳入同一物流体系。",
  },
  {
    number: "04",
    title: "太平洋港口与物流走廊",
    states: "Baja California、Sonora、Sinaloa、Colima、Michoacán、Guerrero、Oaxaca、Chiapas",
    focus: "Ensenada、Guaymas、Topolobampo、Manzanillo、Lázaro Cárdenas、Acapulco、Salina Cruz与Puerto Chiapas的港口扩建，以及集疏运公路、铁路和仓储设施。",
  },
];

const opportunityRows: Array<{ icon: InfrastructureIconName; sector: string; scope: string; buyers: string }> = [
  { icon: "energy", sector: "能源", scope: "发电、储能、输电线路、变电站、配电设备、工程服务", buyers: "CFE、SENER、CENACE及项目主体" },
  { icon: "rail", sector: "铁路", scope: "轨道、桥隧、信号、通信、车辆、站房、施工设备与运维", buyers: "SICT、铁路主管机构及专项项目公司" },
  { icon: "road", sector: "公路与桥梁", scope: "EPC、钢结构、桩基、路面、交通安全设备、机械与材料", buyers: "SICT、CAPUFE、州政府及特许经营项目" },
  { icon: "port", sector: "港口与物流", scope: "疏浚、码头、堆场、装卸设备、仓储、铁路与道路连接", buyers: "SEMAR、各港口ASIPONA及码头运营商" },
  { icon: "water", sector: "水务", scope: "输水、处理、泵站、管网、防洪、节水灌溉与监测", buyers: "CONAGUA、州及市级水务机构" },
  { icon: "industry", sector: "工业园区", scope: "园区基础设施、电力与水务配套、厂房、物流与运营服务", buyers: "经济部、州政府、发展极运营主体及入园企业" },
  { icon: "ict", sector: "信息通信技术", scope: "数据中心、云平台、通信网络、网络安全、智慧城市、政务系统", buyers: "ATDT、CRT、CFE Telecom及公共机构" },
  { icon: "health", sector: "医疗卫生", scope: "医疗设备、影像诊断、实验室、医院信息化、耗材与维保", buyers: "卫生部、IMSS、ISSSTE、IMSS-Bienestar及州级卫生机构" },
];

const pipelineDirections: Array<{ icon: InfrastructureIconName; title: string; text: string }> = [
  { icon: "energy", title: "能源与电网", text: "电力扩张计划持续加码。官方材料包括新增约29,000MW级发电能力的早期口径，以及后续接近32GW、约7,400亿比索（约430亿美元）的更新口径；输电侧另公布81.77亿美元计划，用于275条新输电线路和524项变电站工程。机会不仅在电站，也在储能、变压器、导线、控制保护、施工和运维。" },
  { icon: "rail", title: "铁路", text: "SICT提出2025—2030年建设超过3,000公里客运铁路，覆盖墨西哥城—Pachuca、墨西哥城—Querétaro—Nuevo Laredo以及向Nogales延伸的北向走廊，并推进Tren Maya货运能力。项目会带动轨道、桥隧、信号、通信、车辆、站房和施工设备需求。" },
  { icon: "road", title: "公路与桥梁", text: "截至2026年9月，公路基础设施计划总投资更新为6,478.32亿比索（约376亿美元），覆盖11,366公里；已完成1,796公里，另有4,223公里在建。Banobras另跟踪19个项目、约2,138.68亿比索（约124亿美元）。重点包括新建、现代化、养护、互通、桥梁和港口集疏运连接。" },
  { icon: "port", title: "港口", text: "九个重点港口的公开计划涉及551.79亿比索（约32亿美元）公共投资和2,410.51亿比索（约140亿美元）私人投资，重点包括Ensenada、Manzanillo、Lázaro Cárdenas、Acapulco、Veracruz、Progreso、Guaymas、Topolobampo和Altamira。疏浚、码头、堆场、装卸设备、道路与铁路连接会同步释放需求。" },
  { icon: "water", title: "水务", text: "截至2026年9月，CONAGUA正在推进17个战略水务项目，同时有约2.4万项饮用水与排水工程覆盖2,183个市镇。输水、处理、泵站、管网、防洪、农业节水和监测需求通常由联邦、州与地方共同推进，采购入口也更分散。" },
  { icon: "industry", title: "产业发展极", text: "首批15个经济发展极分布在14个州，配套100%新固定资产加速扣除，以及培训和创新支出额外扣除等政策。随后官方又提出15个全国发展极加11个东南部发展极的26个节点网络。园区建设会带来土地开发、电力、水务、道路、厂房和物流的组合需求。" },
  { icon: "ict", title: "信息通信技术", text: "2026年数字基础设施重点包括Nube MX、Aguascalientes与Tulancingo数据中心扩容、公共云GPU能力、Supercomputadora Coatlicue，以及骨干网、农村站点和光节点建设。潜在项目横跨云服务、服务器、网络设备、网络安全、系统集成和政务数字化。" },
  { icon: "health", title: "医疗卫生", text: "2026年三大公共医疗体系约投入200亿比索（约12亿美元）推进设备更新，包括磁共振、病床、手术室和高端设备；国家卫生基础设施与高技术医疗设备总体规划也已成为项目登记和跟踪入口。机会覆盖设备、医院信息化、实验室、耗材与维保。" },
];

const sources = [
  {
    label: "墨西哥总统府：2026—2030基础设施投资计划",
    href: "https://www.gob.mx/presidencia/prensa/el-plan-de-inversion-en-infraestructura-para-el-desarrollo-con-bienestar-contempla-en-2026-2-adicional-del-pib-y-5-6-bdp-al-2030?idiom=es-MX",
    note: "最初公布的5.6万亿比索（约3,252亿美元）基准、2026年新增7,220亿比索（约419亿美元）与八个战略行业。",
  },
  {
    label: "墨西哥财政部：基础设施投资计划演示文件",
    href: "https://www.finanzaspublicas.hacienda.gob.mx/work/models/Finanzas_Publicas/docs/ori/Ingles/Guides/Plan_de_Inversion_en_Infraestructura_2026-2030.pdf",
    note: "各行业投资占比的原始图表。",
  },
  {
    label: "Proyectos México：在墨西哥投资基础设施",
    href: "https://www.proyectosmexico.gob.mx/como-invertir-en-infraestructura-en-mexico/",
    note: "超过1,500个项目、投资机制和项目入口。",
  },
  {
    label: "墨西哥总统府：首批15个经济发展极",
    href: "https://www.gob.mx/presidencia/prensa/plan-mexico-presidenta-claudia-sheinbaum-pone-en-marcha-los-primeros-15-polos-de-desarrollo-economico-para-el-bienestar-en-14-estados?idiom=es-MX",
    note: "首批发展极的州和城市分布、行业方向与激励措施。",
  },
  {
    label: "墨西哥总统府：Plan México与26个发展极网络",
    href: "https://www.gob.mx/presidencia/prensa/presidenta-claudia-sheinbaum-presenta-plan-mexico-a-miembros-del-foro-economico-mundial?idiom=en",
    note: "15个全国发展极与11个东南部发展极的整体口径。",
  },
  {
    label: "墨西哥总统府：CFE输电扩建计划",
    href: "https://www.gob.mx/presidencia/prensa/cfe-invertira-8-mil-177-mdd-para-fortalecer-red-de-transmision-en-beneficio-de-50-millones-de-mexicanas-y-mexicanos?idiom=es-MX",
    note: "275条新输电线路、524项变电站工程及81.77亿美元投资。",
  },
  {
    label: "SICT：2025—2030铁路发展目标",
    href: "https://www.gob.mx/sict/prensa/construir-3-mil-km-de-trenes-de-pasajeros-objetivo-de-movilidad-para-la-sict-en-2025-2030",
    note: "超过3,000公里新客运铁路与主要走廊。",
  },
  {
    label: "SICT：公路与桥梁投资计划",
    href: "https://www.gob.mx/presidencia/prensa/mejor-comunicacion-es-desarrollo-y-bienestar-presidenta-avanza-programa-de-infraestructura-carretera-con-inversion-de-647-mil-832-mdp",
    note: "截至2026年9月的6,478.32亿比索投资、11,366公里干预范围与最新进度。",
  },
  {
    label: "墨西哥总统府：九个港口重点工程",
    href: "https://www.gob.mx/presidencia/prensa/mexico-sera-potencia-regional-portuaria",
    note: "公共和私人港口投资，以及重点港口分布。",
  },
  {
    label: "CONAGUA：国家水务战略项目",
    href: "https://www.gob.mx/conagua/prensa/el-gobierno-de-mexico-desarrolla-obras-estrategicas-para-mejorar-los-servicios-de-agua-drenaje-y-saneamiento-para-el-bienestar-del-pueblo?idiom=es",
    note: "截至2026年9月的17个战略项目、约2.4万项水务工程与覆盖范围。",
  },
  {
    label: "Proyectos México：跨洋走廊CIIT",
    href: "https://www.proyectosmexico.gob.mx/ppp03-ciit/",
    note: "Veracruz、Oaxaca、Tabasco与Chiapas的港口、铁路和产业发展极。",
  },
  {
    label: "ATDT：2026数字基础设施议程",
    href: "https://www.gob.mx/atdt/agendas/2030/infraestructura-digital",
    note: "Nube MX、公共数据中心、Supercomputadora Coatlicue及2026年实施节点。",
  },
  {
    label: "墨西哥总统府：公共医疗设备更新",
    href: "https://www.gob.mx/presidencia/prensa/se-invierten-20-mil-mdp-en-el-salto-tecnologico-en-el-imss-issste-e-imss-bienestar-presidenta-claudia-sheinbaum?idiom=es",
    note: "2026年约200亿比索医疗设备投资及IMSS、ISSSTE、IMSS-Bienestar采购方向。",
  },
  {
    label: "墨西哥央行：FIX汇率",
    href: "https://www.banxico.org.mx/tipcamb/tipCamMIAction.do?idioma=sp",
    note: "美元换算采用2026年9月21日公布的FIX：1美元＝17.2203墨西哥比索。",
  },
];

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function MexicoInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    dateModified: "2026-09-22",
    datePublished: "2026-09-17",
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image
          src={insight.heroImage}
          alt={insight.heroImageAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/88 to-[#031521]/20" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="inline-flex items-center gap-2 text-sm font-bold text-white/65 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">墨西哥</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Strategic investment outlook</span>
            </div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">墨西哥国家洞察：<br className="hidden sm:block" />2026—2030战略投资与项目机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/76 sm:text-lg">从国家投资方向一直拆到行业、区域和采购入口，帮助中国企业判断未来几年应该跟踪什么，而不只是追逐一条临近截止的招标。</p>
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
            { number: "01", title: "五年规划投资基准", value: "5.6万亿", unit: "墨西哥比索", secondary: "约3,252亿美元", description: "2026—2030年公共及混合投资基准" },
            { number: "02", title: "已分析项目储备", value: "1,500+", unit: "个基础设施项目", description: "已进入财务与技术分析范围" },
            { number: "03", title: "三大领域资金占比", value: "83.72%", unit: "投向能源、铁路与公路", description: "资金集中度最高的三个方向" },
            { number: "04", title: "重点投资范围", value: "8", unit: "个战略行业", description: "覆盖能源、交通、港口、医疗与水务等" },
          ].map(({ number, title, value, unit, secondary, description }) => (
            <div key={number} className="relative flex min-h-60 flex-col overflow-hidden rounded-2xl border border-[#d7e0e4] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,0.04)] sm:p-6">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ffb21c] via-[#d88900] to-[#ffb21c]" />
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#c47a00]">{number}</span>
                <span className="h-3 w-px bg-[#d7e0e4]" />
                <h2 className="text-xs font-black tracking-[0.08em] text-[#445762]">{title}</h2>
              </div>
              <div className="mt-6">
                <p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#a96500] sm:text-4xl">{value}</p>
                <p className="mt-2 text-sm font-black text-[#253d4b]">{unit}</p>
                {secondary ? <p className="mt-1 text-xs font-bold text-[#8a6b35]">（{secondary}）</p> : null}
              </div>
              <div className="mx-auto mt-auto w-10 border-t-2 border-[#ffb21c] pt-4" />
              <p className="text-xs leading-5 text-[#6b7981]">{description}</p>
            </div>
          ))}
        </section>

        <div className="mt-8 rounded-2xl border border-[#e6b13f] bg-[#fff3cf] p-5 sm:p-6">
          <p className="font-black text-[#6d4900]">先理解数字口径</p>
          <p className="mt-2 text-sm leading-7 text-[#6d5a31]">
            本文统一采用2026年2月公布的5.6万亿比索（约3,252亿美元）五年规划基准。八个行业的投资占比及金额估算均对应这一口径。各专项计划的时间范围、资金来源和统计范围不同，不能与总盘子机械相加；超过1,500个项目也表示已进入财务与技术分析范围，并不等于全部已经公开招标。
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl bg-[#061b2b] p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">本页目录</p>
              <nav className="mt-4 space-y-1 text-sm">
                {[
                  ["overview", "投资总览"],
                  ["sectors", "行业预算"],
                  ["pipeline", "重点工程管线"],
                  ["regions", "区域分布"],
                  ["opportunities", "企业机会"],
                  ["entry", "进入路径"],
                  ["sources", "资料来源"],
                ].map(([id, label]) => (
                  <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/66 transition hover:bg-white/8 hover:text-white">{label}</a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Investment framework</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">这不是一张项目清单，而是一条投资主线</h2>
              <div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base">
                <p>墨西哥政府2026年2月公布的《2026—2030年促进福祉基础设施投资计划》，目标是在五年内通过公共及混合投资投入5.6万亿比索（约3,252亿美元）。2026年计划在已批准预算之外增加7,220亿比索（约419亿美元），官方称其相当于约2%的GDP。</p>
                <p>项目池覆盖全国超过1,500个基础设施项目。这里的“混合投资”并不等于所有项目都会采用同一种PPP模式，而是可能包含政府与私人资本、社会组织、土地共同体或专门投资工具的不同组合。具体法律结构、采购方式和风险分配，要等项目进入实施阶段后逐项确认。</p>
                <p>对于供应商和承包商，更重要的信息是：能源、铁路和公路三项占比达到83.72%。这意味着未来几年大量采购需求不仅出现在主合同，也会向输配电设备、轨道系统、钢结构、工程机械、材料、检测、数字化和本地施工服务延伸。</p>
              </div>
            </section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Allocation by sector</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">八个战略行业，资金高度集中</h2>
              <p className="mt-4 text-sm leading-7 text-[#64717c]">下列金额是用官方行业占比乘以5.6万亿比索（约3,252亿美元）基准得到的近似值，用于理解资金量级，不代表每个行业已经获得同额预算授权。</p>
              <div className="mt-7 space-y-5">
                {sectorInvestment.map((sector) => (
                  <div key={sector.name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <p className="font-black">{sector.name} <span className="ml-2 text-[#b56e00]">{sector.share}%</span></p>
                      <p className="font-bold text-[#64717c]">{sector.estimate}</p>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e6ecef]">
                      <div className={`h-full rounded-full ${sector.color}`} style={{ width: `${Math.max(sector.share, 0.6)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 border-t border-[#dbe2e5] pt-8">
                <h3 className="text-xl font-black">投资趋势分析</h3>
                <p className="mt-3 text-sm leading-7 text-[#64717c]">资金并非均匀铺开。结合行业占比和已公布的专项工程，可以看到三个值得持续跟踪的变化。</p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {[
                    ["01", "能源与交通先行", "能源、铁路和公路合计占83.72%。短期最容易形成大额设备、工程与专业服务采购。"],
                    ["02", "单体项目转向走廊协同", "港口、铁路、公路、电网和园区正在同一地区叠加，供应机会会沿产业带连续出现。"],
                    ["03", "本地化能力决定后续订单", "项目由建设进入运营后，备件、维护、仓储和技术服务将更依赖墨西哥本地团队。"],
                  ].map(([number, title, text]) => (
                    <div key={number} className="rounded-2xl bg-[#f1f3f2] p-5">
                      <p className="font-mono text-xs font-black text-[#b86e00]">{number}</p>
                      <h4 className="mt-3 font-black">{title}</h4>
                      <p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Project pipeline</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">已经可以看到哪些工程方向？</h2>
              <div className="mt-7 grid gap-4">
                {pipelineDirections.map(({ icon, title, text }) => (
                  <div key={title} className="grid gap-4 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6">
                    <span className="flex size-11 items-center justify-center rounded-full bg-[#ffb21c] text-[#071826]"><InfrastructureIcon name={icon} /></span>
                    <div>
                      <h3 className="font-black">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Regional map</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">项目不会平均分布，四类区域最值得持续跟踪</h2>
              <figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]">
                <Image src="/insights/mexico-infrastructure-corridors.webp" alt="墨西哥四类重点基础设施投资区域示意图" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" />
                <div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/76 sm:grid-cols-2">
                  {[
                    ["bg-[#f5a20b]", "北部边境与制造业带"],
                    ["bg-[#82c8f2]", "中部与Bajío工业带"],
                    ["bg-[#ef6b2e]", "墨西哥湾与东南部"],
                    ["bg-[#4e9ad4]", "太平洋港口与物流走廊"],
                  ].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}
                </div>
                <figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/55">区域与投资方向示意，用于辅助理解重点产业带，不代表具体项目选线或行政边界上的精确投资范围。</figcaption>
              </figure>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                {regions.map((region) => (
                  <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6">
                    <p className="font-mono text-sm font-black text-[#d58a00]">{region.number}</p>
                    <h3 className="mt-3 text-lg font-black">{region.title}</h3>
                    <p className="mt-3 text-xs font-bold leading-6 text-[#8b651b]">{region.states}</p>
                    <p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-l-4 border-[#ffb21c] bg-[#fff7e4] px-5 py-4 text-sm leading-7 text-[#66562f]">
                对企业来说，“同一地区连续出现多类工程”通常比单个超级项目更重要。能源、交通、港口和园区同时建设，才更容易形成长期设备供应、本地仓储、售后服务和专业分包需求。
              </div>
            </section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]">
              <div className="p-6 sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Opportunity map</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">中国企业可参与空间</h2>
                <p className="mt-4 text-sm leading-7 text-[#64717c]">规划规模不等于可以直接获得的订单。更实际的做法是按行业识别潜在项目机会，并持续跟踪可能发布采购、建设或运营需求的主体。</p>
              </div>
              <div className="overflow-x-auto border-t border-[#dbe2e5]">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-[#edf1f2] text-xs uppercase tracking-[0.08em] text-[#62727b]">
                    <tr><th className="px-6 py-4">行业</th><th className="px-6 py-4">潜在项目机会</th><th className="px-6 py-4">优先跟踪主体</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e7e9]">
                    {opportunityRows.map(({ icon, sector, scope, buyers }) => (
                      <tr key={sector} className="align-top">
                        <th className="px-6 py-7 font-black"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fff1c9] text-[#a96800]"><InfrastructureIcon name={icon} className="size-5" /></span>{sector}</span></th>
                        <td className="px-6 py-7 leading-7 text-[#586873]">{scope}</td>
                        <td className="px-6 py-7 leading-7 text-[#586873]">{buyers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Market entry</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">把“国家机会”转化为可执行动作</h2>
              <ol className="mt-7 space-y-6">
                {[
                  ["先选行业和区域，而不是只选项目", "确定两到三个能力最匹配的细分领域，再锁定重点州、主管机构、当地总包商和设计单位。"],
                  ["区分规划、立项和招标", "政府宣布投资不代表项目已经开放采购。应继续跟踪预算授权、可研、环境许可、征地、预招标、正式公告和更正通知。"],
                  ["提前准备墨西哥履约条件", "很多项目会涉及墨西哥法人、SAT电子签名、税务与社保合规、本地成分、本地劳动力、西班牙语文件以及过往业绩证明。要求必须逐项目核对。"],
                  ["为合作模式留出空间", "如果直接投标门槛过高，可评估与墨西哥企业联合参与，或作为设备供应商、专业分包商、技术方和售后服务伙伴进入。"],
                  ["建立连续跟踪表", "至少记录主管机构、项目阶段、预算来源、采购入口、预计时间、潜在总包、本地伙伴和下一次需要核验的节点。"],
                ].map(([title, detail], index) => (
                  <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                    <span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#ffb21c]">{index + 1}</span>
                    <div className="border-b border-[#e2e7e9] pb-6 last:border-0 last:pb-0">
                      <h3 className="font-black">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-[#eef2f2] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="font-black">需要进一步核对平台注册、资格和材料？</p>
                  <p className="mt-1 text-sm leading-6 text-[#64717c]">参标指南按国家和采购平台整理了可执行的检查步骤。</p>
                </div>
                <Link href="/guides" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#061b2b] px-5 text-sm font-black text-white transition hover:bg-[#123a54]">查看参标指南 →</Link>
              </div>
            </section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">From outlook to tenders</p>
              <h2 className="mt-3 text-2xl font-black">继续查看正在发布的墨西哥项目</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">国家洞察用于判断中长期方向；项目页用于核对当下的采购方、截止日期、参与范围和文件要求。两者要结合使用。</p>
              <InsightOpenTenders country="Mexico" accentText="text-[#ffb21c]" accentBorder="hover:border-[#ffb21c]" /><Link href="/countries/mexico" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">浏览墨西哥招标项目 →</Link>
            </section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Sources & methodology</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">资料来源与使用说明</h2>
              <p className="mt-4 text-sm leading-7 text-[#64717c]">本文优先使用墨西哥总统府、财政部、SICT、SENER、CONAGUA、SEMAR及Proyectos México公开资料。金额和项目状态会变化，实际参与前应重新核对主管机构公告和项目原始文件。</p>
              <div className="mt-7 grid gap-3">
                {sources.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#d29a28] hover:bg-[#fff8e8]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black">{source.label}</p>
                        <p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p>
                      </div>
                      <span className="shrink-0 font-black text-[#b86e00] transition-transform group-hover:translate-x-0.5">↗</span>
                    </div>
                  </a>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-[#dbe2e5] bg-[#f4f6f6] px-4 py-4 text-xs leading-6 text-[#71808a]">
                <strong className="text-[#52636e]">美元换算口径：</strong>本文统一按墨西哥央行2026年9月21日公布的FIX汇率1美元＝17.2203墨西哥比索换算，并在正文中取整，仅用于理解金额量级，不构成报价、投资或财务依据。
              </div>
              <p className="mt-6 text-xs leading-6 text-[#87939a]">本文不构成投资、法律、税务或投标资格意见。具体项目的采购文件、澄清、更正和合同条件具有最终效力。</p>
            </section>
          </div>
        </div>
      </main>
    </article>
  );
}
