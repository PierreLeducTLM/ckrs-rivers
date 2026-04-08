"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, LayersControl, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SparklineChart from "./sparkline-chart";
import type { StationCard } from "./station-grid";

const MAP_LAYER_KEY = "waterflow-map-layer";
const MAP_VIEW_KEY = "waterflow-map-view";

const QUEBEC_CENTER: [number, number] = [47.0, -71.5];
const DEFAULT_ZOOM = 6;

// Approximate path length in meters using Haversine between consecutive points
function pathLengthMeters(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function statusLabel(status: string): string {
  switch (status) {
    case "too-low": return "Too Low";
    case "runnable": return "Runnable";
    case "ideal": return "Good to Go";
    case "too-high": return "Too High";
    default: return "";
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function weatherIcon(w: { tempMax: number | null; precipitation: number; snowfall: number }): string {
  if (w.snowfall > 0.5) return "\u2744\uFE0F";
  if (w.precipitation > 5) return "\uD83C\uDF27\uFE0F";
  if (w.precipitation > 0.5) return "\uD83C\uDF26\uFE0F";
  if (w.tempMax != null && w.tempMax > 15) return "\u2600\uFE0F";
  if (w.tempMax != null && w.tempMax > 5) return "\u26C5";
  return "\u2601\uFE0F";
}

function PersistMapState() {
  const map = useMap();
  useEffect(() => {
    const saveLayer = (e: L.LayersControlEvent) => {
      localStorage.setItem(MAP_LAYER_KEY, e.name);
    };
    const saveView = () => {
      const c = map.getCenter();
      localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({
        lat: c.lat,
        lon: c.lng,
        zoom: map.getZoom(),
      }));
    };
    map.on("baselayerchange", saveLayer);
    map.on("moveend", saveView);
    map.on("zoomend", saveView);
    return () => {
      map.off("baselayerchange", saveLayer);
      map.off("moveend", saveView);
      map.off("zoomend", saveView);
    };
  }, [map]);
  return null;
}

function RestoreOrFitBounds({ cards }: { cards: StationCard[] }) {
  const map = useMap();
  useEffect(() => {
    // Try to restore saved view
    try {
      const raw = localStorage.getItem(MAP_VIEW_KEY);
      if (raw) {
        const { lat, lon, zoom } = JSON.parse(raw);
        if (typeof lat === "number" && typeof lon === "number" && typeof zoom === "number") {
          map.setView([lat, lon], zoom);
          return;
        }
      }
    } catch { /* fall through to fitBounds */ }

    // Fallback: fit to all stations
    if (cards.length === 0) return;
    const allPoints: [number, number][] = [];
    for (const c of cards) {
      if (c.riverPath && c.riverPath.length > 0) {
        allPoints.push(...c.riverPath);
      } else {
        allPoints.push([c.lat, c.lon]);
      }
    }
    map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] });
  }, [map, cards]);
  return null;
}

function StationPopup({ card, isAdmin }: { card: StationCard; isAdmin: boolean }) {
  return (
    <Popup maxWidth={280} minWidth={220}>
      <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>
        {/* Status badge */}
        {card.status !== "unknown" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: card.color,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: card.color }}>
              {statusLabel(card.status)}
            </span>
          </div>
        )}

        {/* Name */}
        <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>{card.name}</p>

        {/* Station ID + catchment (admin only) */}
        {isAdmin && (
          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 6px" }}>
            Station {card.id}
            {card.catchmentArea !== undefined && (
              <span> &middot; {Number(card.catchmentArea).toLocaleString("en-US")} km&sup2;</span>
            )}
          </p>
        )}

        {/* Flow value + time ago */}
        {card.lastFlow != null ? (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <p style={{ fontSize: 20, fontWeight: 700, margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {card.lastFlow.toFixed(1)}{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>m&sup3;/s</span>
            </p>
            {card.forecastAt && (
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(card.forecastAt)}</span>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0" }}>No data</p>
        )}

        {/* Sparkline chart */}
        {card.sparkData.length > 2 && (
          <div style={{ width: "100%", height: 60, marginTop: 6 }}>
            <SparklineChart data={card.sparkData} nowTs={card.nowTs} paddling={card.paddling} />
          </div>
        )}

        {/* Gradient bar */}
        {card.status !== "unknown" && card.lastFlow != null && (
          <div style={{ marginTop: 6 }}>
            <div
              style={{
                position: "relative",
                height: 6,
                width: "100%",
                borderRadius: 3,
                background: "linear-gradient(to right, #eab308, #22c55e 50%, #ef4444)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${Math.max(0, Math.min(100, card.position * 100))}%`,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: card.color,
                  border: "2px solid white",
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,.3)",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9ca3af", marginTop: 2 }}>
              <span>{card.paddling?.min != null ? card.paddling.min : ""}</span>
              <span>{card.paddling?.ideal != null ? card.paddling.ideal : ""}</span>
              <span>{card.paddling?.max != null ? card.paddling.max : ""}</span>
            </div>
          </div>
        )}

        {/* Weather pictograms */}
        {card.weatherDays.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {card.weatherDays.slice(0, 5).map((w) => (
              <div key={w.date} style={{ textAlign: "center", fontSize: 10, lineHeight: 1.2 }}>
                <div style={{ fontSize: 14 }}>{weatherIcon(w)}</div>
                <div style={{ color: "#6b7280" }}>
                  {new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { weekday: "narrow" })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View details link */}
        <Link
          href={`/rivers/${card.id}`}
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 12,
            color: "#2563eb",
            textDecoration: "underline",
          }}
        >
          View details &rarr;
        </Link>
      </div>
    </Popup>
  );
}

export default function StationMap({ cards, isAdmin = false }: { cards: StationCard[]; isAdmin?: boolean }) {
  const [savedLayer] = useState(() => {
    if (typeof window === "undefined") return "Street";
    return localStorage.getItem(MAP_LAYER_KEY) ?? "Street";
  });
  const isSatellite = savedLayer === "Satellite";

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded-xl border border-foreground/10">
      <MapContainer
        center={QUEBEC_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <PersistMapState />
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
        <RestoreOrFitBounds cards={cards} />
        {cards.map((card) => {
          const hasPath = card.riverPath && card.riverPath.length > 1;

          if (hasPath) {
            const isShort = pathLengthMeters(card.riverPath!) < 500;

            if (isShort) {
              // Show a dot at the midpoint for very short paths
              const mid = card.riverPath![Math.floor(card.riverPath!.length / 2)];
              return (
                <CircleMarker
                  key={card.id}
                  center={mid}
                  radius={card.status === "unknown" ? 6 : 8}
                  pathOptions={{
                    color: card.color || "#3b82f6",
                    fillColor: card.color || "#3b82f6",
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <StationPopup card={card} isAdmin={isAdmin} />
                </CircleMarker>
              );
            }

            return (
              <Polyline
                key={card.id}
                positions={card.riverPath!}
                pathOptions={{
                  color: card.color || "#3b82f6",
                  weight: 4,
                  opacity: 0.8,
                }}
              >
                <StationPopup card={card} isAdmin={isAdmin} />
              </Polyline>
            );
          }

          // Fallback: single circle marker at station coordinates
          return (
            <CircleMarker
              key={card.id}
              center={[card.lat, card.lon]}
              radius={card.status === "unknown" ? 6 : 8}
              pathOptions={{
                color: card.color || "#9ca3af",
                fillColor: card.color || "#9ca3af",
                fillOpacity: 0.8,
                weight: 2,
              }}
            >
              <StationPopup card={card} isAdmin={isAdmin} />
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
