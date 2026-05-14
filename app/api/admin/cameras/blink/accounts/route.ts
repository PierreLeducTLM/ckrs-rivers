import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { BlinkClient, type BlinkSession } from "@/lib/blink/client";
import { BlinkInvalidCredentialsError, BlinkTwoFARequiredError } from "@/lib/blink/types";
import {
  createBlinkAccount,
  findBlinkAccountByUsername,
  listBlinkAccounts,
  markBlinkAccountError,
  saveBlinkPendingAuth,
  saveBlinkTokens,
} from "@/lib/blink/account-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (query: string, params?: any[]) => Promise<any[]>;
const sqlFn = sql as SqlFn;

export async function GET() {
  try {
    const rows = await listBlinkAccounts(sqlFn);
    const accounts = rows.map((r) => ({
      id: r.id,
      label: r.label,
      username: r.username,
      hardwareId: r.hardware_id,
      hasTokens: r.tokens_json != null,
      pending2fa: r.pending_2fa,
      lastUsedAt: r.last_used_at,
      lastError: r.last_error,
    }));
    return Response.json({ accounts });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}

interface PostBody {
  username?: string;
  password?: string;
  label?: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  const label = body.label?.trim() || username || "Blink";
  if (!username || !password) {
    return Response.json({ error: "username and password are required" }, { status: 400 });
  }

  let account = await findBlinkAccountByUsername(sqlFn, username);
  if (!account) {
    account = await createBlinkAccount(sqlFn, { label, username });
  }

  const session: BlinkSession = {
    username,
    hardwareId: account.hardware_id,
    tokens: account.tokens_json,
  };
  const client = new BlinkClient(session, {
    onTokensRefreshed: async (tokens) => {
      await saveBlinkTokens(sqlFn, account.id, tokens);
    },
  });

  try {
    await client.login(password);
    // login() persists tokens via the onTokensRefreshed callback.
    return Response.json({ success: true, accountId: account.id, pending2fa: false });
  } catch (err) {
    if (err instanceof BlinkTwoFARequiredError) {
      // Stash the PKCE verifier, CSRF token, and cookie jar so the
      // verify-2fa endpoint can resume this session with the email pin.
      await saveBlinkPendingAuth(sqlFn, account.id, err.pending);
      return Response.json(
        {
          success: false,
          accountId: account.id,
          pending2fa: true,
          message: "Two-factor pin required. Check your email and POST it to /verify-2fa.",
        },
        { status: 202 },
      );
    }
    if (err instanceof BlinkInvalidCredentialsError) {
      const detail = err.body ? `Invalid credentials. Blink response: ${err.body.slice(0, 300)}` : "Invalid credentials";
      await markBlinkAccountError(sqlFn, account.id, detail);
      return Response.json(
        { error: "Invalid Blink credentials", blinkResponse: err.body },
        { status: 401 },
      );
    }
    const msg = err instanceof Error ? err.message : "Login failed";
    await markBlinkAccountError(sqlFn, account.id, msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
