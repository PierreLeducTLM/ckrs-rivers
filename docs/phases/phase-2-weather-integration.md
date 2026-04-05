# Phase 2 — Weather Data Integration (Open-Meteo)

**Status:** Not started
**Dependencies:** Phase 1 (data structures)
**Data required:** River station coordinates

## Goal

Build a reliable pipeline to fetch historical and forecast weather data from Open-Meteo, aligned to river station coordinates.

## Logic

### Historical Weather Retrieval

- Given a station's coordinates and a date range, fetch daily weather history
- Variables needed: precipitation_sum, snowfall_sum, snow_depth, temperature_2m_max, temperature_2m_min, temperature_2m_mean, soil_moisture_0_to_7cm, soil_moisture_7_to_28cm, soil_moisture_28_to_100cm, wind_speed_10m_max, shortwave_radiation_sum
- Store locally to avoid re-fetching
- Handle API rate limits and missing data gracefully

### Forecast Weather Retrieval

- Same variables but from the forecast endpoint (7-16 day horizon)
- Must be fetched fresh each time predictions are made (forecasts change daily)

### Elevation-Adjusted Weather

- River stations at different elevations experience different conditions than the nearest weather grid point
- Apply lapse rate corrections for temperature (~6.5°C per 1000m elevation difference)
- Precipitation may increase with elevation (orographic effect) — apply a simple multiplier based on elevation difference

### Temporal Alignment

- All weather data must align to the same timezone and daily boundaries as the flow readings
- Handle daylight saving transitions cleanly

## Deliverables

- Weather data fetcher module
- Local caching/storage layer
- Data alignment and cleaning utilities
- A working example: fetch 2 years of weather for a given lat/lon and store it
