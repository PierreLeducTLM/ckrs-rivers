"use client";

import dynamic from "next/dynamic";
import type { Rapid } from "@/lib/domain/river-station";
import type { FlagState } from "@/app/use-feature-flag";

const RapidsScroller = dynamic(() => import("./rapids-scroller"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-300 border-t-blue-600 dark:border-zinc-700" />
    </div>
  ),
});

interface Props {
  stationId: string;
  stationName: string;
  stationLat: number;
  stationLon: number;
  riverPath: [number, number][] | null;
  rapids: Rapid[];
  flagState: FlagState;
}

export default function RapidsScrollerWrapper(props: Props) {
  return <RapidsScroller {...props} />;
}
