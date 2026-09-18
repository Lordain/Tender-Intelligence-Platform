export type CountryInsightSummary = {
  slug: string;
  country: string;
  countryCode: string;
  title: string;
  description: string;
  author: string;
  readTime: string;
  heroImage: string;
  highlights: string[];
};

export const countryInsights: CountryInsightSummary[] = [
  {
    slug: "mexico",
    country: "墨西哥",
    countryCode: "MX",
    title: "墨西哥国家洞察：2026—2030战略投资与项目机会",
    description:
      "从5.6万亿比索（约2,902亿美元）基础设施计划出发，拆解能源、铁路、公路、港口、水务等重点行业，以及项目区域分布和中国企业需要关注的进入条件。",
    author: "拉美招投标指南针",
    readTime: "约 15 分钟",
    heroImage: "/insights/mexico-infrastructure-hero.webp",
    highlights: ["5.6万亿比索（约2,902亿美元）规划投资", "超过1,500个项目", "八个战略行业"],
  },
  {
    slug: "colombia",
    country: "哥伦比亚",
    countryCode: "CO",
    title: "哥伦比亚国家洞察：交通重构、能源转型与区域机会",
    description:
      "从1,154.8万亿哥伦比亚比索（约3,691亿美元）国家投资计划出发，梳理铁路、公路、港口、电网、水务与数字基础设施的跨周期项目管线。",
    author: "拉美招投标指南针",
    readTime: "约 16 分钟",
    heroImage: "/insights/colombia-infrastructure-hero.webp",
    highlights: ["1,154.8万亿比索（约3,691亿美元）国家投资计划", "321.3万亿比索（约1,027亿美元）交通项目", "跨周期项目延伸至2055年"],
  },
  {
    slug: "peru",
    country: "秘鲁",
    countryCode: "PE",
    title: "秘鲁国家洞察：竞争力、物流走廊与战略项目机会",
    description:
      "从2024—2030竞争力规划、2032物流走廊和2026项目组合出发，梳理交通、矿业、能源、水务与社会基础设施的区域机会。",
    author: "拉美招投标指南针",
    readTime: "约 17 分钟",
    heroImage: "/insights/peru-infrastructure-hero.webp",
    highlights: ["561.57亿索尔（约166.8亿美元）公共投资", "44个APP/资产项目与8项增补", "66个矿业投资项目"],
  },
];

export function getCountryInsight(slug: string) {
  return countryInsights.find((insight) => insight.slug === slug);
}
