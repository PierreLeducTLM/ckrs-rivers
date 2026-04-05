# Whitewater River Flow Prediction — Development Plan

## Project Vision

Build a system that predicts river flow levels for whitewater paddlers. The system ingests weather data, river characteristics, and official hydrological forecasts to produce sharper, more granular flow predictions than the official service provides. It alerts users when conditions are approaching paddleable levels and continuously improves as real observations come in.

### Key Insight: Refinement, Not Reinvention

The government hydrological service already provides a 7-day forecast (low/high interval) for gauged rivers. Our model does NOT replace this — it **refines** it:
- **Narrow the interval** — official says 15–40 cumecs, our model predicts 22–28
- **Add granularity** — react to weather forecast updates faster than the official daily cycle
- **Learn systematic bias** — detect when the official forecast consistently over/under-predicts for certain river types or conditions
- **Extend the horizon** — beyond 7 days where the official forecast ends, our weather-based model takes over with lower confidence

The official forecast is our most powerful input feature AND our benchmark to beat.

---

## Phase Overview

| Phase | Name | Depends On | Data Required |
|-------|------|------------|---------------|
| 1 | [Domain Model & Data Structures](phases/phase-1-domain-model.md) | None | None |
| 2 | [Weather Data Integration](phases/phase-2-weather-integration.md) | Phase 1 | Station coordinates |
| 3 | [Feature Engineering](phases/phase-3-feature-engineering.md) | Phase 2 | Catchment properties |
| 4 | [Model Training Framework](phases/phase-4-model-training.md) | Phase 3 | Historical flow + official forecasts |
| 5 | [Prediction Engine](phases/phase-5-prediction-engine.md) | Phase 4 | Weather forecasts + ongoing official forecasts |
| 6 | [Alert System](phases/phase-6-alert-system.md) | Phase 5 | Paddling thresholds |
| 7 | [Feedback Loop & Model Refinement](phases/phase-7-feedback-loop.md) | Phase 5 | Real-world usage |
| 8 | [Application API & Interface](phases/phase-8-api-interface.md) | Phase 5 (parallel from here) | None |

Phases 1-3 can proceed without historical river flow data.
Phase 4 is the first point where real river data is required.
Phase 8 can start in parallel from Phase 5 onward.

---

## Data Requirements Summary

| Data | Source | When Needed |
|------|--------|-------------|
| Historical flow readings for 3-5+ rivers | User-provided (government hydrometric data) | Phase 4 |
| Historical official forecasts (low/high) for those rivers | User-provided (government hydrological service) | Phase 4 |
| River station coordinates | User-provided with flow data | Phase 2 |
| Basic catchment properties per river | User-provided or estimated | Phase 3 |
| Historical weather | Open-Meteo API (fetched automatically) | Phase 2 |
| Weather forecasts | Open-Meteo API (fetched in real-time) | Phase 5 |
| Ongoing official forecasts (low/high) | Government hydrological service (fetched/scraped regularly) | Phase 5 |
| Paddling thresholds per river | User-provided (from paddling community knowledge) | Phase 6 |
