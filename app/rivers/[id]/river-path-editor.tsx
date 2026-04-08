"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MAP_LAYER_KEY = "waterflow-map-layer";

type Step = "idle" | "placing-put-in" | "placing-take-out" | "editing-path";

interface RiverPathEditorProps {
  stationId: string;
  stationLat: number;
  stationLon: number;
  initialPutIn?: [number, number] | null;
  initialTakeOut?: [number, number] | null;
  initialPath?: [number, number][] | null;
}

// Custom colored circle icons (avoids broken default marker images)
function circleIcon(color: string, borderColor: string, size: number) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${borderColor};cursor:grab;"></div>`,
  });
}

const putInIcon = circleIcon("#22c55e", "#16a34a", 16);
const takeOutIcon = circleIcon("#ef4444", "#dc2626", 16);
const waypointIcon = circleIcon("#60a5fa", "#3b82f6", 12);

// ---------------------------------------------------------------------------
// Draggable marker component
// ---------------------------------------------------------------------------

function DraggableMarker({
  position,
  icon,
  onDragEnd,
  children,
}: {
  position: [number, number];
  icon: L.DivIcon;
  onDragEnd: (lat: number, lon: number) => void;
  children?: React.ReactNode;
}) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const { lat, lng } = marker.getLatLng();
          onDragEnd(lat, lng);
        }
      },
    }),
    [onDragEnd],
  );

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      draggable={true}
      eventHandlers={eventHandlers}
    >
      {children}
    </Marker>
  );
}

// ---------------------------------------------------------------------------
// Map sub-components
// ---------------------------------------------------------------------------

function PersistLayer() {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LayersControlEvent) => {
      localStorage.setItem(MAP_LAYER_KEY, e.name);
    };
    map.on("baselayerchange", handler);
    return () => { map.off("baselayerchange", handler); };
  }, [map]);
  return null;
}

function FitToPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

