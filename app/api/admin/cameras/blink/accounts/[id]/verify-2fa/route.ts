import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { BlinkInvalidCredentialsError } from "@/lib/blink/types";
import {
  clientForPendingAuth,
  getBlinkAccount,
  markBlinkAccountError,
} from "@/lib/blink/account-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;
const sqlFn = sql as SqlFn;

interface Body {
  pin?: string;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pin = body.pin?.trim();
  if (!pin) return Response.json({ error: "pin is required" }, { status: 400 });

  const account = await getBlinkAccount(sqlFn, id);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!account.pending_auth_json) {
    return Response.json(
      { error: "No pending sign-in. Start the sign-in flow again from scratch." },
      { status: 400 },
    );
  }

  let client;
  try {
    client = clientForPendingAuth(sqlFn, account);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Pending state missing" },
      { status: 400 },
    );
  }

  try {
    await client.verifyTwoFactor(pin);
    // verifyTwoFactor → completeTokens triggers the onTokensRefreshed
    // callback, which writes tokens + clears pending_auth_json + flips
    // pending_2fa to false.
    return Response.json({ success: true, accountId: account.id });
  } catch (err) {
    if (err instanceof BlinkInvalidCredentialsError) {
      const detail = err.body ? `Pin rejected. Blink response: ${err.body.slice(0, 300)}` : "Pin rejected";
      await markBlinkAccountError(sqlFn, account.id, detail);
      return Response.json(
        { error: "Pin rejected. Request a fresh pin and try again.", blinkResponse: err.body },
        { status: 401 },
      );
    }
    const msg = err instanceof Error ? err.message : "Verification failed";
    await markBlinkAccountError(sqlFn, account.id, msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
