import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { deleteBlinkAccount, getBlinkAccount, type SqlFn } from "@/lib/blink/account-store";
import { BlinkClient, type BlinkSession } from "@/lib/blink/client";

const sqlFn = sql as SqlFn;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await getBlinkAccount(sqlFn, id);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  // If we have working tokens, list the cameras attached to this account so
  // the admin UI can show them as importable.
  let cameras: Array<{ id: string; name: string; networkId: string; type: string; model: string | null }> = [];
  let cameraError: string | null = null;
  if (account.tokens_json) {
    try {
      const session: BlinkSession = {
        username: account.username,
        hardwareId: account.hardware_id,
        tokens: account.tokens_json,
      };
      const client = new BlinkClient(session);
      const list = await client.listCameras();
      cameras = list.map((c) => ({
        id: String(c.id),
        name: c.name,
        networkId: String(c.networkId),
        type: c.type,
        model: c.model,
      }));
    } catch (err) {
      cameraError = err instanceof Error ? err.message : "Failed to list cameras";
    }
  }

  return Response.json({
    account: {
      id: account.id,
      label: account.label,
      username: account.username,
      pending2fa: account.pending_2fa,
      hasTokens: account.tokens_json != null,
      lastUsedAt: account.last_used_at,
      lastError: account.last_error,
    },
    cameras,
    cameraError,
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Cameras referencing this account get their FK set to NULL by the
  // ON DELETE SET NULL constraint, but they'll fail to sync until reassigned.
  await deleteBlinkAccount(sqlFn, id);
  return Response.json({ success: true });
}
