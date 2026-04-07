"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SparklineChart from "./sparkline-chart";
import FavoriteButton from "./favorite-button";

const STORAGE_KEY = "waterflow-favorites";

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StationGrid({ cards }: { cards: StationCard[] }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const refreshFavorites = useCallback(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    refreshFavorites();
    window.addEventListener("favorites-changed", refreshFavorites);
    return () => window.removeEventListener("favorites-changed", refreshFavorites);
  }, [refreshFavorites]);

  // Sort: favorites first (preserving original order within each group)
  const sorted = [...cards].sort((a, b) => {
    const aFav = favorites.has(a.id) ? 0 : 1;
    const bFav = favorites.has(b.id) ? 0 : 1;
    return aFav - bFav;
  });

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {sorted.map((card) => (
        <Link
          key={card.id}
          href={`/rivers/${card.id}`}
          className={`group relative rounded-xl bg-background p-6 shadow transition-shadow hover:shadow-lg ${
            card.isGoodRange
              ? "border-2 border-green-500 dark:border-green-400"
              : "border border-foreground/10"
          }`}
          style={card.isGoodRange ? { boxShadow: `0 0 12px ${card.color}25` } : undefined}
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
            <FavoriteButton stationId={card.id} />
          </div>

          <p className="mt-1 text-sm text-foreground/50">
            Station {card.id}
            {card.catchmentArea !== undefined && (
              <span>
                {" "}&middot; {Number(card.catchmentArea).toLocaleString()} km&sup2;
              </span>
            )}
          </p>

          {/* Sparkline chart */}
          {card.sparkData.length > 2 && (
            <div className="mt-3 -mx-1">
              <SparklineChart data={card.sparkData} nowTs={card.nowTs} paddling={card.paddling} />
            </div>
          )}

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
                  background: "linear-gradient(to right, #eab308, #22c55e 50%, #ef4444)",
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
  );
}
