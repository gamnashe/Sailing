/**
 * Forecast parsing and sailing-condition rules.
 * Run via: bun run test (or npx tsx src/tests/weather.test.ts)
 */
import { parseForecast, forecastAt, sailingConditions, windFrom, weatherLabel } from '../services/weather';

let failures = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failures++;
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

const weather = {
  daily: {
    time: ['2026-10-06', '2026-10-07'],
    weather_code: [1, 61],
    temperature_2m_max: [28.4, 24],
    wind_speed_10m_max: [12.3, 26.1],
    wind_gusts_10m_max: [18, 34],
    wind_direction_10m_dominant: [290, 200],
  },
  hourly: {
    time: ['2026-10-06T09:00', '2026-10-06T13:00'],
    weather_code: [0, 2],
    temperature_2m: [24, 28],
    wind_speed_10m: [8, 14],
    wind_gusts_10m: [12, 20],
    wind_direction_10m: [300, 280],
  },
};
const marine = {
  daily: { time: ['2026-10-06'], wave_height_max: [0.9] },
  hourly: { time: ['2026-10-06T09:00', '2026-10-06T13:00'], wave_height: [0.6, 0.8], wave_period: [5.2, null] },
};

const f = parseForecast(weather, marine, 0);
assert(f.days['2026-10-06'].windMax === 12.3 && f.days['2026-10-06'].waveMax === 0.9, 'daily wind and wave height are paired by date');
assert(f.days['2026-10-07'].waveMax === null, 'days past the marine horizon have no wave height');
const h = forecastAt(f, '2026-10-06', '09:30');
assert(h?.wind === 8 && h?.wave === 0.6 && h?.wavePeriod === 5.2, 'departure 09:30 reads the 09:00 hour');
assert(forecastAt(f, '2026-10-06', '13:00')?.wavePeriod === null, 'missing values stay null');
assert(forecastAt(f, '2026-12-01', '10:00') === null, 'dates outside the forecast give null');
assert(forecastAt(null, '2026-10-06', '09:00') === null, 'no forecast loaded gives null');

const noMarine = parseForecast(weather, null, 0);
assert(noMarine.days['2026-10-06'].waveMax === null && noMarine.days['2026-10-06'].windMax === 12.3, 'wind still shows when the marine API failed');

assert(sailingConditions(12, 18, 0.8) === 'good', '12 kn, 0.8 m is good sailing');
assert(sailingConditions(19, 22, 0.8) === 'caution', '19 kn needs experience');
assert(sailingConditions(12, 18, 1.6) === 'caution', '1.6 m waves need experience');
assert(sailingConditions(26, 30, 1) === 'rough', '26 kn is rough');
assert(sailingConditions(10, 12, 2.6) === 'rough', '2.6 m waves are rough');

assert(windFrom(0) === 'צ' && windFrom(270) === 'מע' && windFrom(290) === 'מע' && windFrom(359) === 'צ', 'compass points');
assert(weatherLabel(0).label === 'בהיר' && weatherLabel(63).label === 'גשם' && weatherLabel(95).icon === '⛈️', 'weather codes');

console.log(failures === 0 ? '\n🎉 All weather tests passed' : `\n${failures} weather test(s) failed`);
process.exit(failures === 0 ? 0 : 1);
