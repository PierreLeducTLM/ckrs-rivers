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

  // Compute bar position (0 at min, 0.5 at ideal, 1 at max).
  let position = 0.5;
  if (min != null && ideal != null && flow <= ideal) {
    const range = ideal - min;
    position = range > 0 ? ((flow - min) / range) * 0.5 : 0.25;
  } else if (ideal != null && max != null && flow >= ideal) {
    const range = max - ideal;
    position = range > 0 ? 0.5 + ((flow - ideal) / range) * 0.5 : 0.75;
  } else if (min != null && max != null) {
    position = (flow - min) / (max - min);
  }

  // Classify: "ideal" when flow is within ±20% of the ideal level,
  // otherwise "runnable" (good to go) while still within [min, max].
  if (ideal != null && Math.abs(flow - ideal) <= Math.abs(ideal) * 0.2) {
    return { status: "ideal", position };
  }
  return { status: "runnable", position };
}

export function statusColor(position: number): string {
  if (position < 0) return "";
  const p = Math.max(0, Math.min(1, position));
  // Green up to 70%, yellow warning zone at 70–80%, red transition 80–100%
  const stops: [number, number, number, number][] = [
    [0.0, 74, 222, 128],   // #4ADE80 — at min (green-400)
    [0.5, 22, 163, 74],    // #16A34A — ideal (green-600)
    [0.7, 22, 163, 74],    // #16A34A — still green at 70% (yellow zone start)
    [0.8, 250, 204, 21],   // #FACC15 — yellow (yellow-400) where red transition begins
    [1.0, 211, 47, 47],    // #D32F2F — red at max
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p <= stops[i + 1][0]) {
      const t = (p - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const r = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * t);
      const g = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * t);
      const b = Math.round(stops[i][3] + (stops[i + 1][3] - stops[i][3]) * t);
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(211,47,47)`;
}

/** Check if a status is considered "good" for paddling */
export function isGoodRange(status: PaddlingStatus): boolean {
  return status === "ideal" || status === "runnable";
}
