import type { GuideSection, GuideStep } from "@/lib/participation-guides";
import { splitGuideLine, type GuideIconList } from "@/lib/guide-visuals";
import type { BeginnerIconName } from "@/lib/beginner-guide";
import { BeginnerIcon } from "@/components/guides/BeginnerIcon";

/**
 * The platform guides drawn rather than written out (user, 2026-10-05: 多做成
 * 流程化、或者多以图形的方式说明，并增加一些Icon): the 参与流程 as a flowchart,
 * every other list as icon cards in the shape its section calls for. Same
 * palette and node style as the 新手入门 flowchart (BeginnerFlowchart).
 *
 * The icons come in from guidePageIcons, unique across the page; a line
 * without one simply goes without (a step shows its number instead).
 */

/** Steps tint from 找 (blue) through 投 (amber) to 跟进 (green) along the track. */
const STEP_TONES = [
  "ring-[#cfe2ea]",
  "ring-[#fbe2a3]",
  "ring-[#cfe6d2]",
] as const;
const toneOf = (index: number, count: number) => STEP_TONES[Math.min(2, Math.floor((index / count) * 3))];

function StepNode({ icon, index, count, size = "lg" }: { icon?: BeginnerIconName; index: number; count: number; size?: "lg" | "sm" }) {
  return (
    <span className={`relative z-10 flex shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-[#ffb21c] ring-4 ${toneOf(index, count)} ${size === "lg" ? "size-14" : "size-11"}`}>
      {icon ? (
        <>
          <BeginnerIcon name={icon} className={size === "lg" ? "size-6" : "size-5"} />
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#ffb21c] font-mono text-[11px] font-black text-[#071826] ring-2 ring-white">{index + 1}</span>
        </>
      ) : (
        <span className={`font-mono font-black ${size === "lg" ? "text-xl" : "text-lg"}`}>{index + 1}</span>
      )}
    </span>
  );
}

export function GuideStepFlow({ steps, icons = [] }: { steps: GuideStep[]; icons?: GuideIconList }) {
  return (
    <>
      {/* Desktop: one track, a node per step, the words under it. */}
      <ol className="hidden lg:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const first = index === 0;
          const last = index === steps.length - 1;
          return (
            <li key={step.title} className="px-2 text-center">
              <div className="relative flex justify-center">
                <span aria-hidden="true" className={`absolute top-1/2 h-0.5 -translate-y-1/2 bg-[#cfd8dc] ${first ? "left-1/2" : "-left-2"} ${last ? "right-1/2" : "-right-2"}`} />
                {!last && (
                  <svg aria-hidden="true" viewBox="0 0 12 12" className="absolute -right-3.5 top-1/2 z-10 size-3 -translate-y-1/2 bg-[#fffdf9] fill-none stroke-[#9aa8b0] stroke-2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 2 4 4-4 4" />
                  </svg>
                )}
                <StepNode icon={icons[index]} index={index} count={steps.length} />
              </div>
              <h3 className="mt-4 text-sm font-black leading-6">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-[#586873]">{step.detail}</p>
            </li>
          );
        })}
      </ol>

      {/* Phone and tablet: the same steps as a vertical timeline. */}
      <ol className="relative lg:hidden">
        <span aria-hidden="true" className="absolute bottom-6 left-[22px] top-6 w-0.5 bg-[#cfd8dc]" />
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            <StepNode icon={icons[index]} index={index} count={steps.length} size="sm" />
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="font-black">{step.title}</h3>
              <p className="mt-0.5 text-sm leading-6 text-[#586873]">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function Lead({ lead, rest, leadClassName = "" }: { lead?: string; rest: string; leadClassName?: string }) {
  return (
    <span className="min-w-0">
      {lead && <span className={`block text-sm font-black leading-6 ${leadClassName}`}>{lead}</span>}
      <span className={`block text-sm leading-6 ${lead ? "mt-0.5 opacity-80" : ""}`}>{rest}</span>
    </span>
  );
}

