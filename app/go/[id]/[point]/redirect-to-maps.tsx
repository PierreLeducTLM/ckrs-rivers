"use client";

import { useEffect } from "react";

interface Props {
  lat: number;
  lon: number;
  label: string;
  fallbackUrl: string;
}

function pickMapsUrl(lat: number, lon: number, label: string, fallbackUrl: string): string {
  if (typeof navigator === "undefined") return fallbackUrl;
  const ua = navigator.userAgent;
  const encoded = encodeURIComponent(label);
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return `maps:?q=${encoded}&ll=${lat},${lon}`;
  }
  if (/Android/i.test(ua)) {
    return `geo:${lat},${lon}?q=${lat},${lon}(${encoded})`;
  }
  return fallbackUrl;
}

export default function RedirectToMaps({ lat, lon, label, fallbackUrl }: Props) {
  useEffect(() => {
    const url = pickMapsUrl(lat, lon, label, fallbackUrl);
    window.location.replace(url);
  }, [lat, lon, label, fallbackUrl]);

  return null;
}
