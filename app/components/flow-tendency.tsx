"use client";

import { useTranslation } from "@/lib/i18n/provider";
import type { TrendDirection } from "@/lib/domain/notification";

const PATHS: Record<TrendDirection, string> = {
  rising: "M4.5 15.75l7.5-7.5 7.5 7.5",
  falling: "M19.5 8.25l-7.5 7.5-7.5-7.5",
  stable: "M5 12h14",
};

const COLORS: Record<TrendDirection, string> = {
  rising: "text-sky-600 dark:text-sky-400",
  falling: "text-amber-600 dark:text-amber-400",
  stable: "text-zinc-500 dark:text-zinc-400",
};

export default function FlowTendency({ trend }: { trend: TrendDirection }) {
  const { t } = useTranslation();
  const label = t(`detail.${trend}`);

  return (
    <svg
      role="img"
      aria-label={label}
      className={`inline-block h-5 w-5 shrink-0 ${COLORS[trend]}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={PATHS[trend]} />
    </svg>
  );
}
