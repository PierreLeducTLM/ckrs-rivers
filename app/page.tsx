import Link from "next/link";
import { getStations, getRecentReadings } from "@/lib/data/rivers";

export default async function Home() {
  const stations = getStations();

  const stationsWithReadings = await Promise.all(
    stations.map(async (station) => {
      const readings = getRecentReadings(station.id, 1);
      const lastReading = readings.at(-1);
      return { station, lastReading };
    }),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/10 px-6 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">WaterFlow</h1>
        <p className="mt-2 text-lg text-foreground/60">
          River Flow Predictions
        </p>
      </header>

      {/* River cards grid */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stationsWithReadings.map(({ station, lastReading }) => (
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

              {lastReading?.flow !== undefined ? (
                <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
                  <p className="text-2xl font-bold tabular-nums">
                    {Number(lastReading.flow).toFixed(2)}{" "}
                    <span className="text-sm font-normal text-foreground/60">
                      m&sup3;/s
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-foreground/50">
                    {new Date(lastReading.timestamp).toLocaleDateString(
                      "en-GB",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
                  <p className="text-sm text-foreground/40">
                    No recent readings
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>

        {stations.length === 0 && (
          <p className="py-20 text-center text-foreground/40">
            No stations found. Add station data to get started.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/10 px-6 py-6 text-center text-sm text-foreground/40">
        Powered by Open-Meteo weather data
      </footer>
    </div>
  );
}
