"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { isInAppBrowser, isAndroid, isIOS } from "@/lib/ddl/detect";

interface BounceUrls {
  intentUrl: string;
  customSchemeUrl: string;
  appStoreUrl: string;
}

/**
 * Detects mobile in-app browsers (Messenger, Instagram, ...) and routes the
 * user into the FlowCast app — with a Play Store / App Store fallback if it's
 * not installed.
 *
 *   - Android: `intent://` redirect (the OS handles app-or-store routing,
 *     including a `clickId` referrer so the app can recover the deep link
 *     after install).
 *   - iOS: a sticky banner offering "Open in app" (tries `flowcast://` then
 *     App Store on timeout) or "Get the App". A fingerprint click is recorded
 *     server-side so post-install matching can navigate to the right page.
 *
 * Inert on desktop, in normal mobile browsers, and inside the FlowCast app
 * itself (Capacitor native platform).
 */
export default function DeepLinkBouncer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetPath = useMemo(() => {
    const search = searchParams?.toString() ?? "";
    return search ? `${pathname}?${search}` : pathname ?? "/";
  }, [pathname, searchParams]);

  const [urls, setUrls] = useState<BounceUrls | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [openingApp, setOpeningApp] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof navigator === "undefined") return;
      const ua = navigator.userAgent;
      if (!isInAppBrowser(ua)) return;
      if (!isAndroid(ua) && !isIOS(ua)) return;

      // Skip if we're inside the FlowCast app (Capacitor native).
      try {
        const cap = await import("@capacitor/core");
        if (cap.Capacitor.isNativePlatform()) return;
      } catch {
        // Capacitor not available — we're in a regular browser, continue.
      }

      let response: Response;
      try {
        response = await fetch("/api/ddl/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetPath }),
        });
      } catch {
        return;
      }
      if (!response.ok || cancelled) return;
      const data = (await response.json()) as BounceUrls;
      if (cancelled) return;

      const detected: "android" | "ios" | null = isAndroid(ua)
        ? "android"
        : isIOS(ua)
          ? "ios"
          : null;
      if (!detected) return;
      setPlatform(detected);
      setUrls(data);

      if (detected === "android") {
        // Best-known way out of an Android in-app WebView. The intent URL is
        // routed by the system (not the WebView), so it bypasses Messenger's
        // browser entirely. Fallback to Play Store is encoded in the intent.
        window.location.replace(data.intentUrl);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [targetPath]);

  if (!urls || dismissed || platform !== "ios") return null;

  function handleOpenInApp() {
    if (!urls) return;
    setOpeningApp(true);

    // Visibility-change pattern: if the app actually opens, the page becomes
    // hidden and we cancel the App Store fallback. If nothing happens, we
    // assume it's not installed and bounce to the App Store.
    const fallbackTimer = window.setTimeout(() => {
      window.location.href = urls.appStoreUrl;
    }, 1500);

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearTimeout(fallbackTimer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    window.location.href = urls.customSchemeUrl;
  }

  return (
    <div className="sticky top-0 z-[3000] border-b border-sky-300 bg-sky-50/95 px-3 py-2 backdrop-blur dark:border-sky-900 dark:bg-sky-950/90">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            Open in FlowCast
          </p>
          <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
            Or tap ⋯ → Open in Safari for the best experience.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenInApp}
          disabled={openingApp}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {openingApp ? "Opening…" : "Open in app"}
        </button>
        <a
          href={urls.appStoreUrl}
          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900 dark:text-sky-100 dark:hover:bg-sky-800"
        >
          Get app
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 text-sky-700/70 hover:bg-sky-100 dark:text-sky-200/70 dark:hover:bg-sky-900"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
