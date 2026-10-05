import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("dominican-republic")!;

type SectorIconName = "transport" | "education" | "water" | "energy" | "city" | "digital";

function SectorIcon({ name, className = "size-6" }: { name: SectorIconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {name === "transport" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /><path d="M4 21h16" /></>}
      {name === "education" && <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v6" /></>}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "city" && <><path d="M4 21V9l5-3v15M9 21V4l7 3v14M16 21v-9l4-2v11" /><path d="M6 12h1m-1 3h1m5-6h1m-1 3h1m-1 3h1m5 0h1" /></>}
      {name === "digital" && <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M7 8h10M7 12h6" /></>}
    </svg>
  );
}

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/dominican-republic",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

const strategicFrameworks = [
  { number: "01", horizon: "2025—2028", title: "国家公共投资计划", text: "国家公共投资计划列出约2,024个项目，四年规划投资约4,441.83亿比索。交通、教育、住房和社区服务是最集中的三类，合计约占65.2%。" },
  { number: "02", horizon: "2026年度", title: "预算落地与项目编码", text: "2026年中央政府资本支出约2,152.85亿比索，其中国家公共投资系统编码项目约965.44亿比索。年度预算是判断多年规划是否进入执行的关键入口。" },
  { number: "03", horizon: "滚动项目库", title: "公私合作项目银行", text: "公私合作总局项目银行列出交通、港口、城市服务、能源和公共设施项目，但涵盖受理、评估、公共利益、竞标、授标、执行及终止等不同状态，不能把全部项目都视为正在招标。" },
  { number: "04", horizon: "2025—2038", title: "能源系统扩建", text: "国家能源委员会的长期方向包括可再生能源、储能、天然气、电网和水电。已披露的开发管线有136个项目、超过7,400兆瓦，并估算实现2030目标需要约54亿美元投资。" },
];

const sectorInvestment = [
  { name: "交通运输", share: 30.1, estimate: "约1,338.96亿比索", color: "bg-[#59a8d8]" },
  { name: "教育", share: 21.7, estimate: "约962.98亿比索", color: "bg-[#d9a23a]" },
  { name: "住房与社区服务", share: 13.4, estimate: "约592.94亿比索", color: "bg-[#c85c43]" },
  { name: "环境、空气与水体保护", share: 6.6, estimate: "约292.37亿比索", color: "bg-[#5aa8ba]" },
  { name: "能源与燃料", share: 5.3, estimate: "约235.38亿比索", color: "bg-[#67a98d]" },
  { name: "其他功能", share: 22.9, estimate: "约1,019.20亿比索", color: "bg-[#b5bfc4]" },
];

const sectors: Array<{ icon: SectorIconName; title: string; text: string }> = [
  { icon: "transport", title: "轨道交通、公路与物流连接", text: "四年交通规划投资约1,338.96亿比索、涉及306个项目。圣多明各地铁扩建、圣地亚哥单轨、道路与桥梁会带动土建、轨道、信号、供电、机电、车辆设施和长期维护需求；政府目标到2028年底把大众轨道交通网络由35公里扩展到73公里。" },
  { icon: "education", title: "学校、校园和技能基础设施", text: "教育类四年规划投资约962.98亿比索。采购机会不仅包括校舍建设，也包括修缮、实验室、家具、教学设备、数字化系统、供电供水及校园运营服务。" },
  { icon: "water", title: "供水、排污与气候韧性", text: "住房与社区服务约592.94亿比索，环境、空气与水体保护约292.37亿比索。2025年国家供水与排污研究所执行投资102.68亿比索；管网、泵站、处理厂、排水、河道治理和智能计量仍是持续需求。" },
  { icon: "energy", title: "可再生能源、储能与输电", text: "官方开发管线包括136个项目、超过7,400兆瓦；储能项目也已进入特许阶段。机会覆盖光伏、风电、储能系统、变电站、输电线路、保护控制、工程服务和运营维护。" },
  { icon: "city", title: "公私合作与都市基础设施", text: "公私合作项目银行横跨公路、停车、港口、卫生、政府设施和城市交通。Autopista Ámbar（琥珀高速公路）披露资本支出约236.8亿比索；企业需按项目状态判断是早期倡议、竞标还是已进入执行。" },
];

const regions = [
  { number: "01", title: "Ozama都市区", places: "Distrito Nacional、Santo Domingo", focus: "2026年国家公共投资系统编码项目约325.45亿比索，占地区分布33.7%。重点是地铁与城市交通、供水排污、住房、医院、公共建筑和数字化服务。" },
  { number: "02", title: "Cibao北部与西北部", places: "Santiago、Puerto Plata、Montecristi及周边", focus: "圣地亚哥单轨、道路、供水、物流和旅游基础设施形成区域项目链。2026年Cibao Norte与Cibao Noroeste合计约181.03亿比索的编码项目投资。" },
  { number: "03", title: "东部旅游与产业走廊", places: "La Altagracia、La Romana、San Pedro de Macorís", focus: "机场与道路连接、旅游公共空间、供水排污、电网、港口和工业服务需求并行。项目可能由中央政府、地方机构、公用事业或私人项目业主分别采购。" },
  { number: "04", title: "南部与边境发展带", places: "Barahona、Pedernales、San Juan、Elías Piña及周边", focus: "旅游开发、道路、供水、农业水利、医院、学校和电力连接是主要方向。偏远物流、气候韧性和本地实施资源会显著影响履约成本。" },
];

const opportunities: Array<{ icon: SectorIconName; sector: string; scope: string; buyers: string }> = [
  { icon: "transport", sector: "交通与工程", scope: "地铁、单轨、道路桥梁、轨道信号、机电系统、施工设备与维护", buyers: "公共工程与通信部（MOPC）、圣多明各地铁办公室（OPRET）、交通基础设施信托（FITRAM）、地方政府及项目承包商" },
  { icon: "energy", sector: "能源与电网", scope: "光伏、风电、储能、输变电、保护控制、天然气与运维服务", buyers: "国家能源委员会（CNE）、国家输电公司（ETED）、国家水电公司（EGEHID）、配电企业及私人项目业主" },
  { icon: "water", sector: "供水与环境", scope: "水厂、污水处理、泵站、管网、排水、河道治理、仪表与自动化", buyers: "国家供水与排污研究所（INAPA）、圣多明各供水排污公司（CAASD）、地方供水机构及市政单位" },
  { icon: "education", sector: "社会基础设施", scope: "学校、医院、公共建筑、实验室、家具设备和数字系统", buyers: "教育部（MINERD）、住房部（MIVED）、国家卫生服务（SNS）、各部委与自治机构" },
  { icon: "city", sector: "公私合作项目", scope: "公路、港口、停车、城市服务、公共设施的设计、融资、建设和运营", buyers: "公私合作总局（DGAPP）、项目主管部门、项目公司及入围联合体" },
];

const sources = [
  { label: "国家公共投资计划2025—2028", href: "https://mepyd.gob.do/download/21003/pnpsp/416606/pnpip-2025-2028.pdf", note: "四年公共投资总额、项目数量、年度和功能分类金额。" },
  { label: "规划与发展部：国家公共投资计划入口", href: "https://mepyd.gob.do/pnpip-2025-2028", note: "国家公共投资计划的官方发布页。" },
  { label: "预算总局：2026年国家预算说明报告", href: "https://digepres.gob.do/wp-content/uploads/2026/02/2.-Inf-Expl-y-MPMP-1.pdf", note: "2026年资本支出、国家公共投资系统编码项目及地区分布。" },
  { label: "预算总局：2026年国家预算", href: "https://digepres.gob.do/ley-de-presupuesto-general-del-estado-2026/", note: "2026年度预算文件和法律入口。" },
  { label: "公私合作总局：项目银行", href: "https://dgapp.gob.do/banco-de-proyectos/por-fecha/", note: "不同状态的公私合作倡议、竞标与执行项目。" },
  { label: "公私合作总局：Autopista Ámbar项目", href: "https://dgapp.gob.do/banco-de-proyectos/originador/", note: "项目来源、阶段和公开资本支出口径。" },
  { label: "国家能源委员会：国家能源计划2025—2038及项目管线", href: "https://cne.gob.do/noticia/rd-alcanza-24-5-de-renovables-y-tiene-en-carpeta-mas-de-7400-mw-en-nuevos-proyectos/", note: "136个开发项目、超过7,400兆瓦和2030投资需求。" },
  { label: "国家能源委员会：发电扩建规划", href: "https://cne.gob.do/wp-content/uploads/2025/04/Boletin-7-web.pdf", note: "至2038年的光伏、风电、储能、天然气和水电扩建方向。" },
  { label: "总统府：2028年大众轨道交通扩展目标", href: "https://presidencia.gob.do/noticias/gobierno-impulsa-transformacion-del-transporte-masivo-con-la-expansion-73-kilometros-de", note: "现有和规划轨道交通网络长度。" },
  { label: "总统府：供水与排污投资", href: "https://www.presidencia.gob.do/noticias/presidente-luis-abinader-revela-inversion-historica-en-agua-potable-y-saneamiento", note: "国家供水与排污研究所2025年投资及主要建设方向。" },
  { label: "多米尼加中央银行参考汇率", href: "https://www.bancentral.gov.do/", note: "美元参考值按2026年10月2日卖出价1美元＝60.6902多米尼加比索静态折算。" },
];

export const revalidate = 300;

export default function DominicanRepublicInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    datePublished: "2026-10-04",
    dateModified: "2026-10-04",
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
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#d9a23a] px-3 py-1 text-xs font-black text-[#071826]">多米尼加</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/65">Infrastructure & procurement outlook</span></div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">多米尼加国家洞察：<br className="hidden sm:block" />2025—2028公共投资与长期基础设施机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/80 sm:text-lg">从四年国家公共投资计划出发，结合年度预算、公私合作项目银行和长期能源规划，识别交通、教育、供水、能源与城市基础设施机会。</p>
            <p className="mt-8 text-sm text-white/65">作者：<strong className="text-white">拉美招投标指南针</strong></p>
          </div>
        </div>
        <InsightHeroCredit insight={insight} />
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="多米尼加公共投资关键数字">
          {[
            { number: "01", title: "2025—2028规划投资", value: "4,441.83亿", unit: "多米尼加比索", secondary: "约73.2亿美元", description: "国家公共投资计划" },
            { number: "02", title: "公共投资项目", value: "约2,024个", unit: "国家项目池", description: "覆盖中央与地方项目" },
            { number: "03", title: "四年交通投入", value: "1,338.96亿", unit: "多米尼加比索", description: "规划金额最大的功能类别" },
            { number: "04", title: "能源开发管线", value: "超7,400兆瓦", unit: "136个项目", description: "含可再生能源与储能" },
          ].map(({ number, title, value, unit, secondary, description }) => <div key={number} className="relative flex min-h-60 flex-col overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,.05)] sm:p-6"><span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c85c43] via-[#d9a23a] to-[#59a8d8]" /><div className="flex items-center justify-center gap-2"><span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#b54f39]">{number}</span><span className="h-3 w-px bg-[#dbe2e5]" /><p className="text-xs font-black tracking-[0.07em] text-[#445762]">{title}</p></div><div className="mt-6"><p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#a94835] sm:text-4xl">{value}</p><p className="mt-2 text-sm font-black text-[#253d4b]">{unit}</p>{secondary ? <p className="mt-1 text-xs font-bold text-[#8a672e]">（{secondary}）</p> : null}</div><div className="mx-auto mt-auto w-10 border-t-2 border-[#d9a23a] pt-4" /><p className="text-xs leading-5 text-[#6b7981]">{description}</p></div>)}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d9a23a] bg-[#fff3cf] p-5 text-sm leading-7 text-[#6d5a31] sm:p-6"><strong className="text-[#6d4900]">金额说明：</strong>四年规划投资约4,441.83亿比索（约73.2亿美元）。美元按2026年10月2日多米尼加中央银行卖出价1美元＝60.6902比索静态折算，仅用于比较；实际采购金额与汇率以项目文件为准。</div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#d9a23a]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview", "投资总览"], ["sectors", "行业预算"], ["strategy", "多年期框架"], ["pipeline", "重点工程管线"], ["regions", "区域分布"], ["opportunities", "企业机会"], ["entry", "进入路径"], ["sources", "资料来源"]].map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>
          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Investment framework</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四年规划约4,441.83亿比索，覆盖约2,024个项目</h2><div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base"><p>《国家公共投资计划2025—2028》列示四年投资约4,441.83亿多米尼加比索（约73.2亿美元），年度安排分别约为1,960.12亿、1,133.56亿、752.76亿和595.38亿比索。</p><p>交通运输约1,338.96亿比索，教育约962.98亿比索，住房与社区服务约592.94亿比索；三项合计约占四年规划金额65.2%。</p><p>对供应商与承包商而言，项目机会会从主合同延伸至轨道系统、机电设备、施工机械、管材泵阀、能源设备、数字系统、检测和本地施工服务。</p></div><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["2025", "1,960.12亿比索"], ["2026", "1,133.56亿比索"], ["2027", "752.76亿比索"], ["2028", "595.38亿比索"]].map(([year, amount]) => <div key={year} className="rounded-2xl bg-[#f1f3f2] px-5 py-4"><p className="text-xs font-black tracking-[.12em] text-[#b54f39]">{year}</p><p className="mt-2 text-base font-black text-[#061b2b]">{amount}</p><p className="mt-1 text-xs text-[#64717c]">规划投资</p></div>)}</div></section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Allocation by sector</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">交通、教育和社区基础设施是资金主线</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">下列金额来自国家公共投资计划四年功能分类，用于观察政府项目管线；实际采购规模以年度预算和项目公告为准。</p><div className="mt-7 space-y-5">{sectorInvestment.map((sector) => <div key={sector.name}><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><p className="font-black">{sector.name} <span className="ml-2 text-[#b54f39]">{sector.share}%</span></p><p className="font-bold text-[#64717c]">{sector.estimate}</p></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e6ecef]"><div className={`h-full rounded-full ${sector.color}`} style={{ width: `${Math.max(sector.share, 0.6)}%` }} /></div></div>)}</div><div className="mt-10 grid gap-4 md:grid-cols-3">{[["01", "四年规划看方向", "国家公共投资计划展示中期项目池；是否形成采购，要继续看年度预算、采购计划和正式程序。"], ["02", "年度预算看落地", "2026年国家公共投资系统编码项目约965.44亿比索，是判断当年执行重点的重要口径。"], ["03", "项目数不等于标次数", "约2,024个项目可能拆分多个采购，也可能仍在规划、设计、融资或续建阶段。"]].map(([number, title, text]) => <div key={number} className="rounded-2xl bg-[#f1f3f2] p-5"><p className="font-mono text-xs font-black text-[#b54f39]">{number}</p><h3 className="mt-3 font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p></div>)}</div></section>

            <section id="strategy" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Multi-year strategy</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四条框架决定项目如何进入市场</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">公共预算、公私合作和能源开发属于不同资金与采购口径，不能简单相加；企业应分别跟踪项目阶段和正式入口。</p><div className="mt-7 grid gap-4 sm:grid-cols-2">{strategicFrameworks.map((framework) => <div key={framework.number} className="rounded-2xl border border-[#dbe2e5] bg-[#fafbf9] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><span className="font-mono text-sm font-black text-[#b54f39]">{framework.number}</span><span className="rounded-full bg-[#fff0d2] px-3 py-1 text-xs font-black text-[#8a5b11]">{framework.horizon}</span></div><h3 className="mt-4 text-lg font-black">{framework.title}</h3><p className="mt-3 text-sm leading-7 text-[#586873]">{framework.text}</p></div>)}</div></section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Project pipeline</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">值得持续跟踪的五类项目方向</h2><div className="mt-7 grid gap-4">{sectors.map((sector) => <div key={sector.title} className="grid gap-3 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[2.8rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#c85c43] text-white"><SectorIcon name={sector.icon} className="size-6" /></span><div><h3 className="font-black">{sector.title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{sector.text}</p></div></div>)}</div></section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Regional opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四类业务观察区，采购和履约条件不同</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">按官方规划地区和主要产业链归纳，便于理解项目分布；不是正式行政或投资分区。</p><figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]"><Image src="/insights/dominican-republic-infrastructure-regions.webp" alt="多米尼加四类基础设施机会区域示意图，区分北部生产与物流带、大圣多明各都市核心、东部旅游能源走廊和西南边境发展区" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" /><div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/82 sm:grid-cols-2">{[["bg-[#d9a23a]", "北部生产与物流带"], ["bg-[#c85c43]", "大圣多明各都市核心"], ["bg-[#59a8d8]", "东部旅游与能源走廊"], ["bg-[#7b63a8]", "西南与边境发展区"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div><figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">地图仅用于说明业务观察区域，不代表精确行政边界、项目位置、投资范围或政治立场。</figcaption></figure><div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#b54f39]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a672e]">{region.places}</p><p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p></div>)}</div><div className="mt-6 border-l-4 border-[#c85c43] bg-[#fff2ec] px-5 py-4 text-sm leading-7 text-[#66562f]">国家电子采购平台覆盖面广，但公用事业、地方机构、公私合作项目公司和私人能源开发商可能有不同采购入口。发现项目后，先确认实际采购主体和正式文件来源。</div></section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]"><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">中国企业可关注的潜在项目机会</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">直接投标、组成联合体、参与公私合作或进入总承包供应链的门槛不同；资格和本地化要求以每项最新文件为准。</p></div><div className="overflow-x-auto border-t border-[#dbe2e5]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#edf1f2] text-xs tracking-[.06em] text-[#62727b]"><tr><th className="px-5 py-4">行业</th><th className="px-5 py-4">潜在项目机会</th><th className="px-5 py-4">重点跟踪主体</th></tr></thead><tbody className="divide-y divide-[#e2e7e9]">{opportunities.map((row) => <tr key={row.sector} className="align-top"><th className="px-5 py-5 font-black"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fff0d2] text-[#a94835]"><SectorIcon name={row.icon} className="size-5" /></span>{row.sector}</span></th><td className="px-5 py-5 leading-7 text-[#586873]">{row.scope}</td><td className="px-5 py-5 leading-7 text-[#586873]">{row.buyers}</td></tr>)}</tbody></table></div></section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Market entry</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">把市场方向转成参标动作</h2><ol className="mt-7 space-y-5">{[["分清项目口径", "区分国家公共投资计划、年度预算、公私合作项目银行、私人能源开发和正式采购，避免把规划金额直接当成招标规模。"], ["核对采购入口", "政府采购以DGCP平台为主；公私合作、公用事业和私人项目可能使用其他入口。以项目主管机构发布的原始文件为准。"], ["先完成境外参与核验", "核对RPE临时登记、平台账户、文件翻译认证、本地代表、税务、担保和电子提交要求。"], ["围绕产业链选择角色", "直接投标门槛过高时，可评估联合体、设备供货、专项工程或总承包分包，但不要预设每个项目都强制本地合作。"]].map(([title, detail], index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#d9a23a]">{index + 1}</span><div className="border-b border-[#e2e7e9] pb-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p></div></li>)}</ol><div className="mt-7"><Link href="/guides/dominican-republic-dgcp" className="inline-flex min-h-12 items-center rounded-xl bg-[#061b2b] px-5 text-sm font-black text-white transition hover:bg-[#123a54]">查看多米尼加DGCP参标指南 →</Link></div></section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#d9a23a]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续核对正在发布的多米尼加项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">国家洞察帮助识别方向；项目页用于核对采购方、状态、关键日期和完整标书要求。</p><InsightOpenTenders country="Dominican Republic" accentText="text-[#d9a23a]" accentBorder="hover:border-[#d9a23a]" /><Link href="/countries/dominican-republic" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#d9a23a] px-6 font-black text-[#071826] transition hover:bg-[#e8b957]">浏览多米尼加招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">资料来源与使用说明</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">本文优先使用多米尼加规划与发展部、预算总局、公私合作总局、国家能源委员会、总统府及中央银行公开资料。金额和项目状态会变化，实际参与前应重新核对主管机构公告和项目原始文件。</p><div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#c27863] hover:bg-[#fff2ec]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p></div><span className="font-black text-[#b54f39]">↗</span></div></a>)}</div><p className="mt-6 text-xs leading-6 text-[#8d8186]">本文不是投资、法律、税务或投标资格意见。项目进度、预算、资格与合同条件，以主管机构和采购文件的最新有效版本为准。</p></section>
          </div>
        </div>
      </main>
    </article>
  );
}
