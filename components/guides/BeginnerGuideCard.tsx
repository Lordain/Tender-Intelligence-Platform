import Link from "next/link";
import { BEGINNER_GUIDE_PATH, beginnerGuide, flowSteps } from "@/lib/beginner-guide";

/**
 * The pinned 新手入门 entry, at the top of /guides and above the homepage's
 * four guide cards (user, 2026-10-05: 置顶，加首页参标指南侧展示，放在现在的
 * 4个参标指南的上方). The whole card is the link; the step chips are the
 * flowchart in miniature, so the card says what the guide is without a
 * paragraph.
 */
export function BeginnerGuideCard({ className = "" }: { className?: string }) {
  return (
    <Link
      href={BEGINNER_GUIDE_PATH}
      className={`group grid gap-6 bg-[#061b2b] p-6 text-white transition-colors hover:bg-[#0a2538] sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10 ${className}`}
    >
      <span className="block min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#ffb21c] px-2 py-0.5 text-xs font-black text-[#071826]">新手入门</span>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">置顶 · 适用拉美各国</span>
        </span>
        <span className="mt-3 block text-xl font-black leading-8 tracking-[-0.01em] sm:text-2xl">{beginnerGuide.title}</span>
        <span className="mt-2 block text-sm leading-6 text-white/62">{beginnerGuide.summary}</span>
        <span className="mt-4 inline-block text-sm font-black text-[#ffb21c] transition-transform group-hover:translate-x-1">阅读入门指南 →</span>
      </span>
      {/* Wraps freely on a phone; four to a row from sm up, so the eight
          steps sit as two even lines instead of six and a stray two. */}
      <span aria-hidden="true" className="flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:grid sm:grid-cols-4 sm:gap-x-0">
        {flowSteps.map((step, index) => (
          <span key={step.title} className="flex items-center gap-1.5 sm:gap-0">
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-xs font-bold text-white/82 sm:flex-1">
              <span className="font-mono font-black text-[#ffb21c]">{index + 1}</span>
              {step.title}
            </span>
            {index < flowSteps.length - 1 && (
              <span className={`text-xs font-black text-[#ffb21c]/70 sm:w-5 sm:shrink-0 sm:text-center ${index % 4 === 3 ? "sm:invisible" : ""}`}>→</span>
            )}
            {index === flowSteps.length - 1 && <span className="hidden sm:block sm:w-5 sm:shrink-0" />}
          </span>
        ))}
      </span>
    </Link>
  );
}
