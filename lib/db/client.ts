import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const neonSql = neon(process.env.DATABASE_URL);

/**
 * Execute a parameterized SQL query against Neon PostgreSQL.
 *
 *   sql("SELECT * FROM stations WHERE id = $1", [id])
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sql(query: string, params?: any[]): Promise<any[]> {
  return neonSql.query(query, params ?? []);
}
