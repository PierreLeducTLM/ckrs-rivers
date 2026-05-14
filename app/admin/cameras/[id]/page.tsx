"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { runnabilityColors, runnabilityFor, runnabilityLabel } from "@/lib/skypoint/runnability";

interface Camera {
  id: string;
  provider: string;
  provider_camera_id: string | null;
  provider_account_id: string | null;
  name: string;
  station_id: string | null;
  scale_description: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_unit: string | null;
  paddling_min_reading: number | null;
  paddling_ideal_reading: number | null;
  paddling_max_reading: number | null;
  active: boolean;
  last_synced_photo_date: string | null;
}

interface CameraImage {
  id: string;
  captured_at: string;
  blob_url: string;
  reading_value: number | null;
  reading_confidence: string | null;
  reading_source: string;
  reading_notes: string | null;
}

interface RiverOption {
  id: string;
  name: string;
}

export default function CameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [camera, setCamera] = useState<Camera | null>(null);
  const [images, setImages] = useState<CameraImage[]>([]);
  const [rivers, setRivers] = useState<RiverOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, rRes] = await Promise.all([
        fetch(`/api/admin/cameras/${id}`, { cache: "no-store" }),
        fetch("/api/rivers", { cache: "no-store" }),
      ]);
      if (!cRes.ok) {
        const body = (await cRes.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to load camera");
        return;
      }
      const cData = (await cRes.json()) as { camera: Camera; images: CameraImage[] };
      setCamera(cData.camera);
      setImages(cData.images);

      if (rRes.ok) {
        const rivers = (await rRes.json()) as RiverOption[];
        setRivers(rivers);
      }
    } catch {
      setError("Network error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function bind<K extends keyof Camera>(key: K) {
    return (val: Camera[K]) => setCamera((c) => (c ? { ...c, [key]: val } : c));
  }

  async function save() {
    if (!camera) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cameras/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: camera.name,
          stationId: camera.station_id,
          scaleDescription: camera.scale_description,
          scaleMin: camera.scale_min,
          scaleMax: camera.scale_max,
          scaleUnit: camera.scale_unit,
          paddlingMinReading: camera.paddling_min_reading,
          paddlingIdealReading: camera.paddling_ideal_reading,
          paddlingMaxReading: camera.paddling_max_reading,
          active: camera.active,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cameras/${id}/sync`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Sync failed to enqueue");
        return;
      }
      // Sync runs async. Poll the camera endpoint a few times.
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, 4000));
        await load();
      }
    } finally {
      setSyncing(false);
    }
  }

  async function remove() {
    if (!camera) return;
    const ok = window.confirm(
      `Remove camera "${camera.name}"? This deletes its photos and readings. This cannot be undone.`,
    );
    if (!ok) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cameras/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Remove failed");
        setRemoving(false);
        return;
      }
      router.push("/admin/cameras");
    } catch {
      setError("Network error");
      setRemoving(false);
    }
  }

  async function rerun(imageId: string) {
    setBusyImageId(imageId);
    try {
      await fetch(`/api/admin/cameras/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rerun: true }),
      });
      await load();
    } finally {
      setBusyImageId(null);
    }
  }

  async function override(imageId: string, raw: string) {
    setBusyImageId(imageId);
    try {
      const value = raw.trim() === "" ? null : Number(raw);
      await fetch(`/api/admin/cameras/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingValue: value, notes: "manual override" }),
      });
      await load();
    } finally {
      setBusyImageId(null);
    }
  }

  if (camera === null) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <div className="h-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          )}
        </div>
      </div>
    );
  }

  const thresholds = {
    paddlingMinReading: camera.paddling_min_reading,
    paddlingIdealReading: camera.paddling_ideal_reading,
    paddlingMaxReading: camera.paddling_max_reading,
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/admin/cameras"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All cameras
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{camera.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {camera.provider}
          </span>
          <span className="font-mono">{camera.provider_camera_id ?? "—"}</span>
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Configuration
          </h2>

          <div className="mt-4 grid gap-4">
            <Field label="Display name">
              <input
                type="text"
                value={camera.name}
                onChange={(e) => bind("name")(e.target.value)}
                className="input"
              />
            </Field>

            <Field label="River">
              <select
                value={camera.station_id ?? ""}
                onChange={(e) => bind("station_id")(e.target.value || null)}
                className="input"
              >
                <option value="">— unassigned —</option>
                {rivers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Scale description (sent to the vision reader)">
              <textarea
                rows={3}
                value={camera.scale_description ?? ""}
                onChange={(e) => bind("scale_description")(e.target.value)}
                placeholder="e.g. Vertical white ruler on the left rock face, markings every 10cm from 0 to 200. Read the water surface line."
                className="input"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Scale min">
                <NumberInput value={camera.scale_min} onChange={bind("scale_min")} />
              </Field>
              <Field label="Scale max">
                <NumberInput value={camera.scale_max} onChange={bind("scale_max")} />
              </Field>
              <Field label="Unit">
                <input
                  type="text"
                  value={camera.scale_unit ?? ""}
                  onChange={(e) => bind("scale_unit")(e.target.value || null)}
                  placeholder="m, ft, cm"
                  className="input"
                />
              </Field>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Runnability thresholds (in scale units)
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Below min = no-go; min..ideal = marginal; ideal..max = runnable; above max = high.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label="Min (no-go below)">
                  <NumberInput
                    value={camera.paddling_min_reading}
                    onChange={bind("paddling_min_reading")}
                  />
                </Field>
                <Field label="Ideal">
                  <NumberInput
                    value={camera.paddling_ideal_reading}
                    onChange={bind("paddling_ideal_reading")}
                  />
                </Field>
                <Field label="Max (high above)">
                  <NumberInput
                    value={camera.paddling_max_reading}
                    onChange={bind("paddling_max_reading")}
                  />
                </Field>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={camera.active}
                onChange={(e) => bind("active")(e.target.checked)}
              />
              Active (included in scheduled syncs)
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            {camera.last_synced_photo_date && (
              <span className="text-xs text-zinc-500">
                Last sync: {new Date(camera.last_synced_photo_date).toLocaleString()}
              </span>
            )}
            <button
              onClick={remove}
              disabled={removing}
              className="ml-auto rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              {removing ? "Removing..." : "Remove camera"}
            </button>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Recent photos
          </h2>
          {images.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No photos yet. Configure the scale, then hit &quot;Sync now&quot;.
            </p>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2">
              {images.map((img) => {
                const status = runnabilityFor(img.reading_value, thresholds);
                const colors = runnabilityColors[status];
                return (
                  <li
                    key={img.id}
                    className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-950">
                      <Image
                        src={img.blob_url}
                        alt=""
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="space-y-2 p-3 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-500 text-xs">
                          {new Date(img.captured_at).toLocaleString()}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                          {runnabilityLabel(status)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {img.reading_value != null ? img.reading_value.toFixed(2) : "—"}
                        </span>
                        {camera.scale_unit && (
                          <span className="text-xs text-zinc-500">{camera.scale_unit}</span>
                        )}
                        <span className="ml-auto text-xs text-zinc-500">
                          {img.reading_source}/{img.reading_confidence ?? "—"}
                        </span>
                      </div>
                      {img.reading_notes && (
                        <p className="text-xs text-zinc-500">{img.reading_notes}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => rerun(img.id)}
                          disabled={busyImageId === img.id}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {busyImageId === img.id ? "..." : "Re-read"}
                        </button>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="manual override"
                          defaultValue=""
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void override(img.id, (e.target as HTMLInputElement).value);
                            }
                          }}
                          className="w-32 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(212 212 216);
          background: transparent;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.dark .input) {
          border-color: rgb(63 63 70);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="0.01"
      value={value == null ? "" : value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange(null);
        else {
          const n = Number(v);
          onChange(Number.isFinite(n) ? n : null);
        }
      }}
      className="input"
    />
  );
}
