import Link from "next/link";
import { getStations } from "@/lib/data/rivers";
import { sql } from "@/lib/db/client";
import AddStation from "./add-station";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function Home() {
  const stations = await getStations();

  // Single query: cached forecast data for all stations
  const rows = await sql(
    `SELECT
       station_id,
       generated_at::text as forecast_at,
       (forecast_json->'lastFlow'->>'flow')::double precision as last_flow,
       forecast_json->'lastFlow'->>'date' as last_date
     FROM forecast_cache`,
  ) as Array<{
    station_id: string;
    forecast_at: string | null;
    last_flow: number | null;
    last_date: string | null;
  }>;
  const dataMap = new Map(rows.map((r) => [r.station_id, r]));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/10 px-6 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">WaterFlow</h1>
        <p className="mt-2 text-lg text-foreground/60">
          Quebec River Flow Monitoring
        </p>
      </header>

      {/* River cards grid */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stations.map((station) => {
            const data = dataMap.get(station.id);

            return (
              <Link
                key={station.id}
                href={`/rivers/${station.id}`}
                className="group rounded-xl border border-foreground/10 bg-background p-6 shadow transition-shadow hover:shadow-lg"
              >
                <h2 className="text-xl font-semibold group-hover:underline">
                  {station.name}
                </h2>

                <p className="mt-1 text-sm text-foreground/50">
                  Station {station.id}
                </p>

                {station.catchmentArea !== undefined && (
                  <p className="mt-2 text-sm text-foreground/70">
                    Catchment: {Number(station.catchmentArea).toLocaleString()}{" "}
                    km&sup2;
                  </p>
                )}

                {data?.last_flow != null ? (
                  <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
                    <p className="text-2xl font-bold tabular-nums">
                      {data.last_flow.toFixed(1)}{" "}
                      <span className="text-sm font-normal text-foreground/60">
                        m&sup3;/s
                      </span>
                    </p>
                    {data.forecast_at && (
                      <p className="mt-1 text-xs text-foreground/50">
                        Updated {timeAgo(data.forecast_at)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
                    <p className="text-sm text-foreground/40">
                      Press Refresh to load data
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        <AddStation />

        {stations.length === 0 && (
          <p className="py-20 text-center text-foreground/40">
            No stations found. Add a CEHQ station to get started.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/10 px-6 py-6 text-center text-sm text-foreground/40">
        Data from CEHQ &amp; Open-Meteo
      </footer>
    </div>
  );
}
