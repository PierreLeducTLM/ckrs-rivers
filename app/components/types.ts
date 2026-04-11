export interface StationCard {
  id: string;
  name: string;
  lat: number;
  lon: number;
  municipality?: string;
  catchmentArea?: number;
  lastFlow: number | null;
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
}
