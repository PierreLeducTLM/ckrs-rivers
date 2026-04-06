import { getStations, getRecentReadings } from "@/lib/data/rivers";

export async function GET() {
  const stations = getStations();

  const rivers = await Promise.all(
    stations.map(async (s) => {
      const readings = await getRecentReadings(s.id, 1);
      const lastReading = readings.at(-1);
      return {
        id: s.id,
        name: s.name,
        coordinates: { lat: Number(s.coordinates.lat), lon: Number(s.coordinates.lon) },
        catchmentArea: s.catchmentArea ? Number(s.catchmentArea) : null,
        lastFlow: lastReading?.flow ? Number(lastReading.flow) : null,
        lastDate: lastReading?.timestamp.slice(0, 10) ?? null,
      };
    }),
  );

  return Response.json(rivers);
}
