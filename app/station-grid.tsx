"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import SparklineChart from "./sparkline-chart";
import FavoriteButton from "./favorite-button";
import SubscribeButton, { getSubToken } from "./subscribe-button";
import SubscribeModal from "./subscribe-modal";
import { useAdmin } from "./use-admin";
import ThemeToggle from "./theme-toggle";

const StationMap = dynamic(() => import("./station-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] w-full items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
      <p className="text-foreground/40">Loading map...</p>
    </div>
  ),
});

const STORAGE_KEY = "waterflow-favorites";
const VIEW_MODE_KEY = "waterflow-view-mode";

type ViewMode = "card" | "list" | "map";

function getFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function weatherIcon(w: { tempMax: number | null; precipitation: number; snowfall: number }): string {
  if (w.snowfall > 0.5) return "\u2744\uFE0F";
  if (w.precipitation > 5) return "\uD83C\uDF27\uFE0F";
  if (w.precipitation > 0.5) return "\uD83C\uDF26\uFE0F";
  if (w.tempMax != null && w.tempMax > 15) return "\u2600\uFE0F";
  if (w.tempMax != null && w.tempMax > 5) return "\u26C5";
  return "\u2601\uFE0F";
}

function statusLabel(status: string): string {
  switch (status) {
    case "too-low": return "Too Low";
    case "runnable": return "Runnable";
    case "ideal": return "Good to Go";
    case "too-high": return "Too High";
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Types for pre-computed card data passed from the server
// ---------------------------------------------------------------------------

export interface StationCard {
  id: string;
  name: string;
  lat: number;
  lon: number;
  catchmentArea?: number;
  lastFlow: number | null;
  forecastAt: string | null;
  sparkData: Array<{
    ts: number;
    observed: number | null;
    cehqForecast: number | null;
    cehqRange?: [number, number];
  }>;
  nowTs: number;
  paddling: { min?: number; ideal?: number; max?: number } | null;
  status: "unknown" | "too-low" | "runnable" | "ideal" | "too-high";
  position: number;
  color: string;
  isGoodRange: boolean;
  weatherDays: Array<{
    date: string;
    tempMin: number | null;
    tempMax: number | null;
    precipitation: number;
    snowfall: number;
  }>;
  putIn?: [number, number];
  takeOut?: [number, number];
  riverPath?: [number, number][];
}

// ---------------------------------------------------------------------------
// Pull-to-refresh constants
// ---------------------------------------------------------------------------

const PULL_THRESHOLD = 60;
const ICON_HIDDEN_Y = -40;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StationGrid({ cards }: { cards: StationCard[] }) {
  const isAdmin = useAdmin();
  const router = useRouter();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [mounted, setMounted] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [subscribedStationIds, setSubscribedStationIds] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Pull-to-refresh: floating icon slides down from top edge
  // ---------------------------------------------------------------------------
  const [isPending, startTransition] = useTransition();
  const spinnerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
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
      if (isPending || window.scrollY > 0 || viewMode === "map") return;
      touchStartY.current = e.touches[0].clientY;
      pulling.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (isPending || viewMode === "map") return;
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
  }, [isPending, viewMode, router, startTransition, slideOut]);

  useEffect(() => {
    if (!isPending && pullY.current > 0) slideOut();
  }, [isPending, slideOut]);

  const fetchSubscriptions = useCallback(() => {
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
    if (isNative) {
      setShowComingSoon(true);
      return;
    }
    setShowNotificationModal(true);
  }, [isNative]);

  const refreshFavorites = useCallback(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    refreshFavorites();
    fetchSubscriptions();
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "card" || saved === "map") setViewMode(saved);
    setMounted(true);
    window.addEventListener("favorites-changed", refreshFavorites);

    // Detect Capacitor native platform
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) setIsNative(true);
      })
      .catch(() => {});

    return () => window.removeEventListener("favorites-changed", refreshFavorites);
  }, [refreshFavorites, fetchSubscriptions]);

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // Sort: favorites first, then others. Within each group, runnable/ideal on top.
  const statusPriority = (s: string) => {
    switch (s) {
      case "ideal": return 0;
      case "runnable": return 1;
      case "too-low": return 2;
      case "too-high": return 3;
      default: return 4; // unknown
    }
  };
  const sorted = [...cards].sort((a, b) => {
    const favDiff = (favorites.has(a.id) ? 0 : 1) - (favorites.has(b.id) ? 0 : 1);
    if (favDiff !== 0) return favDiff;
    return statusPriority(a.status) - statusPriority(b.status);
  });

  return (
    <div>
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

      {/* Header + View toggle */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <h1 className="text-lg font-bold tracking-tight text-brand sm:text-xl">Kayak Rivière aux Sables</h1>
        </div>
        <div className="flex items-center gap-2">
          {mounted && (
            <div className="inline-flex rounded-lg border border-brand/20 p-0.5">
              <button
                onClick={() => toggleView("card")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "card"
                    ? "bg-brand/10 text-brand"
                    : "text-foreground/50 hover:text-brand"
                }`}
                aria-label="Card view"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                onClick={() => toggleView("list")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-brand/10 text-brand"
                    : "text-foreground/50 hover:text-brand"
                }`}
                aria-label="List view"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                onClick={() => toggleView("map")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "map"
                    ? "bg-brand/10 text-brand"
                    : "text-foreground/50 hover:text-brand"
                }`}
                aria-label="Map view"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </button>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Card view */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {sorted.map((card) => (
            <Link
              key={card.id}
              href={`/rivers/${card.id}`}
              className={`group relative rounded-xl bg-background p-6 shadow transition-shadow hover:shadow-lg ${
                card.isGoodRange
                  ? "border-2"
                  : "border border-foreground/10"
              }`}
              style={card.isGoodRange ? { borderColor: card.color, boxShadow: `0 0 12px ${card.color}25` } : undefined}
            >
              {/* Paddling status badge */}
              {card.status !== "unknown" && (
                <div className="absolute -top-2.5 right-4 flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-2.5 py-0.5 text-xs font-semibold shadow-sm">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: card.color }}
                  />
                  <span style={{ color: card.color }}>{statusLabel(card.status)}</span>
                </div>
              )}

              <div className="flex items-start gap-1.5">
                <h2 className="text-lg font-semibold group-hover:underline leading-tight flex-1">
                  {card.name}
                </h2>
                <SubscribeButton stationId={card.id} isSubscribed={subscribedStationIds.has(card.id)} onNeedEmail={handleNeedEmail} onToggled={fetchSubscriptions} isNative={isNative} />
                <FavoriteButton stationId={card.id} />
              </div>

              {isAdmin && (
                <p className="mt-1 text-sm text-foreground/50">
                  Station {card.id}
                  {card.catchmentArea !== undefined && (
                    <span>
                      {" "}&middot; {Number(card.catchmentArea).toLocaleString("en-US")} km&sup2;
                    </span>
                  )}
                </p>
              )}

              {/* Sparkline chart */}
              {card.sparkData.length > 2 && (
                <div className="mt-3 -mx-1">
                  <SparklineChart data={card.sparkData} nowTs={card.nowTs} paddling={card.paddling} />
                </div>
              )}

              {/* Weather pictograms aligned to chart days */}
              {card.weatherDays.length > 0 && card.sparkData.length > 2 && (() => {
                const total = card.sparkData.length;
                const icons = card.weatherDays
                  .map((w) => {
                    const dayMid = new Date(w.date + "T12:00:00Z").getTime();
                    let closestIdx = 0;
                    let closestDiff = Infinity;
                    for (let i = 0; i < total; i++) {
                      const diff = Math.abs(card.sparkData[i].ts - dayMid);
                      if (diff < closestDiff) {
                        closestDiff = diff;
                        closestIdx = i;
                      }
                    }
                    const pct = (closestIdx / (total - 1)) * 100;
                    return { ...w, pct };
                  })
                  .filter((w) => w.pct >= 0 && w.pct <= 100);

                const tipKey = (date: string) => `${card.id}:${date}`;

                return icons.length > 0 ? (
                  <div className="relative -mx-1 h-5">
                    {icons.map((w) => {
                      const key = tipKey(w.date);
                      const isOpen = activeTooltip === key;
                      const dateLabel = new Date(w.date + "T00:00:00Z").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
                      return (
                        <span
                          key={w.date}
                          className="absolute text-sm leading-none -translate-x-1/2"
                          style={{ left: `${w.pct}%` }}
                          onPointerEnter={() => setActiveTooltip(key)}
                          onPointerLeave={() => setActiveTooltip((v) => v === key ? null : v)}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTooltip((v) => v === key ? null : key); }}
                        >
                          {weatherIcon(w)}
                          {isOpen && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 rounded-lg bg-zinc-900 dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] text-white shadow-lg whitespace-nowrap">
                              <span className="font-medium">{dateLabel}</span>
                              <br />
                              {(w.tempMin != null || w.tempMax != null) && (
                                <>
                                  {w.tempMin != null && <span className="text-blue-300">{w.tempMin.toFixed(0)}&deg;</span>}
                                  {w.tempMin != null && w.tempMax != null && <span className="text-zinc-400"> / </span>}
                                  {w.tempMax != null && <span className="text-red-300">{w.tempMax.toFixed(0)}&deg;</span>}
                                </>
                              )}
                              {w.precipitation > 0.1 && (
                                <>
                                  <br />
                                  <span className="text-blue-300">{w.precipitation.toFixed(1)} mm rain</span>
                                </>
                              )}
                              {w.snowfall > 0.1 && (
                                <>
                                  <br />
                                  <span className="text-sky-200">{w.snowfall.toFixed(1)} cm snow</span>
                                </>
                              )}
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-800" />
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : null;
              })()}

              {card.lastFlow != null ? (
                <div className="mt-2 flex items-baseline justify-between">
                  <p className="text-2xl font-bold tabular-nums">
                    {card.lastFlow.toFixed(1)}{" "}
                    <span className="text-sm font-normal text-foreground/60">
                      m&sup3;/s
                    </span>
                  </p>
                  {card.forecastAt && (
                    <p className="text-xs text-foreground/40">
                      {timeAgo(card.forecastAt)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
                  <p className="text-sm text-foreground/40">
                    Press Refresh to load data
                  </p>
                </div>
              )}

              {/* Gradient bar showing flow position between min → ideal → max */}
              {card.status !== "unknown" && card.lastFlow != null && (
                <div className="mt-3">
                  <div
                    className="relative h-1.5 w-full overflow-hidden rounded-full"
                    style={{
                      background: "linear-gradient(to right, #6A9FD8, #3B82F6 45%, #3A4FBF 60%, #5C3DAF 75%, #8B2E90 88%, #D32F2F)",
                    }}
                  >
                    <div
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-zinc-900"
                      style={{
                        left: `${Math.max(0, Math.min(100, card.position * 100))}%`,
                        backgroundColor: card.color,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
                    <span>{card.paddling?.min != null ? `${card.paddling.min}` : ""}</span>
                    <span>{card.paddling?.ideal != null ? `${card.paddling.ideal}` : ""}</span>
                    <span>{card.paddling?.max != null ? `${card.paddling.max}` : ""}</span>
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Map view */}
      {viewMode === "map" && (
        <div className="-mx-6 -mb-4 h-[calc(100vh-60px)] sm:mx-0 sm:mb-0 sm:h-auto">
          <StationMap cards={sorted} isAdmin={isAdmin} />
        </div>
      )}

      {/* Email collection modal */}
      {showNotificationModal && (
        <SubscribeModal onClose={() => setShowNotificationModal(false)} />
      )}

      {/* Coming soon on mobile modal */}
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
            <h3 className="text-lg font-semibold">Notifications</h3>
            <p className="mt-2 text-sm text-foreground/60">
              Push notifications are coming soon on mobile. In the meantime, you can subscribe to email alerts from the web version.
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="mt-4 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="flex flex-col gap-2">
          {sorted.map((card) => (
            <Link
              key={card.id}
              href={`/rivers/${card.id}`}
              className={`group flex flex-col gap-1 rounded-lg bg-background px-4 py-3 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:gap-4 ${
                card.isGoodRange
                  ? "border-2"
                  : "border border-foreground/10"
              }`}
              style={card.isGoodRange ? { borderColor: card.color, boxShadow: `0 0 8px ${card.color}20` } : undefined}
            >
              {/* Row 1 on mobile: name + status label */}
              <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: card.status !== "unknown" ? card.color : "transparent" }}
                />
                <h2 className="truncate text-sm font-semibold group-hover:underline">
                  {card.name}
                </h2>
                {card.status !== "unknown" && (
                  <span
                    className="flex-shrink-0 text-xs font-medium"
                    style={{ color: card.color }}
                  >
                    {statusLabel(card.status)}
                  </span>
                )}
              </div>

              {/* Row 2 on mobile: flow, gradient bar, buttons */}
              <div className="flex items-center gap-3 pl-5 sm:pl-0">
                {isAdmin && (
                  <p className="hidden text-xs text-foreground/50 sm:block">
                    {card.id}
                    {card.catchmentArea !== undefined && (
                      <span> &middot; {Number(card.catchmentArea).toLocaleString("en-US")} km&sup2;</span>
                    )}
                  </p>
                )}

                {/* Gradient bar (compact) */}
                {card.status !== "unknown" && card.lastFlow != null && (
                  <div className="hidden w-24 flex-shrink-0 sm:block">
                    <div
                      className="relative h-1.5 w-full overflow-hidden rounded-full"
                      style={{
                        background: "linear-gradient(to right, #6A9FD8, #3B82F6 45%, #3A4FBF 60%, #5C3DAF 75%, #8B2E90 88%, #D32F2F)",
                      }}
                    >
                      <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-zinc-900"
                        style={{
                          left: `${Math.max(0, Math.min(100, card.position * 100))}%`,
                          backgroundColor: card.color,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Flow value */}
                <div className="flex-shrink-0">
                  {card.lastFlow != null ? (
                    <p className="text-base font-bold tabular-nums sm:text-lg">
                      {card.lastFlow.toFixed(1)}{" "}
                      <span className="text-xs font-normal text-foreground/60">m&sup3;/s</span>
                    </p>
                  ) : (
                    <p className="text-xs text-foreground/40">No data</p>
                  )}
                </div>
                {card.forecastAt && (
                  <span className="text-[10px] text-foreground/40">{timeAgo(card.forecastAt)}</span>
                )}

                <div className="ml-auto flex flex-shrink-0 gap-0.5">
                  <SubscribeButton stationId={card.id} isSubscribed={subscribedStationIds.has(card.id)} onNeedEmail={handleNeedEmail} onToggled={fetchSubscriptions} isNative={isNative} />
                  <FavoriteButton stationId={card.id} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
