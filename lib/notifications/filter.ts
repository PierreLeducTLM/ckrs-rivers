/**
 * Filter alert candidates based on subscriber preferences and cooldown state.
 */

import {
  ALERT_COOLDOWN_MS,
  type AlertCandidate,
  type AlertType,
  type Priority,
  type SubscriberPreferences,
} from "@/lib/domain/notification";

interface AlertStateRow {
  alert_type: string;
  state: string;
  last_triggered: string | null;
}

interface FilterContext {
  preferences: SubscriberPreferences;
  alertStates: AlertStateRow[];
  now: Date;
}

/**
 * Returns the subset of candidates that should be sent,
 * after applying all preference and cooldown filters.
 */
export function filterAlerts(
  candidates: AlertCandidate[],
  ctx: FilterContext,
): AlertCandidate[] {
  return candidates.filter((c) => {
    // 1. Cooldown check
    if (isInCooldown(c.alertType, ctx.alertStates, ctx.now)) return false;

    // 2. Quiet hours (suppress non-critical during 22:00-07:00 ET)
    if (isQuietHour(c.priority, ctx.preferences, ctx.now)) return false;

    // 3. Weekend-only mode
    if (ctx.preferences.weekendOnly && !isWeekendWindow(c, ctx.now)) return false;

    // 4. Confidence threshold
    if (!meetsConfidenceThreshold(c, ctx.preferences)) return false;

    // 5. Acceptable range — runnable-in-n-days has a lead time check
    if (!meetsLeadTime(c, ctx.preferences)) return false;

    return true;
  });
}

/**
 * Separate alerts into immediate vs. digest buckets.
 */
export function routeAlerts(
  alerts: AlertCandidate[],
  digestMode: boolean,
): { immediate: AlertCandidate[]; digest: AlertCandidate[] } {
  if (!digestMode) {
    return { immediate: alerts, digest: [] };
  }

  const immediate: AlertCandidate[] = [];
  const digest: AlertCandidate[] = [];

  for (const a of alerts) {
    // Critical and high always go immediate
    if (a.priority === "critical" || a.priority === "high") {
      immediate.push(a);
    } else {
      digest.push(a);
    }
  }

  return { immediate, digest };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInCooldown(
  alertType: AlertType,
  alertStates: AlertStateRow[],
  now: Date,
): boolean {
  const state = alertStates.find((s) => s.alert_type === alertType);
  if (!state || !state.last_triggered) return false;

  const lastTriggered = new Date(state.last_triggered).getTime();
  const cooldown = ALERT_COOLDOWN_MS[alertType] ?? 0;

  return now.getTime() - lastTriggered < cooldown;
}

function isQuietHour(
  priority: Priority,
  prefs: SubscriberPreferences,
  now: Date,
): boolean {
  // Critical alerts always go through
  if (priority === "critical") return false;

  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (start == null || end == null) return false;

  // Convert to Eastern Time (UTC-4 in summer, UTC-5 in winter)
  // Simplification: use offset-based approach
  const etOffset = isEasternDST(now) ? -4 : -5;
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;

  if (start <= end) {
    // e.g., 22:00-07:00 wraps around midnight
    return false; // Doesn't wrap — this case is unusual for quiet hours
  }
  // Wrapping case: start=22, end=7 means 22-23-0-1-...-6 are quiet
  return etHour >= start || etHour < end;
}

function isEasternDST(date: Date): boolean {
  // Rough DST check for Eastern Time (March-November)
  const month = date.getUTCMonth(); // 0-indexed
  return month >= 2 && month <= 10; // March through November
}

function isWeekendWindow(
  candidate: AlertCandidate,
  now: Date,
): boolean {
  // Weekend = Friday, Saturday, Sunday (5, 6, 0)
  const day = now.getDay();
  if (day === 5 || day === 6 || day === 0) return true;

  // Also allow Thursday alerts about upcoming weekend windows
  if (day === 4 && candidate.alertType === "runnable-in-n-days") {
    const entersInDays = (candidate.context?.entersInDays as number) ?? 0;
    if (entersInDays <= 3) return true; // Thu alert about Fri-Sun
  }

  // Allow critical/safety alerts regardless of weekend mode
  if (candidate.priority === "critical") return true;

  return false;
}

function meetsConfidenceThreshold(
  candidate: AlertCandidate,
  prefs: SubscriberPreferences,
): boolean {
  // This only applies to forecast-based alerts
  const forecastAlerts: AlertType[] = [
    "runnable-in-n-days",
    "confidence-upgraded",
    "window-extended",
    "window-shortened",
  ];

  if (!forecastAlerts.includes(candidate.alertType)) return true;

  // If user wants "high" only, skip "medium" confidence alerts
  // The confidence info is in the context or we trust the evaluation engine already filtered
  if (prefs.confidenceThreshold === "high") {
    const confidence = candidate.context?.confidenceLevel as string | undefined;
    if (confidence === "low" || confidence === "medium") return false;
  }

  return true;
}

function meetsLeadTime(
  candidate: AlertCandidate,
  prefs: SubscriberPreferences,
): boolean {
  if (candidate.alertType !== "runnable-in-n-days") return true;

  const entersInDays = (candidate.context?.entersInDays as number) ?? 0;
  return entersInDays <= prefs.leadTimeDays;
}
