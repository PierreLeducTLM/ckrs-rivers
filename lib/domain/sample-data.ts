import { RiverStationSchema, type RiverStation } from "./river-station";
import { FlowReadingSchema, type FlowReading } from "./flow-reading";
import {
  PaddlingThresholdSchema,
  type PaddlingThreshold,
} from "./paddling-threshold";
import {
  OfficialForecastSchema,
  type OfficialForecast,
} from "./official-forecast";
import { CorrelatedRiverSchema, type CorrelatedRiver } from "./correlated-river";
import { WeatherWindowSchema, type WeatherWindow } from "./weather-window";

// ---------------------------------------------------------------------------
// River Stations
// ---------------------------------------------------------------------------

export const SAMPLE_STATIONS: RiverStation[] = [
  // 1. Fully characterized gauged river
  RiverStationSchema.parse({
    id: "riviere-du-nord",
    name: "Rivière du Nord",
    coordinates: { lat: 46.5, lon: -74.0 },
    elevation: 200,
    catchmentArea: 450,
    catchmentSlope: 0.08,
    landCover: { forest: 70, rock: 15, urban: 5, agricultural: 10 },
    baseFlow: 8.5,
    riverBedType: "gravel",
    orientation: "south",
  }),

  // 2. Partial-data mountain creek
  RiverStationSchema.parse({
    id: "ruisseau-sauvage",
    name: "Ruisseau Sauvage",
    coordinates: { lat: 47.2, lon: -71.5 },
    elevation: 680,
    riverBedType: "bedrock",
    orientation: "north",
  }),

  // 3. Ungauged river (correlated to Rivière du Nord)
  RiverStationSchema.parse({
    id: "torrent-vallee",
    name: "Torrent de la Vallée",
    coordinates: { lat: 46.8, lon: -73.8 },
    elevation: 350,
    catchmentArea: 120,
    catchmentSlope: 0.15,
    riverBedType: "gravel",
    orientation: "west",
  }),
];

// ---------------------------------------------------------------------------
// Flow Readings — rising then falling hydrograph for Rivière du Nord
// ---------------------------------------------------------------------------

const baseDate = "2026-03-28";

export const SAMPLE_READINGS: FlowReading[] = [
  { flow: 12, quality: "verified" },
  { flow: 15, quality: "verified" },
  { flow: 22, quality: "verified" },
  { flow: 35, quality: "provisional" },
  { flow: 42, quality: "provisional" },
  { flow: 38, quality: "provisional" },
  { flow: 28, quality: "verified" },
  { flow: 20, quality: "verified" },
  { flow: 16, quality: "verified" },
  { flow: 13, quality: "estimated" },
].map((r, i) =>
  FlowReadingSchema.parse({
    stationId: "riviere-du-nord",
    timestamp: `${baseDate}T${String(8 + i).padStart(2, "0")}:00:00Z`,
    flow: r.flow,
    source: r.quality === "estimated" ? "estimated" : "gauge",
    quality: r.quality,
  }),
);

// ---------------------------------------------------------------------------
// Paddling Thresholds — intermediate and expert for Rivière du Nord
// ---------------------------------------------------------------------------

export const SAMPLE_THRESHOLDS: PaddlingThreshold[] = [
  PaddlingThresholdSchema.parse({
    stationId: "riviere-du-nord",
    skillLevel: "intermediate",
    tooLow: { min: 0, max: 10 },
    lowRunnable: { min: 10, max: 18 },
    optimal: { min: 18, max: 30 },
    highRunnable: { min: 30, max: 45 },
    tooHigh: { min: 45, max: 200 },
  }),
  PaddlingThresholdSchema.parse({
    stationId: "riviere-du-nord",
    skillLevel: "expert",
    tooLow: { min: 0, max: 8 },
    lowRunnable: { min: 8, max: 15 },
    optimal: { min: 15, max: 45 },
    highRunnable: { min: 45, max: 70 },
    tooHigh: { min: 70, max: 200 },
  }),
];

// ---------------------------------------------------------------------------
// Official Forecasts — widening intervals at increasing horizons
// ---------------------------------------------------------------------------

