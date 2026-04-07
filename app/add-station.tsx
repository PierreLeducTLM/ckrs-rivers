"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddStation() {
  const router = useRouter();
  const [stationId, setStationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/stations/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId: stationId.trim() }),
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

      setSuccess(`Added: ${data.station?.name ?? stationId}`);
      setStationId("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-dashed border-foreground/20 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/50">
        Add Station
      </h3>
      <p className="mt-1 text-xs text-foreground/40">
        Enter a CEHQ station ID to add it to your dashboard.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
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
        <button
          type="submit"
          disabled={loading || stationId.trim().length !== 6}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-500">{success}</p>}
    </div>
  );
}
