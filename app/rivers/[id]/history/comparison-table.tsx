"use client";

interface ComparisonRow {
  date: string;
  label: string;
  observed: number | null;
  predicted: number | null;
  predictedLow: number | null;
  predictedHigh: number | null;
  isPast: boolean;
}

interface ComparisonTableProps {
  pastDays: ComparisonRow[];
  futureDays: ComparisonRow[];
}

function ErrorBadge({ pctError }: { pctError: number }) {
  const abs = Math.abs(pctError);
  const color =
    abs < 10
      ? "bg-emerald-500/10 text-emerald-500"
      : abs < 25
        ? "bg-amber-500/10 text-amber-500"
        : "bg-red-500/10 text-red-500";

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {pctError > 0 ? "+" : ""}
      {pctError.toFixed(1)}%
    </span>
  );
}

function DiffValue({ observed, predicted }: { observed: number; predicted: number }) {
  const diff = predicted - observed;
  const pct = (diff / observed) * 100;
  const sign = diff >= 0 ? "+" : "";

  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
        {sign}{diff.toFixed(1)}
      </span>
      <ErrorBadge pctError={pct} />
    </div>
  );
}

export default function ComparisonTable({
  pastDays,
  futureDays,
}: ComparisonTableProps) {
  // Compute summary stats for past days
  const withBoth = pastDays.filter(
    (d) => d.observed !== null && d.predicted !== null,
  );
  const mape =
    withBoth.length > 0
      ? (withBoth.reduce(
          (sum, d) =>
            sum + Math.abs(d.observed! - d.predicted!) / d.observed!,
          0,
        ) /
          withBoth.length) *
        100
      : null;
  const meanBias =
    withBoth.length > 0
      ? withBoth.reduce((sum, d) => sum + (d.predicted! - d.observed!), 0) /
        withBoth.length
      : null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Past 7 days */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Past 7 Days &mdash; Observed vs Model
          </h3>
          {mape !== null && (
            <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                MAPE:{" "}
                <span
                  className={`font-semibold ${mape < 10 ? "text-emerald-500" : mape < 25 ? "text-amber-500" : "text-red-500"}`}
                >
                  {mape.toFixed(1)}%
                </span>
              </span>
              {meanBias !== null && (
                <span>
                  Bias:{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {meanBias >= 0 ? "+" : ""}
                    {meanBias.toFixed(2)} m&sup3;/s
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Observed</th>
                <th className="px-4 py-2 text-right">Model</th>
                <th className="px-4 py-2 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pastDays.map((d) => (
                <tr
                  key={d.date}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {d.label}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-blue-600">
                    {d.observed !== null ? `${d.observed.toFixed(1)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-orange-500">
                    {d.predicted !== null ? `${d.predicted.toFixed(1)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {d.observed !== null && d.predicted !== null ? (
                      <DiffValue
                        observed={d.observed}
                        predicted={d.predicted}
                      />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {pastDays.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-4 text-center text-zinc-400"
                  >
                    No data for past 7 days
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Next 7 days */}
      <div>
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Next 7 Days &mdash; Forecast
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Predicted</th>
                <th className="px-4 py-2 text-right">Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {futureDays.map((d) => (
                <tr
                  key={d.date}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {d.label}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums font-semibold text-orange-500">
                    {d.predicted !== null
                      ? `${d.predicted.toFixed(1)}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                    {d.predictedLow !== null && d.predictedHigh !== null
                      ? `${d.predictedLow.toFixed(1)} – ${d.predictedHigh.toFixed(1)}`
                      : "—"}
                  </td>
                </tr>
              ))}
              {futureDays.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-4 text-center text-zinc-400"
                  >
                    Forecast not available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
