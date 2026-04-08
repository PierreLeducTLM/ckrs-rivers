"use client";

import dynamic from "next/dynamic";
import { useAdmin } from "@/app/use-admin";
import StationMetaEditor from "./station-meta-editor";

const RiverPathEditor = dynamic(() => import("./river-path-editor"), {
  ssr: false,
  loading: () => (
    <div className="mt-4 h-12 animate-pulse rounded-lg bg-foreground/5" />
  ),
});

interface RiverHeaderProps {
  stationId: string;
  initialName: string;
  initialPaddling: {
    min: number | null;
    ideal: number | null;
    max: number | null;
  };
  initialWeatherCity: string | null;
  stationLat: number;
  stationLon: number;
  initialPutIn?: [number, number] | null;
  initialTakeOut?: [number, number] | null;
  initialRiverPath?: [number, number][] | null;
}

export default function RiverHeader({
  stationId,
  initialName,
  initialPaddling,
  initialWeatherCity,
  stationLat,
  stationLon,
  initialPutIn = null,
  initialTakeOut = null,
  initialRiverPath = null,
}: RiverHeaderProps) {
  const isAdmin = useAdmin();

  return (
    <>
      <StationMetaEditor
        stationId={stationId}
        initialName={initialName}
        initialPaddling={initialPaddling}
        initialWeatherCity={initialWeatherCity}
        isAdmin={isAdmin}
      />
      {isAdmin && (
        <RiverPathEditor
          stationId={stationId}
          stationLat={stationLat}
          stationLon={stationLon}
          initialPutIn={initialPutIn}
          initialTakeOut={initialTakeOut}
          initialPath={initialRiverPath}
        />
      )}
    </>
  );
}
