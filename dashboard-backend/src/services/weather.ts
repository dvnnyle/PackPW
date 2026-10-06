// Forecast for Playworld Sørlandet (Barstølveien 35, 4636 Kristiansand) from MET Norway, the API behind yr.no.
// Terms: identify the app in User-Agent and don't poll more than needed (the route caches for 10 minutes).
// https://api.met.no/weatherapi/locationforecast/2.0/documentation
import type { WeatherData, WeatherHour } from '../types';

const LAT = 58.1794;
const LON = 8.1338;
const USER_AGENT = 'playworld-dashboard/1.0 github.com/dvnnyle';

interface RawStep {
  time: string;
  data: {
    instant: { details: { air_temperature: number; wind_speed: number } };
    next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount?: number } };
    next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount?: number } };
  };
}

export async function getWeather(): Promise<WeatherData> {
  const response = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`,
    { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`MET weather request failed (HTTP ${response.status})`);
  const body = (await response.json()) as { properties: { timeseries: RawStep[] } };

  // Hourly steps for the next ~2.5 days, then 6-hour steps out to ~9 days (MET's own resolution).
  const hours = body.properties.timeseries
    .filter((step) => Date.parse(step.time) > Date.now() - 3_600_000)
    .flatMap((step): WeatherHour[] => {
      const next = step.data.next_1_hours ?? step.data.next_6_hours;
      if (!next) return [];
      return [
        {
          time: step.time,
          period: step.data.next_1_hours ? 1 : 6,
          temperature: step.data.instant.details.air_temperature,
          windSpeed: step.data.instant.details.wind_speed,
          symbol: next.summary.symbol_code,
          precipitation: next.details.precipitation_amount ?? 0,
        },
      ];
    });
  if (hours.length === 0) throw new Error('MET weather response had no forecast');

  return { updatedAt: new Date().toISOString(), now: hours[0], hours: hours.slice(1) };
}
