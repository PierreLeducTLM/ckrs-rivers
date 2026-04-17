"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { useTab } from "./tab-context";

export default function TimeTravelToggle() {
  const { t } = useTranslation();
  const { timeTravelTs, setTimeTravelTs } = useTab();
  const active = timeTravelTs != null;

  const handleClick = () => {
    if (active) setTimeTravelTs(null);
    else setTimeTravelTs(Date.now());
  };

  return (
    <button
      onClick={handleClick}
      aria-pressed={active}
      aria-label={t("timeTravel.toggle")}
      title={t("timeTravel.toggle")}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-brand/20 text-foreground/50 hover:text-brand"
      }`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
    </button>
  );
}
