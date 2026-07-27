import type { TrendDirection } from "@/lib/domain/notification";
import type { Rapid } from "@/lib/domain/river-station";

export interface StationCard {
  id: string;
  name: string;
  lat: number;
  lon: number;
  municipality?: string;
  catchmentArea?: number;
  lastFlow: number | null;
  /**
   * Unit label for the displayed value — "m³/s" for a CEHQ flow, or the
   * camera scale's own unit (e.g. "m", "cm") for a camera-reading river.
   * Empty string when a camera has no scale unit configured.
   */
  flowUnit: string;
  /**
   * True when `lastFlow` holds a camera scale reading rather than a CEHQ
   * flow. Used to format the value (2 decimals) and hide the flow-trend
   * arrow, which has no meaning for a single camera reading.
   */
  isReading: boolean;
  forecastAt: string | null;
  sparkData: Array<{
    ts: number;
    observed: number | null;
    cehqForecast: number | null;
    cehqRange?: [number, number];
  }>;
  nowTs: number;
  paddling: { min?: number; ideal?: number; max?: number } | null;
  status: "unknown" | "too-low" | "runnable" | "ideal" | "too-high";
  position: number;
  color: string;
  isGoodRange: boolean;
  trend: TrendDirection;
  weatherDays: Array<{
    date: string;
    tempMin: number | null;
    tempMax: number | null;
    precipitation: number;
    snowfall: number;
  }>;
  putIn?: [number, number];
  takeOut?: [number, number];
  riverPath?: [number, number][];
  rapidClass?: string;
  rapids?: Rapid[];
  approved: boolean;
  hidden: boolean;
}
