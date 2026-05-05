"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible component that bootstraps Capacitor native features.
 * Renders nothing — just runs initialization on mount.
 */
export default function CapacitorInit() {
  const router = useRouter();

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

  // Deep links (Android App Links / iOS Universal Links): when the OS launches
  // the app with a flowcast.ca URL, navigate the WebView to the matching path.
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    import("@capacitor/app").then(({ App }) => {
      const handler = App.addListener("appUrlOpen", ({ url }) => {
        try {
          const parsed = new URL(url);
          const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
          if (target && target !== window.location.pathname + window.location.search + window.location.hash) {
            router.push(target);
          }
        } catch {
          // Malformed URL — ignore
        }
      });

      cleanup = () => {
        handler.then((h) => h.remove());
      };
    }).catch(() => {
      // Not running in Capacitor — ignore
    });

    return () => cleanup?.();
  }, [router]);

  return null;
}
