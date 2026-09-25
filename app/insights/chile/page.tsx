import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata } from "@/lib/seo";

const insight = getCountryInsight("chile")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/chile",
  image: insight.heroImage,
});

const planAreas = [
  { title: "能源安全", amount: 173, usd: "1,791", color: "bg-[#c85c43]", detail: "发电、储能、输电和配网等长期系统需求" },
  { title: "区域连接与交通", amount: 150, usd: "1,553", color: "bg-[#d9a23a]", detail: "公路、铁路、港口、机场与跨区域物流" },
  { title: "城市与公共服务", amount: 49, usd: "507", color: "bg-[#59a8d8]", detail: "城市更新、公共设施、医疗与社区服务" },
  { title: "水资源安全", amount: 45, usd: "466", color: "bg-[#6eab9a]", detail: "供水、污水、蓄水、输水与流域韧性" },
];

const sectors = [
  { number: "01", title: "电网、储能与清洁能源", text: "北部可再生能源与矿业负荷、中部电网扩容及跨区域输电形成持续需求。能源部的2026—2030路线图强调战略输电规划；企业需要分别跟踪政策规划、CNE／电网扩建程序和项目公司的实际采购。" },
  { number: "02", title: "公路、机场与特许经营", text: "DGC持续发布公路、机场、社会基础设施及其他特许经营项目组合。项目可能处于构想、招标、授标、建设或运营阶段；设备商和施工企业应同时识别特许经营公司及EPC分包链。" },
  { number: "03", title: "铜矿与锂项目的配套", text: "Cochilco的2025—2034矿业项目组合估算投资1,045.49亿美元，但这是不同成熟度的矿业投资储备，并非政府采购金额。矿区输电、海水淡化、管线、道路、营地、自动化和环保更值得逐项目拆解。" },
  { number: "04", title: "水务与海水淡化", text: "长期基础设施规划将水资源安全单列，涉及城市与农村供水、污水处理、蓄水、灌溉和抗旱。北部矿业用水与沿海城市供水也会带来海水淡化和长距离输水需求，但水权、环境许可和能源成本必须先核验。" },
  { number: "05", title: "港口物流与数字连接", text: "港口本体之外，要看集疏运、公路铁路接口、仓储和能源供应。国家基础设施规划也将光纤、5G、数据中心及政府数字化作为连接能力的一部分；不同项目的采购主体可能完全不同。" },
];

const regions = [
  { number: "01", title: "北部矿业与能源带", places: "Arica y Parinacota、Tarapacá、Antofagasta、Atacama", focus: "铜与锂项目、光伏和储能、矿区供水、海水淡化、输电、公路与港口集疏运。重点核对环境许可、偏远施工和水资源约束。" },
  { number: "02", title: "中部都市与港口枢纽", places: "Coquimbo、Valparaíso、Metropolitana、O’Higgins", focus: "都市公路、轨道和公交、港口物流、机场、公共建筑、城市水务与电网。采购机构、特许经营公司和地方政府并行。" },
  { number: "03", title: "中南部工业与农业走廊", places: "Maule、Ñuble、Biobío、La Araucanía", focus: "干线公路、铁路货运、林业和农业物流、工业供能、灌溉与灾害韧性。关注区域工程和长期运维标段。" },
  { number: "04", title: "南部与极地连接区", places: "Los Ríos、Los Lagos、Aysén、Magallanes", focus: "跨区交通、机场与港口、偏远电力、光纤、供水和公共服务。项目相对分散，履约物流和气候条件影响成本。" },
];

const opportunities = [
  { sector: "电力与储能", scope: "输电线路、变电站、储能系统、保护控制、配网设备与运维", buyers: "能源部、CNE、Coordinador Eléctrico、发电及输电公司" },
  { sector: "交通与工程", scope: "公路桥梁、轨道、机场设施、施工设备、智能交通及维护", buyers: "MOP、DGC、交通主管机构、特许经营公司" },
  { sector: "水务与海淡", scope: "海水淡化、泵站、输水管线、污水处理、节水和监测", buyers: "MOP水务系统、地方公用事业、矿业及工业项目业主" },
  { sector: "矿业配套", scope: "矿山工程、选矿、供电供水、自动化、环保设备与备件", buyers: "矿业公司、ENAMI、EPC总包与运营商" },
  { sector: "港口与物流", scope: "码头、装卸、仓储、冷链、集疏运及数字化调度", buyers: "港口企业、运营商、DGC及物流项目公司" },
  { sector: "ICT与公共服务", scope: "光纤、数据中心、网络安全、医院设备与信息系统", buyers: "ChileCompra采购机构、通信企业、医院及项目公司" },
];

