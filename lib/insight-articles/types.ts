/**
 * One country insight, as data. Every country page renders the same shape
 * through components/insights/InsightArticle.tsx (user, 2026-10-05: 对所有的
 * 国家洞察页，一样执行你在参标指南做的优化 — 精简内容、优化排版、优化设计风格、
 * 图形化内容).
 *
 * Writing rule, as in the guides: one idea per line, the number first, no
 * paragraph longer than two short sentences. Every figure here comes from the
 * page's sources; shortening a line never changes a number.
 */

export type InsightIconName =
  | "energy"
  | "rail"
  | "road"
  | "port"
  | "water"
  | "mine"
  | "health"
  | "digital"
  | "city"
  | "education"
  | "industry";

/**
 * One headline number. Money is always shown in US dollars first, so every
 * country reads on one scale (user, 2026-10-10: 货币是怎么呈现也没拉齐): value
 * 「约3,252亿」, unit 「美元」, and `detail` the figure in the source's own
 * currency — 「原币5.6万亿墨西哥比索」, or 「原币即美元」 where it is the dollar
 * (Ecuador, Panama). Counts and shares keep their own unit; `detail` may then
 * carry a money figure that goes with them, dollars first as well.
 */
export type InsightStat = {
  label: string;
  value: string;
  unit: string;
  /** Shown small under the unit: see above. */
  detail?: string;
  note: string;
};

export type InsightPoint = { lead: string; text: string };

export type InsightBar = {
  name: string;
  /** Drawn against the largest value in the chart. */
  value: number;
  /** The figure as printed beside the bar. */
  amount: string;
  /** A short tag after the name: the share, the period, the project count. */
  tag?: string;
  color: string;
};

export type InsightArticle = {
  slug: string;
  /** The English country name the tender list uses (InsightOpenTenders). */
  countryEn: string;
  countryPath: string;
  kicker: string;
  /** The h1 in two parts: 「X国家洞察：」 and the subject, broken after the colon on wide screens. */
  headline: [string, string];
  lede: string;
  published: string;
  modified: string;
  stats: InsightStat[];
  /** 数字口径: what the headline numbers are and are not, in one or two lines. */
  basis: string;
  overview: {
    title: string;
    points: InsightPoint[];
    /** The plan year by year, drawn as columns. */
    years?: { title: string; items: Array<{ year: string; value: number; amount: string; status?: string }> };
  };
  sectors: {
    title: string;
    intro: string;
    bars: InsightBar[];
    /** The bars are shares of one total: also drawn as a single stacked strip. */
    shares?: boolean;
    takeaways?: InsightPoint[];
  };
  strategy?: {
    nav: string;
    title: string;
    intro: string;
    items: Array<{ tag: string; title: string; text: string }>;
  };
  pipeline: {
    title: string;
    items: Array<{ icon: InsightIconName; title: string; figure?: string; text: string }>;
    note?: string;
  };
  regions: {
    title: string;
    map: { src: string; width: number; height: number; alt: string; caption: string };
    /** In the map's legend order; `color` is the region's colour on the map. */
    items: Array<{ color: string; title: string; places: string; focus: string }>;
    note: string;
  };
  opportunities: {
    title: string;
    intro: string;
    items: Array<{ sector: string; scope: string[]; buyers: string }>;
  };
  entry: {
    title: string;
    steps: Array<{ title: string; detail: string }>;
    guides: Array<{ href: string; label: string }>;
  };
  sources: {
    intro: string;
    items: Array<{ label: string; href: string; note: string }>;
    fx: string;
    /** Anything else the reader must keep in mind (Peru: political turnover). */
    caution?: string;
  };
};
