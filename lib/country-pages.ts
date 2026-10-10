import { countryLabel } from "@/lib/tender-labels";
import { participationGuides } from "@/lib/participation-guides";

/**
 * The country landing pages (/countries/mexico …), one per open country
 * (2026-09-25; Argentina added 2026-09-29, the Dominican Republic 2026-10-04, Panama and Ecuador 2026-10-06, Bolivia 2026-10-10). They exist for search: /tenders?country=Mexico
 * declares /tenders as its canonical, so until now nothing on the site could
 * rank for 墨西哥招标 or 巴西政府采购 on its own — every filtered view signed
 * itself away to the one list page.
 *
 * The intro is written per country rather than templated: it names where
 * that country actually publishes, which is the sentence a searcher needs and
 * the one a template would get wrong.
 */
export type CountryPage = {
  slug: string;
  /** The Tender.country key. */
  country: string;
  intro: string;
  /**
   * The sources this platform reads for the country, for a country that has
   * no participation guide yet: the page's description and 覆盖采购来源 count
   * come from its guides, and without this they read 「来源包括 。」 and 0.
   * Ignored once the country has guides.
   */
  sources?: string[];
};

export const countryPages: CountryPage[] = [
  {
    slug: "mexico",
    country: "Mexico",
    intro: "墨西哥的公开招标集中在联邦政府采购平台 Compras MX，以及墨西哥国家石油公司（Pemex）、联邦电力委员会（CFE）等国有企业的采购门户；国家战略基础设施项目另有专门制度。",
  },
  {
    slug: "brazil",
    country: "Brazil",
    intro: "巴西联邦、州、市各级政府的采购统一在国家公共采购门户 PNCP 公布；巴西国家石油公司（Petrobras）通过 Petronect 采购，米纳斯吉拉斯州能源公司（Cemig）有自己的采购门户。",
  },
  {
    slug: "colombia",
    country: "Colombia",
    intro: "哥伦比亚的公共采购通过电子采购系统 SECOP II 进行，本平台收录其中的公开招标（Licitación pública）；输电线路项目由矿业能源规划署（UPME）公开招商。",
  },
  {
    slug: "peru",
    country: "Peru",
    intro: "秘鲁各级政府的采购在 SEACE 系统发布，由采购监管机构 OECE 管理；地方工程还可通过以工程抵税机制（Obras por Impuestos）由企业出资建设，秘鲁国家石油公司（Petroperú）另有国际竞争性采购。",
  },
  {
    slug: "chile",
    country: "Chile",
    intro: "智利公共部门的采购在 Mercado Público 平台发布，由 ChileCompra 管理；智利国家铜业公司（Codelco）在自己的采购门户招标。",
  },
  {
    slug: "argentina",
    country: "Argentina",
    intro: "阿根廷联邦政府的货物与服务采购在 COMPR.AR 平台发布，公共工程、特许经营在 CONTRAT.AR 平台发布；国家铁路基础设施公司（ADIF）有自己的招标门户，其他分散采购通知还会刊登在政府公报（Boletín Oficial）第三部分。",
  },
  {
    slug: "dominican-republic",
    country: "Dominican Republic",
    intro: "多米尼加的政府采购统一在公共采购总局（DGCP）管理的 Portal Transaccional 平台发布，本平台读取其中的国内、国际公开招标。",
    sources: ["Portal Transaccional（DGCP）"],
  },
  {
    slug: "panama",
    country: "Panama",
    intro: "巴拿马的政府采购统一在公共采购总局（DGCP）管理的 PanamaCompra 平台发布，本平台读取其中的公开招标、最优价值招标和多边银行贷款项目招标。巴拿马以美元计价。",
    sources: ["PanamaCompra（DGCP）"],
  },
  {
    slug: "ecuador",
    country: "Ecuador",
    intro: "厄瓜多尔的政府采购统一在国家公共采购局（SERCOP）管理的 SOCE 系统发布，本平台收录其中金额较大的公开招标。厄瓜多尔以美元计价。",
    sources: ["SOCE（SERCOP）"],
  },
  {
    slug: "bolivia",
    country: "Bolivia",
    intro: "玻利维亚的政府采购统一在经济财政部管理的国家采购信息系统 SICOES 发布，本平台收录其中金额较大的公开招标，以及世界银行出资项目的招标公告。玻利维亚以玻利维亚诺（Bs）计价，平台按市场汇率换算成美元。",
    sources: ["SICOES（经济财政部）", "世界银行采购公告"],
  },
];

export function getCountryPage(slug: string): CountryPage | undefined {
  return countryPages.find((page) => page.slug === slug);
}

/** /countries/<slug> for a Tender.country key; the list page for a country without one. */
export function countryPagePath(country: string): string {
  const page = countryPages.find((item) => item.country === country);
  return page ? `/countries/${page.slug}` : `/tenders?country=${encodeURIComponent(country)}`;
}

/** Where a country's tenders come from: its guides' platforms, or the page's own list while it has no guide. */
export function sourcesForCountry(page: CountryPage): string[] {
  const guides = guidesForCountry(page.country);
  return guides.length > 0 ? guides.map((guide) => guide.platform.split(" · ")[0]) : page.sources ?? [];
}

/** The participation guides for a country, in the guides' own order. Guides carry the Chinese name. */
export function guidesForCountry(country: string) {
  const name = countryLabel(country, "zh");
  return participationGuides.filter((guide) => guide.country === name);
}

/** The Tender.country key for a guide, from its Chinese country name. */
export function countryKeyForGuide(guide: { country: string }): string | undefined {
  return countryPages.find((page) => countryLabel(page.country, "zh") === guide.country)?.country;
}
