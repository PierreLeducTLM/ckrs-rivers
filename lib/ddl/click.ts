/**
 * DDL click registration + consumption helpers.
 *
 * Privacy-conscious: we never store the raw IP or UA. Instead we hash
 * (IP/24 + day) and a normalised UA so a row can be matched on first launch
 * after install, then expired.
 */

import { createHash } from "node:crypto";

import { sql } from "@/lib/db/client";
import type { IabKind, MobilePlatform } from "@/lib/ddl/detect";

export interface RegisterClickInput {
  targetPath: string;
  platform: MobilePlatform;
  ua: string | null | undefined;
  ip: string | null | undefined;
  iab: IabKind | null;
}

export interface RegisteredClick {
  clickId: string;
}

export interface ConsumeClickInput {
  clickId?: string;
  platform: MobilePlatform;
  ua?: string | null;
  ip?: string | null;
}

const MAX_TARGET_PATH_LEN = 1024;

const UA_VERSION_RE = /\d+(\.\d+)+/g;

/** Normalise a UA so version drift between click and install doesn't break the
 * fingerprint. Strips numeric versions and lowercases. */
export function normaliseUa(ua: string | null | undefined): string {
  if (!ua) return "";
  return ua.replace(UA_VERSION_RE, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashUa(ua: string | null | undefined): string {
  return createHash("sha256").update(normaliseUa(ua)).digest("hex");
}

/** Hash IP narrowed to /24 (IPv4) or /48 (IPv6) so users on the same NAT or
 * carrier prefix can still match on first install. Bucketed by UTC day to
 * limit replay windows. Returns "" when the IP is unknown. */
export function hashIp(ip: string | null | undefined): string {
  const normalised = narrowIp(ip);
  if (!normalised) return "";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${normalised}|${day}`).digest("hex");
}

function narrowIp(ip: string | null | undefined): string {
  if (!ip) return "";
  const trimmed = ip.trim();
  if (!trimmed) return "";
  if (trimmed.includes(":")) {
    // IPv6 — keep first 3 hextets (~/48)
    const parts = trimmed.split(":");
    return parts.slice(0, 3).join(":");
  }
  // IPv4 — keep first 3 octets (/24)
  const parts = trimmed.split(".");
  if (parts.length !== 4) return "";
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

function isSafeTargetPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.length > MAX_TARGET_PATH_LEN) return false;
  // Reject protocol-relative paths and anything with control characters.
  if (path.startsWith("//")) return false;
  return !/[\x00-\x1f]/.test(path);
}

export async function registerClick(
  input: RegisterClickInput,
): Promise<RegisteredClick> {
  if (!isSafeTargetPath(input.targetPath)) {
    throw new Error("Invalid target path");
  }
  const uaHash = hashUa(input.ua);
  const ipHash = hashIp(input.ip);
  const rows = (await sql(
    `INSERT INTO ddl_clicks (target_path, platform, ua_hash, ip_hash, iab)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING click_id`,
    [input.targetPath, input.platform, uaHash, ipHash, input.iab ?? null],
  )) as Array<{ click_id: string }>;
  return { clickId: rows[0].click_id };
}

/**
 * Look up a deferred deep link on first app launch.
 *
 *   - Android: prefer matching by clickId (carried via Play Store install
 *     referrer — exact, no false positives).
 *   - iOS: fall back to fingerprint matching (IP/24 + UA hash + ≤24h).
 *
 * Always marks the matched row as consumed so subsequent launches don't
 * re-trigger.
 */
export async function consumeClick(
  input: ConsumeClickInput,
): Promise<{ targetPath: string } | null> {
  // 1) Android happy path: exact clickId.
  if (input.clickId) {
    const rows = (await sql(
      `UPDATE ddl_clicks
         SET consumed_at = now()
       WHERE click_id = $1
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING target_path`,
      [input.clickId],
    )) as Array<{ target_path: string }>;
    if (rows.length > 0) return { targetPath: rows[0].target_path };
  }

  // 2) Fingerprint match (iOS, or Android fallback when referrer was lost).
  const uaHash = hashUa(input.ua);
  const ipHash = hashIp(input.ip);
  if (!uaHash || !ipHash) return null;

  const rows = (await sql(
    `UPDATE ddl_clicks
        SET consumed_at = now()
      WHERE click_id = (
        SELECT click_id FROM ddl_clicks
         WHERE platform = $1
           AND ua_hash = $2
           AND ip_hash = $3
           AND consumed_at IS NULL
           AND expires_at > now()
           AND created_at > now() - interval '24 hours'
         ORDER BY created_at DESC
         LIMIT 1
      )
      RETURNING target_path`,
    [input.platform, uaHash, ipHash],
  )) as Array<{ target_path: string }>;
  if (rows.length > 0) return { targetPath: rows[0].target_path };
  return null;
}

export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
