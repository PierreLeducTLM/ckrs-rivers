"use client";

import dynamic from "next/dynamic";
import type { Rapid } from "@/lib/domain/river-station";

const RiverCloseupMap = dynamic(() => import("./river-closeup-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800 sm:h-[350px]" />
  ),
});

interface RiverMapWrapperProps {
  riverPath: [number, number][] | null;
  putIn: [number, number] | null;
  takeOut: [number, number] | null;
  stationLat: number;
  stationLon: number;
  color?: string;
  rapids?: Rapid[];
  stationId?: string;
}

export default function RiverMapWrapper(props: RiverMapWrapperProps) {
  return <RiverCloseupMap {...props} />;
}
