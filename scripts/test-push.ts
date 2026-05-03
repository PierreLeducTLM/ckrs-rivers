/**
 * Send a single FCM test push to one device, bypassing alert logic.
 *
 *   FIREBASE_SERVICE_ACCOUNT='...json...' DATABASE_URL='...' \
 *     npx tsx scripts/test-push.ts            # picks newest active android device
 *   ... npx tsx scripts/test-push.ts <token>  # send to a specific token
 */
import { neon } from "@neondatabase/serverless";
import admin from "firebase-admin";

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("FIREBASE_SERVICE_ACCOUNT is required");

  const app = admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(saJson)),
  });

  let token = process.argv[2];
  let platform = "unknown";

  if (!token) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL required when no token arg given");
    const sql = neon(dbUrl);
    const rows = (await sql.query(
      `SELECT token, platform FROM push_devices
        WHERE active = true AND platform = 'android'
        ORDER BY updated_at DESC LIMIT 1`,
    )) as Array<{ token: string; platform: string }>;
    if (rows.length === 0) throw new Error("No active android push_devices rows");
    token = rows[0].token;
    platform = rows[0].platform;
  }

  console.log(`Sending to ${platform} token ${token.slice(0, 16)}…`);

  const id = await admin.messaging(app).send({
    token,
    notification: {
      title: "🧪 FlowCast test push",
      body: "If you see this, FCM + service account are working.",
    },
    data: { stationId: "test", alertType: "test" },
    android: {
      priority: "high" as const,
      notification: { channelId: "river-alerts" },
    },
  });

  console.log("Sent OK. messageId:", id);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
