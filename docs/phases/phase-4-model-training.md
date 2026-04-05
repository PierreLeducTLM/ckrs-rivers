# Phase 4 — Model Training Framework

**Status:** Not started
**Dependencies:** Phase 3 (feature engineering) + user-provided river flow data
**Data required:** Historical flow readings + historical official forecasts for 3-5+ rivers

## Goal

Build the training pipeline for a generic cross-river model.

## Training Data Structure

Each training sample is one row:
- Target: observed flow at station S on day D
- Features: weather features for station S's location over the window ending on day D, plus station S's static catchment features

Training data combines samples from ALL available rivers. The model learns general hydrology, not river-specific patterns.

## Model Choice: Gradient Boosted Trees (start with XGBoost or LightGBM)

Rationale:
- Handles mixed feature types (continuous weather + categorical land cover)
- Naturally captures nonlinear relationships (saturation thresholds, melt onset)
- Feature importance is interpretable — we can verify the model uses sensible signals
- Fast to train and iterate
- Robust to missing features (important since not all rivers have complete profiles)

## Training Strategy

### Train/Validation/Test Split — by time, not random

- Training: first 70% of each river's time series
- Validation: next 15% (for hyperparameter tuning)
- Test: final 15% (for honest evaluation)
- NEVER split randomly — this would leak future information into training

### Target Variable

- Predict log(flow) rather than raw flow — flow distributions are right-skewed
- This helps the model be proportionally accurate (a 10% error matters equally at low and high flows)

### Evaluation Metrics

- **Nash-Sutcliffe Efficiency (NSE)** — standard hydrology metric, 1.0 is perfect, 0.0 means model is no better than predicting the mean
- **Mean Absolute Percentage Error (MAPE)** — intuitive "how far off in percent"
- **Threshold accuracy** — what percentage of days does the model correctly classify as "above good flow" or "below good flow"? This is what paddlers actually care about.

### Multi-Horizon Training

- Train separate models (or model heads) for Day+1, Day+2, Day+3, ... Day+7
- Alternatively, include "prediction_horizon" as a feature so one model handles all horizons
- Day+1 will always be most accurate; accuracy degrades with horizon

## Handling Missing Catchment Data

Many rivers won't have complete profiles. Strategy:
- Train with intentional feature masking — randomly zero out some catchment features during training so the model learns to cope
- Use sentinel values (e.g., -1) for unknown catchment features, not zero (zero could be a valid value)
- The model will be less accurate for poorly described rivers, which is expected and honest

## Deliverables

- Training pipeline: data loading → feature computation → train/val/test split → model training → evaluation
- Evaluation report generation (metrics + residual plots + feature importance)
- Model serialization (save trained model for use in prediction)
- Hyperparameter configuration file (not hardcoded)
