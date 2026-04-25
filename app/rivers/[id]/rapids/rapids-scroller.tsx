"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/lib/i18n/provider";
import { useAdmin } from "@/app/use-admin";
import { useFeatureFlag, type FlagState } from "@/app/use-feature-flag";
import type { Rapid } from "@/lib/domain/river-station";

interface Props {
  stationId: string;
  stationName: string;
  stationLat: number;
  stationLon: number;
  riverPath: [number, number][] | null;
  rapids: Rapid[];
  flagState: FlagState;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function rapidIcon(index: number, name: string, hazard: boolean | undefined, active: boolean): L.DivIcon {
  const bg = hazard ? "#dc2626" : "#0ea5e9";
  const border = active ? "#fbbf24" : "#fff";
  const size = active ? 36 : 26;
  const ring = active
    ? `<div style="position:absolute;inset:-6px;border:3px solid ${border};border-radius:50%;animation:rapidPulse 1.4s ease-out infinite;pointer-events:none;"></div>`
    : "";
  const labelOffset = size / 2 + 6;
  const labelWeight = active ? 700 : 600;
  const labelSize = active ? 13 : 11;
  const labelHtml = name
    ? `<div style="position:absolute;left:${labelOffset}px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:${labelSize}px;font-weight:${labelWeight};color:#1a1a2e;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none;">${escapeHtml(name)}</div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid ${border};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${active ? 15 : 12}px;box-shadow:0 2px 6px rgba(0,0,0,.35);">${index + 1}</div>
      ${ring}
      ${labelHtml}
    </div>`,
  });
}

/** Pan/zoom the map to follow the active rapid. */
function FlyTo({ position, fallback }: { position: [number, number] | null; fallback: [number, number]; }) {
  const map = useMap();
  useEffect(() => {
    const target = position ?? fallback;
    map.flyTo(target, 14, { duration: 0.8 });
  }, [map, position, fallback]);
  return null;
}

export default function RapidsScroller({
  stationId,
  stationName,
  stationLat,
  stationLon,
  riverPath,
  rapids,
  flagState,
}: Props) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const focusId = searchParams?.get("focus") ?? null;
  const isAdmin = useAdmin();
  const visible = useFeatureFlag("rapids", flagState) || isAdmin;

  // Initial active index — from ?focus= or 0.
  const initialIndex = useMemo(() => {
    if (!focusId) return 0;
    const i = rapids.findIndex((r) => r.id === focusId);
    return i >= 0 ? i : 0;
  }, [focusId, rapids]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll the carousel to the focused rapid on mount (also when activeIndex
  // is changed programmatically by tapping a marker on the map).
  const programmaticScrollUntil = useRef(0);
  const scrollToIndex = (idx: number) => {
    const el = cardRefs.current[idx];
    const container = carouselRef.current;
    if (!el || !container) return;
    programmaticScrollUntil.current = Date.now() + 700;
    container.scrollTo({
      left: el.offsetLeft - container.offsetLeft,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (rapids.length > 0) {
      scrollToIndex(initialIndex);
    }
  }, [initialIndex, rapids.length]);

  // Update activeIndex as the user scrolls. Use scroll position instead of
  // IntersectionObserver because it gives us the centered card directly and
  // works reliably with scroll-snap on iOS / Capacitor.
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;
    const onScroll = () => {
      // Skip while we're animating a programmatic scroll.
      if (Date.now() < programmaticScrollUntil.current) return;
      const center = container.scrollLeft + container.clientWidth / 2;
      let closest = 0;
      let bestDist = Infinity;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const c = el.offsetLeft + el.clientWidth / 2;
        const d = Math.abs(c - center);
        if (d < bestDist) {
          bestDist = d;
          closest = i;
        }
      });
      setActiveIndex(closest);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [rapids.length]);

  const activeRapid = rapids[activeIndex] ?? null;
  const fallbackCenter: [number, number] =
    riverPath && riverPath.length > 0 ? riverPath[0] : [stationLat, stationLon];

  if (!visible) {
    return (
      <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
        <Header stationName={stationName} stationId={stationId} t={t} />
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
              <svg className="h-7 w-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-9V6a4 4 0 118 0v2M6 21h12a2 2 0 002-2v-7a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t("rapids.lockedTitle")}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {t("rapids.lockedHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (rapids.length === 0) {
    return (
      <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
        <Header stationName={stationName} stationId={stationId} t={t} />
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">{t("detail.noRapids")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-50 dark:bg-black">
      <style>{`@keyframes rapidPulse { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.6); } }`}</style>

      <Header stationName={stationName} stationId={stationId} t={t} />

      {/* Map (top ~55%) */}
      <div className="relative h-[55%] w-full">
        <MapContainer
          center={fallbackCenter}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {riverPath && riverPath.length > 1 && (
            <>
              <Polyline
                positions={riverPath}
                pathOptions={{ color: "#1a1a2e", weight: 7, opacity: 0.4 }}
              />
              <Polyline
                positions={riverPath}
                pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.9 }}
              />
            </>
          )}
          {rapids.map((r, i) => (
            <Marker
              key={r.id}
              position={r.position}
              icon={rapidIcon(i, r.name || `Rapid ${i + 1}`, r.hazard, i === activeIndex)}
              eventHandlers={{
                click: () => {
                  setActiveIndex(i);
                  scrollToIndex(i);
                },
              }}
            />
          ))}
          <FlyTo
            position={activeRapid ? activeRapid.position : null}
            fallback={fallbackCenter}
          />
        </MapContainer>
      </div>

      {/* Card carousel (bottom ~45%) */}
      <div
        ref={carouselRef}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {rapids.map((r, i) => (
          <div
            key={r.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="flex h-full w-full shrink-0 snap-center snap-always flex-col px-5 py-4"
            style={{ scrollSnapAlign: "center" }}
          >
            <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white ${
                    r.hazard ? "bg-red-600" : "bg-sky-500"
                  }`}
                >
                  {i + 1}
                </span>
                <h2 className="flex-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {r.name}
                </h2>
                {r.grade && (
                  <span className="rounded bg-zinc-800 px-2.5 py-1 text-sm font-bold text-white dark:bg-zinc-200 dark:text-zinc-900">
                    {r.grade}
                  </span>
                )}
              </div>

              {r.hazard && (
                <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Hazard
                </div>
              )}

              {r.description && (
                <p className="mt-4 flex-1 overflow-y-auto whitespace-pre-wrap text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {r.description}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-500">
                <span>
                  {i + 1} / {rapids.length}
                </span>
                {i === 0 && rapids.length > 1 && (
                  <span className="flex items-center gap-1">
                    {t("rapids.swipeHint")}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({
  stationName,
  stationId,
  t,
}: {
  stationName: string;
  stationId: string;
  t: (key: string) => string;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link
        href={`/rivers/${stationId}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t("detail.backToRiver")}
      </Link>
      <div className="ml-auto truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {stationName}
      </div>
    </header>
  );
}
