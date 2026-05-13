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

export default async function PredictorCard({ predictorKey }: Props) {
  const predictor = getPredictor(predictorKey);
  if (!predictor) return null;

  let series: FlowReading[];
  let fetchError: string | null = null;
  let lastFetchedTs: string | null = null;
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
    lastFetchedTs = series.length > 0 ? series[series.length - 1].timestamp : null;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    series = [];
  }

  const result = predictor.predict(series);
  // eslint-disable-next-line react-hooks/purity -- server component runs per request
  const now = Date.now();
  const windowMs = 3 * 60 * 60 * 1000;
  // The predictor anchors its slope window on the latest sample, not on
  // wall-clock `now`. Mirror that here so the debug grid shows the same
  // count the predictor used. `samplesNearNow` is also useful — it tells
  // you whether CEHQ timestamps look fresh against real time.
  const anchorMs = lastFetchedTs ? Date.parse(lastFetchedTs) : null;
  const samplesInAnchorWindow = anchorMs == null
    ? 0
    : series.filter(
        (r) => Date.parse(r.timestamp) >= anchorMs - windowMs && Date.parse(r.timestamp) <= anchorMs,
      ).length;
  const samplesNearNow = series.filter(
    (r) => Date.parse(r.timestamp) >= now - windowMs,
  ).length;
  const stalenessHours = anchorMs == null ? null : (now - anchorMs) / 3_600_000;

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
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-zinc-800 dark:text-zinc-200">
            <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
              {result.refusal.reason}
            </span>{" "}
            — {result.refusal.detail}
          </p>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            <dt>reference station</dt>
            <dd>{predictor.referenceStationId}</dd>
            <dt>fetch</dt>
            <dd>{fetchError ? `error: ${fetchError}` : `ok — ${series.length} readings`}</dd>
            <dt>latest reading</dt>
            <dd>{lastFetchedTs ?? "—"}</dd>
            <dt>staleness vs now</dt>
            <dd>
              {stalenessHours == null
                ? "—"
                : `${stalenessHours.toFixed(1)} h${stalenessHours < 0 ? " (future-dated — likely timezone bug)" : ""}`}
            </dd>
            <dt>samples in 3 h ending at latest</dt>
            <dd>{samplesInAnchorWindow} (need ≥ 4)</dd>
            <dt>samples in last 3 h vs now</dt>
            <dd>{samplesNearNow}</dd>
            <dt>page rendered at</dt>
            <dd>{new Date(now).toISOString()}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
