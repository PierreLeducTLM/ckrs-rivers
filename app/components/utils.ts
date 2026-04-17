import { getPaddlingStatus, isGoodRange, statusColor } from "@/lib/notifications/paddling-status";
import type { PaddlingLevels } from "@/lib/data/rivers";
import type { PaddlingStatus } from "@/lib/domain/notification";
import type { StationCard } from "./types";
import {
  applyForecastCorrection,
  buildForecastCorrection,
  NO_CORRECTION,
  type ForecastCorrection,
  type ForecastPoint,
} from "@/lib/forecast-correction";

// Re-export so existing callers (page.tsx, hourly-chart.tsx) keep working.
export {
  applyForecastCorrection,
  buildForecastCorrection,
  NO_CORRECTION,
  type ForecastCorrection,
};

export function timeAgo(
  isoDate: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.floor(hours / 24) });
}

export function weatherIcon(w: {
  tempMax: number | null;
  precipitation: number;
  snowfall: number;
}): string {
  if (w.snowfall > 0.5) return "\u2744\uFE0F";
  if (w.precipitation > 5) return "\uD83C\uDF27\uFE0F";
  if (w.precipitation > 0.5) return "\uD83C\uDF26\uFE0F";
  if (w.tempMax != null && w.tempMax > 15) return "\u2600\uFE0F";
  if (w.tempMax != null && w.tempMax > 5) return "\u26C5";
  return "\u2601\uFE0F";
}

export function statusLabel(
  status: string,
  t: (key: string) => string,
): string {
  switch (status) {
    case "too-low":
      return t("status.tooLow");
    case "runnable":
      return t("status.runnable");
    case "ideal":
      return t("status.ideal");
    case "too-high":
      return t("status.tooHigh");
    default:
      return "";
  }
}

/**
 * Minimum consecutive hours of forecast flow that must match a condition
 * (in-range or out-of-range) before we treat it as the river genuinely
 * entering/leaving the good range. Prevents single-hour spikes or dips
 * from flipping the status pill.
 */
const MIN_CONSECUTIVE_HOURS = 3;

/**
 * Scan hourly forecast points for the first future run of ≥ MIN_CONSECUTIVE_HOURS
 * consecutive points matching `predicate`. Returns hoursAhead of the run's first
 * point (rounded), or null if no such run exists within the provided points.
 *
 * `correction` (if provided and active) adjusts each future forecast value
 * before status classification, with the adjustment fading over time.
 */
function findFirstSustainedPoint(
  points: ForecastPoint[],
  nowTs: number,
  paddling: PaddlingLevels,
  predicate: (status: ReturnType<typeof getPaddlingStatus>["status"]) => boolean,
  correction: ForecastCorrection = NO_CORRECTION,
): { hoursAhead: number } | null {
  let runStart: number | null = null;
  let runLen = 0;
  for (const p of points) {
    if (p.ts <= nowTs || p.cehqForecast == null) continue;
    const hoursAhead = (p.ts - nowTs) / (60 * 60 * 1000);
    const correctedFlow = applyForecastCorrection(p.cehqForecast, hoursAhead, correction);
    const { status } = getPaddlingStatus(correctedFlow, paddling);
    if (predicate(status)) {
      if (runStart == null) runStart = p.ts;
      runLen += 1;
      if (runLen >= MIN_CONSECUTIVE_HOURS) {
        return {
          hoursAhead: Math.round((runStart - nowTs) / (1000 * 60 * 60)),
        };
      }
    } else {
      runStart = null;
      runLen = 0;
    }
  }
  return null;
}

export function findFirstSustainedGoodPoint(
  points: ForecastPoint[],
  nowTs: number,
  paddling: PaddlingLevels,
  correction: ForecastCorrection = NO_CORRECTION,
): { hoursAhead: number } | null {
  return findFirstSustainedPoint(points, nowTs, paddling, (s) => isGoodRange(s), correction);
}

