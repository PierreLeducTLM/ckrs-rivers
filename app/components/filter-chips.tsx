"use client";

export type StatusFilter = "all" | "ideal" | "runnable" | "too-low";

interface FilterChipsProps {
  value: StatusFilter;
  onChange: (filter: StatusFilter) => void;
  t: (key: string) => string;
}

const CHIPS: { id: StatusFilter; labelKey: string; color?: string }[] = [
  { id: "all", labelKey: "explore.filterAll" },
  { id: "ideal", labelKey: "explore.filterGoodToGo", color: "#00c853" },
  { id: "runnable", labelKey: "explore.filterRunnable", color: "#2979ff" },
  { id: "too-low", labelKey: "explore.filterTooLow", color: "#ff6d00" },
];

export default function FilterChips({ value, onChange, t }: FilterChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {CHIPS.map((chip) => {
        const active = value === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onChange(chip.id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-brand bg-brand/10 text-brand"
                : "border-foreground/15 text-foreground/60 hover:border-foreground/30"
            }`}
          >
            {chip.color && (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: chip.color }}
              />
            )}
            {t(chip.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
