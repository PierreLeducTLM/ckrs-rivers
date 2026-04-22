"use client";

import Link from "next/link";
import FavoriteButton from "../favorite-button";
import SubscribeButton from "../subscribe-button";
import StatusPill from "./status-pill";
import FlowTendency from "./flow-tendency";
import { useTab } from "./tab-context";
import type { StationCard } from "./types";
import { computeDisplayState, statusLabel } from "./utils";

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
  const { timeTravelTs } = useTab();
  const projected =
    timeTravelTs != null ? computeDisplayState(card, timeTravelTs) : null;
  const displayFlow = projected ? projected.flow : card.lastFlow;
  const displayColor = projected ? projected.color : card.color;
  const displayStatus = projected ? projected.status : card.status;
  const displayPosition = projected ? projected.position : card.position;
  const displayIsGood = projected ? projected.isGoodRange : card.isGoodRange;
  const isProjected = projected != null;

  return (
    <Link
      href={`/rivers/${card.id}`}
      className={`group relative rounded-xl bg-background p-4 shadow transition-shadow hover:shadow-lg ${
        displayStatus !== "unknown" ? "border-2" : "border border-foreground/40"
      } ${isProjected ? "ring-2 ring-amber-400/40" : ""}`}
      style={
        displayStatus !== "unknown"
          ? {
              borderColor: displayColor,
              boxShadow: displayIsGood ? `0 0 12px ${displayColor}25` : undefined,
            }
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
      {displayFlow != null && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-bold tabular-nums"
              style={{ backgroundColor: displayColor, color: "#fff" }}
            >
              {displayFlow.toFixed(0)}
            </span>
            <span className="text-xs font-medium text-foreground/50">
              m&sup3;/s
            </span>
            {!isProjected && card.lastFlow != null && (
              <FlowTendency trend={card.trend} />
            )}
          </div>
          {isProjected && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              {t("timeTravel.projected")}
            </span>
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

      {/* Status pill */}
      {displayFlow != null ? (
        <div className="mt-2">
          {isProjected ? (
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: `${displayColor}22`, color: displayColor }}
            >
              {statusLabel(displayStatus, t)}
            </span>
          ) : (
            <StatusPill card={card} t={t} />
          )}
        </div>
      ) : (
        <div className="mt-2 rounded-lg bg-foreground/5 px-3 py-2">
          <p className="text-xs text-foreground/40">{t("app.pressRefresh")}</p>
        </div>
      )}

      {/* Gradient bar */}
      {displayFlow != null && (
        <div className="mt-2">
          <div
            className="relative h-2 w-full overflow-visible rounded-full"
            style={{
              background:
                displayIsGood || displayStatus === "too-high"
                  ? "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 70%, #FACC15 80%, #D32F2F)"
                  : "#a1a1aa",
            }}
          >
            {/* Dim the side of the bar that is opposite to the marker, so the
                relevant half (green when low, red when high) stays vivid. */}
            {(displayIsGood || displayStatus === "too-high") &&
              (displayPosition > 0.55 || displayPosition < 0.45) && (
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={
                    displayPosition > 0.55
                      ? {
                          left: 0,
                          right: `${(1 - displayPosition) * 100 + 6}%`,
                          backgroundImage:
                            "linear-gradient(to right, color-mix(in srgb, var(--background) 70%, transparent) 0%, color-mix(in srgb, var(--background) 70%, transparent) 60%, transparent 100%)",
                        }
                      : {
                          left: `${displayPosition * 100 + 6}%`,
                          right: 0,
                          backgroundImage:
                            "linear-gradient(to right, transparent 0%, color-mix(in srgb, var(--background) 70%, transparent) 40%, color-mix(in srgb, var(--background) 70%, transparent) 100%)",
                        }
                  }
                />
              )}
            {/* Current position indicator — hidden when too-low or unknown */}
            {(displayIsGood || displayStatus === "too-high") && (
              <div
                className={`absolute top-1/2 h-6 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white ring-2 ring-black/80 transition-all duration-500 dark:bg-zinc-900 dark:ring-white/85 ${
                  displayIsGood && !isProjected ? "animate-flow-pulse" : ""
                }`}
                style={{
                  left: `${Math.max(2, Math.min(98, displayPosition * 100))}%`,
                  boxShadow: "0 0 4px rgba(0,0,0,0.5)",
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
