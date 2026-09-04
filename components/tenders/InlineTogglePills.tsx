"use client";

/**
 * Always-visible toggle-chip row — the "打开，不是下拉式选单" counterpart to
 * MultiSelectPills' dropdown-with-Apply/Cancel, per the user's explicit
 * request (2026-09-04): for a short, fixed option list (项目规模/项目阶段/
 * 计划交标时间 — at most 6 options), hiding it behind a click-to-open panel
 * added a step for no benefit; every option is visible and each click
 * applies immediately, same as the removable industry chips already below
 * the filter row. Reserve the dropdown pattern (MultiSelectPills) for
 * longer or searchable lists (行业/项目类型) where showing every option
 * inline would be cluttered.
 */
export function InlineTogglePills<T extends string>({
  label,
  options,
  selected,
  onChange,
  mode = "multi",
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  /** "single" behaves like a radio group (e.g. sort order) — clicking an option always selects just that one, never toggles it off. */
  mode?: "multi" | "single";
}) {
  function handleClick(value: T) {
    if (mode === "single") {
      onChange([value]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-semibold text-[#425461]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleClick(option.value)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]"
                  : "border-[#d8e0e3] bg-white text-[#425461] hover:border-[#9babb3] hover:bg-[#f7f9f9]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
