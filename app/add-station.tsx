"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("./location-picker"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
  ),
});

type Mode = "cehq" | "custom";

export default function AddStation() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("cehq");
  const [stationId, setStationId] = useState("");
  const [riverName, setRiverName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleMapClick = useCallback((newLat: number, newLon: number) => {
    setLat(newLat.toFixed(5));
    setLon(newLon.toFixed(5));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const body =
        mode === "cehq"
          ? {
              stationId: stationId.trim(),
              name: riverName.trim() || undefined,
            }
          : {
              name: riverName.trim(),
              lat: parseFloat(lat),
              lon: parseFloat(lon),
            };

      const res = await fetch("/api/stations/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        success?: boolean;
        station?: { name: string };
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      setSuccess(`Added: ${data.station?.name ?? riverName}`);
      setStationId("");
      setRiverName("");
      setLat("");
      setLon("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isCehqValid = stationId.trim().length === 6;
  const isCustomValid =
    riverName.trim().length > 0 &&
    lat.trim().length > 0 &&
    lon.trim().length > 0 &&
    !isNaN(parseFloat(lat)) &&
    !isNaN(parseFloat(lon));

  const canSubmit = mode === "cehq" ? isCehqValid : isCustomValid;

  return (
    <div className="mt-8 rounded-xl border border-dashed border-foreground/20 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/50">
        Add River
      </h3>

      {/* Mode toggle */}
      <div className="mt-3 inline-flex rounded-lg border border-foreground/15 p-0.5">
        <button
          type="button"
          onClick={() => { setMode("cehq"); setError(null); setSuccess(null); }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "cehq"
              ? "bg-foreground/10 text-foreground"
              : "text-foreground/50 hover:text-foreground/70"
          }`}
        >
          CEHQ Station
        </button>
        <button
          type="button"
          onClick={() => { setMode("custom"); setError(null); setSuccess(null); }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "custom"
              ? "bg-foreground/10 text-foreground"
              : "text-foreground/50 hover:text-foreground/70"
          }`}
        >
          Custom River
        </button>
      </div>

      <p className="mt-2 text-xs text-foreground/40">
        {mode === "cehq"
          ? "Enter a CEHQ station ID to add it to your dashboard."
          : "Add a river without a CEHQ station. Flow data will not be available."}
      </p>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        {mode === "cehq" ? (
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="e.g. 061004"
              maxLength={6}
              pattern="\d{6}"
              className="w-32 rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-sm font-mono placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
            <input
              type="text"
              value={riverName}
              onChange={(e) => setRiverName(e.target.value)}
              placeholder="River name (optional)"
              className="w-48 rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={riverName}
                onChange={(e) => setRiverName(e.target.value)}
                placeholder="River name"
                className="w-56 rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none"
                disabled={loading}
              />
              <input
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                className="w-28 rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-sm font-mono placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none"
                disabled={loading}
              />
              <input
                type="text"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="Longitude"
                className="w-28 rounded-lg border border-foreground/15 bg-transparent px-3 py-1.5 text-sm font-mono placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Adding..." : "Add"}
              </button>
            </div>
            <LocationPicker
              lat={lat ? parseFloat(lat) : null}
              lon={lon ? parseFloat(lon) : null}
              onClick={handleMapClick}
            />
          </>
        )}
      </form>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-500">{success}</p>}
    </div>
  );
}
