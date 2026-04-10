"use client";

import dynamic from "next/dynamic";
import { useAdmin } from "@/app/use-admin";
import { useTranslation } from "@/lib/i18n/provider";
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
  catchmentArea?: number;
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
  catchmentArea,
  initialPutIn = null,
  initialTakeOut = null,
  initialRiverPath = null,
}: RiverHeaderProps) {
  const isAdmin = useAdmin();
  const { t } = useTranslation();

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
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            {t("detail.station")}{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{stationId}</span>
          </span>
          <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
          <span>
            {stationLat.toFixed(4)}N, {stationLon.toFixed(4)}W
          </span>
          {catchmentArea !== undefined && (
            <>
              <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
              <span>
                {t("detail.catchment")}{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {Number(catchmentArea).toLocaleString()} km&sup2;
                </span>
              </span>
            </>
          )}
        </div>
      )}
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
