import { ImageResponse } from "next/og";
import { getStationById, getPaddlingLevels } from "@/lib/data/rivers";
import { getPaddlingStatus } from "@/lib/notifications/paddling-status";
import { sql } from "@/lib/db/client";

export const runtime = "nodejs";
export const alt = "FlowCast — river status preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface CachedForecast {
  lastFlow: { date: string; flow: number } | null;
}

async function getLastFlow(stationId: string): Promise<number | null> {
  try {
    const rows = (await sql(
      `SELECT forecast_json FROM forecast_cache WHERE station_id = $1`,
      [stationId],
    )) as Array<{ forecast_json: CachedForecast }>;
    return rows[0]?.forecast_json?.lastFlow?.flow ?? null;
  } catch {
    return null;
  }
}

function statusToLabel(
  status: ReturnType<typeof getPaddlingStatus>["status"],
): { label: string; bg: string; fg: string } {
  switch (status) {
    case "ideal":
      return { label: "Prime", bg: "#10b98120", fg: "#059669" };
    case "runnable":
      return { label: "Runnable", bg: "#3b82f620", fg: "#2563eb" };
    case "too-low":
      return { label: "Too low", bg: "#71717a20", fg: "#52525b" };
    case "too-high":
      return { label: "Too high", bg: "#ef444420", fg: "#dc2626" };
    default:
      return { label: "—", bg: "#71717a20", fg: "#52525b" };
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const station = await getStationById(id);

  if (!station) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fafafa",
            fontSize: 64,
            color: "#18181b",
          }}
        >
          FlowCast
        </div>
      ),
      size,
    );
  }

  const paddling = (await getPaddlingLevels()).get(id);
  const flow = await getLastFlow(id);
  const { status } = getPaddlingStatus(flow, paddling);
  const pill = statusToLabel(status);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #f0f9ff 0%, #ffffff 60%)",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 32,
            fontWeight: 700,
            color: "#0369a1",
            letterSpacing: -0.5,
          }}
        >
          FlowCast
        </div>

        {/* River name */}
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 88,
            fontWeight: 800,
            color: "#0f172a",
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: "100%",
          }}
        >
          {station.name}
        </div>

        {/* Status pill + flow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "16px 32px",
              fontSize: 44,
              fontWeight: 700,
              borderRadius: 9999,
              background: pill.bg,
              color: pill.fg,
            }}
          >
            {pill.label}
          </div>

          {flow != null && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 48,
                color: "#334155",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ fontWeight: 700, color: "#0f172a", marginRight: 12 }}>
                {flow.toFixed(1)}
              </span>
              <span style={{ fontSize: 32, color: "#64748b" }}>m³/s</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 28,
            color: "#64748b",
          }}
        >
          flowcast.ca · Real-time river status for paddlers
        </div>
      </div>
    ),
    size,
  );
}
