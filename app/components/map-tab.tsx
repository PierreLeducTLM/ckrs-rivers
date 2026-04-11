"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/lib/i18n/provider";
import FilterChips, { type StatusFilter } from "./filter-chips";
import BottomSheet from "./bottom-sheet";
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<StationCard | null>(null);

  const filteredCards = useMemo(() => {
    if (statusFilter === "all") return cards;
    return cards.filter((c) => {
      if (statusFilter === "ideal") return c.status === "ideal";
      if (statusFilter === "runnable") return c.status === "runnable";
      if (statusFilter === "too-low") return c.status === "too-low";
      return true;
    });
  }, [cards, statusFilter]);

  return (
    <>
      {/* Full-bleed map container — breaks out of parent padding and fills between header and bottom nav */}
      <div
        className="relative -mx-6 sm:mx-0"
        style={{
          /* Fill from below header to above bottom nav (56px nav + safe area) */
          height: "calc(100vh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Filter chips overlay */}
        <div className="absolute left-0 right-0 top-2 z-20 px-4">
          <FilterChips value={statusFilter} onChange={setStatusFilter} t={t} />
        </div>

        {/* Map — full bleed, no border/rounding */}
        <StationMap
          cards={filteredCards}
          isAdmin={isAdmin}
          onMarkerTap={setSelectedCard}
          className="h-full w-full"
        />
      </div>

      {/* Bottom sheet — rendered outside map container so it overlays properly */}
      <BottomSheet
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        t={t}
      />
    </>
  );
}
