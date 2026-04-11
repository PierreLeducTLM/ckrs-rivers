"use client";

import type { ClassFilter } from "./tab-context";

interface RapidClassFilterProps {
  value: ClassFilter;
  onChange: (filter: ClassFilter) => void;
  t: (key: string) => string;
}

const CLASSES: { id: ClassFilter; label: string }[] = [
  { id: "all", label: "" },
  { id: "I", label: "I" },
  { id: "II", label: "II" },
  { id: "III", label: "III" },
  { id: "IV", label: "IV" },
  { id: "V", label: "V" },
];

/**
 * Check whether a river's rapidClass string contains the selected class.
 * e.g. classFilter="III" matches "III", "II-III", "III-IV", "II-III-IV"
 * but "I" does NOT match "II" or "III".
 */
export function matchesClassFilter(rapidClass: string | undefined, classFilter: ClassFilter): boolean {
  if (classFilter === "all") return true;
  if (!rapidClass) return false;
  const parts = rapidClass.split("-").map((p) => p.trim().toUpperCase());
  return parts.includes(classFilter);
}

export default function RapidClassFilter({ value, onChange, t }: RapidClassFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {CLASSES.map((cls) => {
        const active = value === cls.id;
        return (
          <button
            key={cls.id}
            onClick={() => onChange(cls.id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-brand bg-brand/10 text-brand"
                : "border-foreground/15 text-foreground/60 hover:border-foreground/30"
            }`}
          >
            {cls.id === "all" ? t("explore.filterAllClasses") : cls.label}
          </button>
        );
      })}
    </div>
  );
}
