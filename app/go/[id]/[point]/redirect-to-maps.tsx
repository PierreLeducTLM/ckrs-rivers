"use client";

import { useEffect } from "react";

import { isInAppBrowser } from "@/lib/ddl/detect";

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
    let cancelled = false;

    async function run() {
      if (typeof navigator === "undefined") return;
      // In an in-app browser, the DeepLinkBouncer takes over with a banner /
      // intent redirect — don't yank the user into Maps from underneath it.
      if (isInAppBrowser(navigator.userAgent)) return;
      // Inside the FlowCast app itself, Capacitor rewrites /go/* to /rivers/*
      // before this component ever mounts, but defend just in case.
      try {
        const cap = await import("@capacitor/core");
        if (cap.Capacitor.isNativePlatform()) return;
      } catch {
        // Capacitor unavailable — regular browser, continue.
      }
      if (cancelled) return;
      const url = pickMapsUrl(lat, lon, label, fallbackUrl);
      window.location.replace(url);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, label, fallbackUrl]);

  return null;
}
