"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/lib/i18n/provider";
import { useTab } from "./tab-context";
import FilterChips from "./filter-chips";
import RapidClassFilter, { matchesClassFilter } from "./rapid-class-filter";
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
  const { statusFilter, setStatusFilter, classFilter, setClassFilter } = useTab();

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "runnable" && c.status !== "runnable" && c.status !== "ideal") return false;
        if (statusFilter === "too-low" && c.status !== "too-low") return false;
      }
      // Rapid class filter
      if (!matchesClassFilter(c.rapidClass, classFilter)) return false;
      return true;
    });
  }, [cards, statusFilter, classFilter]);

  return (
    <>
      {/* Filter chips — sits above the map in normal document flow */}
      <div className="flex-shrink-0 pb-2 flex flex-col gap-2">
        <FilterChips value={statusFilter} onChange={setStatusFilter} t={t} />
        <RapidClassFilter value={classFilter} onChange={setClassFilter} t={t} />
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
