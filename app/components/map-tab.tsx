"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/lib/i18n/provider";
import { useTab } from "./tab-context";
import FilterChips from "./filter-chips";
import type { StationCard } from "./types";

const StationMap = dynamic(() => import("../station-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-foreground/5">
      <p className="text-foreground/40">Loading map...</p>
    </div>
  ),
});

interface MapTabProps {
  cards: StationCard[];
  isAdmin: boolean;
}

export default function MapTab({ cards, isAdmin }: MapTabProps) {
  const { t } = useTranslation();
  const { statusFilter, setStatusFilter } = useTab();

  const filteredCards = useMemo(() => {
    if (statusFilter === "all") return cards;
    return cards.filter((c) => {
      if (statusFilter === "runnable") return c.status === "runnable" || c.status === "ideal";
      if (statusFilter === "too-low") return c.status === "too-low";
      return true;
    });
  }, [cards, statusFilter]);

  return (
    <>
      {/* Filter chips — sits above the map in normal document flow */}
      <div className="flex-shrink-0 pb-2">
        <FilterChips value={statusFilter} onChange={setStatusFilter} t={t} />
      </div>

      {/* Map fills all remaining vertical space via flex-1 */}
      <div className="min-h-0 flex-1 -mx-6 sm:mx-0 isolate z-0">
        <StationMap
          cards={filteredCards}
          isAdmin={isAdmin}
          className="h-full w-full"
        />
      </div>
    </>
  );
}