const sources = [
  { label: "MOP：国家公共基础设施规划2025—2055", href: "https://infraestructura2055.mop.gob.cl/", note: "截至2026年1月的417万亿比索与24,589项倡议；四大规划方向。" },
  { label: "MOP：PNIP文件与口径说明", href: "https://infraestructura2055.mop.gob.cl/descargas/", note: "规划文件、项目组合来源和2026年1月更新说明。" },
  { label: "DGC：特许经营项目组合", href: "https://concesiones.mop.gob.cl/tipo/cartera-de-proyectos/", note: "按项目核对特许经营的阶段、预估投资和采购主体。" },
  { label: "DGC：季度报告与招标组合", href: "https://concesiones.mop.gob.cl/publicaciones/", note: "区分待招、正在招标、授标与建设。" },
  { label: "能源部：2026—2030能源路线图", href: "https://energia.gob.cl/sites/default/files/documentos/ruta_2026-2030.pdf", note: "输电规划、战略电网和项目推进方向。" },
  { label: "Cochilco：2025—2034矿业投资项目组合", href: "https://www.cochilco.cl/web/informe-cartera-de-proyectos-de-inversion-minera-2025-2034/", note: "1,045.49亿美元矿业投资储备；不是公共采购预算。" },
  { label: "ChileCompra：Mercado Público", href: "https://www.chilecompra.cl/mercado-publico/", note: "公共采购的公开查询及交易平台。" },
  { label: "智利央行：观察美元参考汇率", href: "https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TIPO_CAMBIO/MN_TIPO_CAMBIO4/DOLAR_OBS_ADO?idSerie=F073.TCO.PRE.Z.D", note: "2026年9月25日1美元＝965.71智利比索；仅用于本文美元估算。" },
];

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function ChileInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    datePublished: "2026-09-25",
    dateModified: "2026-09-25",
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image src={insight.heroImage} alt="智利港口、海岸物流与安第斯山脉" fill priority sizes="100vw" className="object-cover opacity-65" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/90 to-[#031521]/12" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="text-sm font-bold text-white/70 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#d9a23a] px-3 py-1 text-xs font-black text-[#071826]">智利</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/65">Infrastructure & procurement outlook</span></div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">智利国家洞察：<br className="hidden sm:block" />2025—2055基础设施规划与近期项目机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/80 sm:text-lg">从长期规划识别方向，再按项目阶段、采购主体和正式标书寻找可执行机会。</p>
            <p className="mt-8 text-sm text-white/65">作者：<strong className="text-white">拉美招投标指南针</strong>　·　资料核对：截至2026年9月25日</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="智利基础设施关键数字">
          {[
            ["01", "长期规划估算", "417万亿", "智利比索", "约4,318亿美元 · PNIP 2025—2055滚动组合"],
            ["02", "规划倡议", "24,589", "项", "截至2026年1月"],
            ["03", "核心方向", "4", "大领域", "能源、交通、城市与水务"],
            ["04", "矿业储备", "1,045.49亿", "美元", "Cochilco 2025—2034组合"],
          ].map(([number, title, value, unit, note]) => <div key={number} className="relative flex min-h-52 flex-col rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,.05)] sm:p-6"><span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c85c43] via-[#d9a23a] to-[#59a8d8]" /><p className="text-xs font-black tracking-[0.07em] text-[#445762]"><span className="mr-2 font-mono text-[#b54f39]">{number}</span>{title}</p><p className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#a94835] sm:text-4xl">{value}</p><p className="mt-1 text-sm font-black text-[#253d4b]">{unit}</p><p className="mt-auto border-t border-[#e5e9ea] pt-4 text-xs leading-5 text-[#6b7981]">{note}</p></div>)}
        </section>

        <div className="mt-8 rounded-2xl border border-[#d9a23a] bg-[#fff3cf] p-5 text-sm leading-7 text-[#6d5a31] sm:p-6"><strong className="text-[#6d4900]">先看清口径：</strong>417万亿比索与24,589项倡议是横跨2025—2055年的滚动规划，包含不同成熟度、不同实施主体的公共与私人项目；不是2026年预算，也不是已经发布的招标数量。Cochilco矿业储备属于另一套统计，不应与PNIP相加。具体机会仍需核对预算、许可、招标与承包链。</div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#d9a23a]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview", "规划口径"], ["allocation", "资金主要投向"], ["pipeline", "项目方向"], ["regions", "区域分布"], ["opportunities", "企业机会"], ["entry", "进入路径"], ["sources", "资料来源"]].map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>
          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Planning framework</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">从30年规划到真正可跟踪的项目</h2><div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base"><p>智利MOP的《国家公共基础设施规划2025—2055》（PNIP）把交通与区域连接、城市宜居、水资源安全及能源安全纳入同一长期框架。官方在2025年发布初版后继续滚动调整；2026年1月口径为417万亿智利比索、24,589项倡议。</p><p>这项规划的价值在于辨认国家与区域的长期建设重点，而非直接提供投标日历。投资组合中既有公共工程，也包含其他部委、公共企业及部分私人项目。企业必须把PNIP、DGC特许经营组合、Mercado Público采购和矿业／电力业主招采分开管理。</p><p>2026年更应留意项目是否已完成可研、环评、融资和采购文件，是否已由主管机构发布正式公告。只有进入相应采购程序并满足资格条件，才构成可直接响应的机会。</p></div></section>

            <section id="allocation" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Long-term investment directions</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">资金主要投向：能源与连接能力居前</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">下列金额为PNIP官网展示的四个领域约数，单位为万亿智利比索，反映截至2026年1月的长期规划规模。并非年度预算或可相加的公开招标金额。</p><div className="mt-7 space-y-5 rounded-2xl border border-[#e0e6e8] bg-[#fafbf9] p-5">{planAreas.map((area) => <div key={area.title}><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><h3 className="font-black">{area.title}</h3><span className="font-black text-[#445762]">约{area.amount}万亿智利比索 <span className="font-medium text-[#71808a]">（约{area.usd}亿美元）</span></span></div><div className="mt-2 h-3 rounded-full bg-[#e6ecef]"><div className={`h-3 rounded-full ${area.color}`} style={{ width: `${area.amount / 173 * 100}%` }} /></div><p className="mt-1.5 text-xs leading-5 text-[#71808a]">{area.detail}</p></div>)}</div><p className="mt-4 text-xs leading-6 text-[#71808a]">图示统一以最大领域“能源安全”作横条刻度；类别金额是官方约数，横条表示相对规模，不表示项目已经具备采购条件。</p></section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Project pipeline</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">值得持续跟踪的五类项目方向</h2><div className="mt-7 grid gap-4">{sectors.map((sector) => <div key={sector.number} className="grid gap-3 rounded-2xl bg-[#f1f3f2] p-5 sm:grid-cols-[2.8rem_minmax(0,1fr)] sm:p-6"><span className="flex size-11 items-center justify-center rounded-full bg-[#c85c43] font-mono text-sm font-black text-white">{sector.number}</span><div><h3 className="font-black">{sector.title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{sector.text}</p></div></div>)}</div></section>

            <section id="regions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Regional opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">四类区域，采购与履约条件不同</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">以下为根据官方规划与行业管线整理的业务观察区，不代表正式行政分区或精确项目边界。</p><figure className="mt-7 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]"><Image src="/insights/chile-infrastructure-regions.webp" alt="智利四类基础设施机会区域示意图，按南北方向区分矿业能源、中部港口、中南部产业和南部连接" width={1600} height={900} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" /><div className="grid gap-3 border-t border-white/10 px-5 py-5 text-xs font-bold text-white/82 sm:grid-cols-2">{[["bg-[#d9a23a]", "北部矿业与能源带"], ["bg-[#59a8d8]", "中部都市与港口枢纽"], ["bg-[#c85c43]", "中南部工业与农业走廊"], ["bg-[#7b63a8]", "南部与极地连接区"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2.5 shrink-0 rounded-full ${color}`} />{label}</span>)}</div><figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/58">地图仅用于说明业务观察区域，不代表行政边界、项目准确位置或投资范围。</figcaption></figure><div className="mt-7 grid gap-5 sm:grid-cols-2">{regions.map((region) => <div key={region.number} className="rounded-2xl border border-[#dbe2e5] p-5 sm:p-6"><p className="font-mono text-sm font-black text-[#b54f39]">{region.number}</p><h3 className="mt-3 text-lg font-black">{region.title}</h3><p className="mt-3 text-xs font-bold leading-6 text-[#8a672e]">{region.places}</p><p className="mt-3 text-sm leading-7 text-[#586873]">{region.focus}</p></div>)}</div><div className="mt-6 border-l-4 border-[#c85c43] bg-[#fff2ec] px-5 py-4 text-sm leading-7 text-[#66562f]">在智利，南北地理跨度、海拔、气候、用水与港口距离会直接改变报价和售后成本。不要仅按项目标题判断是否适合进入。</div></section>

            <section id="opportunities" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]"><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Opportunity map</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">中国企业可关注的潜在项目机会</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">大型特许经营总包之外，设备供货、专项工程、数字系统和长期维护也可能形成实际合同。是否开放境外企业参与，以项目文件为准。</p></div><div className="overflow-x-auto border-t border-[#dbe2e5]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#edf1f2] text-xs tracking-[.06em] text-[#62727b]"><tr><th className="px-5 py-4">行业</th><th className="px-5 py-4">潜在项目机会</th><th className="px-5 py-4">重点跟踪主体</th></tr></thead><tbody className="divide-y divide-[#e2e7e9]">{opportunities.map((row) => <tr key={row.sector} className="align-top"><th className="px-5 py-5 font-black">{row.sector}</th><td className="px-5 py-5 leading-7 text-[#586873]">{row.scope}</td><td className="px-5 py-5 leading-7 text-[#586873]">{row.buyers}</td></tr>)}</tbody></table></div></section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Market entry</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">把规划方向转成参标动作</h2><ol className="mt-7 space-y-5">{[["区分入口", "政府货物与服务采购看Mercado Público；大型特许经营看DGC；矿业、电力和港口业主还可能使用自有供应商系统。"], ["核对项目阶段", "把规划、许可、预算、正式公告、投标、授标和建设逐项标注，避免把项目库当成采购清单。"], ["先读完整标书", "核对境外企业资格、技术标准、担保、交货、税费、评标权重及问答更正。"], ["建立本地履约方案", "提前评估认证、代表、仓储、安装、售后和长期运维需求，以及与本地承包商合作的边界。"]].map(([title, detail], index) => <li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#d9a23a]">{index + 1}</span><div className="border-b border-[#e2e7e9] pb-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{detail}</p></div></li>)}</ol><Link href="/guides/chile-mercado-publico" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-[#061b2b] px-6 text-sm font-black text-white transition hover:bg-[#123a54]">查看智利参标指南 →</Link></section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#d9a23a]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续核对正在发布的智利项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">国家洞察识别长期方向；项目页帮助核对采购方、状态、关键日期及标书要求。我们会继续跟踪项目从规划走向采购的变化。</p><InsightOpenTenders country="Chile" accentText="text-[#d9a23a]" accentBorder="hover:border-[#d9a23a]" /><Link href="/countries/chile" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#d9a23a] px-6 font-black text-[#071826] transition hover:bg-[#e8b957]">浏览智利招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#b54f39]">Sources & methodology</p><h2 className="mt-3 text-2xl font-black sm:text-3xl">资料来源与使用说明</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">本文依据截至2026年9月25日可核对的官方资料撰写。PNIP规划数据更新至2026年1月；矿业数据采用Cochilco 2025—2034组合。规划、矿业投资储备、特许经营及公开采购之间可能存在交叉，不能相加。美元金额按智利央行2026年9月25日观察美元参考汇率1美元＝965.71智利比索估算，四舍五入至亿美元；仅作规模参考，并非历史投资实际汇率。</p><div className="mt-7 grid gap-3">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#dbe2e5] px-4 py-4 transition hover:border-[#c27863] hover:bg-[#fff2ec]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black">{source.label}</p><p className="mt-1 text-xs leading-6 text-[#71808a]">{source.note}</p></div><span className="font-black text-[#b54f39]">↗</span></div></a>)}</div><p className="mt-6 text-xs leading-6 text-[#8d8186]">本文不是投资、法律、税务或投标资格意见。项目进度、预算、资格与合同条件，以主管机构和采购文件的最新有效版本为准。</p></section>
          </div>
        </div>
      </main>
    </article>
  );
}
