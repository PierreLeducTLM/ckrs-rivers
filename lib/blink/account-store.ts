// Persistence layer between camera_provider_accounts rows and BlinkClient.
// Spypoint uses static env vars, but Blink's OAuth refresh tokens rotate
// every login and we need to persist them across cron ticks.

import { randomUUID } from "node:crypto";
import { BlinkClient, type BlinkSession } from "./client";
import type { BlinkTokens } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

export interface BlinkAccountRow {
  id: string;
  label: string;
  username: string;
  hardware_id: string;
  tokens_json: BlinkTokens | null;
  pending_2fa: boolean;
  last_used_at: string | null;
  last_error: string | null;
}

interface RawAccountRow {
  id: string;
  label: string;
  username: string;
  hardware_id: string;
  tokens_json: BlinkTokens | string | null;
  pending_2fa: boolean;
  last_used_at: string | null;
  last_error: string | null;
}

function parseTokens(raw: BlinkTokens | string | null): BlinkTokens | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as BlinkTokens;
    } catch {
      return null;
    }
  }
  return raw;
}

function rowFromRaw(raw: RawAccountRow): BlinkAccountRow {
  return { ...raw, tokens_json: parseTokens(raw.tokens_json) };
}

export async function listBlinkAccounts(sql: SqlFn): Promise<BlinkAccountRow[]> {
  const rows = (await sql(
    `SELECT id, label, username, hardware_id, tokens_json, pending_2fa,
            last_used_at::text AS last_used_at, last_error
       FROM camera_provider_accounts
      WHERE provider = 'blink'
      ORDER BY created_at DESC`,
  )) as RawAccountRow[];
  return rows.map(rowFromRaw);
}

export async function getBlinkAccount(sql: SqlFn, id: string): Promise<BlinkAccountRow | null> {
  const rows = (await sql(
    `SELECT id, label, username, hardware_id, tokens_json, pending_2fa,
            last_used_at::text AS last_used_at, last_error
       FROM camera_provider_accounts
      WHERE provider = 'blink' AND id = $1`,
    [id],
  )) as RawAccountRow[];
  if (rows.length === 0) return null;
  return rowFromRaw(rows[0]);
}

export async function findBlinkAccountByUsername(sql: SqlFn, username: string): Promise<BlinkAccountRow | null> {
  const rows = (await sql(
    `SELECT id, label, username, hardware_id, tokens_json, pending_2fa,
            last_used_at::text AS last_used_at, last_error
       FROM camera_provider_accounts
      WHERE provider = 'blink' AND username = $1`,
    [username],
  )) as RawAccountRow[];
  if (rows.length === 0) return null;
  return rowFromRaw(rows[0]);
}

export async function createBlinkAccount(
  sql: SqlFn,
  input: { label: string; username: string },
): Promise<BlinkAccountRow> {
  const hardwareId = randomUUID().toUpperCase();
  const rows = (await sql(
    `INSERT INTO camera_provider_accounts (provider, label, username, hardware_id, pending_2fa)
     VALUES ('blink', $1, $2, $3, true)
     RETURNING id, label, username, hardware_id, tokens_json, pending_2fa,
               last_used_at::text AS last_used_at, last_error`,
    [input.label, input.username, hardwareId],
  )) as RawAccountRow[];
  return rowFromRaw(rows[0]);
}

export async function saveBlinkTokens(sql: SqlFn, accountId: string, tokens: BlinkTokens): Promise<void> {
  await sql(
    `UPDATE camera_provider_accounts
        SET tokens_json = $1::jsonb,
            pending_2fa = false,
            last_used_at = now(),
            last_error = NULL,
            updated_at = now()
      WHERE id = $2`,
    [JSON.stringify(tokens), accountId],
  );
}

export async function markBlinkAccountPending2fa(sql: SqlFn, accountId: string): Promise<void> {
  await sql(
    `UPDATE camera_provider_accounts
        SET pending_2fa = true, updated_at = now()
      WHERE id = $1`,
    [accountId],
  );
}

export async function markBlinkAccountError(sql: SqlFn, accountId: string, error: string): Promise<void> {
  await sql(
    `UPDATE camera_provider_accounts
        SET last_error = $1, updated_at = now()
      WHERE id = $2`,
    [error.slice(0, 500), accountId],
  );
}

export async function deleteBlinkAccount(sql: SqlFn, accountId: string): Promise<void> {
  await sql(`DELETE FROM camera_provider_accounts WHERE id = $1`, [accountId]);
}

/**
 * Build a BlinkClient that automatically persists rotated tokens back to
 * the DB row whenever they refresh. Throws if the account hasn't yet
 * completed 2FA.
 */
export function clientForAccount(sql: SqlFn, account: BlinkAccountRow): BlinkClient {
  if (!account.tokens_json) {
    throw new Error(`Blink account ${account.label} has no tokens — complete login first`);
  }
  const session: BlinkSession = {
    username: account.username,
    hardwareId: account.hardware_id,
    tokens: account.tokens_json,
  };
  return new BlinkClient(session, {
    onTokensRefreshed: async (tokens) => {
      await saveBlinkTokens(sql, account.id, tokens);
    },
  });
}
