import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { readCache, writeCache } from './apiCache';

const BACKEND_PORT = 3000;

// The phone can't reach "localhost" on your PC, so during development we use the same
// IP address the Expo dev server is running on. Set EXPO_PUBLIC_API_URL to override
// (e.g. the Render URL in production).
function getApiUrl() {
  // The website is served by the backend itself, so it calls the same address (and the browser login applies).
  if (Platform.OS === 'web' && !__DEV__) return globalThis.location?.origin ?? '';
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:${BACKEND_PORT}`;
}

export const API_URL = getApiUrl();

// The Render backend only answers requests carrying its API key. The key comes from the EAS environment
// variable EXPO_PUBLIC_API_KEY at build time (never from the repo); locally it's unset and not needed.
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

// fresh = skip the backend's cache and fetch new data from the sites (the refresh button).
// onCached = called right away with the last answer saved on this device (if any), before the network
// request finishes, so screens can show data instantly. Every successful answer is saved for next time.
// The location every data request is for (set by the location picker). The saved-answer cache is per
// location too, because the location is part of the path.
let currentLocation = 'sorlandet';
export function setApiLocation(id) {
  currentLocation = id;
}

// `location` overrides the global one (Oversikt shows every location side by side in its pager).
async function getJson(rawPath, fresh = false, onCached, location = currentLocation) {
  const general = rawPath.startsWith('/api/health') || rawPath.startsWith('/api/app-version');
  const path = general ? rawPath : `${rawPath}${rawPath.includes('?') ? '&' : '?'}location=${location}`;
  if (onCached && !fresh) {
    const saved = readCache(path);
    if (saved !== undefined) onCached(saved);
  }
  const response = await fetch(`${API_URL}${path}${fresh ? `${path.includes('?') ? '&' : '?'}fresh=1` : ''}`, {
    headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }
  const data = await response.json();
  if (onCached) writeCache(path, data);
  return data;
}

// date: "YYYY-MM-DD" (Extanda Go + NordPay numbers for that day)
export function fetchDashboard(date, fresh, onCached, location) {
  return getJson(`/api/dashboard?date=${date}`, fresh, onCached, location);
}

// date: "YYYY-MM-DD"
export function fetchBookings(date, fresh, onCached, location) {
  return getJson(`/api/bookings?date=${date}`, fresh, onCached, location);
}

// The first day on or after `from` that has bookings → { date: "YYYY-MM-DD" | null }
export function fetchNextBookingDay(from, location) {
  return getJson(`/api/bookings/next?from=${from}`, false, undefined, location);
}

// Sales per opening hour on `date` (YYYY-MM-DD) for both locations → { date, hours: [{ hour, extandaGo, nordpay }], ... }
export function fetchHourlySales(date, fresh, onCached) {
  return getJson(`/api/sales/hourly?date=${date}`, fresh, onCached);
}

// The next `count` days (max 30) on or after `from` that have bookings → { days: [{ date, bookings }] }
export function fetchUpcomingBookings(from, fresh, count = 10, onCached) {
  return getJson(`/api/bookings/upcoming?from=${from}&count=${count}`, fresh, onCached);
}

// Current weather + next 12 hours at Playworld Sørlandet (MET Norway / yr.no)
export function fetchWeather(onCached, location) {
  return getJson('/api/weather', false, onCached, location);
}

// Who is working on `date` (YYYY-MM-DD), from Planday → { date, shifts: [{ name, group, start, end, status, punchIn, punchOut }] }
export function fetchStaff(date, fresh, onCached, location) {
  return getJson(`/api/staff?date=${date}`, fresh, onCached, location);
}

// Latest released Android build → { version, versionCode, apkUrl, mandatory, releaseNotes }
export function fetchAppVersion() {
  return getJson('/api/app-version');
}

// Backend health check → { status: "ok" }
export function fetchHealth() {
  return getJson('/api/health');
}
