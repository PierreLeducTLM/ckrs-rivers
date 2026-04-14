"use client";

import { useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import FavoriteButton from "../favorite-button";
import RelativeTime from "./relative-time";
import type { StationCard } from "./types";
import { statusLabel } from "./utils";

interface BottomSheetProps {
  card: StationCard | null;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function BottomSheet({ card, onClose, t }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 10) {
      dragging.current = true;
      el.style.transition = "none";
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const el = sheetRef.current;
    if (!el || !dragging.current) return;
    dragging.current = false;
    const dy =
      parseInt(el.style.transform.replace(/[^-\d]/g, ""), 10) || 0;
    if (dy > 100) {
      onClose();
    } else {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "translateY(0)";
    }
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!card) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, onClose]);

  // Close when tapping outside the sheet (on the map)
  useEffect(() => {
    if (!card) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a short delay so the marker click that opened the sheet
    // doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [card, onClose]);

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 z-30 rounded-t-2xl border-t border-foreground/10 bg-background px-5 pb-5 pt-3 shadow-2xl transition-transform duration-200"
      style={{
        bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
        transform: card ? "translateY(0)" : "translateY(110%)",
        pointerEvents: card ? "auto" : "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag handle */}
      <div className="mb-3 flex justify-center">
        <div className="h-1 w-10 rounded-full bg-foreground/20" />
      </div>

      {card && (
        <>
          {/* Content */}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold">{card.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                {card.municipality && (
                  <span className="text-xs text-foreground/50">
                    {card.municipality}
                  </span>
                )}
                {card.status !== "unknown" && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: card.color }}
                    />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: card.color }}
                    >
                      {statusLabel(card.status, t)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <FavoriteButton stationId={card.id} />
          </div>

          {/* Flow value */}
          {card.lastFlow != null && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {card.lastFlow.toFixed(1)}
              </span>
              <span className="text-sm text-foreground/50">m&sup3;/s</span>
              {card.forecastAt && (
                <RelativeTime
                  isoDate={card.forecastAt}
                  t={t}
                  className="ml-auto text-xs text-foreground/40"
                />
              )}
            </div>
          )}

          {/* Gradient bar */}
          {card.status !== "unknown" && card.lastFlow != null && (
            <div className="mt-3">
              <div
                className="relative h-1.5 w-full overflow-hidden rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 80%, #D32F2F)",
                }}
              >
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md dark:border-zinc-900"
                  style={{
                    left: `${Math.max(0, Math.min(100, card.position * 100))}%`,
                    backgroundColor: "#22c55e",
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
                <span>
                  {card.paddling?.min != null ? `${card.paddling.min}` : ""}
                </span>
                <span>
                  {card.paddling?.ideal != null ? `${card.paddling.ideal}` : ""}
                </span>
                <span>
                  {card.paddling?.max != null ? `${card.paddling.max}` : ""}
                </span>
              </div>
            </div>
          )}

          {/* View details button */}
          <Link
            href={`/rivers/${card.id}`}
            className="mt-4 block w-full rounded-lg bg-brand py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            {t("map.viewDetails")}
          </Link>
        </>
      )}
    </div>
  );
}
