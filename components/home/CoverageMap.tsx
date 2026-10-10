import Link from "next/link";
import { LATAM_MAP_SHAPES, LATAM_MAP_VIEWBOX } from "@/lib/latam-map";
import { Reveal } from "@/components/home/Reveal";
import { CoverageMapHighlight } from "@/components/home/CoverageMapHighlight";

/**
 * The homepage coverage map, in place of the four insight cards (user,
 * 2026-10-10: 将国家洞察改成一张拉美地图，然后我们已经覆盖的国家就点亮，并标出
 * 那个国家在我们网站有多少项目正在招标(每天刷新)+国家洞察页的链接; 点亮的国家
 * 持续发光，做成特效; then 还是有个标题（我们已覆盖的国家），然后我想把地图居中，
 * 把国家信息加进每个国家拉出来的点，右边的框都不要).
 *
 * The map sits in the middle of a wider canvas; each lit country has a line
 * drawn out to a card on its side — name, live count, link — the western
 * countries to the left, the rest to the right. The cards are HTML placed in
 * the canvas's own units, so they line up with the lines at any width; below
 * the lg breakpoint there is no room beside the map, and the same cards sit
 * under it in two columns instead.
 *
 * Server-rendered SVG from lib/latam-map.ts, so the outlines are in the HTML
 * and never in the page's JavaScript. The only script is the hover link
 * between a country and its card (CoverageMapHighlight). The glow is CSS
 * (app/globals.css, .coverage-*): a blurred copy of each lit country
 * breathing behind it, staggered; under prefers-reduced-motion it holds
 * still, still lit.
 *
 * Counts are the country pages' own (liveTenderCountForCountry), computed by
 * app/page.tsx on the homepage's five-minute revalidation, which every import
 * also triggers — so they follow the daily imports.
 */
export type CoverageCountry = {
  /** Tender.country key, e.g. "Dominican Republic". */
  country: string;
  name: string;
  liveCount: number;
  href: string;
  /** "国家洞察" when the country has an insight page, "国家页" otherwise. */
  linkLabel: string;
};

/** The canvas: the 600-wide map with room for a column of cards either side. */
const SIDE = 300;
const CANVAS = { x: -SIDE, width: LATAM_MAP_VIEWBOX.width + SIDE * 2, height: LATAM_MAP_VIEWBOX.height };
/**
 * Each card: the side it hangs off, the height of its line, and `edge`, the x
 * where the line meets the card — staggered on purpose (user, 2026-10-10:
 * 信息框的摆放可以不规则一点，不要刚好左右对齐), each card set into the open
 * sea or land beside its own country. Left edges stay ≥ -70 and right edges
 * ≤ 670 so a 13.5rem card never leaves the canvas.
 */
