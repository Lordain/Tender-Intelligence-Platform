import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("argentina")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/argentina",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

const budgetAreas = [
  { title: "直接投资", amount: 1.355, usd: "9.0", color: "bg-[#c85c43]", detail: "国家机关直接执行的资本项目" },
  { title: "资本转移", amount: 1.632, usd: "10.8", color: "bg-[#d9a23a]", detail: "向企业、地方或其他执行主体提供的资本资金" },
  { title: "金融投资", amount: 0.300, usd: "2.0", color: "bg-[#59a8d8]", detail: "与公共投资相关的金融资产与出资" },
];

const sectors = [
  { number: "01", title: "输电扩建与能源配套", text: "国家输电扩建计划列出16项战略工程、超过5,610公里500千伏线路，官方估算投资超过66亿美元。AMBA I已由CONTRAT.AR启动国际、多阶段特许经营招标；油气、锂和可再生能源项目还会带动变电站、管线、道路、水务和营地采购。" },
  { number: "02", title: "锂、Vaca Muerta与RIGI项目链", text: "RIGI是大型投资的激励制度，不是政府采购平台。截至2026年6月，官方披露16个项目获批、投资298.92亿美元。中国企业应逐项目识别业主、EPC、设备包和地方许可，而不是把已批准投资额当作公开招标金额。" },
  { number: "03", title: "铁路更新与运营重构", text: "ADIF门户持续发布线路、轨道、车站、信号、电气化、变电站及配套工程采购。铁路特许与私有化改变的是经营和投资结构；正式机会仍需回到ADIF、主管机关或交易文件核对阶段、资格和采购入口。" },
  { number: "04", title: "国家公路与Malla维护", text: "Vialidad Nacional按路线和区域组织养护、路面恢复、桥涵及安全设施项目，国家公路特许经营则通过CONTRAT.AR分阶段推进。工程企业应区分传统Malla/维护合同、工程招标与长期特许经营。" },
  { number: "05", title: "港航、水务与城市服务", text: "Paraná—Paraguay水道（Hidrovía）特许经营和港口集疏运形成疏浚、导航、监测、码头与物流需求；AySA及地方运营主体则涉及供排水、管网、处理设施和维护。不同项目的资金来源和采购主体差异很大。" },
];

const regions = [
  { number: "01", title: "西北与库约资源带", places: "Jujuy、Salta、Catamarca、La Rioja、San Juan、Mendoza", focus: "锂、铜、油气与可再生能源项目带动矿区道路、输电、供水、营地和加工设施。高海拔、缺水、跨省许可与社区关系会改变履约成本。" },
  { number: "02", title: "东北与Litoral物流带", places: "Misiones、Corrientes、Chaco、Formosa、Entre Ríos、Santa Fe", focus: "水电、林农产业、铁路、公路、港口和Paraná—Paraguay水道相互连接。设备企业应同步跟踪港航运营方、铁路采购与省级项目。" },
  { number: "03", title: "中部都市与Pampas核心区", places: "Buenos Aires、CABA、Córdoba、Santa Fe、La Pampa、San Luis", focus: "AMBA输电、城市水务、干线公路、铁路、港口、公共建筑与数字系统最为集中，也最常出现国家、省、市和特许经营主体并行。" },
  { number: "04", title: "Patagonia能源与连接区", places: "Neuquén、Río Negro、Chubut、Santa Cruz、Tierra del Fuego", focus: "Vaca Muerta油气、风电、输电、管线、港口和长距离交通形成工程链。偏远物流、气候、营地和长期运维能力是报价关键。" },
];

const opportunities = [
  { sector: "电网与能源", scope: "500千伏线路、变电站、保护控制、储能、油气与矿区供电", buyers: "能源主管机关、CAMMESA、特许经营项目公司、能源与矿业业主" },
  { sector: "铁路与交通", scope: "轨道、道岔、信号通信、牵引供电、车站、车辆设施和维护", buyers: "ADIF、铁路运营主体、交通主管机关及中标承包商" },
  { sector: "公路与工程", scope: "路面恢复、桥涵、收费与ITS、安全设施、施工设备和养护", buyers: "Vialidad Nacional、省级公路部门、特许经营公司" },
  { sector: "矿业与油气", scope: "矿山与油田工程、管线、泵阀、自动化、水处理、营地和物流", buyers: "RIGI项目业主、矿业与油气公司、EPC总包" },
  { sector: "港航与水务", scope: "疏浚、导航监测、码头设备、供排水管网、泵站与处理设施", buyers: "港航主管机关、港口和水道运营方、AySA及地方公用事业" },
];

