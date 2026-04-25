"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/lib/i18n/provider";
import { snapToPath } from "@/lib/geo/snap-to-path";
import type { Rapid } from "@/lib/domain/river-station";

const MAP_LAYER_KEY = "waterflow-map-layer";

const RAPID_CLASSES = ["I", "I-II", "II", "II-III", "III", "III-IV", "IV", "IV-V", "V", "V+"];

interface RapidsEditorProps {
  stationId: string;
  stationLat: number;
  stationLon: number;
  riverPath: [number, number][] | null;
  initialRapids: Rapid[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function rapidIcon(index: number, name: string, hazard: boolean | undefined, active: boolean): L.DivIcon {
  const bg = hazard ? "#dc2626" : "#0ea5e9";
  const border = active ? "#fbbf24" : "#fff";
  const size = active ? 30 : 26;
  const labelOffset = size / 2 + 6;
  const labelHtml = name
    ? `<div style="position:absolute;left:${labelOffset}px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:#1a1a2e;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none;">${escapeHtml(name)}</div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid ${border};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;">${index + 1}</div>
      ${labelHtml}
    </div>`,
  });
}

function PersistLayer() {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LayersControlEvent) => {
      localStorage.setItem(MAP_LAYER_KEY, e.name);
    };
    map.on("baselayerchange", handler);
    return () => {
      map.off("baselayerchange", handler);
    };
  }, [map]);
  return null;
}

function FitToPath({ path, station }: { path: [number, number][] | null; station: [number, number] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    if (path && path.length > 1) {
      map.fitBounds(L.latLngBounds(path), { padding: [40, 40] });
    } else {
      map.setView(station, 13);
    }
  }, [map, path, station]);
  return null;
}

