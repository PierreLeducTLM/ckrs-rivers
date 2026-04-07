"use client";

import { useAdmin } from "@/app/use-admin";
import StationMetaEditor from "./station-meta-editor";

interface RiverHeaderProps {
  stationId: string;
  initialName: string;
  initialPaddling: {
    min: number | null;
    ideal: number | null;
    max: number | null;
  };
  initialWeatherCity: string | null;
}

export default function RiverHeader({
  stationId,
  initialName,
  initialPaddling,
  initialWeatherCity,
}: RiverHeaderProps) {
  const isAdmin = useAdmin();

  return (
    <StationMetaEditor
      stationId={stationId}
      initialName={initialName}
      initialPaddling={initialPaddling}
      initialWeatherCity={initialWeatherCity}
      isAdmin={isAdmin}
    />
  );
}
