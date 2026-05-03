import { z } from "zod";

import { SkillLevelSchema } from "./enums";

// ---------------------------------------------------------------------------
// Alert types — all 15 notification categories
// ---------------------------------------------------------------------------

export const AlertTypeSchema = z.enum([
  "its-on",
  "safety-warning",
  "runnable-in-n-days",
  "weekend-forecast",
  "rain-bump",
  "confidence-upgraded",
  "rising-into-range",
  "dropping-out",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

/** All known alert types — kept for type-safety / historical prefs payloads. */
export const ALL_ALERT_TYPES: readonly AlertType[] = AlertTypeSchema.options;

/**
 * Alert types currently disabled at the source in evaluate-alerts.ts.
 * Mirrored here so the settings UI can hide their toggles. The server-side
 * `DISABLED_ALERT_TYPES` constant in src/trigger/evaluate-alerts.ts is the
 * authoritative gate (Trigger.dev bundling forbids @/ imports there).
 */
export const DISABLED_ALERT_TYPES: ReadonlySet<AlertType> = new Set<AlertType>([
  "dropping-out",
  "rain-bump",
  "confidence-upgraded",
]);

/** Alert types shown to users in the preference UI. */
export const USER_FACING_ALERT_TYPES: readonly AlertType[] = ALL_ALERT_TYPES.filter(
  (t) => !DISABLED_ALERT_TYPES.has(t),
);

export const PrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const AlertStateValueSchema = z.enum([
  "idle",
  "triggered",
  "cooldown",
]);
export type AlertStateValue = z.infer<typeof AlertStateValueSchema>;

export const ChannelSchema = z.enum(["email", "push", "sms"]);
export type Channel = z.infer<typeof ChannelSchema>;

// ---------------------------------------------------------------------------
// Alert priority mapping
// ---------------------------------------------------------------------------

export const ALERT_PRIORITY: Record<AlertType, Priority> = {
  "its-on": "critical",
  "safety-warning": "critical",
  "runnable-in-n-days": "normal",
  "weekend-forecast": "normal",
  "rain-bump": "high",
  "confidence-upgraded": "high",
  "rising-into-range": "normal",
  "dropping-out": "normal",
};

/** Cooldown in milliseconds before the same alert can fire again */
export const ALERT_COOLDOWN_MS: Record<AlertType, number> = {
  "its-on": 6 * 60 * 60_000,
  "safety-warning": 6 * 60 * 60_000,
  "runnable-in-n-days": 24 * 60 * 60_000,
  "weekend-forecast": 7 * 24 * 60 * 60_000,
  "rain-bump": 24 * 60 * 60_000,
  "confidence-upgraded": 24 * 60 * 60_000,
  "rising-into-range": 12 * 60 * 60_000,
  "dropping-out": 12 * 60 * 60_000,
};

// ---------------------------------------------------------------------------
// Subscriber preferences
// ---------------------------------------------------------------------------

export const SubscriberPreferencesSchema = z.object({
  skillLevel: SkillLevelSchema.default("intermediate"),
  leadTimeDays: z.number().int().min(1).max(5).default(2),
  confidenceThreshold: z.enum(["high", "medium"]).default("high"),
  acceptableRange: z.enum(["optimal-only", "runnable"]).default("runnable"),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  digestMode: z.boolean().default(false),
  weekendOnly: z.boolean().default(false),
  channel: ChannelSchema.default("email"),
  /** Per-channel opt-out. Both default true so existing users keep receiving. */
  emailEnabled: z.boolean().default(true),
  pushEnabled: z.boolean().default(true),
  /** Allow-list of alert types the user wants to receive. */
  enabledAlertTypes: z
    .array(AlertTypeSchema)
    .default([...USER_FACING_ALERT_TYPES]),
});
export type SubscriberPreferences = z.infer<typeof SubscriberPreferencesSchema>;

// ---------------------------------------------------------------------------
// Paddling status (shared type used across app + notification engine)
// ---------------------------------------------------------------------------

export const PaddlingStatusSchema = z.enum([
  "too-low",
  "runnable",
  "ideal",
  "too-high",
  "unknown",
]);
export type PaddlingStatus = z.infer<typeof PaddlingStatusSchema>;

export const TrendDirectionSchema = z.enum(["rising", "falling", "stable"]);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

export const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

// ---------------------------------------------------------------------------
// Station snapshot (derived per-evaluation, stored in alert_snapshots)
// ---------------------------------------------------------------------------

export const StationSnapshotSchema = z.object({
  stationId: z.string(),
  currentFlow: z.number().nullable(),
  paddlingStatus: PaddlingStatusSchema,
  runnableWindowDays: z.number().default(0),
  trendDirection: TrendDirectionSchema.default("stable"),
  forecastEntersRange: z.boolean().default(false),
  forecastEntersRangeInDays: z.number().nullable().default(null),
  forecastExitsRange: z.boolean().default(false),
  forecastExitsRangeInHours: z.number().nullable().default(null),
  precipNext48h: z.number().default(0),
  confidenceLevel: ConfidenceLevelSchema.default("low"),
  isSeasonFirst: z.boolean().default(false),
  evaluatedAt: z.string(),
});
export type StationSnapshot = z.infer<typeof StationSnapshotSchema>;

// ---------------------------------------------------------------------------
// Alert candidate (output of evaluation, before filtering)
// ---------------------------------------------------------------------------

export const AlertCandidateSchema = z.object({
  alertType: AlertTypeSchema,
  priority: PrioritySchema,
  stationId: z.string(),
  stationName: z.string(),
  currentFlow: z.number().nullable(),
  message: z.string(),
  /** Extra context for the email template */
  context: z.record(z.string(), z.unknown()).default({}),
});
export type AlertCandidate = z.infer<typeof AlertCandidateSchema>;
