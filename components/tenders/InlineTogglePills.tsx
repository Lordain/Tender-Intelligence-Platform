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
  showAllOption = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  /** "single" behaves like a radio group (e.g. sort order) — clicking an option always selects just that one, never toggles it off. */
  mode?: "multi" | "single";
  /**
   * Prepends a "全部" chip that clears every selection in this group —
   * per explicit user request (2026-09-04): this group ships with a
   * non-empty default selection (see DEFAULT_STATUSES/
   * DEFAULT_RELEVANCE_TIERS in TenderExplorer.tsx), and un-toggling every
   * chip by hand was the only way to see everything regardless of this
   * dimension. Only meaningful for "multi" mode — a "single" group (sort
   * order) always needs exactly one value selected.
   */
  showAllOption?: boolean;
}) {
  function handleClick(value: T) {
    if (mode === "single") {
      onChange([value]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  const chipClass = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? "border-[#ffb21c] bg-[#ffb21c] text-[#071826]"
        : "border-[#d8e0e3] bg-white text-[#425461] hover:border-[#9babb3] hover:bg-[#f7f9f9]"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-semibold text-[#425461]">{label}</span>
      {showAllOption && mode === "multi" && (
        <button type="button" onClick={() => onChange([])} aria-pressed={selected.length === 0} className={chipClass(selected.length === 0)}>
          全部
        </button>
      )}
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button key={option.value} type="button" onClick={() => handleClick(option.value)} aria-pressed={active} className={chipClass(active)}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
