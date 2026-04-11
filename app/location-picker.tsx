"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const QUEBEC_CENTER: [number, number] = [47.0, -71.5];
const DEFAULT_ZOOM = 6;

const markerIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #2563eb;"></div>`,
});

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToPoint({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const dist = Math.abs(currentCenter.lat - lat) + Math.abs(currentCenter.lng - lon);
    if (dist > 0.001) {
      map.flyTo([lat, lon], Math.max(map.getZoom(), 10), { duration: 0.5 });
    }
  }, [map, lat, lon]);
  return null;
}

interface LocationPickerProps {
  lat: number | null;
  lon: number | null;
  onClick: (lat: number, lon: number) => void;
}

export default function LocationPicker({ lat, lon, onClick }: LocationPickerProps) {
  const hasPoint = lat != null && lon != null && !isNaN(lat) && !isNaN(lon);

  return (
    <div className="overflow-hidden rounded-lg border border-foreground/15">
      <MapContainer
        center={hasPoint ? [lat, lon] : QUEBEC_CENTER}
        zoom={hasPoint ? 10 : DEFAULT_ZOOM}
        className="h-[200px] w-full"
        style={{ background: "#1a1a2e" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onClick={onClick} />
        {hasPoint && (
          <>
            <Marker position={[lat, lon]} icon={markerIcon} />
            <FlyToPoint lat={lat} lon={lon} />
          </>
        )}
      </MapContainer>
      <p className="bg-foreground/5 px-3 py-1.5 text-[10px] text-foreground/40">
        Click the map to set location
      </p>
    </div>
  );
}