const CALLOUT: Record<string, { side: "left" | "right"; y: number; edge: number }> = {
  Mexico: { side: "left", y: 84, edge: -20 },
  Panama: { side: "left", y: 210, edge: -70 },
  Ecuador: { side: "left", y: 338, edge: 0 },
  Peru: { side: "left", y: 478, edge: -60 },
  Chile: { side: "left", y: 650, edge: 190 },
  "Dominican Republic": { side: "right", y: 62, edge: 480 },
  Colombia: { side: "right", y: 226, edge: 660 },
  Brazil: { side: "right", y: 372, edge: 670 },
  Bolivia: { side: "right", y: 520, edge: 600 },
  Argentina: { side: "right", y: 664, edge: 520 },
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

/** The relief: map-unit offsets of the stacked copies under each country, deepest last. */
const UNLIT_SIDES = [4, 3, 2, 1];
const LIT_SIDES = [9, 8, 7, 6, 5, 4, 3, 2, 1];
/** Darkest at the base, warming toward the top edge. */
const LIT_SIDE_COLORS = ["#5a2c04", "#6a3405", "#7a3d06", "#8a4607", "#9a5008", "#aa5a09", "#b9640b", "#c66f0e", "#d27a12"];

/** `facing`: the side the map is on, which carries the amber accent. */
function CountryCard({ entry, facing, className = "" }: { entry: CoverageCountry; facing?: "left" | "right"; className?: string }) {
  const accent = facing === "right" ? "border-r-2 border-r-[#ffb21c]/80" : facing === "left" ? "border-l-2 border-l-[#ffb21c]/80" : "";
  return (
    <Link
      href={entry.href}
      data-country={entry.country}
      className={`coverage-row group block rounded-2xl border border-white/10 bg-linear-to-br from-[#0d2a3f]/95 to-[#071826]/95 px-4 py-3 shadow-[0_18px_45px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#ffb21c]/60 ${accent} ${className}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#ffb21c] shadow-[0_0_10px_2px_rgba(255,178,28,0.65)]" />
          <span className="truncate text-[15px] font-black tracking-[0.02em]">{entry.name}</span>
        </span>
        <span className="text-[1.65rem] font-black leading-none tabular-nums text-[#ffb21c] [text-shadow:0_0_18px_rgba(255,178,28,0.35)]">{entry.liveCount}</span>
      </span>
      <span className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-black text-[#ffd06f] transition-transform duration-200 group-hover:translate-x-0.5">{entry.linkLabel} →</span>
        <span className="text-white/50">个在招项目</span>
      </span>
    </Link>
  );
}

export function CoverageMap({ countries }: { countries: CoverageCountry[] }) {
  const byCountry = new Map(countries.map((entry) => [entry.country, entry]));
  const shapes = LATAM_MAP_SHAPES.filter((shape) => !shape.country || byCountry.has(shape.country));
  const lit = shapes.filter((shape) => shape.country);
  const total = countries.reduce((sum, entry) => sum + entry.liveCount, 0);

  return (
    <section id="country-insights" className="scroll-mt-20 overflow-hidden bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <Reveal className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffb21c]">Coverage map</p>
            <h2 className="mt-3 text-[min(7.2vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] sm:text-4xl">我们已覆盖的国家</h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-white/66">
              已覆盖 <span className="font-black text-white">{countries.length}</span> 个国家 · 共{" "}
              <span className="font-black tabular-nums text-[#ffb21c]">{total}</span> 个在招项目，每天随数据更新。点击国家，看它的投资方向与项目机会。
            </p>
            <Link href="/insights" className="mt-5 inline-flex font-black text-[#ffb21c] transition hover:text-[#ffd06f]">
              查看全部国家洞察 →
            </Link>
          </div>
        </Reveal>

        <CoverageMapHighlight className="mx-auto mt-10 max-w-6xl">
          <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-none">
            {/* A soft amber haze behind the continent, so the glow has something to sit in. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-[20%] inset-y-[10%] rounded-full bg-[#ffb21c]/10 blur-3xl lg:inset-x-[36%]" />
            <svg
              viewBox={`${CANVAS.x} 0 ${CANVAS.width} ${CANVAS.height}`}
              className="relative hidden h-auto w-full lg:block"
              role="img"
              aria-label={`拉美地图：已覆盖 ${countries.length} 个国家，共 ${total} 个在招项目`}
            >
              <MapBody shapes={shapes} lit={lit} byCountry={byCountry} callouts />
            </svg>
            <svg
              viewBox={`0 0 ${LATAM_MAP_VIEWBOX.width} ${LATAM_MAP_VIEWBOX.height}`}
              className="relative h-auto w-full lg:hidden"
              role="img"
              aria-label={`拉美地图：已覆盖 ${countries.length} 个国家，共 ${total} 个在招项目`}
            >
              <MapBody shapes={shapes} lit={lit} byCountry={byCountry} callouts={false} />
            </svg>

            {/* The cards, beside the map from lg up, each at the end of its country's line. */}
            {lit.map((shape) => {
              const entry = byCountry.get(shape.country!)!;
              const callout = CALLOUT[entry.country];
              if (!callout) return null;
              const edge = callout.edge;
              return (
                <div
                  key={entry.country}
                  className="absolute hidden w-[13.5rem] lg:block"
                  style={{
                    left: pct(edge - CANVAS.x, CANVAS.width),
                    top: pct(callout.y, CANVAS.height),
                    transform: callout.side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)",
                  }}
                >
                  <CountryCard entry={entry} facing={callout.side === "left" ? "right" : "left"} />
                </div>
              );
            })}
          </div>

          {/* Phones and tablets: the same cards under the map. */}
          <ul className="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-2 lg:hidden">
            {[...countries].sort((a, b) => b.liveCount - a.liveCount).map((entry) => {
              return (
                <li key={entry.country}>
                  <CountryCard entry={entry} className="h-full" />
                </li>
              );
            })}
          </ul>
        </CoverageMapHighlight>
      </div>
    </section>
  );
}

function MapBody({
  shapes,
  lit,
  byCountry,
  callouts,
}: {
  shapes: typeof LATAM_MAP_SHAPES;
  lit: typeof LATAM_MAP_SHAPES;
  byCountry: Map<string, CoverageCountry>;
  callouts: boolean;
}) {
  // Two copies of this body can be on the page (lg and below); the ids differ so each finds its own.
  const id = callouts ? "wide" : "narrow";
  const ref = (shape: (typeof LATAM_MAP_SHAPES)[number]) => `#coverage-${id}-${shape.name.replace(/\W+/g, "-")}`;
  return (
    <>
      <defs>
        <linearGradient id={`coverage-lit-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd06f" />
          <stop offset="100%" stopColor="#f39c12" />
        </linearGradient>
        <filter id={`coverage-blur-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`coverage-shadow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {/* Each outline once; the relief below re-uses it with <use>, so the 3D costs no extra path data. */}
        {shapes.map((shape) => (
          <path key={shape.name} id={ref(shape).slice(1)} d={shape.d} />
        ))}
      </defs>

      {/* The relief (user, 2026-10-10: 能不能把地图做成3D的？): a soft shadow on
          the sea, every country given thickness by stacked copies stepping
          down, the lit ones twice as thick so they stand above the rest. All
          the sides are drawn before any top, so no side covers a neighbour's
          surface. */}
      <g aria-hidden fill="#00070d" opacity={0.75} filter={`url(#coverage-shadow-${id})`} transform="translate(6 18)">
        {shapes.map((shape) => (
          <use key={shape.name} href={ref(shape)} />
        ))}
      </g>
      <g aria-hidden>
        {shapes.filter((shape) => !shape.country).map((shape) =>
          UNLIT_SIDES.map((step) => <use key={`${shape.name}-${step}`} href={ref(shape)} y={step} fill="#071d2c" />),
        )}
      </g>
      {shapes.filter((shape) => !shape.country).map((shape) => (
        <use key={shape.name} href={ref(shape)} fill="#11324a" stroke="#1d4560" strokeWidth={0.7} />
      ))}

      <g aria-hidden filter={`url(#coverage-blur-${id})`}>
        {lit.map((shape, index) => (
          <use key={shape.name} href={ref(shape)} fill="#ffb21c" className="coverage-glow" style={{ animationDelay: `${(index * 0.37) % 3.2}s` }} />
        ))}
      </g>

      {lit.map((shape) => (
        <g key={`${shape.name}-sides`} aria-hidden data-country={shape.country!} className="coverage-country">
          <g className="coverage-lift">
            {LIT_SIDES.map((step, index) => (
              <use key={step} href={ref(shape)} y={step} fill={LIT_SIDE_COLORS[index]} />
            ))}
          </g>
        </g>
      ))}

      {lit.map((shape) => {
        const entry = byCountry.get(shape.country!)!;
        return (
          <a key={shape.name} href={entry.href} aria-label={`${entry.name}：${entry.liveCount} 个在招项目，${entry.linkLabel}`} data-country={entry.country} className="coverage-country">
            <g className="coverage-lift">
              <use href={ref(shape)} fill={`url(#coverage-lit-${id})`} stroke="#fff3d1" strokeOpacity={0.55} strokeWidth={0.8} className="coverage-shape" />
            </g>
          </a>
        );
      })}

      {lit.map((shape) => {
        const entry = byCountry.get(shape.country!)!;
        const callout = callouts ? CALLOUT[entry.country] : undefined;
        const edge = callout?.edge ?? 0;
        // An elbow: out from the country to the column, then level into the card.
        const elbowX = callout ? (callout.side === "left" ? edge + 40 : edge - 40) : 0;
        return (
          <g key={`${shape.name}-pin`} aria-hidden data-country={entry.country} className="coverage-country">
            {callout && (
              <>
                <path
                  d={`M${shape.cx} ${shape.cy}L${elbowX} ${callout.y}H${edge}`}
                  fill="none"
                  stroke="#ffd06f"
                  strokeOpacity={0.5}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                  className="coverage-leader"
                />
                <circle cx={edge} cy={callout.y} r={3} fill="#ffd06f" className="coverage-leader-end" />
              </>
            )}
            <circle cx={shape.cx} cy={shape.cy} r={4} fill="#fff8e6" />
            <circle cx={shape.cx} cy={shape.cy} r={4} fill="none" stroke="#fff8e6" strokeWidth={1.5} className="coverage-ping" />
          </g>
        );
      })}
    </>
  );
}
