# Phase 7 — Feedback Loop & Model Refinement

**Status:** Not started
**Dependencies:** Phase 5 (predictions) + real-world usage
**Data required:** Ongoing predictions vs actuals

## Goal

Continuously improve the model as real observations come in.

## Logic

### Prediction Tracking

- Store every prediction made (river, date predicted, date predicted for, predicted value, confidence interval)
- **Store the official hydrological service forecast (low/high) for the same river and date** — captured at the same time and stored alongside our prediction
- When actual flow data becomes available, compute prediction error for BOTH our model and the official forecast
- Track accuracy metrics over time per river and per horizon

### Benchmark Comparison (critical from day one)

For every observed flow value, evaluate:
- Did the actual flow fall within the official forecast range? (baseline accuracy)
- Did the actual flow fall within OUR predicted range? (our accuracy)
- Was our predicted range narrower than the official range? (are we adding value by being more precise?)
- Was our point prediction closer to actual than the official midpoint? (are we more accurate?)

Generate a rolling scorecard: "Our model beats the official forecast X% of the time, with Y% narrower intervals"

If our model is NOT beating the official forecast, that's valuable information — it tells us which features or river types need work.

Track this separately by river type, season, and flow regime (the model may beat officials during spring melt but not during rain events).

### Model Retraining Triggers

- Scheduled: retrain monthly with all accumulated data
- Performance-based: retrain if rolling accuracy drops below threshold
- Data-based: retrain when a new river with sufficient history is added

### River-Specific Calibration (optional refinement)

- After the generic model makes predictions for a specific river for a while, compute a bias correction
- Example: if the model consistently over-predicts River X by 15%, apply a 0.85 multiplier
- This gives some river-specific adaptation without needing a full per-river model

### User Feedback Integration

- Allow paddlers to report actual conditions ("I was there, it was medium-high")
- These qualitative reports can validate or flag prediction errors even when gauge data is unavailable
- Over time, user reports for ungauged rivers can help calibrate correlation functions

## Deliverables

- Prediction logging and tracking system
- Accuracy dashboard (per river, per horizon, over time)
- Bias correction calculator
- Retraining pipeline (same as Phase 4 but automated)