export function findFirstSustainedBadPoint(
  points: ForecastPoint[],
  nowTs: number,
  paddling: PaddlingLevels,
  correction: ForecastCorrection = NO_CORRECTION,
): { hoursAhead: number } | null {
  return findFirstSustainedPoint(points, nowTs, paddling, (s) => !isGoodRange(s), correction);
}

export function computeCardStatusInfo(
  card: StationCard,
): { key: string; param?: number } | null {
  const paddling = card.paddling;
  if (
    !paddling ||
    (paddling.min == null && paddling.ideal == null && paddling.max == null)
  ) {
    return null;
  }
  if (card.status === "unknown") return null;

  if (card.status === "ideal") return { key: "detail.ideal" };
  if (card.status === "runnable") return { key: "detail.goodToGo" };

  const correction = buildForecastCorrection(card.sparkData, card.nowTs);

  if (card.status === "too-low" || card.status === "too-high") {
    const hit = findFirstSustainedGoodPoint(card.sparkData, card.nowTs, paddling, correction);
    if (hit) {
      if (hit.hoursAhead <= 24) {
        return { key: "detail.runnableInHours", param: hit.hoursAhead };
      }
      return {
        key: "detail.runnableInDays",
        param: Math.ceil(hit.hoursAhead / 24),
      };
    }
    return {
      key: card.status === "too-low" ? "detail.tooLow" : "detail.tooHigh",
    };
  }

  if (card.isGoodRange) {
    const hit = findFirstSustainedBadPoint(card.sparkData, card.nowTs, paddling, correction);
    if (hit && hit.hoursAhead <= 48) {
      return { key: "detail.droppingOutHours", param: hit.hoursAhead };
    }
  }

  return null;
}

export const STATUS_PILL_COLORS: Record<string, { bg: string; text: string }> =
  {
    "detail.ideal": { bg: "rgba(16,185,129,0.12)", text: "#059669" },
    "detail.goodToGo": { bg: "rgba(59,130,246,0.12)", text: "#2563eb" },
    "detail.tooLow": { bg: "rgba(113,113,122,0.12)", text: "#71717a" },
    "detail.tooHigh": { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },
    "detail.runnableInHours": {
      bg: "rgba(245,158,11,0.12)",
      text: "#d97706",
    },
    "detail.runnableInDays": {
      bg: "rgba(245,158,11,0.12)",
      text: "#d97706",
    },
    "detail.droppingOutHours": {
      bg: "rgba(249,115,22,0.12)",
      text: "#ea580c",
    },
  };

export function statusPriority(s: string): number {
  switch (s) {
    case "ideal":
      return 0;
    case "runnable":
      return 1;
    case "too-low":
      return 2;
    case "too-high":
      return 3;
    default:
      return 4;
  }
}

/**
 * Compute a sort key for the "by ideal level" sort mode.
 *
 * Group 1: Rivers currently paddleable (ideal/runnable) — ordered by
 *          absolute distance from the ideal paddling level (closest first).
 * Group 2: Rivers not currently paddleable but forecast to become good —
 *          ordered by time until they become good (soonest first).
 * Group 3: All other rivers (no forecast window, unknown, missing levels).
 */
export function idealSortKey(card: StationCard): {
  group: number;
  score: number;
} {
  const paddling = card.paddling;
  const lastFlow = card.lastFlow;

  // Group 1: currently paddleable — distance from ideal
  if (
    (card.status === "ideal" || card.status === "runnable") &&
    paddling &&
    paddling.ideal != null &&
    lastFlow != null
  ) {
    return { group: 1, score: Math.abs(lastFlow - paddling.ideal) };
  }

  // Group 2: forecast will become good — soonest first
  if (paddling) {
    const now = card.nowTs;
    const correction = buildForecastCorrection(card.sparkData, now);
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const hoursAhead = (point.ts - now) / (60 * 60 * 1000);
      const corrected = applyForecastCorrection(flow, hoursAhead, correction);
      const { status } = getPaddlingStatus(corrected, paddling);
      if (isGoodRange(status)) {
        return { group: 2, score: point.ts - now };
      }
    }
  }

  // Group 3: no imminent window
  return { group: 3, score: statusPriority(card.status) };
}

