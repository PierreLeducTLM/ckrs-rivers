"use client";

import type { ReactNode } from "react";

/** Open the device's default map app at the given coordinates */
function openInMaps(lat: number, lon: number, label: string) {
  const encoded = encodeURIComponent(label);
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    window.open(`maps:?q=${encoded}&ll=${lat},${lon}`, "_blank");
  } else if (/Android/i.test(ua)) {
    window.open(`geo:${lat},${lon}?q=${lat},${lon}(${encoded})`, "_blank");
  } else {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
      "_blank",
    );
  }
}

interface NavigateToPointProps {
  lat: number;
  lon: number;
  label: string;
  children: ReactNode;
  className?: string;
}

export default function NavigateToPoint({
  lat,
  lon,
  label,
  children,
  className,
}: NavigateToPointProps) {
  return (
    <button
      type="button"
      onClick={() => openInMaps(lat, lon, label)}
      className={className}
      title={label}
    >
      {children}
    </button>
  );
}
