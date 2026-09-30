"use client";

/**
 * The manual imports' publication window: the last 1, 2 or 3 days (user,
 * 2026-09-28: 把现在后台的1个月的导入选项，都调整成1、2、3天，不需要每次都1个月 —
 * the same choice the Chile form has offered since 2026-09-25). The daily
 * jobs are unchanged; this is only what a manual run asks for.
 */
export const DAY_WINDOW_CHOICES = [1, 2, 3] as const;
export const DEFAULT_DAY_WINDOW = 3;

export function DayWindowPicker({
  value,
  onChange,
  disabled,
  label = "只导入发布于",
  choices = DAY_WINDOW_CHOICES,
}: {
  value: number;
  onChange: (days: number) => void;
  disabled?: boolean;
  label?: string;
  /** SECOP adds 7: its open data trails the portal by a day or two, so 1–2 days is usually empty. */
  choices?: readonly number[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-[#52636e]">{label}</span>
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onChange(choice)}
          disabled={disabled}
          aria-pressed={value === choice}
          className={`h-7 rounded-lg border px-3 font-bold transition-colors disabled:opacity-50 ${
            value === choice ? "border-[#071826] bg-[#071826] text-white" : "border-[#d8e0e3] bg-white text-[#233846] hover:border-[#b86e00]"
          }`}
        >
          近 {choice} 天
        </button>
      ))}
      <span className="text-[#64717c]">的项目</span>
    </div>
  );
}
