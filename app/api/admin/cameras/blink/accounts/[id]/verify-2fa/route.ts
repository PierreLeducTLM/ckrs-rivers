import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { BlinkClient, type BlinkSession } from "@/lib/blink/client";
import { BlinkInvalidCredentialsError, BlinkTwoFARequiredError } from "@/lib/blink/types";
import { getBlinkAccount, markBlinkAccountError, saveBlinkTokens } from "@/lib/blink/account-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;
const sqlFn = sql as SqlFn;

interface Body {
  password?: string;
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
  const password = body.password;
  const pin = body.pin?.trim();
  if (!password || !pin) {
    return Response.json({ error: "password and pin are required" }, { status: 400 });
  }

  const account = await getBlinkAccount(sqlFn, id);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  const session: BlinkSession = {
    username: account.username,
    hardwareId: account.hardware_id,
    tokens: account.tokens_json,
  };
  const client = new BlinkClient(session);

  try {
    const tokens = await client.verifyTwoFactor(password, pin);
    await saveBlinkTokens(sqlFn, account.id, tokens);
    return Response.json({ success: true, accountId: account.id });
  } catch (err) {
    if (err instanceof BlinkTwoFARequiredError) {
      // Blink rejected the pin and asked for a fresh one (or we hit it
      // again with the wrong code).
      return Response.json({ error: "Pin rejected. Request a fresh pin and try again." }, { status: 401 });
    }
    if (err instanceof BlinkInvalidCredentialsError) {
      const detail = err.body ? `Invalid credentials. Blink response: ${err.body.slice(0, 300)}` : "Invalid credentials";
      await markBlinkAccountError(sqlFn, account.id, detail);
      return Response.json(
        { error: "Invalid credentials", blinkResponse: err.body },
        { status: 401 },
      );
    }
    const msg = err instanceof Error ? err.message : "Verification failed";
    await markBlinkAccountError(sqlFn, account.id, msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