const sources = [
  { label: "2026年国家预算法 Ley 27.798", href: "https://www.argentina.gob.ar/normativa/nacional/ley-27798-422000/texto", note: "年度预算的正式法律文本，资本支出总额为3.286766万亿比索。" },
  { label: "阿根廷财政部：2026年预算说明与资本支出分项", href: "https://www.argentina.gob.ar/sites/default/files/proyecto_de_ley_de_presupuesto_general_de_gastos_y_calculo_de_recursos_de_la_administracio_nacional_2026_-_mensaje_articulado_y_planillas_del_proyecto_de_ley.pdf", note: "列明直接投资、资本转移和金融投资等资本支出构成。" },
  { label: "国家公共投资计划 PNIP 2026—2028", href: "https://www.argentina.gob.ar/jefatura/presupuestaria/inversion-publica/plan-nacional-de-inversiones-publicas", note: "公共投资项目编制、评估和年度预算衔接口径。" },
  { label: "公共投资项目查询（BAPIN / 2026预算）", href: "https://www.argentina.gob.ar/jefatura/presupuestaria/inversion-publica/consulta-de-proyectos-y-seguimiento-de-ejecucion/proyectos", note: "可按省份、机关、项目状态和2026年金额核对具体公共投资项目。" },
  { label: "经济部：RIGI批准与评估项目进展", href: "https://www.argentina.gob.ar/node/504545", note: "截至2026年6月披露16个已批准项目、298.92亿美元；评估中项目不计入已批准金额。" },
  { label: "RIGI官方制度入口", href: "https://www.argentina.gob.ar/economia/rigi", note: "制度、适用行业、项目状态与法规入口。" },
  { label: "能源部门：国家输电扩建计划与AMBA I", href: "https://www.argentina.gob.ar/node/510027", note: "16项战略工程、5,610公里500千伏线路和超过66亿美元计划规模；AMBA I进入招标。" },
  { label: "Resolución 202/2026：AMBA I特许经营招标", href: "https://www.argentina.gob.ar/normativa/nacional/norma-428810", note: "确认国际、多阶段公开招标的法律与采购口径。" },
  { label: "ADIF铁路基础设施招标门户", href: "https://plataforma.adifsa.com.ar/portal_licitaciones", note: "线路、车站、信号、电气与配套项目的正式文件和Circulares。" },
  { label: "Vialidad Nacional：公路项目与招采入口", href: "https://www.argentina.gob.ar/obras-publicas/vialidad-nacional", note: "国家公路工程、维护与机构信息；具体程序仍需进入指定平台。" },
  { label: "政府公告：国家公路特许经营第三阶段", href: "https://www.argentina.gob.ar/node/492834", note: "CONTRAT.AR程序504-0001-LPU26及八个路段的官方说明。" },
  { label: "政府公告：Hidrovía特许经营进展", href: "https://www.argentina.gob.ar/noticias/avanza-el-proceso-de-licitacion-de-la-hidrovia-se-evaluaron-las-ofertas-de-la-etapa-1", note: "用于核对水道特许经营的正式评审阶段，不代表下游合同已发布。" },
  { label: "AySA 2026行动计划与预算", href: "https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-495-2026-424845/texto", note: "供排水运营、维护和投资的官方预算依据。" },
  { label: "BCRA：A3500参考汇率", href: "https://www.bcra.gob.ar/principales-variables/", note: "本文资本支出按2026年9月15日1美元＝1,506.6836阿根廷比索估算。" },
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
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">阿根廷国家洞察：<br className="hidden sm:block" />公共投资、RIGI与基础设施项目机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/80 sm:text-lg">把年度预算、获批大型投资和正式采购分开阅读，寻找输电、交通、能源与水务的可执行机会。</p>
            <p className="mt-8 text-sm text-white/65">作者：<strong className="text-white">拉美招投标指南针</strong>　·　资料核对：截至2026年9月30日</p>
          </div>
        </div>
        <InsightHeroCredit insight={insight} />
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="阿根廷基础设施关键数字">
          {[["01", "2026年资本支出", "3.29万亿", "阿根廷比索", "约21.8亿美元 · 国家预算"], ["02", "RIGI已批准", "16", "个项目", "官方披露投资298.92亿美元"], ["03", "输电战略工程", "16", "项", "超过5,610公里500千伏线路"], ["04", "输电计划规模", "66亿+", "美元", "规划规模，不等于已招标金额"]].map(([number, title, value, unit, note]) => <div key={number} className="relative flex min-h-52 flex-col rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,.05)] sm:p-6"><span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c85c43] via-[#d9a23a] to-[#59a8d8]" /><p className="text-xs font-black tracking-[0.07em] text-[#445762]"><span className="mr-2 font-mono text-[#b54f39]">{number}</span>{title}</p><p className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#a94835] sm:text-4xl">{value}</p><p className="mt-1 text-sm font-black text-[#253d4b]">{unit}</p><p className="mt-auto border-t border-[#e5e9ea] pt-4 text-xs leading-5 text-[#6b7981]">{note}</p></div>)}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d9a23a] bg-[#fff3cf] p-5 text-sm leading-7 text-[#6d5a31] sm:p-6"><strong className="text-[#6d4900]">先看清口径：</strong>2026年资本支出是国家预算口径；RIGI数字是已获批的大型私人投资；输电计划是多年规划；平台中的招标才是可直接响应的采购。本文不会把四类金额相加。资本支出美元换算按BCRA 2026年9月15日A3500参考汇率1美元＝1,506.6836阿根廷比索，仅作规模比较。</div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#d9a23a]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview", "投资与采购口径"], ["allocation", "预算资本支出"], ["pipeline", "项目方向"], ["regions", "区域分布"], ["opportunities", "企业机会"], ["entry", "进入路径"], ["sources", "资料来源"]].map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>
          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Planning framework</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">从国家预算到可以响应的采购程序</h2><div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base"><p>阿根廷公共投资项目通过BAPIN和年度国家公共投资计划（PNIP）与预算衔接。2026年预算中的资本支出为3.286766万亿比索，包括直接投资、资本转移和金融投资；它比“政府所有支出”更接近基础设施观察口径，但仍不等于公开招标金额。</p><p>RIGI（大型投资激励制度）服务于矿业、能源、油气、基础设施等大型投资。截至2026年6月，经济部披露16个项目已批准、投资298.92亿美元；另有项目处于评估中。已批准代表制度审批进展，不代表全部设备和工程包已进入采购。</p><p>真正参标时，应回到COMPR.AR、CONTRAT.AR、ADIF或项目业主指定入口，核对采购主体、资格、最新Circulares、截止时间和合同条件。</p></div></section>

            <section id="allocation" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">2026 capital expenditure</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">预算资本支出：资本转移与直接投资为主</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">下列金额均为2026年预算项目文件口径，单位为万亿阿根廷比索；美元只用于横向理解规模。</p><div className="mt-7 space-y-5 rounded-2xl border border-[#e0e6e8] bg-[#fafbf9] p-5">{budgetAreas.map((area) => <div key={area.title}><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><h3 className="font-black">{area.title}</h3><span className="font-black text-[#445762]">{area.amount.toFixed(3)}万亿比索 <span className="font-medium text-[#71808a]">（约{area.usd}亿美元）</span></span></div><div className="mt-2 h-3 rounded-full bg-[#e6ecef]"><div className={`h-3 rounded-full ${area.color}`} style={{ width: `${area.amount / 1.632 * 100}%` }} /></div><p className="mt-1.5 text-xs leading-5 text-[#71808a]">{area.detail}</p></div>)}</div><p className="mt-4 text-xs leading-6 text-[#71808a]">横条以最大类别“资本转移”为刻度。预算获批后仍会受执行、项目进度、融资和采购安排影响。</p></section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Project pipeline</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">值得持续跟踪的五类项目方向</h2><div className="mt-7 grid gap-4">{sectors.map((sector) => <div key={sector.number} className="grid gap-3 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[2.8rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#c85c43] font-mono text-sm font-black text-white">{sector.number}</span><div><h3 className="font-black">{sector.title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{sector.text}</p></div></div>)}</div></section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Regional opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四类业务观察区，项目逻辑不同</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">按省份和主要产业链归纳，便于理解采购与履约条件；不是正式行政或投资分区。</p><figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]"><Image src="/insights/argentina-infrastructure-regions.webp" alt="阿根廷四类基础设施机会区域示意图，区分西北库约、东北Litoral、中部Pampas与Patagonia" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" /><div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/82 sm:grid-cols-2">{[["bg-[#d9a23a]", "西北与库约资源带"], ["bg-[#59a8d8]", "东北与Litoral物流带"], ["bg-[#c85c43]", "中部都市与Pampas核心区"], ["bg-[#7b63a8]", "Patagonia能源与连接区"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div><figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">地图仅用于说明业务观察区域，不代表行政边界、项目准确位置、投资范围或政治立场。</figcaption></figure><div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#b54f39]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a672e]">{region.places}</p><p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p></div>)}</div><div className="mt-6 border-l-4 border-[#c85c43] bg-[#fff2ec] px-5 py-4 text-sm leading-7 text-[#66562f]">阿根廷是联邦制国家。国家平台之外，省级和市级采购、国有企业及项目公司也可能各用独立入口；本地税务、专业签字和许可要求应逐省核对。</div></section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]"><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">中国企业可关注的潜在项目机会</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">直接投标、与本地企业组成联合体、进入特许经营或EPC供应链，适用门槛不同；以每项最新文件为准。</p></div><div className="overflow-x-auto border-t border-[#dbe2e5]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#edf1f2] text-xs tracking-[.06em] text-[#62727b]"><tr><th className="px-5 py-4">行业</th><th className="px-5 py-4">潜在项目机会</th><th className="px-5 py-4">重点跟踪主体</th></tr></thead><tbody className="divide-y divide-[#e2e7e9]">{opportunities.map((row) => <tr key={row.sector} className="align-top"><th className="px-5 py-5 font-black">{row.sector}</th><td className="px-5 py-5 leading-7 text-[#586873]">{row.scope}</td><td className="px-5 py-5 leading-7 text-[#586873]">{row.buyers}</td></tr>)}</tbody></table></div></section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Market entry</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">把市场方向转成参标动作</h2><ol className="mt-7 space-y-5">{[["分清发布入口", "货物与服务看COMPR.AR；工程与特许经营看CONTRAT.AR；铁路看ADIF；省级项目和企业采购还需跟踪各自入口。"], ["把阶段写进机会清单", "区分预算、RIGI批准、规划、正式公告、投标、授标和建设，避免把投资新闻当作采购通知。"], ["先下载最新完整标书", "核对境外资格、Circulares、担保、币种、调价、税费、付款与本地履约条件。"], ["选择合适的参与结构", "直接投标门槛过高时，评估联合体、当地代表、设备供货、专项工程或EPC分包，但不预设每个项目都强制本地合作。"]].map(([title, detail], index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#d9a23a]">{index + 1}</span><div className="border-b border-[#e2e7e9] pb-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p></div></li>)}</ol><div className="mt-7 flex flex-wrap gap-3"><Link href="/guides/argentina-comprar" className="inline-flex min-h-12 items-center rounded-xl bg-[#061b2b] px-5 text-sm font-black text-white transition hover:bg-[#123a54]">查看COMPR.AR指南 →</Link><Link href="/guides/argentina-contratar" className="inline-flex min-h-12 items-center rounded-xl border border-[#061b2b] px-5 text-sm font-black text-[#061b2b] transition hover:bg-[#edf1f2]">查看CONTRAT.AR指南 →</Link></div></section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#d9a23a]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续核对正在发布的阿根廷项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">国家洞察帮助识别方向；项目页用于核对采购方、状态、关键日期及完整标书要求。</p><InsightOpenTenders country="Argentina" accentText="text-[#d9a23a]" accentBorder="hover:border-[#d9a23a]" /><Link href="/countries/argentina" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#d9a23a] px-6 font-black text-[#071826] transition hover:bg-[#e8b957]">浏览阿根廷招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">资料来源与使用说明</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">本文依据截至2026年9月30日可核对的阿根廷官方资料撰写。预算、RIGI批准、规划投资、企业预算和公开采购口径彼此独立，不能相加。文中的2026年预算阿根廷比索金额按BCRA 2026年9月15日A3500参考汇率1美元＝1,506.6836阿根廷比索换算并四舍五入；RIGI和输电规划使用官方直接公布的美元金额。</p><div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#c27863] hover:bg-[#fff2ec]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p></div><span className="font-black text-[#b54f39]">↗</span></div></a>)}</div><p className="mt-6 text-xs leading-6 text-[#8d8186]">本文不是投资、法律、税务或投标资格意见。项目进度、预算、资格与合同条件，以主管机构和采购文件的最新有效版本为准。</p></section>
          </div>
        </div>
      </main>
    </article>
  );
}
