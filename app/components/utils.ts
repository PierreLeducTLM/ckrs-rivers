import { getPaddlingStatus, isGoodRange } from "@/lib/notifications/paddling-status";
import type { PaddlingLevels } from "@/lib/data/rivers";
import type { StationCard } from "./types";

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
 * Window (in hours) used to compute the CEHQ forecast bias from the most
 * recent overlap between observed and forecast. Shorter = more reactive,
 * longer = more robust.
 */
const BIAS_LOOKBACK_HOURS = 6;

/**
 * Minimum number of overlap samples required before we trust the bias.
 * Below this, we fall back to zero (no correction).
 */
const BIAS_MIN_SAMPLES = 2;

type ForecastPoint = {
  ts: number;
  observed: number | null;
  cehqForecast: number | null;
};

/**
 * Compute the signed bias (cehqForecast − observed) averaged over the last
 * BIAS_LOOKBACK_HOURS where both values are present. Returns 0 when there
 * isn't enough overlap, and clamps the result to ±50% of the recent
 * observed median as a safety rail against anomalous readings.
 *
 * Positive bias = CEHQ over-predicts vs. reality → subtract to correct.
 */
export function computeForecastBias(
  points: ForecastPoint[],
  nowTs: number,
): number {
  const cutoff = nowTs - BIAS_LOOKBACK_HOURS * 60 * 60 * 1000;
  const diffs: number[] = [];
  const recentObs: number[] = [];
  for (const p of points) {
    if (p.ts > nowTs || p.ts < cutoff) continue;
    if (p.observed == null || p.cehqForecast == null) continue;
    diffs.push(p.cehqForecast - p.observed);
    recentObs.push(p.observed);
  }
  if (diffs.length < BIAS_MIN_SAMPLES) return 0;
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sorted = [...recentObs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cap = Math.abs(median) * 0.5;
  if (cap === 0) return 0;
  return Math.max(-cap, Math.min(cap, mean));
}

/**
 * Scan hourly forecast points for the first future run of ≥ MIN_CONSECUTIVE_HOURS
 * consecutive points matching `predicate`. Returns hoursAhead of the run's first
 * point (rounded), or null if no such run exists within the provided points.
 *
 * `bias` is subtracted from `cehqForecast` before status classification,
 * so a positive bias (CEHQ over-predicting) pushes runnable-in estimates later.
 */
function findFirstSustainedPoint(
  points: ForecastPoint[],
  nowTs: number,
  paddling: PaddlingLevels,
  predicate: (status: ReturnType<typeof getPaddlingStatus>["status"]) => boolean,
  bias: number = 0,
): { hoursAhead: number } | null {
  let runStart: number | null = null;
  let runLen = 0;
  for (const p of points) {
    if (p.ts <= nowTs || p.cehqForecast == null) continue;
    const correctedFlow = p.cehqForecast - bias;
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
  bias: number = 0,
): { hoursAhead: number } | null {
  return findFirstSustainedPoint(points, nowTs, paddling, (s) => isGoodRange(s), bias);
}

export function findFirstSustainedBadPoint(
  points: ForecastPoint[],
  nowTs: number,
  paddling: PaddlingLevels,
  bias: number = 0,
): { hoursAhead: number } | null {
  return findFirstSustainedPoint(points, nowTs, paddling, (s) => !isGoodRange(s), bias);
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

  const bias = computeForecastBias(card.sparkData, card.nowTs);

  if (card.status === "too-low" || card.status === "too-high") {
    const hit = findFirstSustainedGoodPoint(card.sparkData, card.nowTs, paddling, bias);
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
    const hit = findFirstSustainedBadPoint(card.sparkData, card.nowTs, paddling, bias);
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
    const bias = computeForecastBias(card.sparkData, now);
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const { status } = getPaddlingStatus(flow - bias, paddling);
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
