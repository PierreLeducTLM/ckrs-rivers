"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HourlyChart, {
  type HourlyChartPoint,
  type PaddlingLevels,
} from "./hourly-chart";
import { useTranslation } from "@/lib/i18n/provider";
import type { ForecastCorrection } from "@/app/components/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** ~1 year of weekly steps back from the live view. */
const MAX_OFFSET = 53;

interface HistoryResponse {
  points: HourlyChartPoint[];
  predictorUnit?: string;
  predictorLabel?: string;
}

interface ChartNavProps {
  /** Live view: recent observed + forecast, already built server-side. */
  data: HourlyChartPoint[];
  nowTimestamp: string;
  paddling?: PaddlingLevels;
  correction?: ForecastCorrection;
  predictorUnit?: string;
  predictorLabel?: string;
  stationId: string;
}

/**
 * Wraps the flow chart with left/right arrows that slide the visible window
 * back through history one week at a time. Offset 0 is the live view (recent
 * observed + forecast, rendered from server data). Offset ≥ 1 fetches a
 * 7-day historical window ending `(offset − 1)` weeks before now, including
 * the custom predictor recomputed across that window.
 */
export default function ChartNav({
  data,
  nowTimestamp,
  paddling,
  correction,
  predictorUnit,
  predictorLabel,
  stationId,
}: ChartNavProps) {
  const { t } = useTranslation();
  const nowMs = new Date(nowTimestamp).getTime();

  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const cache = useRef<Map<number, HistoryResponse>>(new Map());

  const endMsFor = useCallback(
    (o: number) => nowMs - (o - 1) * WEEK_MS,
    [nowMs],
  );

  useEffect(() => {
    if (offset === 0) {
      setHistory(null);
      setError(false);
      return;
    }
    const cached = cache.current.get(offset);
    if (cached) {
      setHistory(cached);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    const end = new Date(endMsFor(offset)).toISOString();
    fetch(`/api/rivers/${stationId}/history?end=${encodeURIComponent(end)}&days=7`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: HistoryResponse) => {
        if (cancelled) return;
        cache.current.set(offset, json);
        setHistory(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [offset, stationId, endMsFor]);

  const isLive = offset === 0;
  const viewData = isLive ? data : history?.points ?? [];
  const viewUnit = isLive ? predictorUnit : history?.predictorUnit;
  const viewLabel = isLive ? predictorLabel : history?.predictorLabel;

  // Range caption: "Live" or "May 1 – May 8".
  const rangeLabel = (() => {
    if (isLive) return t("chart.live");
    const end = endMsFor(offset);
    const start = end - WEEK_MS;
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    return `${fmt(start)} – ${fmt(end)}`;
  })();

  const canGoBack = offset < MAX_OFFSET;
  const canGoForward = offset > 0;

  const arrowClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-colors enabled:hover:bg-zinc-50 enabled:active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800";

  const showEmpty = !isLive && !loading && viewData.length === 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={arrowClass}
          onClick={() => setOffset((o) => Math.min(o + 1, MAX_OFFSET))}
          disabled={!canGoBack || loading}
          aria-label={t("chart.previousWeek")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          {showEmpty ? (
            <div className="flex h-[300px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {error ? t("chart.historyError") : t("chart.noHistory")}
            </div>
          ) : (
            <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <HourlyChart
                data={viewData}
                nowTimestamp={nowTimestamp}
                paddling={paddling}
                correction={isLive ? correction : undefined}
                predictorUnit={viewUnit}
                predictorLabel={viewLabel}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className={arrowClass}
          onClick={() => setOffset((o) => Math.max(o - 1, 0))}
          disabled={!canGoForward || loading}
          aria-label={t("chart.nextWeek")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        {loading ? t("chart.loadingHistory") : rangeLabel}
      </div>
    </div>
  );
}
