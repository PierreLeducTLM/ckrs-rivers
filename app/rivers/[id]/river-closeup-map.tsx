"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/lib/i18n/provider";
import type { Rapid } from "@/lib/domain/river-station";

/** Open the device's default map app at the given coordinates */
function openInMaps(lat: number, lon: number, label: string) {
  const encoded = encodeURIComponent(label);
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    // Apple Maps
    window.open(`maps:?q=${encoded}&ll=${lat},${lon}`, "_blank");
  } else if (/Android/i.test(ua)) {
    // Android geo intent
    window.open(`geo:${lat},${lon}?q=${lat},${lon}(${encoded})`, "_blank");
  } else {
    // Desktop fallback — Google Maps
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
      "_blank",
    );
  }
}

// Green pin for put-in
const putInIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:#16a34a;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font-size:12px;color:#fff;font-weight:700">P</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

// Red pin for take-out
const takeOutIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font-size:12px;color:#fff;font-weight:700">T</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function FitBounds({
  riverPath,
  putIn,
  takeOut,
  stationLat,
  stationLon,
}: {
  riverPath: [number, number][] | null;
  putIn: [number, number] | null;
  takeOut: [number, number] | null;
  stationLat: number;
  stationLon: number;
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [];
    if (riverPath && riverPath.length > 0) {
      points.push(...riverPath);
    }
    if (putIn) points.push(putIn);
    if (takeOut) points.push(takeOut);
    if (points.length === 0) {
      points.push([stationLat, stationLon]);
    }
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, riverPath, putIn, takeOut, stationLat, stationLon]);
  return null;
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

function rapidDotIcon(index: number, name: string, hazard: boolean | undefined): L.DivIcon {
  const bg = hazard ? "#dc2626" : "#0ea5e9";
  const labelHtml = name
    ? `<div style="position:absolute;left:26px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:#1a1a2e;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none;">${escapeHtml(name)}</div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="position:relative;width:22px;height:22px;">
      <div style="width:22px;height:22px;border-radius:50%;background:${bg};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.4);">${index + 1}</div>
      ${labelHtml}
    </div>`,
  });
}

interface RiverCloseupMapProps {
  riverPath: [number, number][] | null;
  putIn: [number, number] | null;
  takeOut: [number, number] | null;
  stationLat: number;
  stationLon: number;
  color?: string;
  rapids?: Rapid[];
  stationId?: string;
}

export default function RiverCloseupMap({
  riverPath,
  putIn,
  takeOut,
  stationLat,
  stationLon,
  color = "#3b82f6",
  rapids = [],
  stationId,
}: RiverCloseupMapProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 sm:h-[350px]">
      <MapContainer
        center={[stationLat, stationLon]}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom={false}
        dragging={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds
          riverPath={riverPath}
          putIn={putIn}
          takeOut={takeOut}
          stationLat={stationLat}
          stationLon={stationLon}
        />

        {/* River path polyline */}
        {riverPath && riverPath.length > 1 && (
          <>
            <Polyline
              positions={riverPath}
              pathOptions={{
                color: "#1a1a2e",
                weight: 7,
                opacity: 0.4,
                lineCap: "butt",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={riverPath}
              pathOptions={{
                color,
                weight: 4,
                opacity: 0.9,
                lineCap: "butt",
              }}
            />
            {/* Start/end boundary circles */}
            <CircleMarker
              center={riverPath[0]}
              radius={5}
              pathOptions={{
                color: "#fff",
                fillColor: color,
                fillOpacity: 1,
                weight: 2,
              }}
              interactive={false}
            />
            <CircleMarker
              center={riverPath[riverPath.length - 1]}
              radius={5}
              pathOptions={{
                color: "#fff",
                fillColor: color,
                fillOpacity: 1,
                weight: 2,
              }}
              interactive={false}
            />
          </>
        )}

        {/* Put-in marker — click opens native map app */}
        {putIn && (
          <Marker
            position={putIn}
            icon={putInIcon}
            eventHandlers={{
              click: () => openInMaps(putIn[0], putIn[1], t("detail.putIn")),
            }}
          >
            <Tooltip direction="top" offset={[0, -24]} permanent={false}>
              {t("detail.putIn")}
            </Tooltip>
          </Marker>
        )}

        {/* Take-out marker — click opens native map app */}
        {takeOut && (
          <Marker
            position={takeOut}
            icon={takeOutIcon}
            eventHandlers={{
              click: () => openInMaps(takeOut[0], takeOut[1], t("detail.takeOut")),
            }}
          >
            <Tooltip direction="top" offset={[0, -24]} permanent={false}>
              {t("detail.takeOut")}
            </Tooltip>
          </Marker>
        )}

        {/* Rapid markers — numbered with name label, tap to open dedicated rapids screen */}
        {rapids.map((r, i) => (
          <Marker
            key={r.id}
            position={r.position}
            icon={rapidDotIcon(i, r.name || `Rapid ${i + 1}`, r.hazard)}
            eventHandlers={{
              click: () => {
                if (stationId) {
                  router.push(`/rivers/${stationId}/rapids?focus=${encodeURIComponent(r.id)}`);
                }
              },
            }}
          />
        ))}

        {/* Station marker if no path */}
        {(!riverPath || riverPath.length === 0) && !putIn && !takeOut && (
          <CircleMarker
            center={[stationLat, stationLon]}
            radius={8}
            pathOptions={{
              color: "#1a1a2e",
              fillColor: color,
              fillOpacity: 0.9,
              weight: 2,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
