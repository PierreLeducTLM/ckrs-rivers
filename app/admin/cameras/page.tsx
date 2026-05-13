"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LocalCamera {
  id: string;
  spypoint_camera_id: string;
  name: string;
  station_id: string | null;
  active: boolean;
  last_synced_photo_date: string | null;
  station_name: string | null;
  latest_reading_value: number | null;
  latest_reading_confidence: string | null;
  latest_captured_at: string | null;
}

interface UnassignedCamera {
  id: string;
  name: string;
  model: string | null;
  isOnline: boolean;
}

interface ApiResponse {
  local: LocalCamera[];
  unassigned: UnassignedCamera[];
  remoteError: string | null;
}

export default function CamerasAdminPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const res = await fetch("/api/admin/cameras", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to load cameras");
        return;
      }
      setData((await res.json()) as ApiResponse);
    } catch {
      setError("Network error");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function importCamera(spypointCameraId: string) {
    setImporting(spypointCameraId);
    try {
      const res = await fetch("/api/admin/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spypointCameraId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to import camera");
        return;
      }
      await refresh();
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cameras</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Spypoint field cameras. Each can be assigned to a river to provide a visual water-level
          reading.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        {data === null && (
          <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        )}

        {data && (
          <>
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Configured ({data.local.length})
              </h2>
              {data.local.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No cameras imported yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.local.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {c.name}
                          </h3>
                          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                            {c.spypoint_camera_id}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            River:{" "}
                            {c.station_name ? (
                              <Link
                                href={`/rivers/${c.station_id}`}
                                className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                              >
                                {c.station_name}
                              </Link>
                            ) : (
                              <span className="italic">unassigned</span>
                            )}
                          </p>
                          {c.latest_captured_at && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Latest:{" "}
                              {c.latest_reading_value != null
                                ? c.latest_reading_value.toFixed(2)
                                : "—"}{" "}
                              <span className="text-zinc-400">
                                ({c.latest_reading_confidence ?? "—"})
                              </span>{" "}
                              · {new Date(c.latest_captured_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/admin/cameras/${c.id}`}
                          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Edit
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Available on Spypoint ({data.unassigned.length})
              </h2>
              {data.remoteError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Spypoint API: {data.remoteError}
                </p>
              )}
              {!data.remoteError && data.unassigned.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500">All Spypoint cameras are already imported.</p>
              )}
              {data.unassigned.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {data.unassigned.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                        <p className="font-mono text-[11px] text-zinc-500">
                          {c.id} {c.model && `· ${c.model}`} {c.isOnline ? "· online" : "· offline"}
                        </p>
                      </div>
                      <button
                        onClick={() => importCamera(c.id)}
                        disabled={importing === c.id}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {importing === c.id ? "Importing..." : "Import"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
