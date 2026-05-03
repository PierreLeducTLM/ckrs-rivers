import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStationById } from "@/lib/data/rivers";
import RedirectToMaps from "./redirect-to-maps";

export const dynamic = "force-dynamic";

type PointKind = "put-in" | "take-out";

function isPointKind(value: string): value is PointKind {
  return value === "put-in" || value === "take-out";
}

function pointLabel(kind: PointKind): string {
  return kind === "put-in" ? "Put-in" : "Take-out";
}

function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

async function resolvePoint(id: string, point: string) {
  if (!isPointKind(point)) return null;
  const station = await getStationById(id);
  if (!station) return null;
  const coords = point === "put-in" ? station.putIn : station.takeOut;
  if (!coords) return null;
  return {
    station,
    point,
    lat: Number(coords.lat),
    lon: Number(coords.lon),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; point: string }>;
}): Promise<Metadata> {
  const { id, point } = await params;
  const resolved = await resolvePoint(id, point);
  if (!resolved) return { title: "FlowCast" };

  const label = pointLabel(resolved.point);
  const title = `${label} — ${resolved.station.name} · FlowCast`;
  const description = `${label} location for ${resolved.station.name}. Open in your maps app for directions.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "FlowCast",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function GoToPointPage({
  params,
}: {
  params: Promise<{ id: string; point: string }>;
}) {
  const { id, point } = await params;
  const resolved = await resolvePoint(id, point);
  if (!resolved) notFound();

  const { station, lat, lon } = resolved;
  const label = `${pointLabel(resolved.point)} — ${station.name}`;
  const fallback = googleMapsUrl(lat, lon);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-center font-sans dark:bg-zinc-950">
      <RedirectToMaps lat={lat} lon={lon} label={label} fallbackUrl={fallback} />
      <div>
        <p className="text-base text-zinc-600 dark:text-zinc-300">
          Opening in your maps app…
        </p>
        <p className="mt-3">
          <a
            href={fallback}
            className="font-semibold text-sky-700 underline hover:text-sky-800 dark:text-sky-400"
          >
            Tap here if it doesn&apos;t open automatically
          </a>
        </p>
      </div>
    </div>
  );
}
