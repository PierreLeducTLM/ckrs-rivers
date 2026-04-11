"use client";

import { useState } from "react";
import Link from "next/link";
import SparklineChart from "../sparkline-chart";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import type { StationCard } from "./types";
import { timeAgo, weatherIcon, statusLabel } from "./utils";

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
      className={`group relative rounded-xl bg-background p-6 shadow transition-shadow hover:shadow-lg ${
        card.isGoodRange ? "border-2" : "border border-foreground/40"
      }`}
      style={
        card.isGoodRange
          ? { borderColor: card.color, boxShadow: `0 0 12px ${card.color}25` }
          : undefined
      }
    >
      {/* Status badge */}
      {card.status !== "unknown" && (
        <div className="absolute -top-2.5 right-4 flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-2.5 py-0.5 text-xs font-semibold shadow-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: card.color }}
          />
          <span style={{ color: card.color }}>
            {statusLabel(card.status, t)}
          </span>
        </div>
      )}

      <div className="flex items-start gap-1.5">
        <h2 className="flex-1 text-lg font-semibold leading-tight group-hover:underline">
          {card.name}
        </h2>
        <SubscribeButton
          stationId={card.id}
          isSubscribed={isSubscribed}
          onNeedEmail={onNeedEmail}
          onToggled={onToggled}
          isNative={isNative}
        />
        <FavoriteButton stationId={card.id} />
      </div>

      {isAdmin && (
        <p className="mt-1 text-sm text-foreground/50">
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
        <div className="-mx-1 mt-3">
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

      {/* Flow value */}
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
              {timeAgo(card.forecastAt, t)}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-foreground/5 px-4 py-3">
          <p className="text-sm text-foreground/40">{t("app.pressRefresh")}</p>
        </div>
      )}

      {/* Status pill */}
      <div className="mt-2">
        <StatusPill card={card} t={t} />
      </div>

      {/* Gradient bar */}
      {card.status !== "unknown" && card.lastFlow != null && (
        <div className="mt-2">
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full"
            style={{
              background:
                "linear-gradient(to right, #6A9FD8, #3B82F6 45%, #3A4FBF 60%, #5C3DAF 75%, #8B2E90 88%, #D32F2F)",
            }}
          >
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md dark:border-zinc-900"
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
    </Link>
  );
}