export const SAMPLE_FORECASTS: OfficialForecast[] = [
  OfficialForecastSchema.parse({
    stationId: "riviere-du-nord",
    issuedAt: "2026-03-28T06:00:00Z",
    targetDate: "2026-03-29",
    lowBound: 20,
    highBound: 30,
    source: "Centre d'expertise hydrique du Québec",
    horizonDays: 1,
  }),
  OfficialForecastSchema.parse({
    stationId: "riviere-du-nord",
    issuedAt: "2026-03-28T06:00:00Z",
    targetDate: "2026-03-31",
    lowBound: 15,
    highBound: 40,
    source: "Centre d'expertise hydrique du Québec",
    horizonDays: 3,
  }),
  OfficialForecastSchema.parse({
    stationId: "riviere-du-nord",
    issuedAt: "2026-03-28T06:00:00Z",
    targetDate: "2026-04-02",
    lowBound: 10,
    highBound: 50,
    source: "Centre d'expertise hydrique du Québec",
    horizonDays: 5,
  }),
];

// ---------------------------------------------------------------------------
// Correlated River — Torrent de la Vallée linked to Rivière du Nord
// ---------------------------------------------------------------------------

export const SAMPLE_CORRELATION: CorrelatedRiver = CorrelatedRiverSchema.parse({
  stationId: "torrent-vallee",
  referenceStationId: "riviere-du-nord",
  correlation: { type: "linear", ratio: 0.3, offset: 2 },
  timeOffsetHours: 2,
  confidence: 0.78,
});

// ---------------------------------------------------------------------------
// Weather Windows — 3 consecutive days showing a rain event arriving
// ---------------------------------------------------------------------------

export const SAMPLE_WEATHER: WeatherWindow[] = [
  // Day 1: dry, cold
  WeatherWindowSchema.parse({
    stationId: "riviere-du-nord",
    date: "2026-03-28",
    precipitation: 0,
    snowfall: 0,
    snowDepth: 15,
    temperature: { min: -3, max: 4, mean: 1 },
    soilMoisture: { depth0to7cm: 0.35, depth7to28cm: 0.42, depth28to100cm: 0.5 },
    wind: { speed: 3.2, direction: "NW" },
    solarRadiation: 180,
    freezingLevel: 600,
  }),
  // Day 2: rain begins, warming
  WeatherWindowSchema.parse({
    stationId: "riviere-du-nord",
    date: "2026-03-29",
    precipitation: 15,
    snowfall: 0,
    snowDepth: 12,
    temperature: { min: 1, max: 8, mean: 5 },
    soilMoisture: { depth0to7cm: 0.55, depth7to28cm: 0.48, depth28to100cm: 0.52 },
    wind: { speed: 5.8, direction: "S" },
    solarRadiation: 95,
    freezingLevel: 1200,
  }),
  // Day 3: heavy rain, snowmelt accelerating
  WeatherWindowSchema.parse({
    stationId: "riviere-du-nord",
    date: "2026-03-30",
    precipitation: 25,
    snowfall: 0,
    snowDepth: 5,
    temperature: { min: 4, max: 12, mean: 8 },
    soilMoisture: { depth0to7cm: 0.78, depth7to28cm: 0.6, depth28to100cm: 0.55 },
    wind: { speed: 8.1, direction: "SW" },
    solarRadiation: 60,
    freezingLevel: 1800,
  }),
];

// ---------------------------------------------------------------------------
// Validation helper — call to verify all sample data parses correctly
// ---------------------------------------------------------------------------

export function validateSampleData(): void {
  SAMPLE_STATIONS.forEach((s) => RiverStationSchema.parse(s));
  SAMPLE_READINGS.forEach((r) => FlowReadingSchema.parse(r));
  SAMPLE_THRESHOLDS.forEach((t) => PaddlingThresholdSchema.parse(t));
  SAMPLE_FORECASTS.forEach((f) => OfficialForecastSchema.parse(f));
  CorrelatedRiverSchema.parse(SAMPLE_CORRELATION);
  SAMPLE_WEATHER.forEach((w) => WeatherWindowSchema.parse(w));
}
