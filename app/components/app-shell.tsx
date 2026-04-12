"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";
import { useAdmin } from "../use-admin";
import { getSubToken } from "../subscribe-button";
import { getPushToken } from "@/lib/capacitor/push";
import SubscribeModal from "../subscribe-modal";
import { useTab } from "./tab-context";
import BottomNav from "./bottom-nav";
import SettingsMenu from "./settings-menu";
import MyRiversTab from "./my-rivers-tab";
import ExploreTab from "./explore-tab";
import MapTab from "./map-tab";
import type { StationCard } from "./types";

const PULL_THRESHOLD = 60;
const ICON_HIDDEN_Y = -40;

export default function AppShell({ cards }: { cards: StationCard[] }) {
  const isAdmin = useAdmin();
  const router = useRouter();
  const { t } = useTranslation();
  const { activeTab } = useTab();

  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [subscribedStationIds, setSubscribedStationIds] = useState<Set<string>>(new Set());

  // Hide test stations unless admin
  const visible = isAdmin ? cards : cards.filter((c) => !c.id.startsWith("TEST-"));

  // ---------------------------------------------------------------------------
  // Pull-to-refresh
  // ---------------------------------------------------------------------------
  const [isPending, startTransition] = useTransition();
  const spinnerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartedInHeader = useRef(false);
  const pulling = useRef(false);
  const pullY = useRef(0);

  const slideOut = useCallback(() => {
    const el = spinnerRef.current;
    if (!el) return;
    el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
    el.style.transform = `translate(-50%, ${ICON_HIDDEN_Y}px)`;
    el.style.opacity = "0";
    el.querySelector("svg")?.classList.remove("animate-spin");
    pullY.current = 0;
  }, []);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (isPending || window.scrollY > 0) return;
      const inHeader = headerRef.current?.contains(e.target as Node) ?? false;
      if (activeTab === "map" && !inHeader) return;
      touchStartedInHeader.current = inHeader;
      touchStartY.current = e.touches[0].clientY;
      pulling.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (isPending) return;
      if (activeTab === "map" && !touchStartedInHeader.current) return;
      if (window.scrollY > 0) {
        if (pulling.current) { pulling.current = false; applyPull(0); }
        return;
      }
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 10) {
        pulling.current = true;
        applyPull(Math.min(delta * 0.4, 100));
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullY.current >= PULL_THRESHOLD) {
        const el = spinnerRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.transform = `translate(-50%, ${pullY.current + ICON_HIDDEN_Y}px)`;
          el.style.opacity = "1";
          el.querySelector("svg")?.classList.add("animate-spin");
        }
        startTransition(() => { router.refresh(); });
      } else {
        slideOut();
      }
    }

    function applyPull(y: number) {
      pullY.current = y;
      const el = spinnerRef.current;
      if (!el) return;
      el.style.transition = "none";
      el.style.opacity = String(Math.min(y / PULL_THRESHOLD, 1));
      el.style.transform = `translate(-50%, ${y + ICON_HIDDEN_Y}px) rotate(${y * 4}deg)`;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isPending, activeTab, router, startTransition, slideOut]);

  useEffect(() => {
    if (!isPending && pullY.current > 0) slideOut();
  }, [isPending, slideOut]);

  // ---------------------------------------------------------------------------
  // Auto-refresh: poll /api/freshness every 2 min, reload when data changes
  // ---------------------------------------------------------------------------
  const knownTs = useRef<string | null>(null);

  useEffect(() => {
    // Seed with the latest forecastAt from initial server render
    const newest = cards.reduce<string | null>((best, c) => {
      if (!c.forecastAt) return best;
      return !best || c.forecastAt > best ? c.forecastAt : best;
    }, null);
    knownTs.current = newest;
  }, []); // only on mount — we don't want cards updates to overwrite

  useEffect(() => {
    let cancelled = false;

    async function checkFreshness() {
      if (document.hidden) return; // skip when tab is in background
      try {
        const res = await fetch("/api/freshness", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { ts } = (await res.json()) as { ts: string | null };
        if (ts && knownTs.current && ts !== knownTs.current) {
          knownTs.current = ts;
          window.location.reload();
        } else if (ts && !knownTs.current) {
          knownTs.current = ts; // first seed from API
        }
      } catch {
        // network error — ignore, will retry next interval
      }
    }

    const id = setInterval(checkFreshness, 2 * 60 * 1000);

    // Also reload when user comes back to a stale tab
    function onVisibilityChange() {
      if (!document.hidden) checkFreshness();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------
  const fetchSubscriptions = useCallback(() => {
    // Native: load from push device subscriptions
    const pushToken = getPushToken();
    if (pushToken) {
      fetch(`/api/notifications/push-register?token=${encodeURIComponent(pushToken)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setSubscribedStationIds(new Set<string>(data.stationIds ?? []));
        })
        .catch(() => {});
      return;
    }

    // Web: load from email subscriptions
    const token = getSubToken();
    if (!token) {
      setSubscribedStationIds(new Set());
      return;
    }
    fetch(`/api/notifications/manage?token=${token}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const ids = new Set<string>(
          (data.subscriptions as Array<{ stationId: string; active: boolean }>)
            .filter((s) => s.active)
            .map((s) => s.stationId),
        );
        setSubscribedStationIds(ids);
      })
      .catch(() => {});
  }, []);

  const handleNeedEmail = useCallback(() => {
    setShowNotificationModal(true);
  }, []);

  useEffect(() => {
    fetchSubscriptions();
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) setIsNative(true);
      })
      .catch(() => {});
  }, [fetchSubscriptions]);

  return (
    <div
      className={activeTab === "map"
        ? "flex flex-col"
        : "pb-16"
      }
      style={activeTab === "map"
        ? { height: "calc(100dvh - 2rem - 3.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))" }
        : undefined
      }
    >
      {/* Pull-to-refresh floating icon */}
      <div
        ref={spinnerRef}
        className="pointer-events-none fixed left-1/2 top-0 z-40"
        style={{ opacity: 0, transform: "translate(-50%, -40px)" }}
      >
        <div className="rounded-full bg-background p-2 shadow-lg border border-foreground/10">
          <svg className="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      </div>

      {/* Header */}
      <div ref={headerRef} className="relative z-20 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <h1 className="text-lg font-bold tracking-tight text-brand sm:text-xl">
            {t("app.title")}
          </h1>
        </div>
        <SettingsMenu />
      </div>

      {/* Tab content */}
      {activeTab === "my-rivers" && (
        <MyRiversTab
          cards={visible}
          isAdmin={isAdmin}
          subscribedStationIds={subscribedStationIds}
          onNeedEmail={handleNeedEmail}
          onToggled={fetchSubscriptions}
          isNative={isNative}
        />
      )}

      {activeTab === "explore" && (
        <ExploreTab
          cards={visible}
          isAdmin={isAdmin}
          subscribedStationIds={subscribedStationIds}
          onNeedEmail={handleNeedEmail}
          onToggled={fetchSubscriptions}
          isNative={isNative}
        />
      )}

      {activeTab === "map" && (
        <MapTab cards={visible} isAdmin={isAdmin} />
      )}

      {/* Bottom navigation */}
      <BottomNav />

      {/* Modals */}
      {showNotificationModal && (
        <SubscribeModal onClose={() => setShowNotificationModal(false)} />
      )}
      {showComingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowComingSoon(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-6 shadow-2xl text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">{t("notifications.comingSoon")}</h3>
            <p className="mt-2 text-sm text-foreground/60">
              {t("notifications.comingSoonMessage")}
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="mt-4 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15"
            >
              {t("notifications.gotIt")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
