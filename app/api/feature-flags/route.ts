import { NextResponse } from "next/server";
import { getAllFeatureFlags } from "@/lib/feature-flags";

// Public read — used by the Settings UI to list previewable features.
// Cached briefly so flipping a flag from admin propagates within ~30s.
export const revalidate = 30;

export async function GET() {
  const flags = await getAllFeatureFlags();
  return NextResponse.json({ flags });
}
