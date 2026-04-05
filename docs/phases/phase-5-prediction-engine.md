# Phase 5 — Prediction Engine

**Status:** Not started
**Dependencies:** Phase 4 (trained model)
**Data required:** Weather forecasts (Open-Meteo) + ongoing official forecasts

## Goal

Use the trained model to produce actionable flow forecasts for any registered river.

## Prediction Flow

```
1. User registers a river with coordinates + whatever catchment info they have
2. System fetches:
   a. Recent observed weather (last 14 days) from Open-Meteo history
   b. Weather forecast (next 7-16 days) from Open-Meteo forecast
   c. Latest observed flow (if available from gauge)
3. System constructs feature matrix:
   - For each forecast day, compute features using the weather window ending on that day
   - Weather window = real historical weather + forecast weather stitched together
   - Lag flow features: Day+1 uses real observed flow, Day+2+ uses cascading predictions
4. Model predicts flow for each forecast day
5. System converts predictions back from log-space to real flow values
6. System compares predictions against paddling thresholds
7. System outputs: daily flow predictions + confidence bands + threshold crossings
```

## Confidence Estimation

Point predictions alone are not enough. The system should communicate uncertainty:
- Use quantile regression or prediction intervals from the model
- Wider intervals for longer horizons
- Wider intervals when weather forecast itself is uncertain (e.g., ensemble spread)
- Display to user as: "Thursday: 25 cumecs (likely range: 18-35)"

## Correlated River Predictions

For rivers without direct gauges:
1. Predict the reference (gauged) river's flow using the main model
2. Apply the correlation function to derive the ungauged river's estimated flow
3. Propagate uncertainty (correlation adds its own error margin)

## Deliverables

- Prediction module: takes a river station + current date → produces 7-day flow forecast with confidence bands
- Threshold comparison logic
- Correlated river estimation
- Output format suitable for API consumption
