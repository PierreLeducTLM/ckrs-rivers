"use client";

import { useState } from "react";
import Link from "next/link";
import SparklineChart from "../sparkline-chart";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import RelativeTime from "./relative-time";
import type { StationCard } from "./types";
import { weatherIcon } from "./utils";

interface RiverCardProps {
  card: StationCard;
  isAdmin: boolean;
  isSubscribed: boolean;
  onNeedEmail: () => void;
  onToggled: () => void;
  isNative: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function RiverCard({
  card,
  isAdmin,
  isSubscribed,
  onNeedEmail,
  onToggled,
  isNative,
  t,
}: RiverCardProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  return (
    <Link
      href={`/rivers/${card.id}`}
      className={`group relative rounded-xl bg-background p-4 shadow transition-shadow hover:shadow-lg ${
        card.isGoodRange ? "border-2" : "border border-foreground/40"
      }`}
      style={
        card.isGoodRange
          ? { borderColor: card.color, boxShadow: `0 0 12px ${card.color}25` }
          : undefined
      }
    >
      {/* Header row: title + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-base font-semibold leading-tight group-hover:underline">
            {card.name}
          </h2>
          {card.rapidClass && (
            <span className="flex-shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white dark:bg-zinc-200 dark:text-zinc-900">
              {card.rapidClass}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <SubscribeButton
            stationId={card.id}
            isSubscribed={isSubscribed}
            onNeedEmail={onNeedEmail}
            onToggled={onToggled}
            isNative={isNative}
          />
          <FavoriteButton stationId={card.id} />
        </div>
      </div>

      {/* Flow value row */}
      {card.lastFlow != null && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-bold tabular-nums"
              style={{ backgroundColor: card.color, color: "#fff" }}
            >
              {card.lastFlow.toFixed(0)}
            </span>
            <span className="text-xs font-medium text-foreground/50">
              m&sup3;/s
            </span>
          </div>
          {card.forecastAt && (
            <RelativeTime
              isoDate={card.forecastAt}
              t={t}
              className="text-xs text-foreground/40"
            />
          )}
        </div>
      )}

      {isAdmin && (
        <p className="mt-0.5 text-xs text-foreground/50">
          Station {card.id}
          {card.catchmentArea !== undefined && (
            <span>
              {" "}
              &middot; {Number(card.catchmentArea).toLocaleString("en-US")}{" "}
              km&sup2;
            </span>
          )}
        </p>
      )}

      {/* Sparkline */}
      {card.sparkData.length > 2 && (
        <div className="-mx-1 mt-2">
          <SparklineChart
            data={card.sparkData}
            nowTs={card.nowTs}
            paddling={card.paddling}
          />
        </div>
      )}

      {/* Weather pictograms */}
      {card.weatherDays.length > 0 &&
        card.sparkData.length > 2 &&
        (() => {
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
                const dateLabel = new Date(
                  w.date + "T00:00:00Z",
                ).toLocaleDateString("en-CA", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <span
                    key={w.date}
                    className="absolute -translate-x-1/2 text-sm leading-none"
                    style={{ left: `${w.pct}%` }}
                    onPointerEnter={() => setActiveTooltip(key)}
                    onPointerLeave={() =>
                      setActiveTooltip((v) => (v === key ? null : v))
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveTooltip((v) => (v === key ? null : key));
                    }}
                  >
                    {weatherIcon(w)}
                    {isOpen && (
                      <span className="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg dark:bg-zinc-800">
                        <span className="font-medium">{dateLabel}</span>
                        <br />
                        {(w.tempMin != null || w.tempMax != null) && (
                          <>
                            {w.tempMin != null && (
                              <span className="text-blue-300">
                                {w.tempMin.toFixed(0)}&deg;
                              </span>
                            )}
                            {w.tempMin != null && w.tempMax != null && (
                              <span className="text-zinc-400"> / </span>
                            )}
                            {w.tempMax != null && (
                              <span className="text-red-300">
                                {w.tempMax.toFixed(0)}&deg;
                              </span>
                            )}
                          </>
                        )}
                        {w.precipitation > 0.1 && (
                          <>
                            <br />
                            <span className="text-blue-300">
                              {w.precipitation.toFixed(1)} {t("weather.rain")}
                            </span>
                          </>
                        )}
                        {w.snowfall > 0.1 && (
                          <>
                            <br />
                            <span className="text-sky-200">
                              {w.snowfall.toFixed(1)} {t("weather.snow")}
                            </span>
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

      {/* Status pill */}
      {card.lastFlow != null ? (
        <div className="mt-2">
          <StatusPill card={card} t={t} />
        </div>
      ) : (
        <div className="mt-2 rounded-lg bg-foreground/5 px-3 py-2">
          <p className="text-xs text-foreground/40">{t("app.pressRefresh")}</p>
        </div>
      )}

      {/* Gradient bar */}
      {card.lastFlow != null && (
        <div className="mt-2">
          <div
            className="relative h-2 w-full overflow-hidden rounded-full"
            style={{
              background:
                card.isGoodRange || card.status === "too-high"
                  ? "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 80%, #D32F2F)"
                  : "#a1a1aa",
            }}
          >
            {/* Current position indicator — hidden when too-low or unknown */}
            {(card.isGoodRange || card.status === "too-high") && (
              <div
                className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-lg transition-all duration-500 dark:border-zinc-900 ${
                  card.isGoodRange ? "animate-flow-pulse" : ""
                }`}
                style={{
                  left: `${Math.max(2, Math.min(98, card.position * 100))}%`,
                  backgroundColor: card.color,
                }}
              />
            )}
          </div>
          {/* Flow values below bar */}
          <div className="mt-1 flex justify-between text-[10px] font-medium tabular-nums text-foreground/50">
            <span>
              {card.paddling?.min != null ? `${card.paddling.min}` : "0"}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {card.paddling?.ideal != null ? `${card.paddling.ideal}` : ""}
            </span>
            <span>
              {card.paddling?.max != null ? `${card.paddling.max}` : ""}
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
