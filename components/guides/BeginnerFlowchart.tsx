import { flowDecision, flowSteps, type FlowStep } from "@/lib/beginner-guide";
import { BeginnerIcon } from "@/components/guides/BeginnerIcon";

/**
 * The 新手入门 flowchart (user, 2026-10-05: 流程图，做成更图形化一点的流程图).
 *
 * Desktop: one horizontal track through nine columns — the eight steps plus
 * the decision diamond after 下载招标文件 — under three stage bands. The
 * diamond's 可以 runs straight on along the track; its 不可以 climbs into a
 * dashed bypass box above the track and drops back down into 注册供应商, so
 * the fork reads as a fork. Phone: the same sequence as a vertical timeline.
 */

export const FLOW_STAGES = [
  { label: "看项目", steps: [0, 1, 2], tint: "bg-[#e6f0f4] text-[#1d5670] border-[#9cc3d3]", ring: "ring-[#cfe2ea]" },
  { label: "做投标", steps: [3, 4, 5], tint: "bg-[#fff0c9] text-[#8f5b00] border-[#e8c26a]", ring: "ring-[#fbe2a3]" },
  { label: "等结果", steps: [6, 7], tint: "bg-[#e7f2e8] text-[#2e6b3a] border-[#a5cfab]", ring: "ring-[#cfe6d2]" },
] as const;

export const stageOf = (index: number) => FLOW_STAGES.find((stage) => (stage.steps as readonly number[]).includes(index))!;

/** The diamond sits after step index 2, so steps from index 3 on move one column right. */
const DECISION_AFTER = 2;
const columnOf = (index: number) => (index <= DECISION_AFTER ? index + 1 : index + 2);
const DECISION_COLUMN = DECISION_AFTER + 2;

export type FlowNode = { kind: "step"; step: FlowStep; index: number } | { kind: "decision" };
/** The eight steps with the decision diamond after step 3 — shared with the pinned card's miniature. */
export const FLOW_NODES: FlowNode[] = [
  ...flowSteps.slice(0, DECISION_AFTER + 1).map((step, index) => ({ kind: "step" as const, step, index })),
  { kind: "decision" as const },
  ...flowSteps.slice(DECISION_AFTER + 1).map((step, offset) => ({ kind: "step" as const, step, index: offset + DECISION_AFTER + 1 })),
];

function StepNode({ step, index, size = "lg" }: { step: FlowStep; index: number; size?: "lg" | "sm" }) {
  return (
    <span className={`relative z-10 flex shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-[#ffb21c] ring-4 ${stageOf(index).ring} ${size === "lg" ? "size-14" : "size-11"}`}>
      <BeginnerIcon name={step.icon} className={size === "lg" ? "size-6" : "size-5"} />
      <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#ffb21c] font-mono text-[11px] font-black text-[#071826] ring-2 ring-white">{index + 1}</span>
    </span>
  );
}

