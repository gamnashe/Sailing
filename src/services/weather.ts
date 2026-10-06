import { useEffect, useState } from 'react';
import { DEFAULT_WEATHER_LOCATION, type WeatherLocation } from '../types';

/**
 * Sailing forecast from Open-Meteo (free, no API key): wind and weather from the forecast API,
 * waves from the marine API. Wind in knots, waves in metres, times in Israel time.
 */

// The default spot (Herzliya marina); the club can set its own in the settings.
export const CLUB_LOCATION = DEFAULT_WEATHER_LOCATION;

const FORECAST_DAYS = 16;
const MARINE_DAYS = 8;
const CACHE_KEY = 'sailing_club_forecast_v2';
const CACHE_MS = 60 * 60 * 1000;

export type DayForecast = {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  windMax: number; // kn
  gustMax: number; // kn
  windDir: number; // degrees, where the wind blows from
  waveMax: number | null; // m; null past the marine horizon
};

export type HourForecast = {
  time: string; // YYYY-MM-DDTHH:00
  weatherCode: number;
  temp: number;
  wind: number;
  gust: number;
  windDir: number;
  wave: number | null;
  wavePeriod: number | null;
};

export type Forecast = {
  fetchedAt: number;
  /** "lat,lon" the forecast was fetched for. */
  place?: string;
  days: Record<string, DayForecast>;
  hours: Record<string, HourForecast>;
};

type OpenMeteoSeries = Record<string, Array<number | null> | string[]>;

/** Pairs Open-Meteo's parallel arrays into one record per timestamp. */
function zip<T>(series: OpenMeteoSeries | undefined, build: (i: number) => T): Record<string, T> {
  const out: Record<string, T> = {};
  const times = (series?.time ?? []) as string[];
  times.forEach((t, i) => {
    out[t] = build(i);
  });
  return out;
}

const num = (series: OpenMeteoSeries | undefined, key: string, i: number): number | null => {
  const v = (series?.[key] as Array<number | null> | undefined)?.[i];
  return typeof v === 'number' ? v : null;
};

export function parseForecast(weather: { daily?: OpenMeteoSeries; hourly?: OpenMeteoSeries }, marine: { daily?: OpenMeteoSeries; hourly?: OpenMeteoSeries } | null, fetchedAt: number): Forecast {
  const marineDaily = marine?.daily;
  const marineHourly = marine?.hourly;
  const waveMaxByDay = zip(marineDaily, (i) => num(marineDaily, 'wave_height_max', i));
  const waveByHour = zip(marineHourly, (i) => ({
    wave: num(marineHourly, 'wave_height', i),
    period: num(marineHourly, 'wave_period', i),
  }));

  const d = weather.daily;
  const h = weather.hourly;
  const days = zip(d, (i) => {
    const date = (d!.time as string[])[i];
    return {
      date,
      weatherCode: num(d, 'weather_code', i) ?? 0,
      tempMax: num(d, 'temperature_2m_max', i) ?? 0,
      windMax: num(d, 'wind_speed_10m_max', i) ?? 0,
      gustMax: num(d, 'wind_gusts_10m_max', i) ?? 0,
      windDir: num(d, 'wind_direction_10m_dominant', i) ?? 0,
      waveMax: waveMaxByDay[date] ?? null,
    };
  });
  const hours = zip(h, (i) => {
    const time = (h!.time as string[])[i];
    return {
      time,
      weatherCode: num(h, 'weather_code', i) ?? 0,
      temp: num(h, 'temperature_2m', i) ?? 0,
      wind: num(h, 'wind_speed_10m', i) ?? 0,
      gust: num(h, 'wind_gusts_10m', i) ?? 0,
      windDir: num(h, 'wind_direction_10m', i) ?? 0,
      wave: waveByHour[time]?.wave ?? null,
      wavePeriod: waveByHour[time]?.period ?? null,
    };
  });
  return { fetchedAt, days, hours };
}