function MapClickHandler({
  onClick,
  enabled,
}: {
  onClick: (lat: number, lon: number) => void;
  enabled: boolean;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggableRapidMarker({
  rapid,
  index,
  active,
  onClick,
  onDragEnd,
}: {
  rapid: Rapid;
  index: number;
  active: boolean;
  onClick: () => void;
  onDragEnd: (lat: number, lon: number) => void;
}) {
  const ref = useRef<L.Marker>(null);

  const handlers = useMemo(
    () => ({
      click() {
        onClick();
      },
      dragend() {
        const m = ref.current;
        if (!m) return;
        const { lat, lng } = m.getLatLng();
        onDragEnd(lat, lng);
      },
    }),
    [onClick, onDragEnd],
  );

  return (
    <Marker
      ref={ref}
      position={rapid.position}
      icon={rapidIcon(index, rapid.name, rapid.hazard, active)}
      draggable
      eventHandlers={handlers}
    />
  );
}

export default function RapidsEditor({
  stationId,
  stationLat,
  stationLon,
  riverPath,
  initialRapids,
}: RapidsEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rapids, setRapids] = useState<Rapid[]>(() =>
    sortByPath(initialRapids ?? [], riverPath),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const active = activeId ? rapids.find((r) => r.id === activeId) ?? null : null;

  const placeNewRapid = useCallback(
    (lat: number, lon: number) => {
      let position: [number, number] = [lat, lon];
      if (riverPath && riverPath.length > 1) {
        const snap = snapToPath([lat, lon], riverPath);
        if (snap) position = snap.point;
      }
      const r: Rapid = {
        id: newId(),
        name: "",
        description: "",
        position,
        grade: undefined,
        hazard: false,
      };
      setRapids((prev) => sortByPath([...prev, r], riverPath));
      setActiveId(r.id);
    },
    [riverPath],
  );

  const moveRapid = useCallback(
    (id: string, lat: number, lon: number) => {
      let position: [number, number] = [lat, lon];
      if (riverPath && riverPath.length > 1) {
        const snap = snapToPath([lat, lon], riverPath);
        if (snap) position = snap.point;
      }
      setRapids((prev) =>
        sortByPath(
          prev.map((r) => (r.id === id ? { ...r, position } : r)),
          riverPath,
        ),
      );
    },
    [riverPath],
  );

  const updateActive = useCallback((patch: Partial<Rapid>) => {
    setRapids((prev) =>
      prev.map((r) => (r.id === activeId ? { ...r, ...patch } : r)),
    );
  }, [activeId]);

  const deleteActive = useCallback(() => {
    if (!activeId) return;
    setRapids((prev) => prev.filter((r) => r.id !== activeId));
    setActiveId(null);
  }, [activeId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Strip empty-named rapids before saving (the form requires a name).
      const valid = rapids.filter((r) => r.name.trim().length > 0);
      const res = await fetch(`/api/stations/${stationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapids: valid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to save rapids");
        return;
      }
      setRapids(valid);
      setMessage(t("rapids.saving"));
      setOpen(false);
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }, [rapids, stationId, t]);

  const [savedLayer] = useState(() => {
    if (typeof window === "undefined") return "Street";
    return localStorage.getItem(MAP_LAYER_KEY) ?? "Street";
  });
  const isSatellite = savedLayer === "Satellite";

  if (!open) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setOpen(true)}
          disabled={!riverPath || riverPath.length < 2}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={!riverPath || riverPath.length < 2 ? "Set a river path first" : undefined}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" strokeLinecap="round" />
          </svg>
          {t("detail.editRapids")}
          {rapids.length > 0 && (
            <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-bold">
              {rapids.length}
            </span>
          )}
        </button>
        {message && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
        {t("rapids.clickPathToAdd")}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-foreground/10">
        <MapContainer
          center={[stationLat, stationLon]}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom
        >
          <PersistLayer />
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked={!isSatellite} name="Street">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={isSatellite} name="Satellite">
              <TileLayer
                attribution="Tiles &copy; Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <FitToPath path={riverPath} station={[stationLat, stationLon]} />
          <MapClickHandler onClick={placeNewRapid} enabled={!active} />
          {riverPath && riverPath.length > 1 && (
            <Polyline
              positions={riverPath}
              pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.6 }}
            />
          )}
          {rapids.map((r, i) => (
            <DraggableRapidMarker
              key={r.id}
              rapid={r}
              index={i}
              active={r.id === activeId}
              onClick={() => setActiveId(r.id)}
              onDragEnd={(lat, lon) => moveRapid(r.id, lat, lon)}
            />
          ))}
        </MapContainer>
      </div>

      {/* Inline form for the active rapid */}
      {active && (
        <div className="rounded-xl border border-foreground/10 bg-white p-4 shadow-sm dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {active.name ? t("rapids.editTitle") : t("rapids.addTitle")}{" "}
            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              #{rapids.findIndex((r) => r.id === active.id) + 1}
            </span>
          </h3>

          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t("rapids.name")}
              </span>
              <input
                autoFocus
                type="text"
                value={active.name}
                onChange={(e) => updateActive({ name: e.target.value })}
                placeholder={t("rapids.namePlaceholder")}
                maxLength={80}
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t("rapids.description")}
              </span>
              <textarea
                value={active.description ?? ""}
                onChange={(e) => updateActive({ description: e.target.value })}
                placeholder={t("rapids.descriptionPlaceholder")}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {t("rapids.grade")}
                </span>
                <select
                  value={active.grade ?? ""}
                  onChange={(e) => updateActive({ grade: e.target.value || undefined })}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="">{t("rapids.gradeNone")}</option>
                  {RAPID_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active.hazard ?? false}
                  onChange={(e) => updateActive({ hazard: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-zinc-700 dark:text-zinc-300">{t("rapids.hazard")}</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => setActiveId(null)}
                className="rounded-lg border border-foreground/10 px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
              >
                {t("rapids.cancel")}
              </button>
              <button
                onClick={deleteActive}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                {t("rapids.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? t("rapids.saving") : t("rapids.saveAll")}
        </button>
        <button
          onClick={() => {
            setRapids(sortByPath(initialRapids ?? [], riverPath));
            setActiveId(null);
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
        >
          {t("rapids.cancel")}
        </button>
      </div>
    </div>
  );
}

function sortByPath(rapids: Rapid[], path: [number, number][] | null): Rapid[] {
  if (!path || path.length < 2) return rapids;
  const withProgress = rapids.map((r) => {
    const snap = snapToPath(r.position, path);
    return { rapid: r, km: snap?.cumulativeKm ?? 0 };
  });
  withProgress.sort((a, b) => a.km - b.km);
  return withProgress.map((w) => w.rapid);
}
