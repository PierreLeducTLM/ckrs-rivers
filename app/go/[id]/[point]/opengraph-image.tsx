import { ImageResponse } from "next/og";
import { getStationById } from "@/lib/data/rivers";
import { getFlowcastLogoDataUrl } from "@/lib/share/og-logo";

export const runtime = "nodejs";
export const alt = "FlowCast — paddling point preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type PointKind = "put-in" | "take-out";

function isPointKind(value: string): value is PointKind {
  return value === "put-in" || value === "take-out";
}

interface PointStyle {
  label: string;
  badge: string;
  fg: string;
  bg: string;
}

function pointStyle(kind: PointKind): PointStyle {
  return kind === "put-in"
    ? { label: "Put-in", badge: "P", fg: "#15803d", bg: "#dcfce7" }
    : { label: "Take-out", badge: "T", fg: "#b91c1c", bg: "#fee2e2" };
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string; point: string }>;
}) {
  const { id, point } = await params;
  const logoDataUrl = await getFlowcastLogoDataUrl();

  if (!isPointKind(point)) {
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
            fontSize: 48,
            color: "#18181b",
          }}
        >
          <img src={logoDataUrl} width={96} height={96} alt="" style={{ marginRight: 24 }} />
          FlowCast
        </div>
      ),
      size,
    );
  }

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
            fontSize: 48,
            color: "#18181b",
          }}
        >
          <img src={logoDataUrl} width={96} height={96} alt="" style={{ marginRight: 24 }} />
          FlowCast
        </div>
      ),
      size,
    );
  }

  const coords = point === "put-in" ? station.putIn : station.takeOut;
  const style = pointStyle(point);
  const latLon =
    coords != null
      ? `${Number(coords.lat).toFixed(5)}, ${Number(coords.lon).toFixed(5)}`
      : null;

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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={logoDataUrl} width={64} height={64} alt="" />
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#0369a1",
              letterSpacing: -0.5,
            }}
          >
            FlowCast
          </div>
        </div>

        {/* Point badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 9999,
              background: style.fg,
              color: "white",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            {style.badge}
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              fontSize: 36,
              fontWeight: 700,
              borderRadius: 9999,
              background: style.bg,
              color: style.fg,
            }}
          >
            {style.label}
          </div>
        </div>

        {/* River name */}
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 80,
            fontWeight: 800,
            color: "#0f172a",
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          {station.name}
        </div>

        {/* Lat / lon */}
        {latLon && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 32,
              fontSize: 32,
              color: "#475569",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ marginRight: 12 }}>📍</span>
            {latLon}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 28,
            color: "#64748b",
          }}
        >
          flowcast.ca · Tap to open in maps
        </div>
      </div>
    ),
    size,
  );
}
