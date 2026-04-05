# Phase 1 — Domain Model & Data Structures

**Status:** Not started
**Dependencies:** None
**Data required:** None

## Goal

Define the core domain concepts and how they relate to each other. No ML yet — just the language of the problem.

## Concepts to Model

### River Station

A monitored point on a river. Properties:
- Coordinates (lat, lon) — used to fetch weather data
- Elevation (meters)
- Catchment area (km²) — how large the drainage basin is upstream
- Catchment slope (average gradient — steep vs flat)
- Land cover profile (% forest, % rock, % urban, % agricultural) — affects water absorption
- Base flow (typical low-water flow in dry conditions)
- River bed type (bedrock, gravel, sand) — affects drainage speed
- Orientation (north/south facing — affects snowmelt timing)

Not all properties will be known for every river. The system must handle partial profiles gracefully with sensible defaults or estimations.

### Flow Reading

A single observation of river conditions at a station:
- Timestamp
- Flow value (cubic meters per second) or water level (meters)
- Source (direct gauge, manual observation, estimated from correlated station)
- Quality flag (verified, provisional, estimated)

### Paddling Threshold

User-defined ranges for a given river:
- Too low (not runnable)
- Low but runnable (bony, technical)
- Optimal range
- High but runnable (pushy, serious)
- Too high (dangerous)

These thresholds are subjective and per-river. Different paddler skill levels may define different thresholds for the same river.

### Official Forecast

The government hydrological service prediction for a gauged river:
- Timestamp of when the forecast was issued
- Target date (the day being predicted)
- Low bound (minimum expected flow/level)
- High bound (maximum expected flow/level)
- Source (which hydrological service)
- Horizon (how many days ahead this prediction is for)

These official forecasts are both an INPUT to our model (powerful feature) and a BENCHMARK to compare against. Every official forecast must be stored so we can later evaluate: did our model beat the official range?

### Correlated River

When a river has no direct gauge, it can be linked to a gauged river:
- Reference station (the gauged river)
- Correlation function (could be linear ratio, could be offset, could be nonlinear)
- Time offset (River B peaks 3 hours after River A)
- Confidence level of the correlation

### Weather Window

A snapshot of weather conditions for a location over a time period:
- Precipitation (mm) — rain
- Snowfall (cm) — new snow
- Snow depth (cm) — existing snowpack
- Temperature (min, max, mean)
- Soil moisture (multiple depth levels if available)
- Wind speed and direction
- Solar radiation (affects snowmelt and evaporation)
- Freezing level elevation

## Deliverables

- Data model definitions (classes/schemas)
- Validation rules (e.g., flow cannot be negative, catchment area must be positive)
- Unit handling (the system must be clear about units everywhere)
- A sample dataset structure with 2-3 fictional rivers to test against
