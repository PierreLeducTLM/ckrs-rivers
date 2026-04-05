# Phase 6 — Alert System

**Status:** Not started
**Dependencies:** Phase 5 (predictions)
**Data required:** Paddling thresholds per river (from paddling community)

## Goal

Notify paddlers when conditions are approaching or have reached their target flow range.

## Alert Logic

### Trigger Conditions (configurable per user per river)

- "Predicted to be in optimal range within next N days"
- "Currently rising and predicted to enter optimal range"
- "Currently in optimal range" (go now!)
- "Currently good but predicted to leave optimal range soon" (last chance)
- "Predicted to exceed high-water threshold" (safety warning)

### Alert Timing Intelligence

- Don't alert for a Thursday window on Monday if forecast confidence is low — wait until Wednesday when the forecast is more reliable
- Re-evaluate daily: if Thursday's prediction changes significantly, update the alert
- Avoid alert fatigue: consolidate multiple updates into one daily digest, with "breaking" alerts only for high-confidence imminent windows

### Alert Content

- River name and predicted flow
- Confidence level (high/medium/low)
- How long the window is expected to last
- Trend (rising into range, stable in range, falling out of range)

## Deliverables

- Alert evaluation engine (runs daily per user per river)
- Alert state machine (tracks what has been communicated to avoid repeats)
- Alert message generation (human-readable summaries)
- Alert delivery interface (prepare for push notifications, email, SMS — but don't build delivery infrastructure yet)
