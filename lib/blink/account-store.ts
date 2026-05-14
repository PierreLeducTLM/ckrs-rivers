// Persistence layer between camera_provider_accounts rows and BlinkClient.
// The v2 OAuth flow takes two HTTP requests to our backend (signin →
// verify-2fa) and the transient PKCE + CSRF + cookie state needs to span
// both, so we stash it in the dedicated pending_auth_json column while
// the user goes to their email for the pin.

import { randomUUID } from "node:crypto";
import { BlinkClient, type BlinkSession } from "./client";
import type { BlinkPendingAuth, BlinkTokens } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlFn = (query: string, params?: any[]) => Promise<any[]>;

export interface BlinkAccountRow {
  id: string;
  label: string;
  username: string;
  hardware_id: string;
  tokens_json: BlinkTokens | null;
  pending_auth_json: BlinkPendingAuth | null;
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
  pending_auth_json: BlinkPendingAuth | string | null;
  pending_2fa: boolean;
  last_used_at: string | null;
  last_error: string | null;
}

function parseJsonField<T>(raw: T | string | null): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw;
}

function rowFromRaw(raw: RawAccountRow): BlinkAccountRow {
  return {
    ...raw,
    tokens_json: parseJsonField<BlinkTokens>(raw.tokens_json),
    pending_auth_json: parseJsonField<BlinkPendingAuth>(raw.pending_auth_json),
  };
}

const SELECT_COLUMNS = `id, label, username, hardware_id, tokens_json, pending_auth_json, pending_2fa,
        last_used_at::text AS last_used_at, last_error`;

export async function listBlinkAccounts(sql: SqlFn): Promise<BlinkAccountRow[]> {
  const rows = (await sql(
    `SELECT ${SELECT_COLUMNS}
       FROM camera_provider_accounts
      WHERE provider = 'blink'
      ORDER BY created_at DESC`,
  )) as RawAccountRow[];
  return rows.map(rowFromRaw);
}

export async function getBlinkAccount(sql: SqlFn, id: string): Promise<BlinkAccountRow | null> {
  const rows = (await sql(
    `SELECT ${SELECT_COLUMNS}
       FROM camera_provider_accounts
      WHERE provider = 'blink' AND id = $1`,
    [id],
  )) as RawAccountRow[];
  if (rows.length === 0) return null;
  return rowFromRaw(rows[0]);
}

export async function findBlinkAccountByUsername(sql: SqlFn, username: string): Promise<BlinkAccountRow | null> {
  const rows = (await sql(
    `SELECT ${SELECT_COLUMNS}
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
     RETURNING ${SELECT_COLUMNS}`,
    [input.label, input.username, hardwareId],
  )) as RawAccountRow[];
  return rowFromRaw(rows[0]);
}

export async function saveBlinkTokens(sql: SqlFn, accountId: string, tokens: BlinkTokens): Promise<void> {
  await sql(
    `UPDATE camera_provider_accounts
        SET tokens_json = $1::jsonb,
            pending_auth_json = NULL,
            pending_2fa = false,
            last_used_at = now(),
            last_error = NULL,
            updated_at = now()
      WHERE id = $2`,
    [JSON.stringify(tokens), accountId],
  );
}

export async function saveBlinkPendingAuth(sql: SqlFn, accountId: string, pending: BlinkPendingAuth): Promise<void> {
  await sql(
    `UPDATE camera_provider_accounts
        SET pending_auth_json = $1::jsonb,
            pending_2fa = true,
            last_error = NULL,
            updated_at = now()
      WHERE id = $2`,
    [JSON.stringify(pending), accountId],
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

/**
 * Build a BlinkClient for the verify-2FA half of an in-flight login. The
 * client is hydrated with the pending OAuth state (PKCE verifier, CSRF
 * token, cookie jar) saved during the signin step.
 */
export function clientForPendingAuth(sql: SqlFn, account: BlinkAccountRow): BlinkClient {
  if (!account.pending_auth_json) {
    throw new Error(`Blink account ${account.label} has no pending auth state — start signin first`);
  }
  const session: BlinkSession = {
    username: account.username,
    hardwareId: account.hardware_id,
    tokens: null,
    pending: account.pending_auth_json,
  };
  return new BlinkClient(session, {
    onTokensRefreshed: async (tokens) => {
      await saveBlinkTokens(sql, account.id, tokens);
    },
  });
}
