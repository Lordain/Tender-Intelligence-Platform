import Link from "next/link";
import { BEGINNER_GUIDE_PATH, beginnerGuide } from "@/lib/beginner-guide";
import { FLOW_NODES, FLOW_STAGES, stageOf } from "@/components/guides/BeginnerFlowchart";
import { BeginnerIcon } from "@/components/guides/BeginnerIcon";

/**
 * The pinned 新手入门 entry, at the top of /guides and above the homepage's
 * four guide cards (user, 2026-10-05: 置顶，加首页参标指南侧展示，放在现在的
 * 4个参标指南的上方). The whole card is the link.
 *
 * Its right half is the guide's flowchart in miniature — the same nodes,
 * icons, stage bands and decision diamond as the page, redrawn for the dark
 * card (user, 2026-10-05: 这张流程图也优化一下，更图形化一点). On a phone
 * the track keeps its icons and drops the labels; from sm up the labels
 * return under each node.
 */

/** The stage colours, re-tuned to read on the navy card. */
const DARK_STAGE = {
  看项目: { band: "bg-[#6fb3cf]/14 text-[#9dd0e4] border-[#6fb3cf]/55", ring: "ring-[#6fb3cf]/60" },
  做投标: { band: "bg-[#ffb21c]/14 text-[#ffc95c] border-[#ffb21c]/55", ring: "ring-[#ffb21c]/60" },
  等结果: { band: "bg-[#7cc58a]/14 text-[#a6dcb0] border-[#7cc58a]/55", ring: "ring-[#7cc58a]/60" },
} as const;

/** Grid column of each node: the steps, with the diamond after step 3 in column 4. */
const columnOfNode = (position: number) => position + 1;
const stageColumns = FLOW_STAGES.map((stage, stageIndex) => {
  const positions = FLOW_NODES.flatMap((node, position) => (node.kind === "step" && (stage.steps as readonly number[]).includes(node.index) ? [position] : []));
  // 看项目 also takes the diamond's column, which sits at the end of its run.
  const last = positions[positions.length - 1] + (stageIndex === 0 ? 1 : 0);
  return { stage, from: columnOfNode(positions[0]), to: columnOfNode(last) };
});

function MiniFlow() {
  return (
    <span aria-hidden="true" className="block min-w-0">
      {/* Stage bands */}
      <span className="hidden grid-cols-9 sm:grid">
        {stageColumns.map(({ stage, from, to }) => (
          <span key={stage.label} style={{ gridColumn: `${from} / ${to + 1}` }} className={`mx-1 rounded-md border-b-2 py-1 text-center text-[10px] font-black tracking-[0.14em] ${DARK_STAGE[stage.label].band}`}>
            {stage.label}
          </span>
        ))}
      </span>

      {/* Track and nodes */}
      <span className="mt-0 grid grid-cols-9 sm:mt-4">
        {FLOW_NODES.map((node, position) => {
          const first = position === 0;
          const last = position === FLOW_NODES.length - 1;
          return (
            <span key={node.kind === "decision" ? "decision" : node.step.title} className="relative flex justify-center">
              <span className={`absolute top-1/2 h-px -translate-y-1/2 bg-white/22 ${first ? "left-1/2" : "left-0"} ${last ? "right-1/2" : "right-0"}`} />
              {!last && (
                <svg viewBox="0 0 12 12" className="absolute -right-1 top-1/2 z-10 hidden size-2.5 -translate-y-1/2 fill-none stroke-white/45 stroke-2 sm:block" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4 2 4 4-4 4" />
                </svg>
              )}
              {node.kind === "decision" ? (
                <span className="relative z-10 flex size-7 items-center justify-center sm:size-10">
                  <span className="absolute size-4 rotate-45 rounded-[3px] border-2 border-[#ffb21c] bg-[#2a2a1c] sm:size-6" />
                  <span className="relative text-[10px] font-black text-[#ffb21c] sm:text-[11px]">?</span>
                </span>
              ) : (
                <span className={`relative z-10 flex size-7 items-center justify-center rounded-full bg-[#0e2a3d] text-[#ffb21c] ring-[1.5px] sm:size-10 sm:ring-2 ${DARK_STAGE[stageOf(node.index).label].ring}`}>
                  <BeginnerIcon name={node.step.icon} className="size-3.5 sm:size-[18px]" />
                  <span className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-[#ffb21c] font-mono text-[9px] font-black text-[#071826] sm:flex">{node.index + 1}</span>
                </span>
              )}
            </span>
          );
        })}
      </span>

      {/* Labels */}
      <span className="mt-2.5 hidden grid-cols-9 sm:grid">
        {FLOW_NODES.map((node) => (
          <span key={node.kind === "decision" ? "decision-label" : `${node.step.title}-label`} className={`px-0.5 text-center text-[11px] font-bold leading-4 ${node.kind === "decision" ? "text-[#ffc95c]" : "text-white/72"}`}>
            {node.kind === "decision" ? "能否直投" : node.step.title}
          </span>
        ))}
      </span>
    </span>
  );
}

export function BeginnerGuideCard({ className = "" }: { className?: string }) {
  return (
    <Link
      href={BEGINNER_GUIDE_PATH}
      className={`group grid gap-6 bg-[#061b2b] p-6 text-white transition-colors hover:bg-[#0a2538] sm:p-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-10 ${className}`}
    >
      <span className="block min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#ffb21c] px-2 py-0.5 text-xs font-black text-[#071826]">新手入门</span>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">置顶 · 适用拉美各国</span>
        </span>
        <span className="mt-3 block text-xl font-black leading-8 tracking-[-0.01em] sm:text-2xl">{beginnerGuide.title}</span>
        <span className="mt-2 block text-sm leading-6 text-white/62">{beginnerGuide.summary}</span>
        {/* Drawn as a button (user, 2026-10-05: 阅读入门指南 -> 做成明显一点的按钮);
            a span, since the whole card is already the link. */}
        <span className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] shadow-[0_6px_18px_-6px_rgba(255,178,28,0.55)] transition group-hover:bg-[#ffc34d]">
          阅读入门指南
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
        </span>
      </span>
      <MiniFlow />
    </Link>
  );
}
