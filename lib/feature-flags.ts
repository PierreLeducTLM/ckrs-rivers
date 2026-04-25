/**
 * Server-side feature-flag helpers.
 *
 * Flags have three states:
 *   - "off"     : hidden everywhere
 *   - "preview" : hidden by default; users opt in per-device via Settings
 *   - "on"      : visible everywhere
 *
 * Backed by the `feature_flags` table. Reads are deduped per request via
 * React.cache, matching the rest of the data layer (lib/data/rivers.ts).
 */
import "server-only";
import { cache } from "react";
import { sql } from "@/lib/db/client";

export type FlagState = "off" | "preview" | "on";

export interface FeatureFlag {
  key: string;
  state: FlagState;
  label: string;
  description: string | null;
  updatedAt: string;
}

interface FlagRow {
  key: string;
  state: string;
  label: string;
  description: string | null;
  updated_at: string;
}

function rowToFlag(row: FlagRow): FeatureFlag {
  const s = row.state === "preview" || row.state === "on" ? row.state : "off";
  return {
    key: row.key,
    state: s,
    label: row.label,
    description: row.description,
    updatedAt: row.updated_at,
  };
}

export const getAllFeatureFlags = cache(async (): Promise<FeatureFlag[]> => {
  try {
    const rows = (await sql(
      `SELECT key, state, label, description, updated_at::text FROM feature_flags ORDER BY key`,
    )) as FlagRow[];
    return rows.map(rowToFlag);
  } catch {
    // Table may not exist yet on a stale DB; treat as no flags configured.
    return [];
  }
});

export async function getFeatureFlagState(key: string): Promise<FlagState> {
  const flags = await getAllFeatureFlags();
  return flags.find((f) => f.key === key)?.state ?? "off";
}

export async function getPreviewFeatureFlags(): Promise<FeatureFlag[]> {
  const flags = await getAllFeatureFlags();
  return flags.filter((f) => f.state === "preview");
}

export async function setFeatureFlagState(key: string, state: FlagState): Promise<void> {
  await sql(
    `UPDATE feature_flags SET state = $1, updated_at = now() WHERE key = $2`,
    [state, key],
  );
}