/** 注册前先看这些字段: the field name as it appears on the platform, then what it tells you. */
function FieldCards({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => {
        const { lead, rest } = splitGuideLine(item);
        return (
          <li key={item} className="flex gap-3 rounded-xl border border-[#dbe2e5] bg-white p-4 md:last:odd:col-span-2">
            <span className="min-w-0">
              {lead && <span className="inline-block max-w-full break-words rounded-md border border-[#cfe2ea] bg-[#f1f7fa] px-2 py-0.5 font-mono text-xs font-bold leading-5 text-[#1d5670]">{lead}</span>}
              <span className="mt-1.5 block text-sm leading-6 text-[#43545f]">{rest}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 常见资料清单: a checklist of tiles. */
function ChecklistTiles({ items, icons }: { items: string[]; icons: GuideIconList }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl border border-[#e5e9ea] bg-[#e5e9ea] sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const { lead, rest } = splitGuideLine(item);
        // The last tile widens to close the row, so no empty grey cells are left.
        const last = index === items.length - 1;
        const span = !last ? "" : `${items.length % 2 === 1 ? "sm:col-span-2" : ""} ${items.length % 3 === 1 ? "lg:col-span-3" : items.length % 3 === 2 ? "lg:col-span-2" : "lg:col-span-1"}`;
        return (
          <li key={item} className={`flex gap-3 bg-white p-4 sm:p-5 ${span}`}>
            {icons[index] && <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#fff0c9] text-[#8f5b00]"><BeginnerIcon name={icons[index]} /></span>}
            <span className="min-w-0 flex-1 text-[#43545f]">
              <Lead lead={lead} rest={rest} leadClassName="text-[#071826]" />
            </span>
            <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 border-[#9fcda7] text-[11px] font-black text-[#2e6b3a]">✓</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 中国企业重点核对: numbered amber cards, one risk each. */
function WatchCards({ items, icons }: { items: string[]; icons: GuideIconList }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item, index) => {
        const { lead, rest } = splitGuideLine(item);
        return (
          <li key={item} className="flex gap-3 rounded-xl border-l-4 border-[#e0a12a] bg-[#fff7e4] px-4 py-3.5 text-[#66562f] md:last:odd:col-span-2">
            {icons[index] ? (
              <span className="relative mt-0.5 h-fit shrink-0 text-[#b86e00]">
                <BeginnerIcon name={icons[index]} className="size-6" />
                <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-[#b86e00] font-mono text-[9px] font-black text-white">{index + 1}</span>
              </span>
            ) : (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#b86e00] font-mono text-[11px] font-black text-white">{index + 1}</span>
            )}
            <Lead lead={lead} rest={rest} leadClassName="text-[#071826]" />
          </li>
        );
      })}
    </ul>
  );
}

/** Everything else (适用范围, 担保与异议 …): icon cards. */
function InfoCards({ items, icons }: { items: string[]; icons: GuideIconList }) {
  return (
    <ul className={`grid gap-3 md:grid-cols-2 ${items.length === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((item, index) => {
        const { lead, rest } = splitGuideLine(item);
        return (
          <li key={item} className={`flex gap-3 rounded-xl border border-[#dbe2e5] bg-white p-4 text-[#43545f] ${items.length === 3 ? "md:last:odd:col-span-2 lg:last:odd:col-span-1" : "md:last:odd:col-span-2"}`}>
            {icons[index] && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e6f0f4] text-[#1d5670]"><BeginnerIcon name={icons[index]} /></span>}
            <Lead lead={lead} rest={rest} leadClassName="text-[#071826]" />
          </li>
        );
      })}
    </ul>
  );
}

export function GuideNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border-l-4 border-[#ffb21c] bg-[#061b2b] px-4 py-3.5 text-sm leading-6 text-white/80 sm:px-5">{children}</p>
  );
}

export function GuideSectionBody({ section, icons = [] }: { section: GuideSection; icons?: GuideIconList }) {
  return (
    <>
      {section.intro && <p className="mt-3 text-sm leading-6 text-[#586873]">{section.intro}</p>}
      {section.steps && (
        <div className="mt-8">
          <GuideStepFlow steps={section.steps} icons={icons} />
        </div>
      )}
      {section.items && (
        <div className="mt-6">
          {section.id === "first-check" ? (
            <FieldCards items={section.items} />
          ) : section.id === "documents" ? (
            <ChecklistTiles items={section.items} icons={icons} />
          ) : section.id === "foreign" ? (
            <WatchCards items={section.items} icons={icons} />
          ) : (
            <InfoCards items={section.items} icons={icons} />
          )}
        </div>
      )}
      {section.note && (
        <div className="mt-6">
          <GuideNote>{section.note}</GuideNote>
        </div>
      )}
    </>
  );
}
