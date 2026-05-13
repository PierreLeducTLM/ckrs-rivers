export type Runnability = "no-go" | "marginal" | "runnable" | "high" | "unknown";

export interface CameraThresholds {
  paddlingMinReading: number | null;
  paddlingIdealReading: number | null;
  paddlingMaxReading: number | null;
}

export function runnabilityFor(
  reading: number | null,
  thresholds: CameraThresholds,
): Runnability {
  if (reading == null) return "unknown";
  const { paddlingMinReading: min, paddlingIdealReading: ideal, paddlingMaxReading: max } = thresholds;
  if (min == null || ideal == null || max == null) return "unknown";
  if (reading < min) return "no-go";
  if (reading > max) return "high";
  if (reading < ideal) return "marginal";
  return "runnable";
}

export function runnabilityLabel(status: Runnability): string {
  switch (status) {
    case "runnable": return "Runnable";
    case "marginal": return "Marginal";
    case "no-go": return "Too low";
    case "high": return "Too high";
    case "unknown": return "Unknown";
  }
}

export const runnabilityColors: Record<Runnability, { bg: string; text: string; dot: string }> = {
  runnable: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
  marginal: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  "no-go": { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-300", dot: "bg-zinc-500" },
  high: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  unknown: { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400", dot: "bg-zinc-400" },
};
