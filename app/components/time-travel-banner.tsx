"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useTab } from "./tab-context";
import type { StationCard } from "./types";
import { getForecastEndTs } from "./utils";

const HOUR_MS = 60 * 60 * 1000;

export default function TimeTravelBanner({ cards }: { cards: StationCard[] }) {
  const { t, locale } = useTranslation();
  const { timeTravelTs, setTimeTravelTs } = useTab();
  const active = timeTravelTs != null;

  // Snapshot "now" once when the banner activates.
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(active ? Date.now() : null);
  }, [active]);

  const maxTs = useMemo(
    () => (nowTs != null ? (getForecastEndTs(cards) ?? nowTs + 7 * 24 * HOUR_MS) : 0),
    [cards, nowTs],
  );

  if (!active || nowTs == null) return null;

  const clampedTs = Math.max(nowTs, Math.min(maxTs, timeTravelTs));
  const hoursAhead = Math.max(0, Math.round((clampedTs - nowTs) / HOUR_MS));

  const formattedDate = new Date(clampedTs).toLocaleString(
    locale === "fr" ? "fr-CA" : "en-CA",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
    },
  );

  return (
    <div className="sticky top-0 z-30 mb-3 rounded-xl border border-amber-400/60 bg-amber-50 px-3 py-2 shadow-md dark:border-amber-500/40 dark:bg-amber-950/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 7v5l3 2" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {t("timeTravel.banner")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTimeTravelTs(nowTs)}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            {t("timeTravel.now")}
          </button>
          <button
            onClick={() => setTimeTravelTs(null)}
            aria-label={t("timeTravel.exit")}
            className="flex h-6 w-6 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-100">
          {formattedDate}
        </span>
        <span className="text-[11px] tabular-nums text-amber-700/80 dark:text-amber-300/80">
          {hoursAhead === 0
            ? t("timeTravel.now")
            : hoursAhead < 24
              ? t("timeTravel.hoursFromNow", { n: hoursAhead })
              : t("timeTravel.daysFromNow", { n: Math.round(hoursAhead / 24) })}
        </span>
      </div>

      <input
        type="range"
        min={nowTs}
        max={maxTs}
        step={HOUR_MS}
        value={clampedTs}
        onChange={(e) => setTimeTravelTs(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-amber-200 accent-amber-600 dark:bg-amber-900/60"
      />
    </div>
  );
}
