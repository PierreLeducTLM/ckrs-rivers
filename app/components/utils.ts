import { getPaddlingStatus, isGoodRange } from "@/lib/notifications/paddling-status";
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

  if (card.status === "too-low" || card.status === "too-high") {
    const now = card.nowTs;
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const { status } = getPaddlingStatus(flow, paddling);
      if (isGoodRange(status)) {
        const hoursAhead = Math.round((point.ts - now) / (1000 * 60 * 60));
        if (hoursAhead <= 24) {
          return { key: "detail.runnableInHours", param: hoursAhead };
        }
        return {
          key: "detail.runnableInDays",
          param: Math.ceil(hoursAhead / 24),
        };
      }
    }
    return {
      key: card.status === "too-low" ? "detail.tooLow" : "detail.tooHigh",
    };
  }

  if (card.isGoodRange) {
    const now = card.nowTs;
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const { status } = getPaddlingStatus(flow, paddling);
      if (!isGoodRange(status)) {
        const hoursAhead = Math.round((point.ts - now) / (1000 * 60 * 60));
        if (hoursAhead <= 48) {
          return { key: "detail.droppingOutHours", param: hoursAhead };
        }
        break;
      }
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

/** Normalize a string for accent-insensitive search */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