const placeKey = (loc: WeatherLocation) => `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;

async function fetchForecast(loc: WeatherLocation): Promise<Forecast> {
  const { lat, lon } = loc;
  const seaLat = loc.seaLat ?? lat;
  const seaLon = loc.seaLon ?? lon;
  const tz = 'timezone=Asia%2FJerusalem';
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&${tz}&forecast_days=${FORECAST_DAYS}` +
    '&wind_speed_unit=kn' +
    '&daily=weather_code,temperature_2m_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant' +
    '&hourly=weather_code,temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m';
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${seaLat}&longitude=${seaLon}&${tz}&forecast_days=${MARINE_DAYS}` +
    '&daily=wave_height_max&hourly=wave_height,wave_period';

  const [weatherRes, marineRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(marineUrl).catch(() => null),
  ]);
  if (!weatherRes.ok) throw new Error(`Open-Meteo ${weatherRes.status}`);
  const weather = await weatherRes.json();
  // Waves are a bonus: the calendar still shows wind if the marine API is down.
  const marine = marineRes && marineRes.ok ? await marineRes.json() : null;
  return { ...parseForecast(weather, marine, Date.now()), place: placeKey(loc) };
}

let inflight: Promise<Forecast> | null = null;
let inflightPlace = '';
let memory: Forecast | null = null;

const fresh = (f: Forecast | null, place: string): f is Forecast =>
  Boolean(f && f.place === place && Date.now() - f.fetchedAt < CACHE_MS);

function readCache(place: string): Forecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Forecast;
    return fresh(cached, place) ? cached : null;
  } catch {
    return null;
  }
}

export function loadForecast(loc: WeatherLocation = CLUB_LOCATION): Promise<Forecast> {
  const place = placeKey(loc);
  if (fresh(memory, place)) return Promise.resolve(memory);
  const cached = readCache(place);
  if (cached) {
    memory = cached;
    return Promise.resolve(cached);
  }
  if (!inflight || inflightPlace !== place) {
    inflightPlace = place;
    inflight = fetchForecast(loc)
      .then((f) => {
        memory = f;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(f));
        } catch {
          // storage full or blocked: the in-memory copy still serves this session
        }
        return f;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The forecast for the club's location, or null while loading / when offline. */
export function useForecast(loc: WeatherLocation = CLUB_LOCATION): Forecast | null {
  const place = placeKey(loc);
  const [forecast, setForecast] = useState<Forecast | null>(fresh(memory, place) ? memory : null);
  useEffect(() => {
    let alive = true;
    loadForecast(loc)
      .then((f) => alive && setForecast(f))
      .catch(() => alive && setForecast(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, loc.seaLat, loc.seaLon]);
  return forecast;
}

/** The hourly forecast nearest to a sail's departure (same hour), if within the forecast range. */
export function forecastAt(forecast: Forecast | null, date: string, time: string): HourForecast | null {
  if (!forecast) return null;
  return forecast.hours[`${date}T${time.slice(0, 2)}:00`] ?? null;
}

const COMPASS = ['צ', 'צ-מז', 'מז', 'ד-מז', 'ד', 'ד-מע', 'מע', 'צ-מע'];
/** Hebrew compass point the wind blows from: צפון, מזרח, דרום, מערב. */
export function windFrom(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** WMO weather code → emoji and Hebrew label. */
export function weatherLabel(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'בהיר' };
  if (code <= 2) return { icon: '🌤️', label: 'מעונן חלקית' };
  if (code === 3) return { icon: '☁️', label: 'מעונן' };
  if (code <= 48) return { icon: '🌫️', label: 'ערפל' };
  if (code <= 67) return { icon: '🌧️', label: 'גשם' };
  if (code <= 77) return { icon: '🌨️', label: 'שלג' };
  if (code <= 82) return { icon: '🌦️', label: 'ממטרים' };
  return { icon: '⛈️', label: 'סופת רעמים' };
}

export type SailingConditions = 'good' | 'caution' | 'rough';

export type ConditionThresholds = { roughWindKn: number; roughWaveM: number };
export const DEFAULT_THRESHOLDS: ConditionThresholds = { roughWindKn: 25, roughWaveM: 2.5 };

/**
 * A rough guide for a club keelboat: wind and gusts in knots, waves in metres.
 * Rough from the club's wind / wave limits (gusts 5 kn above the wind limit); "caution" starts 7 kn and 1 m below.
 */
export function sailingConditions(
  wind: number,
  gust: number,
  wave: number | null,
  t: ConditionThresholds = DEFAULT_THRESHOLDS
): SailingConditions {
  const w = wave ?? 0;
  if (wind >= t.roughWindKn || gust >= t.roughWindKn + 5 || w >= t.roughWaveM) return 'rough';
  if (wind >= t.roughWindKn - 7 || gust >= t.roughWindKn - 1 || w >= Math.max(0.5, t.roughWaveM - 1)) return 'caution';
  return 'good';
}

/** Why a day counts as rough, e.g. "רוח עד 28 קשר, גלים עד 2.7 מ'". */
export function roughReason(day: DayForecast, t: ConditionThresholds = DEFAULT_THRESHOLDS): string {
  const parts: string[] = [];
  if (day.windMax >= t.roughWindKn || day.gustMax >= t.roughWindKn + 5) {
    parts.push(`רוח עד ${Math.round(day.windMax)} קשר (משבים ${Math.round(day.gustMax)})`);
  }
  if ((day.waveMax ?? 0) >= t.roughWaveM) parts.push(`גלים עד ${day.waveMax!.toFixed(1)} מ'`);
  return parts.join(', ');
}

export const CONDITIONS_STYLE: Record<SailingConditions, { label: string; className: string }> = {
  good: { label: 'תנאים טובים', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  caution: { label: 'רוח/ים ערים — לשייטים מנוסים', className: 'text-amber-800 bg-amber-50 border-amber-200' },
  rough: { label: 'ים סוער — לשקול ביטול', className: 'text-rose-700 bg-rose-50 border-rose-200' },
};
