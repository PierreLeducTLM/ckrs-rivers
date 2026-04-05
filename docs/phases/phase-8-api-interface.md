# Phase 8 — Application API & Interface

**Status:** Not started
**Dependencies:** Phase 5 (can start in parallel from Phase 5 onward)
**Data required:** None (consumes other phases' outputs)

## Goal

Expose the system through a clean API that a mobile/web app can consume.

## Core Endpoints (logical, not technical)

### River Management

- Register a new river (coordinates, catchment info, thresholds)
- Update river properties
- Define correlation between two rivers
- List all rivers

### Current Conditions

- Get latest known flow for a river
- Get current conditions summary (flow + trend + status relative to thresholds)

### Forecasts

- Get 7-day flow forecast for a river (values + confidence + threshold status per day)
- Get forecast summary ("Next good window: Thursday-Saturday, confidence: medium")

### Alerts

- Configure alert preferences for a user/river combination
- Get pending alerts
- Acknowledge/dismiss an alert

### Historical

- Get historical flow and predictions for a river over a date range
- Get model accuracy statistics for a river

## Deliverables

- API design document
- Core API implementation
- Basic web interface for river management and forecast display
