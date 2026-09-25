import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { getCountryInsight } from "@/lib/country-insights";
import { pageMetadata } from "@/lib/seo";

const insight = getCountryInsight("brazil")!;

export const metadata: Metadata = pageMetadata({
  title: "巴西国家洞察：Novo PAC、特许经营与区域基础设施机会",
  description:
    "梳理巴西Novo PAC、PPI项目组合，以及交通、能源、港口、水务、城市建设和区域供应链机会。",
  path: "/insights/brazil",
  image: insight.heroImage,
});

type IconName = "road" | "rail" | "port" | "energy" | "water" | "city" | "digital" | "health";

function SectorIcon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" {...common}>
      {name === "road" && <><path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" /></>}
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "city" && <><path d="M4 21V8h7v13M11 21V3h9v18M7 12h1m-1 4h1m7-9h1m-1 4h1m-1 4h1M2 21h20" /></>}
      {name === "digital" && <><path d="M5 15a10 10 0 0 1 14 0M8 18a6 6 0 0 1 8 0M12 21h.01" /><path d="M4 5h16v6H4z" /></>}
      {name === "health" && <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M9 5V3h6v2M12 9v8M8 13h8" /></>}
    </svg>
  );
}

const pipeline: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "road", title: "公路建设与长期特许经营", text: "联邦公路机会同时包括传统工程采购、既有合同优化和新一轮特许经营。交通部公布的四年管线包含35个新项目、约3,960亿雷亚尔；企业应分别跟踪政府采购方、特许经营公司和其EPC供应链。" },
  { icon: "rail", title: "铁路、农业物流与多式联运", text: "北向出口通道、中心—西部粮食产区与东南港口群之间的铁路扩能，是降低大宗商品物流成本的重要方向。轨道、信号、机车车辆、装卸和运维机会往往分布在授权、续约和承包链中。" },
  { icon: "port", title: "港口、航道与海工供应链", text: "港口与机场部披露2025—2026年有42个港口项目、投资超过220亿雷亚尔。除码头租赁外，还要关注疏浚、航道、仓储、岸电、港机、数字化和铁路公路集疏运。" },
  { icon: "energy", title: "电网扩张、可再生能源与油气", text: "东北风光资源、北部孤网替代、跨区输电和海上油气共同构成能源投资主线。机会覆盖输变电设备、储能、工程服务、海工装备、运维和工业用能解决方案。" },
  { icon: "water", title: "供水、污水处理与气候韧性", text: "供水、污水、排涝和防灾项目由联邦、州、市及公用事业公司共同推进。Novo PAC供水子项目前已覆盖371个项目、投资125亿雷亚尔；具体落地入口仍需逐个核对。" },
  { icon: "city", title: "住房、城市更新与公共交通", text: "住房、社区基础设施、BRT、VLT、地铁和公交走廊是城市投资的重要组成。此类项目常由地方政府申报、联邦资金支持，再通过地方采购或融资项目实施。" },
  { icon: "digital", title: "数字基础设施与公共服务系统", text: "宽带连接、数据中心、政府数字化、智能交通与基础设施监测贯穿多个投资轴。采购可能以设备、软件、系统集成或持续服务合同出现。" },
  { icon: "health", title: "医疗、教育与社会基础设施", text: "医院、学校、托育、体育文化设施既有分散采购，也有Novo PAC Seleções形成的批量项目。中小项目数量多，地方执行能力和资金来源判断尤其重要。" },
];

