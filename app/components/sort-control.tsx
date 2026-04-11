"use client";

export type SortMode = "status" | "name";

interface SortControlProps {
  value: SortMode;
  onChange: (mode: SortMode) => void;
  t: (key: string) => string;
}

const OPTIONS: { id: SortMode; labelKey: string }[] = [
  { id: "status", labelKey: "myRivers.sortStatus" },
  { id: "name", labelKey: "myRivers.sortName" },
];

export default function SortControl({ value, onChange, t }: SortControlProps) {
  return (
    <div className="inline-flex rounded-lg border border-foreground/15 p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === opt.id
              ? "bg-brand/10 text-brand"
              : "text-foreground/50 hover:text-brand"
          }`}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
