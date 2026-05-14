import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { clientForAccount, getBlinkAccount, type SqlFn } from "@/lib/blink/account-store";

const sqlFn = sql as SqlFn;

/**
 * Debug-only: returns the raw status + truncated body of each Blink
 * enumeration endpoint, plus the parsed camera list. Used by the admin
 * UI to figure out why a camera that's visible in the Blink app isn't
 * appearing on our side.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await getBlinkAccount(sqlFn, id);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!account.tokens_json) {
    return Response.json({ error: "Account has no tokens — complete sign-in first" }, { status: 400 });
  }

  try {
    const client = clientForAccount(sqlFn, account);
    const diagnostics = await client.fetchDiagnostics();
    let cameras: unknown = null;
    let camerasError: string | null = null;
    try {
      cameras = await client.listCameras();
    } catch (err) {
      camerasError = err instanceof Error ? err.message : String(err);
    }
    return Response.json({ diagnostics, cameras, camerasError });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Diagnostics failed" },
      { status: 500 },
    );
  }
}