const regions = [
  { number: "01", color: "bg-[#35a6c8]", title: "北部与亚马孙出口通道", states: "Pará、Amazonas、Amapá、Rondônia、Tocantins等", focus: "河运、北方港口、输电、数字连接、供水和矿业物流。距离长、环境许可和社区协商会显著影响进度与履约成本。" },
  { number: "02", color: "bg-[#e5ad35]", title: "东北能源与水务走廊", states: "Bahia、Pernambuco、Ceará、Rio Grande do Norte、Piauí等", focus: "风电、光伏、输电、绿氢、港口、铁路、水安全和城市公共服务。应同步观察电网消纳、许可和港区产业链。" },
  { number: "03", color: "bg-[#b95d42]", title: "东南工业与物流核心", states: "São Paulo、Rio de Janeiro、Minas Gerais、Espírito Santo", focus: "全国最密集的工业、消费和港口市场，机会集中于公路铁路、港口、城市轨道、能源、油气、制造升级及水务。" },
  { number: "04", color: "bg-[#548c58]", title: "中西部—南部农业物流带", states: "Mato Grosso、Goiás、Mato Grosso do Sul、Paraná、Santa Catarina、Rio Grande do Sul", focus: "粮食仓储、铁路公路、边境通道、南部港口、电网及气候韧性工程，是设备和专业工程供应链的重要市场。" },
];

const opportunities: Array<{ icon: IconName; sector: string; scope: string; route: string }> = [
  { icon: "road", sector: "交通与大型土建", scope: "公路桥隧、铁路、轨道、站场、收费、智慧交通及施工设备", route: "DNIT、ANTT、州政府、特许经营公司及EPC" },
  { icon: "port", sector: "港口与物流", scope: "码头、疏浚、港机、仓储、岸电、冷链和集疏运系统", route: "港务局、ANTAQ、码头运营商和物流企业" },
  { icon: "energy", sector: "能源与工业设施", scope: "发输配电、风光储、海工、油气装备、电气设备及长期运维", route: "MME、ANEEL、Petrobras、公用事业与项目公司" },
  { icon: "water", sector: "水务与环境", scope: "供排水、污水处理、泵站、防洪、固废及智慧水务", route: "州和市政府、公用事业公司、PPP运营商" },
  { icon: "city", sector: "城市与社会基础设施", scope: "住房、公共交通、医院学校、数字化设施与设施管理", route: "部委、Caixa、州、市及公共机构" },
  { icon: "digital", sector: "数字与专业服务", scope: "咨询设计、BIM、测绘、监测、系统集成、网络和数据平台", route: "政府采购、主承包商和长期运营主体" },
];

