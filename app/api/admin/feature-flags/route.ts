import { NextRequest } from "next/server";
import {
  getAllFeatureFlags,
  setFeatureFlagState,
  type FlagState,
} from "@/lib/feature-flags";

const VALID: FlagState[] = ["off", "preview", "on"];

export async function GET() {
  const flags = await getAllFeatureFlags();
  return Response.json({ flags });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    key?: string;
    state?: string;
  };
  if (!body.key || typeof body.key !== "string") {
    return Response.json({ error: "Missing flag key" }, { status: 400 });
  }
  if (!body.state || !VALID.includes(body.state as FlagState)) {
    return Response.json(
      { error: `Invalid state. Expected one of: ${VALID.join(", ")}` },
      { status: 400 },
    );
  }
  await setFeatureFlagState(body.key, body.state as FlagState);
  return Response.json({ success: true });
}
