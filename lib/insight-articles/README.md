# Country insights: the house style

Every country insight renders the same `InsightArticle` shape (types.ts) through
`components/insights/InsightArticle.tsx`. These are the rules that keep the
pages alike (user, 2026-10-10: 每次生成都有不一样的地方，要拉齐整个设计). A new
country follows them; a change to one is made to all.

## Title

`<国名>国家洞察：<起止年份><主题>机会`, the period being that of the plan the
headline number comes from, e.g. 「墨西哥国家洞察：2026—2030战略投资与项目机会」,
「巴西国家洞察：2023—2026 Novo PAC与特许经营机会」.

- The title lives once, in `lib/country-insights.ts`. The page metadata reads
  `insight.title`; the article's `headline` is the same text split after the
  colon.

## Money

- **Headline numbers (`stats`) and the cards' `highlights`:** US dollars come
  first, so every country reads on one scale.
  - stat: value 「约3,252亿」, unit 「美元」, detail 「原币5.6万亿墨西哥比索」.
  - chip: 「约3,252亿美元五年投资基准」.
- **Where the currency is the dollar (Ecuador, Panama):** no 「约」, and the
  detail reads 「原币即美元」.
- **Body text:** the source's own currency, as the source states it. The page's
  `sources.fx` line gives the rate, its date and the issuer (central bank or
  official fixing), and every converted figure uses that one rate.
- **Units:** 亿 / 万亿, with 「约」 on any converted figure. Never more precision
  than the source figure had.

## Regions and the map

- **Regions:** four, each with a colour, a title, `places` and `focus`.
  - `places` lists provinces or states by their own Spanish/Portuguese names,
    adding 等 when the list is partial.
  - `focus` is one or two sentences: what is built there, then what to check.
    Only facts the article already states.
- **The map:** `public/insights/<slug>-regions.svg`, drawn by
  `npm run maps:insights` (`scripts/generate-insight-maps.mjs`). Never an
  image made by hand or by an image model.
  - Natural Earth provinces are coloured by region, in the same colours as the
    region cards.
  - Each region carries one label: its number plus two or three icons from the
    shared set.
  - A strip at the foot names the icons.
  - Add a country there (provinces per region, icons, label offsets) and run
    the script.
  - The `alt` text is 「<国名>重点区域地图，按省级行政区着色：1 …、2 …」. The
    caption is the shared one: 按省级行政区着色，编号对应下方区域卡片…

## Hero photo

A real photograph from Wikimedia Commons under a free licence, credited in
`heroImageCredit`. Never AI-generated.

## Sections

The order is fixed by the component: stats, basis, overview, sectors,
(strategy), pipeline, regions, opportunities, entry, sources. Write one idea
per line, put the number first, and keep every paragraph to two short
sentences or fewer.