function MapClickHandler({
  step,
  onPlacePutIn,
  onPlaceTakeOut,
  onAddWaypoint,
}: {
  step: Step;
  onPlacePutIn: (lat: number, lon: number) => void;
  onPlaceTakeOut: (lat: number, lon: number) => void;
  onAddWaypoint: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (step === "placing-put-in") {
        onPlacePutIn(lat, lng);
      } else if (step === "placing-take-out") {
        onPlaceTakeOut(lat, lng);
      } else if (step === "editing-path") {
        onAddWaypoint(lat, lng);
      }
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export default function RiverPathEditor({
  stationId,
  stationLat,
  stationLon,
  initialPutIn = null,
  initialTakeOut = null,
  initialPath = null,
}: RiverPathEditorProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [putIn, setPutIn] = useState<[number, number] | null>(initialPutIn);
  const [takeOut, setTakeOut] = useState<[number, number] | null>(initialTakeOut);
  const [path, setPath] = useState<[number, number][]>(initialPath ?? []);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handlePlacePutIn = useCallback((lat: number, lon: number) => {
    setPutIn([lat, lon]);
    setStep("placing-take-out");
    setPath([]);
    setError(null);
  }, []);

  const handlePlaceTakeOut = useCallback((lat: number, lon: number) => {
    setTakeOut([lat, lon]);
    setStep("editing-path");
    setError(null);
  }, []);

  const handleAddWaypoint = useCallback(
    (lat: number, lon: number) => {
      if (!putIn || !takeOut) return;
      if (path.length === 0) {
        setPath([[lat, lon]]);
        return;
      }
      const fullPath = [putIn, ...path, takeOut];
      let bestIdx = 1;
      let bestDist = Infinity;
      for (let i = 0; i < fullPath.length - 1; i++) {
        const d =
          Math.hypot(fullPath[i][0] - lat, fullPath[i][1] - lon) +
          Math.hypot(fullPath[i + 1][0] - lat, fullPath[i + 1][1] - lon);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const insertIdx = Math.max(0, bestIdx);
      const newPath = [...path];
      newPath.splice(insertIdx, 0, [lat, lon]);
      setPath(newPath);
    },
    [putIn, takeOut, path],
  );

  const moveWaypoint = useCallback(
    (idx: number, lat: number, lon: number) => {
      setPath((p) => p.map((pt, i) => (i === idx ? [lat, lon] : pt)));
    },
    [],
  );

  const removeWaypoint = useCallback((idx: number) => {
    setPath((p) => p.filter((_, i) => i !== idx));
  }, []);

  const movePutIn = useCallback((lat: number, lon: number) => {
    setPutIn([lat, lon]);
  }, []);

  const moveTakeOut = useCallback((lat: number, lon: number) => {
    setTakeOut([lat, lon]);
  }, []);

  const autoDetect = async () => {
    if (!putIn || !takeOut) return;
    setFetching(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/rivers/overpass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          putInLat: putIn[0],
          putInLon: putIn[1],
          takeOutLat: takeOut[0],
          takeOutLon: takeOut[1],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to fetch river path");
        return;
      }
      setPath(data.path);
      if (data.riverName) {
        setMessage(`Detected: ${data.riverName}`);
      }
    } catch {
      setError("Network error while fetching river data");
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const fullPath =
        path.length > 0 && putIn && takeOut
          ? [putIn, ...path, takeOut]
          : path.length > 0
            ? path
            : null;

      const res = await fetch(`/api/stations/${stationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          put_in_lat: putIn?.[0] ?? null,
          put_in_lon: putIn?.[1] ?? null,
          take_out_lat: takeOut?.[0] ?? null,
          take_out_lon: takeOut?.[1] ?? null,
          river_path: fullPath,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      setStep("idle");
      setOpen(false);
      setMessage("River path saved! Reload to see changes on the main map.");
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setPutIn(null);
    setTakeOut(null);
    setPath([]);
    setStep("idle");
    setError(null);
    setMessage(null);
  };

  const startEditing = () => {
    setOpen(true);
    if (putIn && takeOut) {
      setStep("editing-path");
    } else {
      setStep("placing-put-in");
    }
  };

  const [savedLayer] = useState(() => {
    if (typeof window === "undefined") return "Street";
    return localStorage.getItem(MAP_LAYER_KEY) ?? "Street";
  });
  const isSatellite = savedLayer === "Satellite";

  // Build the displayed polyline (put-in -> waypoints -> take-out)
  const displayPath: [number, number][] =
    putIn && takeOut ? [putIn, ...path, takeOut] : path.length > 0 ? path : [];

  // Points to fit the map to
  const fitPoints: [number, number][] =
    putIn || takeOut
      ? ([putIn, takeOut].filter(Boolean) as [number, number][])
      : [[stationLat, stationLon]];

  const stepLabel =
    step === "placing-put-in"
      ? "Click the map to place the put-in location"
      : step === "placing-take-out"
        ? "Click the map to place the take-out location"
        : step === "editing-path"
          ? "Drag markers to adjust. Click map to add waypoints. Click a waypoint to remove it."
          : null;

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={startEditing}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/10 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          {putIn && takeOut ? "Edit River Path" : "Set River Path"}
        </button>
        {message && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Instructions banner */}
      {stepLabel && (
        <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
          {stepLabel}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-200">
          {message}
        </div>
      )}

      {/* Map */}
      <div className="h-[500px] w-full overflow-hidden rounded-xl border border-foreground/10">
        <MapContainer
          center={[stationLat, stationLon]}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom={true}
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
          <FitToPoints points={fitPoints} />
          <MapClickHandler
            step={step}
            onPlacePutIn={handlePlacePutIn}
            onPlaceTakeOut={handlePlaceTakeOut}
            onAddWaypoint={handleAddWaypoint}
          />

          {/* Put-in marker (draggable) */}
          {putIn && (
            <DraggableMarker position={putIn} icon={putInIcon} onDragEnd={movePutIn}>
              <Popup>Put-in (drag to move)</Popup>
            </DraggableMarker>
          )}

          {/* Take-out marker (draggable) */}
          {takeOut && (
            <DraggableMarker position={takeOut} icon={takeOutIcon} onDragEnd={moveTakeOut}>
              <Popup>Take-out (drag to move)</Popup>
            </DraggableMarker>
          )}

          {/* Waypoints (draggable, click to remove) */}
          {path.map((pt, i) => (
            <DraggableMarker
              key={`wp-${i}`}
              position={pt}
              icon={waypointIcon}
              onDragEnd={(lat, lon) => moveWaypoint(i, lat, lon)}
            >
              <Popup>
                <button
                  onClick={() => removeWaypoint(i)}
                  className="text-xs text-red-600 underline"
                >
                  Remove waypoint
                </button>
              </Popup>
            </DraggableMarker>
          ))}

          {/* Polyline */}
          {displayPath.length > 1 && (
            <Polyline
              positions={displayPath}
              pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.8 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {putIn && takeOut && (
          <button
            onClick={autoDetect}
            disabled={fetching}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {fetching ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Detecting...
              </>
            ) : (
              "Auto-detect river"
            )}
          </button>
        )}
        {(putIn || takeOut || path.length > 0) && (
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        <button
          onClick={clear}
          className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
        >
          Clear
        </button>
        <button
          onClick={() => { setOpen(false); setStep("idle"); }}
          className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
