import { sql } from "@/lib/db/client";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
}

export interface AdminUserWithHash extends AdminUserRow {
  password_hash: string;
}

const PUBLIC_COLUMNS =
  "id, email, name, role, is_active, created_at, created_by, last_login_at";

export async function countActiveAdmins(): Promise<number> {
  const rows = (await sql(
    "SELECT count(*)::int AS n FROM admin_users WHERE is_active = true",
  )) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export async function countAdmins(): Promise<number> {
  const rows = (await sql(
    "SELECT count(*)::int AS n FROM admin_users",
  )) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export async function listAdmins(): Promise<AdminUserRow[]> {
  return (await sql(
    `SELECT ${PUBLIC_COLUMNS} FROM admin_users ORDER BY created_at ASC`,
  )) as AdminUserRow[];
}

export async function getAdminById(id: string): Promise<AdminUserRow | null> {
  const rows = (await sql(
    `SELECT ${PUBLIC_COLUMNS} FROM admin_users WHERE id = $1 LIMIT 1`,
    [id],
  )) as AdminUserRow[];
  return rows[0] ?? null;
}

export async function getAdminByEmail(
  email: string,
): Promise<AdminUserWithHash | null> {
  const rows = (await sql(
    `SELECT ${PUBLIC_COLUMNS}, password_hash
     FROM admin_users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  )) as AdminUserWithHash[];
  return rows[0] ?? null;
}

export async function createAdmin(args: {
  email: string;
  passwordHash: string;
  name: string | null;
  createdBy: string | null;
}): Promise<AdminUserRow> {
  const rows = (await sql(
    `INSERT INTO admin_users (email, password_hash, name, created_by)
     VALUES (LOWER($1), $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [args.email, args.passwordHash, args.name, args.createdBy],
  )) as AdminUserRow[];
  return rows[0];
}

/**
 * Insert the very first admin only when the table is empty. Returns null if
 * another admin already exists, so the /setup wizard self-disables.
 */
export async function createFirstAdmin(args: {
  email: string;
  passwordHash: string;
  name: string | null;
}): Promise<AdminUserRow | null> {
  const rows = (await sql(
    `INSERT INTO admin_users (email, password_hash, name)
     SELECT LOWER($1), $2, $3
     WHERE NOT EXISTS (SELECT 1 FROM admin_users)
     RETURNING ${PUBLIC_COLUMNS}`,
    [args.email, args.passwordHash, args.name],
  )) as AdminUserRow[];
  return rows[0] ?? null;
}

export async function updateAdminPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  await sql(`UPDATE admin_users SET password_hash = $2 WHERE id = $1`, [
    id,
    passwordHash,
  ]);
}

export async function updateAdminName(
  id: string,
  name: string | null,
): Promise<AdminUserRow | null> {
  const rows = (await sql(
    `UPDATE admin_users SET name = $2 WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, name],
  )) as AdminUserRow[];
  return rows[0] ?? null;
}

export async function setAdminActive(
  id: string,
  isActive: boolean,
): Promise<AdminUserRow | null> {
  const rows = (await sql(
    `UPDATE admin_users SET is_active = $2 WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, isActive],
  )) as AdminUserRow[];
  return rows[0] ?? null;
}

export async function recordLogin(id: string): Promise<void> {
  await sql(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [id]);
}
