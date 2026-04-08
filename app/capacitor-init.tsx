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

  return null;
}