const sources = [
  { label: "Casa Civil：Novo PAC总览", href: "https://www.gov.br/casacivil/pt-br/novopac", note: "1.9万亿雷亚尔总投资、2023—2026与后续投资口径。" },
  { label: "Casa Civil：Novo PAC透明度", href: "https://www.gov.br/casacivil/pt-br/novopac/transparencia", note: "4.11万个项目、资金来源和可按州及行业筛选的项目清单。" },
  { label: "巴西政府：2026致国会报告", href: "https://www.gov.br/casacivil/pt-br/.arquivos/mensagem-ao-congresso-nacional-2026.pdf/@@download/file", note: "PPI的192项联邦及地方项目、3,340亿雷亚尔投资管线。" },
  { label: "交通部：2026公路特许经营项目", href: "https://www.gov.br/transportes/pt-br/assuntos/incentivos/reidi/rodovias", note: "四年35个新项目与约3,960亿雷亚尔机会。" },
  { label: "港口与机场部：港口项目组合", href: "https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/concessoes/portos", note: "2025—2026年42个港口项目与超过220亿雷亚尔投资。" },
  { label: "Casa Civil：Novo PAC供水项目", href: "https://www.gov.br/casacivil/pt-br/novopac/agua-para-todos/abastecimento-de-agua", note: "371个项目及125亿雷亚尔供水投资。" },
  { label: "巴西央行：PTAX美元汇率", href: "https://ptax.bcb.gov.br/ptax_internet/consultarUltimaCotacaoDolar.do", note: "2026年9月18日收盘卖出价：1美元＝5.1575雷亚尔。" },
];

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function BrazilInsightPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    datePublished: "2026-09-21",
    dateModified: "2026-09-21",
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image src={insight.heroImage} alt="巴西港口、铁路、公路与能源基础设施" fill priority sizes="100vw" className="object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/88 to-[#031521]/20" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <Link href="/insights" className="inline-flex text-sm font-bold text-white/68 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#e5ad35] px-3 py-1 text-xs font-black text-[#071826]">巴西</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/62">Infrastructure & procurement outlook</span></div>
            <h1 className="mt-6 text-3xl font-black leading-[1.17] tracking-[-0.04em] sm:text-5xl lg:text-6xl">巴西国家洞察：<br className="hidden sm:block" />Novo PAC、特许经营与区域基础设施机会</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-white/78 sm:text-lg">从国家投资计划、PPI项目组合和行业管线出发，识别交通、能源、港口、水务、城市建设及中国企业的进入路径。</p>
            <div className="mt-8 text-sm text-white/64">作者：<strong className="text-white">拉美招投标指南针</strong></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "01", title: "Novo PAC总投资", value: "1.9万亿", unit: "巴西雷亚尔", usd: "约3,684亿美元", text: "公共、国企、融资与私人资本的综合口径" },
            { n: "02", title: "项目覆盖", value: "4.11万", unit: "个项目", usd: "覆盖全国各州", text: "可按州、市、行业、阶段和执行主体筛选" },
            { n: "03", title: "PPI项目管线", value: "192", unit: "个PPI项目", usd: "约648亿美元", text: "联邦及地方特许经营与PPP项目" },
            { n: "04", title: "公路特许经营", value: "35", unit: "个新项目", usd: "约768亿美元", text: "交通部公布的四年机会管线" },
          ].map((card) => (
            <div key={card.n} className="relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-center shadow-[0_12px_30px_rgba(6,27,43,0.05)] sm:p-6">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2d7450] via-[#e5ad35] to-[#318fae]" />
              <div className="flex items-center justify-center gap-2"><span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#2d7450]">{card.n}</span><span className="h-3 w-px bg-[#dbe2e5]" /><h2 className="text-xs font-black tracking-[0.07em] text-[#445762]">{card.title}</h2></div>
              <div className="mt-6"><p className="text-3xl font-black leading-none tracking-[-0.05em] text-[#9b5b16] sm:text-4xl">{card.value}</p><p className="mt-2 text-sm font-black text-[#253d4b]">{card.unit}</p><p className="mt-1 text-xs font-bold text-[#2d7450]">（{card.usd}）</p></div>
              <div className="mx-auto mt-auto w-10 border-t-2 border-[#e5ad35] pt-4" /><p className="text-xs leading-5 text-[#6b7981]">{card.text}</p>
            </div>
          ))}
        </section>

        <div className="mt-8 rounded-2xl border border-[#e5ad35] bg-[#fff3cf] p-5 sm:p-6"><p className="font-black text-[#674719]">先理解数字口径</p><p className="mt-2 text-sm leading-7 text-[#725e47]">1.9万亿雷亚尔不是全部由联邦预算直接采购，也不是同一年内支出。它包含私人投资、国企投资、融资、联邦预算和行业基金，覆盖2023—2026年及2026年后的项目。判断商业机会时，应继续确认项目处于规划、采购、拍卖、建设还是运营阶段。</p></div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[#061b2b] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e5ad35]">本页目录</p><nav className="mt-4 space-y-1 text-sm">{[["overview","投资框架"],["sectors","重点行业"],["pipeline","工程方向"],["regions","区域分布"],["opportunities","企业机会"],["entry","进入路径"],["sources","资料来源"]].map(([id,label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-2 text-white/68 transition hover:bg-white/8 hover:text-white">{label}</a>)}</nav></div></aside>

          <div className="min-w-0 space-y-8">
            <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#2d7450]">Investment framework</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">国家投资、地方执行与私人资本同时存在</h2><div className="mt-5 space-y-4 text-sm leading-8 text-[#52636e] sm:text-base"><p>Novo PAC是观察巴西基础设施方向的主框架，当前披露总投资1.9万亿雷亚尔（约3,684亿美元），其中2023—2026年约1.3万亿雷亚尔（约2,521亿美元），2026年后约6,000亿雷亚尔（约1,163亿美元）。</p><p>项目不会通过单一采购平台集中执行。联邦部委、州、市、公用事业公司、国企和特许经营公司都可能成为实际采购或发包主体。PPI则更适合识别特许经营、PPP和资产项目，2026年官方材料列出192项在办项目，预计投资3,340亿雷亚尔（约648亿美元）。</p><p>因此，企业应把国家规划当作“方向雷达”，再回到项目业主、监管机构、PNCP、Compras.gov.br、地方平台或运营商采购入口核实实际机会。</p></div></section>

            <section id="sectors" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#2d7450]">Strategic sectors</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">八条行业主线，需要用不同入口跟踪</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">Novo PAC按九个投资轴组织项目，但对企业开发最有用的是把它重新拆成工程与供应链语言。</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{pipeline.map((item) => <div key={item.title} className="rounded-2xl border border-[#e0e6e8] bg-[#fafbf9] p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-[#e8f2eb] text-[#2d7450]"><SectorIcon name={item.icon} /></div><h3 className="mt-4 font-black">{item.title}</h3><p className="mt-2 text-sm leading-7 text-[#5b6a74]">{item.text}</p></div>)}</div><div className="mt-6 rounded-xl border-l-4 border-[#e5ad35] bg-[#fff8e8] px-5 py-4 text-sm leading-7 text-[#66562f]"><strong>趋势判断：</strong>未来几年最具连续性的机会并非只来自新建工程，还来自特许经营优化、存量设施扩能、气候韧性、数字化改造和长期运维。对设备与专业分包企业而言，识别中标运营商和主承包商与跟踪政府公告同样重要。</div></section>

            <section id="pipeline" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#e5ad35]">Project pipeline</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">先判断项目属于哪一种落地机制</h2><div className="mt-6 grid gap-4 sm:grid-cols-3">{[{n:"01",t:"公共采购",d:"通过PNCP发现公告，再按文件指定的平台递交；合同由联邦、州、市或公共机构执行。"},{n:"02",t:"特许经营／PPP",d:"通过PPI、主管部委、监管机构和B3拍卖管线跟踪；后续采购多进入项目公司供应链。"},{n:"03",t:"国企与公用事业",d:"Petrobras、Eletrobras体系及地方公用事业可能使用自己的供应商和采购门户。"}].map((x)=><div key={x.n} className="rounded-2xl border border-white/12 bg-white/6 p-5"><span className="font-mono text-sm font-black text-[#e5ad35]">{x.n}</span><h3 className="mt-4 font-black">{x.t}</h3><p className="mt-2 text-sm leading-7 text-white/64">{x.d}</p></div>)}</div></section>

            <section id="regions" className="scroll-mt-8 overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9]"><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#2d7450]">Regional map</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">项目不会平均分布，四类区域值得持续跟踪</h2><p className="mt-4 text-sm leading-7 text-[#64717c]">下图用于表达产业和物流方向，不代表具体项目选线或行政边界投资金额。</p></div><div className="relative aspect-[16/10] bg-[#031521]"><Image src="/insights/brazil-infrastructure-regions.webp" alt="巴西四类重点基础设施区域示意图" fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" /></div><div className="grid gap-px bg-[#dbe2e5] sm:grid-cols-2">{regions.map((region)=><div key={region.number} className="bg-[#fffdf9] p-5 sm:p-6"><div className="flex items-center gap-3"><span className={`size-3 rounded-full ${region.color}`} /><span className="font-mono text-xs font-black text-[#64717c]">{region.number}</span><h3 className="font-black">{region.title}</h3></div><p className="mt-3 text-xs font-bold text-[#6c7b84]">{region.states}</p><p className="mt-2 text-sm leading-7 text-[#5b6a74]">{region.focus}</p></div>)}</div></section>

            <section id="opportunities" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#2d7450]">Opportunity map</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">中国企业可以从哪些位置进入？</h2><div className="mt-6 overflow-hidden rounded-2xl border border-[#dbe2e5]">{opportunities.map((row)=><div key={row.sector} className="grid gap-3 border-b border-[#e2e7e9] p-5 last:border-b-0 sm:grid-cols-[3rem_10rem_1fr_1fr] sm:items-center"><span className="flex size-10 items-center justify-center rounded-xl bg-[#e8f2eb] text-[#2d7450]"><SectorIcon name={row.icon} /></span><strong>{row.sector}</strong><span className="text-sm leading-6 text-[#5b6a74]">{row.scope}</span><span className="text-sm leading-6 text-[#7b612e]">{row.route}</span></div>)}</div></section>

            <section id="entry" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#2d7450]">Market entry</p><h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">把国家机会转化为可执行动作</h2><ol className="mt-6 space-y-5">{[
              ["先选行业和区域", "不要从全国所有公告开始。先确定一到两个行业、重点州和可交付的产品或能力。"],
              ["识别真正的采购主体", "区分政府机关、州或市、国企、公用事业、特许经营公司和EPC总包，分别建立客户名单。"],
              ["判断进入身份", "比较直接投标、巴西本地公司、联合参与、设备供货和专业分包；税务、担保、葡萄牙语与售后能力会影响选择。"],
              ["建立双重监测", "一边跟踪PNCP等公告入口，一边跟踪PPI、监管机构、拍卖结果和中标项目公司的供应链。"],
              ["用项目文件做最终判断", "核对资格、认证、技术标准、本地化、进口税费、汇率、担保和递交系统，再决定投入。"],
            ].map(([title,text],i)=><li key={title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"><span className="flex size-11 items-center justify-center rounded-full bg-[#e5ad35] font-mono text-sm font-black">{String(i+1).padStart(2,"0")}</span><div className="border-b border-[#e5e9ea] pb-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-7 text-[#586873]">{text}</p></div></li>)}</ol><Link href="/guides/brazil-pncp" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#2d7450] px-6 font-black text-white transition hover:bg-[#245f42]">查看巴西 PNCP 参标指南 →</Link></section>

            <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#e5ad35]">From outlook to tenders</p><h2 className="mt-3 text-2xl font-black">继续查看正在发布的巴西项目</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">国家洞察用于判断中长期方向；项目页用于核对采购方、截止日期、参与范围和文件要求。两者要结合使用。</p><InsightOpenTenders country="Brazil" accentText="text-[#e5ad35]" accentBorder="hover:border-[#e5ad35]" /><Link href="/countries/brazil" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#e5ad35] px-6 font-black text-[#071826] transition hover:bg-[#f0c25a]">浏览巴西招标项目 →</Link></section>

            <section id="sources" className="scroll-mt-8 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#e5ad35]">Official sources</p><h2 className="mt-3 text-2xl font-black">资料来源与汇率说明</h2><div className="mt-6 grid gap-3">{sources.map((source)=><a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="rounded-xl border border-white/12 bg-white/6 px-4 py-4 transition hover:border-[#e5ad35]"><div className="flex items-center justify-between gap-4 text-sm font-bold"><span>{source.label}</span><span className="shrink-0 text-[#e5ad35]">打开 ↗</span></div><p className="mt-2 text-xs leading-6 text-white/52">{source.note}</p></a>)}</div><p className="mt-6 border-t border-white/12 pt-5 text-xs leading-6 text-white/52">本文人民币以外的美元换算统一采用巴西中央银行2026年9月18日PTAX收盘卖出价：1美元＝5.1575巴西雷亚尔。换算值四舍五入，仅用于理解规模，不代表项目结算汇率。规划、项目数量和实施进度会调整，具体参与条件以主管机构和项目最新文件为准。</p></section>
          </div>
        </div>
      </main>
    </article>
  );
}
