/**
 * Send a variety of FCM test pushes to one device. Useful for visually
 * verifying notification grouping (Android tag/auto-bundle, iOS thread-id).
 *
 *   FIREBASE_SERVICE_ACCOUNT='...json...' DATABASE_URL='...' \
 *     npx tsx scripts/test-push.ts                    # 5-alert grouped burst
 *     npx tsx scripts/test-push.ts single             # one push, baseline
 *     npx tsx scripts/test-push.ts grouped            # 5-alert grouped burst (same as default)
 *     npx tsx scripts/test-push.ts replace            # send same tag twice — second replaces first
 *     npx tsx scripts/test-push.ts <device-token>     # token positional arg still works for `single`
 *     npx tsx scripts/test-push.ts <mode> <token>     # explicit token for any mode
 */
import { neon } from "@neondatabase/serverless";
import admin from "firebase-admin";

type Mode = "single" | "grouped" | "replace";

interface FakeAlert {
  emoji: string;
  prefix: string;
  stationId: string;
  stationName: string;
  alertType: string;
  message: string;
}

const ALERT_BURST: FakeAlert[] = [
  {
    emoji: "🟢",
    prefix: "Go paddle!",
    stationId: "test-jacques-cartier",
    stationName: "Riviere Jacques-Cartier",
    alertType: "its-on",
    message: "Riviere Jacques-Cartier is now runnable at 24.1 m³/s. Time to paddle!",
  },
  {
    emoji: "🔴",
    prefix: "Safety warning",
    stationId: "test-rouge",
    stationName: "Riviere Rouge",
    alertType: "safety-warning",
    message: "Riviere Rouge has exceeded safe levels at 142.0 m³/s. Exercise extreme caution.",
  },
  {
    emoji: "📅",
    prefix: "Coming soon",
    stationId: "test-batiscan",
    stationName: "Riviere Batiscan",
    alertType: "runnable-in-n-days",
    message: "Riviere Batiscan predicted to become runnable in 2 days.",
  },
  {
    emoji: "📈",
    prefix: "Rising into range",
    stationId: "test-malbaie",
    stationName: "Riviere Malbaie",
    alertType: "rising-into-range",
    message: "Riviere Malbaie is rising (8.4 m³/s) and approaching runnable range.",
  },
  {
    emoji: "🟢",
    prefix: "Go paddle!",
    stationId: "test-bonaventure",
    stationName: "Riviere Bonaventure",
    alertType: "its-on",
    message: "Riviere Bonaventure is now runnable at 18.7 m³/s. Time to paddle!",
  },
];

async function resolveToken(explicit: string | undefined): Promise<{ token: string; platform: string }> {
  if (explicit) return { token: explicit, platform: "explicit" };
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required when no token arg given");
  const sql = neon(dbUrl);
  const rows = (await sql.query(
    `SELECT token, platform FROM push_devices
      WHERE active = true AND platform = 'android'
      ORDER BY updated_at DESC LIMIT 1`,
  )) as Array<{ token: string; platform: string }>;
  if (rows.length === 0) throw new Error("No active android push_devices rows");
  return rows[0];
}

function buildMessage(token: string, alert: FakeAlert): admin.messaging.Message {
  return {
    token,
    notification: {
      title: `${alert.emoji} ${alert.prefix} — ${alert.stationName}`,
      body: alert.message,
    },
    data: {
      stationId: alert.stationId,
      alertType: alert.alertType,
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: "river-alerts",
        tag: `flowcast-${alert.stationId}-${alert.alertType}`,
      },
    },
    apns: {
      payload: {
        aps: {
          "thread-id": "flowcast-river-alerts",
        },
      },
    },
  };
}

async function sendOne(messaging: admin.messaging.Messaging, msg: admin.messaging.Message, label: string) {
  const id = await messaging.send(msg);
  console.log(`  ${label} → ${id}`);
}

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("FIREBASE_SERVICE_ACCOUNT is required");

  // Parse args: [mode] [token] OR just [token]
  const args = process.argv.slice(2);
  const knownModes: Mode[] = ["single", "grouped", "replace"];
  let mode: Mode = "grouped";
  let tokenArg: string | undefined;

  if (args.length === 0) {
    // default: grouped burst, lookup newest android device
  } else if (args.length === 1) {
    if (knownModes.includes(args[0] as Mode)) mode = args[0] as Mode;
    else tokenArg = args[0];
  } else {
    if (knownModes.includes(args[0] as Mode)) mode = args[0] as Mode;
    tokenArg = args[1];
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(saJson)),
  });
  const messaging = admin.messaging(app);

  const { token, platform } = await resolveToken(tokenArg);
  console.log(`Target: ${platform} token ${token.slice(0, 16)}…`);
  console.log(`Mode:   ${mode}\n`);

  if (mode === "single") {
    await sendOne(messaging, buildMessage(token, ALERT_BURST[0]), "single its-on");
  } else if (mode === "grouped") {
    console.log(`Sending ${ALERT_BURST.length} alerts in quick succession.`);
    console.log("Expected:");
    console.log("  - iOS  : all collapse into one expandable thread.");
    console.log("  - Android: 4+ notifications auto-bundle into a stack on the lock screen.\n");
    for (const alert of ALERT_BURST) {
      await sendOne(
        messaging,
        buildMessage(token, alert),
        `${alert.alertType.padEnd(20)} ${alert.stationName}`,
      );
    }
  } else {
    // replace: same alert sent twice with the same tag — the second should
    // visually replace the first rather than producing a duplicate card.
    console.log("Sending alert #1, waiting 4s, then sending alert #2 with the same tag.");
    console.log("Expected: only one notification visible at the end (second replaced first).\n");
    const a = ALERT_BURST[0];
    await sendOne(messaging, buildMessage(token, a), "first  (will be replaced)");
    await new Promise((r) => setTimeout(r, 4000));
    const updated: FakeAlert = {
      ...a,
      message: a.message.replace("24.1 m³/s", "27.6 m³/s (updated)"),
    };
    await sendOne(messaging, buildMessage(token, updated), "second (replaces first)");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
