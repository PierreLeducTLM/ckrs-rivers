import type { PaddlingLevels } from "@/lib/data/rivers";
import type { PaddlingStatus } from "@/lib/domain/notification";

/**
 * Compute paddling status and position from flow and thresholds.
 *
 * Extracted from app/page.tsx so it can be shared between the homepage
 * and the notification evaluation engine.
 */
export function getPaddlingStatus(
  flow: number | null | undefined,
  paddling: PaddlingLevels | undefined,
): { status: PaddlingStatus; position: number } {
  if (flow == null || !paddling) return { status: "unknown", position: -1 };
  const { min, ideal, max } = paddling;
  if (min == null && ideal == null && max == null) return { status: "unknown", position: -1 };

  if (min != null && flow < min) return { status: "too-low", position: 0 };
  if (max != null && flow > max) return { status: "too-high", position: 1 };

  if (min != null && ideal != null && flow <= ideal) {
    const range = ideal - min;
    const pos = range > 0 ? ((flow - min) / range) * 0.5 : 0.25;
    return { status: "runnable", position: pos };
  }
  if (ideal != null && max != null && flow >= ideal) {
    const range = max - ideal;
    const pos = range > 0 ? 0.5 + ((flow - ideal) / range) * 0.5 : 0.75;
    return { status: "ideal", position: pos };
  }
  if (min != null && max != null) {
    const pos = (flow - min) / (max - min);
    return { status: "runnable", position: pos };
  }

  return { status: "runnable", position: 0.5 };
}

export function statusColor(position: number): string {
  if (position < 0) return "";
  const p = Math.max(0, Math.min(1, position));
  if (p <= 0.5) {
    const t = p / 0.5;
    const r = Math.round(234 + (34 - 234) * t);
    const g = Math.round(179 + (197 - 179) * t);
    const b = Math.round(8 + (94 - 8) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (p - 0.5) / 0.5;
  const r = Math.round(34 + (239 - 34) * t);
  const g = Math.round(197 + (68 - 197) * t);
  const b = Math.round(94 + (68 - 94) * t);
  return `rgb(${r},${g},${b})`;
}

/** Check if a status is considered "good" for paddling */
export function isGoodRange(status: PaddlingStatus): boolean {
  return status === "ideal" || status === "runnable";
}
