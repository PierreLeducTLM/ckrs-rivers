/**
 * Server-side predictor card. Looks up the predictor assigned to the
 * station, fetches the reference station's recent flow via CEHQ, and
 * renders the predicted local reading + uncertainty band.
 *
 * Returns null if no predictor is assigned or the lookup fails — the
 * page caller should treat that as "nothing to show" rather than an
 * error state.
 */
import type { FlowReading } from "@/lib/domain/flow-reading";
import { fetchRealtimeData } from "@/lib/realtime/cehq-client";
import { getPredictor } from "@/lib/prediction/registry";

interface Props {
  predictorKey: string;
}

const REFUSAL_LABELS: Record<string, string> = {
  "no-current-flow": "No recent reference flow available.",
  "flow-out-of-range": "Reference flow is outside the predictor's calibrated range.",
  "insufficient-slope-samples": "Not enough recent reference samples to estimate the trend.",
};

export default async function PredictorCard({ predictorKey }: Props) {
  const predictor = getPredictor(predictorKey);
  if (!predictor) return null;

  let series: FlowReading[];
  try {
    const realtime = await fetchRealtimeData(predictor.referenceStationId);
    series = realtime.readings
      .filter((r) => r.flow != null)
      .map((r) => ({
        stationId: predictor.referenceStationId,
        timestamp: r.timestamp,
        flow: r.flow as FlowReading["flow"],
        source: "gauge",
        quality: "provisional",
      }));
  } catch {
    return null;
  }

  const result = predictor.predict(series);

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Predicted gauge level
        </h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          via {predictor.label}
        </span>
      </div>

      {result.ok ? (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {result.output.displayValue.toFixed(2)}
            </span>
            <span className="text-lg text-zinc-500 dark:text-zinc-400">
              {result.output.unit}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              ± {result.output.confidenceBand.toFixed(2)} {result.output.unit}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {result.output.regime && (
              <span>
                regime: <span className="font-medium text-zinc-700 dark:text-zinc-300">{result.output.regime}</span>
              </span>
            )}
            <span>
              ref Q: <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{result.output.referenceValue.toFixed(1)} m³/s</span>
            </span>
            <span className="ml-auto">
              {result.output.asOf.toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {REFUSAL_LABELS[result.refusal.reason] ?? result.refusal.detail}
        </p>
      )}
    </section>
  );
}
