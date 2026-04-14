"use client";

import React, { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, LayersControl, CircleMarker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SparklineChart from "./sparkline-chart";
import type { StationCard } from "./components/types";
import { useTranslation } from "@/lib/i18n/provider";
import { getPaddlingStatus, isGoodRange } from "@/lib/notifications/paddling-status";

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

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "too-low": return t("status.tooLow");
    case "runnable": return t("status.runnable");
    case "ideal": return t("status.ideal");
    case "too-high": return t("status.tooHigh");
    default: return "";
  }
}

function timeAgo(isoDate: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.floor(hours / 24) });
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

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

function boundaryRadius(zoom: number): number {
  if (zoom >= 13) return 6;
  if (zoom >= 11) return 5;
  if (zoom >= 9) return 4;
  if (zoom >= 7) return 3;
  return 2;
}

function stationRadius(zoom: number, isUnknown: boolean): number {
  const base = isUnknown ? -1 : 0;
  if (zoom >= 13) return 8 + base;
  if (zoom >= 11) return 7 + base;
  if (zoom >= 9) return 6 + base;
  if (zoom >= 7) return 4 + base;
  return 3 + base;
}

function computeCardStatusInfo(
  card: StationCard,
): { key: string; param?: number } | null {
  const paddling = card.paddling;
  if (!paddling || (paddling.min == null && paddling.ideal == null && paddling.max == null)) {
    return null;
  }
  if (card.status === "unknown") return null;

  if (card.status === "ideal") return { key: "detail.ideal" };
  if (card.status === "runnable") return { key: "detail.goodToGo" };

  // too-low or too-high: check hourly forecast for when it enters range
  if (card.status === "too-low" || card.status === "too-high") {
    const now = card.nowTs;
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const { status } = getPaddlingStatus(flow, paddling);
      if (isGoodRange(status)) {
        const hoursAhead = Math.round((point.ts - now) / (1000 * 60 * 60));
        if (hoursAhead <= 24) {
          return { key: "detail.runnableInHours", param: hoursAhead };
        }
        return { key: "detail.runnableInDays", param: Math.ceil(hoursAhead / 24) };
      }
    }
    return { key: card.status === "too-low" ? "detail.tooLow" : "detail.tooHigh" };
  }

  // Currently runnable: check if dropping out
  if (card.isGoodRange) {
    const now = card.nowTs;
    for (const point of card.sparkData) {
      const flow = point.cehqForecast;
      if (flow == null || point.ts <= now) continue;
      const { status } = getPaddlingStatus(flow, paddling);
      if (!isGoodRange(status)) {
        const hoursAhead = Math.round((point.ts - now) / (1000 * 60 * 60));
        if (hoursAhead <= 48) {
          return { key: "detail.droppingOutHours", param: hoursAhead };
        }
        break;
      }
    }
  }

  return null;
}

const STATUS_PILL_STYLES: Record<string, { bg: string; text: string }> = {
  "detail.ideal": { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  "detail.goodToGo": { bg: "rgba(59,130,246,0.12)", text: "#2563eb" },
  "detail.tooLow": { bg: "rgba(113,113,122,0.12)", text: "#71717a" },
  "detail.tooHigh": { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },
  "detail.runnableInHours": { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  "detail.runnableInDays": { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  "detail.droppingOutHours": { bg: "rgba(249,115,22,0.12)", text: "#ea580c" },
};

function StationPopup({ card, isAdmin }: { card: StationCard; isAdmin: boolean }) {
  const { t } = useTranslation();
  const statusInfo = computeCardStatusInfo(card);
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
              {statusLabel(card.status, t)}
            </span>
          </div>
        )}

        {/* Name + rapid class */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 2px" }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{card.name}</p>
          {card.rapidClass && (
            <span
              style={{
                display: "inline-block",
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                backgroundColor: "#27272a",
                color: "#fff",
                textTransform: "uppercase",
                lineHeight: 1.4,
              }}
            >
              {card.rapidClass}
            </span>
          )}
        </div>

        {/* Station ID + catchment (admin only) */}
        {isAdmin && (
          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 6px" }}>
            {t("map.station")} {card.id}
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
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(card.forecastAt, t)}</span>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0" }}>No data</p>
        )}

        {/* Paddling status message */}
        {statusInfo && (() => {
          const style = STATUS_PILL_STYLES[statusInfo.key] ?? { bg: "rgba(113,113,122,0.12)", text: "#71717a" };
          const text = statusInfo.param != null
            ? t(statusInfo.key, { n: statusInfo.param })
            : t(statusInfo.key);
          return (
            <div style={{ marginTop: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: style.bg,
                  color: style.text,
                }}
              >
                {text}
              </span>
            </div>
          );
        })()}

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
                background: "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 80%, #D32F2F)",
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
                  backgroundColor: "#22c55e",
                  border: "2px solid white",
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 1px 3px rgba(0,0,0,.3)",
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
          {t("map.viewDetails")}
        </Link>
      </div>
    </Popup>
  );
}

