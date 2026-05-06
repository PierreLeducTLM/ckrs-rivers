"use client";

import { useEffect } from "react";

interface Props {
  /** "put-in" | "take-out" — read from `?navigate=` query param on the page. */
  kind: "put-in" | "take-out";
  lat: number;
  lon: number;
  label: string;
}

/**
 * When the FlowCast app is opened on a `/rivers/{id}?navigate=put-in|take-out`
 * URL — typically because a shared `/go/{id}/{kind}` link was rewritten by
 * `CapacitorInit` — automatically open the device's maps app for that point.
 *
 * Inert in regular browsers: web visitors land on the river page with no
 * auto-redirect. Inside the app the redirect preserves the original intent of
 * `/go/*` shares (which were designed as one-tap maps launchers).
 */
export default function AutoNavigate({ kind, lat, lon, label }: Props) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const cap = await import("@capacitor/core");
        if (!cap.Capacitor.isNativePlatform()) return;
      } catch {
        return;
      }
      if (cancelled) return;

      const encoded = encodeURIComponent(label);
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      let url: string;
      if (/iPhone|iPad|iPod/i.test(ua)) {
        url = `maps:?q=${encoded}&ll=${lat},${lon}`;
      } else if (/Android/i.test(ua)) {
        url = `geo:${lat},${lon}?q=${lat},${lon}(${encoded})`;
      } else {
        url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      }
      window.open(url, "_blank");
    }

    run();
    return () => {
      cancelled = true;
    };
    // We deliberately fire only once per mount — re-renders shouldn't replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suppress the unused-prop kind warning by referencing it; consumers pass it
  // for clarity at the call site.
  void kind;
  return null;
}
