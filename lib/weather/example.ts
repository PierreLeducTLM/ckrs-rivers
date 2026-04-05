/**
 * Runnable example: fetch 2 years of historical weather for a sample station.
 *
 *   npx tsx lib/weather/example.ts
 */
import { getHistoricalWeather } from "./weather-service";
import { SAMPLE_STATIONS } from "../domain/sample-data";

async function main() {
  const station = SAMPLE_STATIONS[0]; // Rivière du Nord
  console.log(`Fetching weather for "${station.name}" ...`);
  console.log(`  Coordinates: ${station.coordinates.lat}, ${station.coordinates.lon}`);
  console.log(`  Elevation:   ${station.elevation ?? "unknown"} m\n`);

  const startDate = "2024-04-01";
  const endDate = "2026-03-31";

  const windows = await getHistoricalWeather(station, startDate, endDate);

  console.log(`Fetched ${windows.length} weather days`);

  if (windows.length > 0) {
    console.log(`  First: ${windows[0].date}`);
    console.log(`  Last:  ${windows[windows.length - 1].date}`);
    console.log(`\nSample day (${windows[0].date}):`);
    console.log(JSON.stringify(windows[0], null, 2));
  }
}

main().catch(console.error);