interface StationMapProps {
  cards: StationCard[];
  isAdmin?: boolean;
  onMarkerTap?: (card: StationCard) => void;
  className?: string;
}

export default function StationMap({ cards, isAdmin = false, onMarkerTap, className }: StationMapProps) {
  const { t } = useTranslation();
  const [savedLayer] = useState(() => {
    if (typeof window === "undefined") return t("map.street");
    return localStorage.getItem(MAP_LAYER_KEY) ?? t("map.street");
  });
  const isSatellite = savedLayer === "Satellite";
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const handleZoom = useCallback((z: number) => setZoom(z), []);

  // Helper: render popup or attach click handler based on mode
  const markerContent = (card: StationCard) => {
    if (onMarkerTap) return null; // Bottom sheet mode — no popup
    return <StationPopup card={card} isAdmin={isAdmin} />;
  };

  const markerHandlers = (card: StationCard) => {
    if (!onMarkerTap) return {};
    return { click: () => onMarkerTap(card) };
  };

  return (
    <div className={className ?? "h-full w-full overflow-hidden rounded-xl border border-foreground/10 sm:rounded-xl sm:border md:h-[70vh]"}>
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
        <ZoomTracker onZoom={handleZoom} />
        {cards.map((card) => {
          const hasPath = card.riverPath && card.riverPath.length > 1;

          if (hasPath) {
            const isShort = pathLengthMeters(card.riverPath!) < 500;

            if (isShort) {
              const mid = card.riverPath![Math.floor(card.riverPath!.length / 2)];
              return (
                <CircleMarker
                  key={card.id}
                  center={mid}
                  radius={stationRadius(zoom, card.status === "unknown")}
                  pathOptions={{
                    color: "#1a1a2e",
                    fillColor: card.color || "#E07020",
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                  eventHandlers={markerHandlers(card)}
                >
                  {markerContent(card)}
                </CircleMarker>
              );
            }

            return (
              <React.Fragment key={card.id}>
                <Polyline
                  positions={card.riverPath!}
                  pathOptions={{
                    color: "transparent",
                    weight: 30,
                    opacity: 0,
                  }}
                  eventHandlers={markerHandlers(card)}
                >
                  {markerContent(card)}
                </Polyline>
                <Polyline
                  positions={card.riverPath!}
                  pathOptions={{
                    color: "#1a1a2e",
                    weight: 7,
                    opacity: 0.4,
                    lineCap: "butt",
                    lineJoin: "round",
                  }}
                  interactive={false}
                />
                <Polyline
                  positions={card.riverPath!}
                  pathOptions={{
                    color: card.color || "#E07020",
                    weight: 4,
                    opacity: 0.8,
                    lineCap: "butt",
                  }}
                  interactive={false}
                />
                <CircleMarker
                  center={card.riverPath![0]}
                  radius={boundaryRadius(zoom)}
                  pathOptions={{
                    color: "#fff",
                    fillColor: card.color || "#E07020",
                    fillOpacity: 1,
                    weight: zoom >= 11 ? 2 : 1,
                  }}
                  interactive={false}
                />
                <CircleMarker
                  center={card.riverPath![card.riverPath!.length - 1]}
                  radius={boundaryRadius(zoom)}
                  pathOptions={{
                    color: "#fff",
                    fillColor: card.color || "#E07020",
                    fillOpacity: 1,
                    weight: zoom >= 11 ? 2 : 1,
                  }}
                  interactive={false}
                />
              </React.Fragment>
            );
          }

          return (
            <CircleMarker
              key={card.id}
              center={[card.lat, card.lon]}
              radius={stationRadius(zoom, card.status === "unknown")}
              pathOptions={{
                color: "#1a1a2e",
                fillColor: card.color || "#E07020",
                fillOpacity: 0.9,
                weight: 2,
              }}
              eventHandlers={markerHandlers(card)}
            >
              {markerContent(card)}
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
