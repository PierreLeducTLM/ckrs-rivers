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
  // Blue-to-red via violet: min(0) → ideal(0.5) → max(1)
  const stops: [number, number, number, number][] = [
    [0.0, 106, 159, 216], // #6A9FD8 — at min
    [0.5, 59, 130, 246],  // #3B82F6 — ideal
    [0.7, 58, 79, 191],   // #3A4FBF — above ideal (indigo)
    [0.85, 92, 61, 175],  // #5C3DAF — approaching max (violet)
    [1.0, 139, 46, 144],  // #8B2E90 — at max (magenta)
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
  return `rgb(139,46,144)`;
}

/** Check if a status is considered "good" for paddling */
export function isGoodRange(status: PaddlingStatus): boolean {
  return status === "ideal" || status === "runnable";
}