/** Normalize a string for accent-insensitive search */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Time-travel projection helpers
// ---------------------------------------------------------------------------

/**
 * Linear-interpolate a forecast flow at `ts` from an hourly `sparkData` array.
 * Applies the same bias correction the charts use so projected flows match the
 * hourly chart view. Returns null when no bracketing forecast points exist.
 */
export function getFlowAtTime(
  sparkData: StationCard["sparkData"],
  ts: number,
  nowTs: number,
  correction: ForecastCorrection = NO_CORRECTION,
): number | null {
  const forecastPoints = sparkData.filter((p) => p.cehqForecast != null);
  if (forecastPoints.length === 0) return null;

  // Clamp to first/last available forecast point
  if (ts <= forecastPoints[0].ts) {
    const p = forecastPoints[0];
    const hoursAhead = (p.ts - nowTs) / (60 * 60 * 1000);
    return applyForecastCorrection(p.cehqForecast as number, hoursAhead, correction);
  }
  const last = forecastPoints[forecastPoints.length - 1];
  if (ts >= last.ts) {
    const hoursAhead = (last.ts - nowTs) / (60 * 60 * 1000);
    return applyForecastCorrection(last.cehqForecast as number, hoursAhead, correction);
  }

  // Find the two bracketing points and linearly interpolate
  for (let i = 0; i < forecastPoints.length - 1; i++) {
    const a = forecastPoints[i];
    const b = forecastPoints[i + 1];
    if (ts >= a.ts && ts <= b.ts) {
      const span = b.ts - a.ts;
      const t = span > 0 ? (ts - a.ts) / span : 0;
      const aFlow = applyForecastCorrection(
        a.cehqForecast as number,
        (a.ts - nowTs) / (60 * 60 * 1000),
        correction,
      );
      const bFlow = applyForecastCorrection(
        b.cehqForecast as number,
        (b.ts - nowTs) / (60 * 60 * 1000),
        correction,
      );
      return aFlow + (bFlow - aFlow) * t;
    }
  }

  return null;
}

export interface DisplayState {
  flow: number | null;
  status: PaddlingStatus;
  position: number;
  color: string;
  isGoodRange: boolean;
}

/**
 * Derive the visual state a card should render at the given timestamp.
 * Returns null when projection is not possible (no forecast data).
 */
export function computeDisplayState(
  card: StationCard,
  ts: number,
): DisplayState | null {
  const correction = buildForecastCorrection(card.sparkData, card.nowTs);
  const flow = getFlowAtTime(card.sparkData, ts, card.nowTs, correction);
  if (flow == null) return null;

  const paddling: PaddlingLevels | undefined = card.paddling ?? undefined;
  const { status, position } = getPaddlingStatus(flow, paddling);
  const color =
    status === "too-low"
      ? "#a1a1aa"
      : status === "too-high"
        ? "#D32F2F"
        : status === "unknown"
          ? "#a1a1aa"
          : statusColor(position);

  return {
    flow,
    status,
    position,
    color,
    isGoodRange: isGoodRange(status),
  };
}

/**
 * Maximum forecast timestamp across all cards (i.e. slider's upper bound).
 * Returns null when no cards have any forecast points.
 */
export function getForecastEndTs(cards: StationCard[]): number | null {
  let maxTs: number | null = null;
  for (const card of cards) {
    for (const p of card.sparkData) {
      if (p.cehqForecast == null) continue;
      if (maxTs == null || p.ts > maxTs) maxTs = p.ts;
    }
  }
  return maxTs;
}
