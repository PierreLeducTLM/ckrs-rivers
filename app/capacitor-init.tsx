"use client";

import { useEffect } from "react";

/**
 * Invisible component that bootstraps Capacitor native features.
 * Renders nothing — just runs initialization on mount.
 */
export default function CapacitorInit() {
  useEffect(() => {
    import("@/lib/capacitor/push").then((m) => m.initPushNotifications());
  }, []);

  // Android back gesture / button: navigate within the app instead of exiting
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    import("@capacitor/app").then(({ App }) => {
      const handler = App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      });

      cleanup = () => {
        handler.then((h) => h.remove());
      };
    }).catch(() => {
      // Not running in Capacitor — ignore
    });

    return () => cleanup?.();
  }, []);

  return null;
}
