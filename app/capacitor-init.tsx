"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DDL_CONSUMED_KEY = "flowcast.ddl.consumed.v1";
const REFERRER_CLICKID_RE = /(?:^|&)ddl_clickid=([^&]+)/;

/**
 * Map shared deep-link paths to the screen we actually want to land on inside
 * the app.
 *
 *   - `/go/{id}/put-in`   → `/rivers/{id}?navigate=put-in`
 *   - `/go/{id}/take-out` → `/rivers/{id}?navigate=take-out`
 *
 * The `/go/*` route is a maps-redirect for non-app users; if we let it render
 * inside FlowCast it'd boot the user back out into Google/Apple Maps.
 */
function rewriteForApp(target: string): string {
  if (!target.startsWith("/")) return target;
  const match = target.match(/^\/go\/([^/?#]+)\/(put-in|take-out)(?:[/?#].*)?$/);
  if (!match) return target;
  const [, id, kind] = match;
  const url = new URL(target, "https://www.flowcast.ca");
  const params = new URLSearchParams(url.search);
  params.set("navigate", kind);
  return `/rivers/${id}?${params.toString()}`;
}

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

  // Deep links (Android App Links / iOS Universal Links / flowcast://): when the
  // OS launches the app with a FlowCast URL, navigate the WebView to the matching
  // path. Rewrites /go/* to /rivers/* so users don't get bounced to Maps.
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    import("@capacitor/app").then(({ App }) => {
      const handler = App.addListener("appUrlOpen", ({ url }) => {
        try {
          const parsed = new URL(url);
          const target = rewriteForApp(
            `${parsed.pathname}${parsed.search}${parsed.hash}`,
          );
          if (
            target &&
            target !==
              window.location.pathname +
                window.location.search +
                window.location.hash
          ) {
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

  // Deferred deep link: on first cold launch after install, recover the
  // originally shared path (Android: install-referrer; iOS: server-side
  // fingerprint match) and navigate there.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const cap = await import("@capacitor/core");
        if (!cap.Capacitor.isNativePlatform()) return;
      } catch {
        return;
      }

      // One-shot. If the user clears app data this fires again, which is fine.
      try {
        if (window.localStorage.getItem(DDL_CONSUMED_KEY)) return;
      } catch {
        // localStorage may be unavailable — proceed anyway.
      }

      let clickId: string | undefined;
      try {
        const cap = await import("@capacitor/core");
        if (cap.Capacitor.getPlatform() === "android") {
          const { InstallReferrer } = await import(
            "@/lib/capacitor/install-referrer"
          );
          const { referrer } = await InstallReferrer.getReferrer();
          const m = referrer.match(REFERRER_CLICKID_RE);
          if (m) clickId = decodeURIComponent(m[1]);
        }
      } catch {
        // Plugin unavailable or referrer not present — continue with iOS
        // fingerprint matching.
      }

      let targetPath: string | null = null;
      try {
        const response = await fetch("/api/ddl/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(clickId ? { clickId } : {}),
        });
        if (response.ok) {
          const data = (await response.json()) as { targetPath?: string };
          if (typeof data.targetPath === "string") {
            targetPath = data.targetPath;
          }
        }
      } catch {
        // Network failure — try again next cold launch (don't set the flag).
        return;
      }

      try {
        window.localStorage.setItem(DDL_CONSUMED_KEY, String(Date.now()));
      } catch {
        // Best-effort.
      }

      if (cancelled || !targetPath) return;
      const rewritten = rewriteForApp(targetPath);
      router.push(rewritten);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
