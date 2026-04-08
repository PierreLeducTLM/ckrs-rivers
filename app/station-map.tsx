"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, LayersControl, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

function StationPopup({ card }: { card: StationCard }) {
  return (
    <Popup>
      <div className="min-w-[180px]">
        <p className="text-sm font-semibold">{card.name}</p>
        {card.status !== "unknown" && (
          <p className="text-xs font-medium" style={{ color: card.color }}>
            {statusLabel(card.status)}
          </p>
        )}
        {card.lastFlow != null && (
          <p className="text-lg font-bold tabular-nums">
            {card.lastFlow.toFixed(1)}{" "}
            <span className="text-xs font-normal text-gray-500">m&sup3;/s</span>
          </p>
        )}
        <Link
          href={`/rivers/${card.id}`}
          className="mt-1 inline-block text-sm text-blue-600 underline hover:text-blue-800"
        >
          View details
        </Link>
      </div>
    </Popup>
  );
}

export default function StationMap({ cards }: { cards: StationCard[] }) {
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
                  <StationPopup card={card} />
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
                <StationPopup card={card} />
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
              <StationPopup card={card} />
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