function DecisionNode({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <span className={`relative z-10 flex shrink-0 items-center justify-center ${size === "lg" ? "size-14" : "size-11"}`}>
      <span className={`absolute rotate-45 rounded-md border-2 border-[#e0a12a] bg-[#fff7e4] ${size === "lg" ? "size-10" : "size-8"}`} />
      <span className="relative font-black text-[#b86e00]">?</span>
    </span>
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 fill-none stroke-[#9aa8b0] stroke-2 ${className}`} strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 2 4 4-4 4" />
    </svg>
  );
}

export function BeginnerFlowchart() {
  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block" role="img" aria-label={`流程：${flowSteps.map((step) => step.title).join("、")}；第 3 步后判断${flowDecision.question}`}>
        <div className="grid grid-cols-9">
          {/* Row 1: stage bands. 看项目 also spans the diamond's column. */}
          {FLOW_STAGES.map((stage, stageIndex) => {
            const first = columnOf(stage.steps[0]);
            const last = columnOf(stage.steps[stage.steps.length - 1]) + (stageIndex === 0 ? 1 : 0);
            return (
              <div key={stage.label} style={{ gridColumn: `${first} / ${last + 1}`, gridRow: 1 }} className={`mx-1.5 rounded-lg border-b-2 py-1.5 text-center text-xs font-black tracking-[0.12em] ${stage.tint}`}>
                {stage.label}
              </div>
            );
          })}

          {/* Row 2: the 不可以 bypass, from the diamond back down into 注册供应商. */}
          <div style={{ gridColumn: `${DECISION_COLUMN} / span 2`, gridRow: 2 }} className="relative mt-5">
            <div className="mx-2 rounded-xl border-2 border-dashed border-[#e0a12a] bg-[#fff7e4] px-3 py-2.5 text-center">
              <span className="inline-block rounded bg-[#ffb21c] px-1.5 py-0.5 text-[11px] font-black text-[#071826]">不可以</span>
              {flowDecision.bypass.map((line, index) => (
                <span key={line} className={`block text-xs leading-5 ${index === 0 ? "mt-1 font-black text-[#071826]" : "text-[#66562f]"}`}>{line}</span>
              ))}
            </div>
            {/* Down from the box's left quarter (the diamond's column) and its right quarter (注册供应商's), stopping short of the node's ring. */}
            <span aria-hidden="true" className="absolute left-1/4 top-full h-7 border-l-2 border-dashed border-[#e0a12a]" />
            <span aria-hidden="true" className="absolute left-3/4 top-full h-3.5 border-l-2 border-dashed border-[#e0a12a]" />
            <svg aria-hidden="true" viewBox="0 0 12 8" className="absolute left-3/4 top-[calc(100%+0.8rem)] h-2 w-3 -translate-x-[42%] fill-[#e0a12a]"><path d="M0 0h12L6 8z" /></svg>
          </div>

          {/* Row 3: the track and its nodes. */}
          {FLOW_NODES.map((node, position) => {
            const column = node.kind === "decision" ? DECISION_COLUMN : columnOf(node.index);
            const first = position === 0;
            const last = position === FLOW_NODES.length - 1;
            return (
              <div key={node.kind === "decision" ? "decision" : node.step.title} style={{ gridColumn: column, gridRow: 3 }} className="relative mt-7 flex justify-center">
                <span aria-hidden="true" className={`absolute top-1/2 h-0.5 -translate-y-1/2 bg-[#cfd8dc] ${first ? "left-1/2" : "left-0"} ${last ? "right-1/2" : "right-0"}`} />
                {!last && <Chevron className="absolute -right-1.5 top-1/2 z-10 -translate-y-1/2 bg-[#fffdf9]" />}
                {node.kind === "decision" && (
                  <span className="absolute -right-3 top-1/2 z-20 -translate-y-[170%] rounded bg-[#9fd8a8] px-1.5 py-0.5 text-[10px] font-black text-[#0f3b18]">可以</span>
                )}
                {node.kind === "decision" ? <DecisionNode /> : <StepNode step={node.step} index={node.index} />}
              </div>
            );
          })}

          {/* Row 4: labels under each node. */}
          {FLOW_NODES.map((node) => {
            const column = node.kind === "decision" ? DECISION_COLUMN : columnOf(node.index);
            return (
              <div key={`label-${node.kind === "decision" ? "decision" : node.step.title}`} style={{ gridColumn: column, gridRow: 4 }} className="mt-4 px-1.5 text-center">
                {node.kind === "decision" ? (
                  <>
                    <span className="block text-sm font-black text-[#8f5b00]">关键判断</span>
                    <span className="mt-1 block text-xs leading-5 text-[#586873]">{flowDecision.shortQuestion}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm font-black">{node.step.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#586873]">{node.step.detail}</span>
                    {node.step.term && <span className="mt-1.5 block text-[10px] font-bold leading-4 text-[#8a969d]">{node.step.term}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone and tablet: a vertical timeline. */}
      <ol className="relative lg:hidden">
        <span aria-hidden="true" className="absolute bottom-6 left-[22px] top-6 w-0.5 bg-[#cfd8dc]" />
        {FLOW_NODES.map((node) => {
          if (node.kind === "decision") {
            return (
              <li key="decision" className="relative flex gap-4 pb-6">
                <DecisionNode size="sm" />
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-xs font-black text-[#8f5b00]">关键判断</p>
                  <p className="mt-0.5 font-black">{flowDecision.question}</p>
                  <div className="mt-3 grid gap-2">
                    <p className="flex items-start gap-2 text-sm leading-6 text-[#43545f]">
                      <span className="mt-0.5 shrink-0 rounded bg-[#9fd8a8] px-1.5 py-0.5 text-[11px] font-black text-[#0f3b18]">可以</span>继续往下，直接注册投标
                    </p>
                    <div className="rounded-xl border-2 border-dashed border-[#e0a12a] bg-[#fff7e4] px-3 py-2.5 text-sm leading-6">
                      <span className="mr-2 rounded bg-[#ffb21c] px-1.5 py-0.5 text-[11px] font-black text-[#071826]">不可以</span>
                      <span className="font-black">{flowDecision.bypass[0]}</span>
                      <span className="text-[#66562f]">，{flowDecision.bypass[1]}，再回到下一步</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          }
          const stage = stageOf(node.index);
          const startsStage = stage.steps[0] === node.index;
          return (
            <li key={node.step.title} className="relative flex gap-4 pb-6 last:pb-0">
              <StepNode step={node.step} index={node.index} size="sm" />
              <div className="min-w-0 flex-1 pt-0.5">
                {startsStage && <span className={`mb-1.5 inline-block rounded border-b-2 px-2 py-0.5 text-[11px] font-black ${stage.tint}`}>{stage.label}</span>}
                <p className="font-black">{node.step.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-[#586873]">{node.step.detail}</p>
                {node.step.term && <p className="mt-1 text-[11px] font-bold text-[#8a969d]">{node.step.term}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
