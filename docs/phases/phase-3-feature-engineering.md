# Phase 3 — Feature Engineering

**Status:** Not started
**Dependencies:** Phase 2 (weather data)
**Data required:** Catchment properties (partial OK)

## Goal

Transform raw weather data into features that capture how weather translates to river flow. This is the most critical intellectual phase — the quality of features determines model quality more than the choice of algorithm.

## Core Principle: Rivers Have Memory

Today's river level is NOT just about today's weather. It is the result of:
- Rain from the past hours/days draining through the catchment
- Snow accumulated over weeks/months now melting
- Soil that was saturated from last week's rain, so new rain runs off faster
- Baseflow from groundwater that takes weeks to respond

The feature engineering must encode this temporal memory.

## Feature Categories

### 1. Precipitation Accumulation Features

- Precip in last 1, 3, 6, 12, 24, 48, 72 hours (for hourly models)
- Precip in last 1, 2, 3, 5, 7, 14 days (for daily models)
- Precip intensity (max hourly rate in last 24h) — a short intense burst causes more runoff than the same total spread over a day
- Days since last significant rain (>5mm) — dry periods mean soil absorbs more

### 2. Snowmelt Features

- Current snow depth
- Snow depth change over last 1, 3, 7 days (negative = melting)
- Degree-days above 0°C in last 1, 3, 7 days (proxy for melt energy)
- Freezing level relative to catchment elevation range — if freezing level rises above the catchment, all snow in the catchment is melting
- "Melt potential" = snow_depth × positive_degree_days (more snow + warmer = more melt water)

### 3. Soil Saturation Features

- Current soil moisture at different depths
- Soil moisture trend (rising, stable, falling over last 7 days)
- Soil moisture percentile (compared to historical range — is the soil unusually wet or dry for this time of year?)
- "Runoff potential" = when soil is saturated, nearly all precipitation becomes runoff

### 4. Temperature Features

- Current temperature
- Freeze/thaw cycle detection (did temperature cross 0°C in last 24h?)
- Diurnal temperature range (large range = strong daytime melt, nighttime refreeze)
- Cumulative degree-days above 0°C since last snowfall (tracks melt progression)

### 5. Seasonal/Calendar Features

- Day of year (captures seasonal patterns — spring melt, fall rains)
- Encode cyclically: sin(2π × day/365) and cos(2π × day/365)
- Month grouping (winter base flow, spring melt, summer low, fall rain)

### 6. Catchment Features (static per river)

- Catchment area (larger = slower response, more smoothing)
- Average slope (steeper = faster response)
- Forest cover fraction (more forest = more absorption = slower response)
- Elevation range (determines snow vs rain line)
- Base flow (characterizes the "minimum" the river settles to)

### 7. Lag Features

- Previous day's observed flow (autoregressive — tomorrow's flow is strongly correlated with today's)
- Flow trend over last 1, 3, 7 days (rising, falling, stable)
- Rate of change of flow (helps distinguish rising limb from falling limb of a flood pulse)

### 8. Official Forecast Features

- Official forecast low bound for the target day
- Official forecast high bound for the target day
- Official forecast midpoint (low + high) / 2
- Official forecast spread (high - low) — wider spread = more uncertainty from the official model
- Forecast horizon (how many days ahead was this issued — Day+1 official forecasts are more reliable than Day+7)
- Historical official forecast bias for this station (does the service tend to over/under-predict this river?)

These are likely the single most powerful features in the model. The official forecast already encodes watershed modeling, upstream conditions, dam operations, and domain expertise we cannot replicate. Our model's job is to learn when and how to adjust it.

## Important: Feature Windows for Prediction

During **training**, we have observed flow to use as lag features. During **prediction** of future days, we don't. The system must handle this:
- Day+1 prediction: use today's observed flow as lag
- Day+2 prediction: use Day+1's *predicted* flow as lag (cascading prediction)
- This means prediction uncertainty grows with horizon — the app should communicate this

## Deliverables

- Feature computation module that takes raw weather + station profile → feature matrix
- Clear documentation of every feature and its hydrological rationale
- Feature computation must work identically for historical (training) and forecast (prediction) data
- Unit tests verifying feature calculations against hand-computed examples
