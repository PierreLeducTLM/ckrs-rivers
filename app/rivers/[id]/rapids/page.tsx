export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getStationById } from "@/lib/data/rivers";
import { getFeatureFlagState } from "@/lib/feature-flags";
import RapidsScrollerWrapper from "./rapids-scroller-wrapper";

export default async function RapidsScreenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const flagState = await getFeatureFlagState("rapids");
  if (flagState === "off") notFound();

  const station = await getStationById(id);
  if (!station) notFound();

  const rapids = station.rapids ?? [];
  const riverPath = station.riverPath ?? null;

  return (
    <RapidsScrollerWrapper
      stationId={id}
      stationName={station.name}
      stationLat={Number(station.coordinates.lat)}
      stationLon={Number(station.coordinates.lon)}
      riverPath={riverPath}
      rapids={rapids}
      flagState={flagState}
    />
  );
}
