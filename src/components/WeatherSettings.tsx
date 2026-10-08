import React, { useState } from 'react';
import { store } from '../services/store';
import { WEATHER_PRESETS, WeatherLocation } from '../types';
import { MapPin, LocateFixed, CloudLightning, Check } from 'lucide-react';

/** Staff: where the forecast comes from, and from which wind / waves a day is flagged as rough. */
export const WeatherSettings: React.FC = () => {
  const settings = store.getSettings();
  const [loc, setLoc] = useState<WeatherLocation>(settings.weatherLocation);
  const [wind, setWind] = useState(settings.roughWindKn);
  const [wave, setWave] = useState(settings.roughWaveM);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [locating, setLocating] = useState(false);

  const presetIndex = WEATHER_PRESETS.findIndex((p) => p.lat === loc.lat && p.lon === loc.lon);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setMsg({ text: 'הדפדפן לא תומך באיתור מיקום', ok: false });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        setLoc({ name: 'המיקום שלי', lat, lon });
        setMsg({ text: 'המיקום אותר. אפשר לשנות את השם ולשמור.', ok: true });
      },
      () => {
        setLocating(false);
        setMsg({ text: 'לא ניתן לאתר מיקום. אשר גישה למיקום בדפדפן או הזן קואורדינטות.', ok: false });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loc.name.trim()) return setMsg({ text: 'יש לתת שם למיקום', ok: false });
    if (!(Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180)) return setMsg({ text: 'קואורדינטות לא תקינות', ok: false });
    if (!(wind >= 8 && wind <= 60)) return setMsg({ text: 'סף הרוח צריך להיות בין 8 ל-60 קשר', ok: false });
    if (!(wave >= 0.5 && wave <= 6)) return setMsg({ text: "סף הגלים צריך להיות בין 0.5 ל-6 מ'", ok: false });
    await store.updateSettings({ weatherLocation: { ...loc, name: loc.name.trim() }, roughWindKn: wind, roughWaveM: wave });
    setMsg({ text: 'נשמר. התחזית בלוח השנה מתעדכנת למיקום החדש.', ok: true });
  };

  return (
    <form onSubmit={save} className="glass rounded-3xl p-4 sm:p-6 space-y-4 text-xs">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-600" aria-hidden="true" />
          מזג אוויר ומיקום המועדון
        </h2>
        <p className="text-slate-500">התחזית בלוח השנה נלקחת מהמיקום הזה. ימים סוערים מסומנים בבולטות ביומן.</p>
      </div>

      <div>
        <label htmlFor="weather-preset" className="block font-semibold text-slate-700 mb-1">
          מיקום
        </label>
        <select
          id="weather-preset"
          value={presetIndex >= 0 ? String(presetIndex) : 'custom'}
          onChange={(e) => {
            if (e.target.value !== 'custom') setLoc(WEATHER_PRESETS[Number(e.target.value)]);
          }}
          className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl cursor-pointer"
        >
          {WEATHER_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
          <option value="custom">מיקום אחר (קואורדינטות)</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 sm:col-span-1">
          <label htmlFor="weather-name" className="block font-semibold text-slate-700 mb-1">
            שם המיקום
          </label>
          <input
            id="weather-name"
            value={loc.name}
            onChange={(e) => setLoc({ ...loc, name: e.target.value })}
            className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
          />
        </div>
        <div>
          <label htmlFor="weather-lat" className="block font-semibold text-slate-700 mb-1">
            קו רוחב
          </label>
          <input
            id="weather-lat"
            type="number"
            step="0.0001"
            dir="ltr"
            value={loc.lat}
            onChange={(e) => setLoc({ ...loc, lat: Number(e.target.value), seaLat: undefined, seaLon: undefined })}
            className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
          />
        </div>
        <div>
          <label htmlFor="weather-lon" className="block font-semibold text-slate-700 mb-1">
            קו אורך
          </label>
          <input
            id="weather-lon"
            type="number"
            step="0.0001"
            dir="ltr"
            value={loc.lon}
            onChange={(e) => setLoc({ ...loc, lon: Number(e.target.value), seaLat: undefined, seaLon: undefined })}
            className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="px-3 py-2 bg-white border border-slate-200 hover:border-sky-300 rounded-xl font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <LocateFixed className="w-4 h-4 text-sky-600" aria-hidden="true" />
          {locating ? 'מאתר...' : 'השתמש במיקום הנוכחי שלי'}
        </button>
        <a
          href={`https://www.google.com/maps?q=${loc.lat},${loc.lon}`}
          target="_blank"
          rel="noreferrer"
          className="text-sky-700 font-semibold hover:underline"
        >
          הצג במפה ↗
        </a>
      </div>

      <div className="pt-3 border-t border-slate-100 space-y-2">
        <p className="font-bold text-slate-800 flex items-center gap-1.5">
          <CloudLightning className="w-4 h-4 text-rose-600" aria-hidden="true" />
          מתי יום מסומן כ"ים סוער"
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="rough-wind" className="block font-semibold text-slate-700 mb-1">
              רוח מ- (קשר)
            </label>
            <input
              id="rough-wind"
              type="number"
              min={8}
              max={60}
              value={wind}
              onChange={(e) => setWind(Number(e.target.value))}
              className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="rough-wave" className="block font-semibold text-slate-700 mb-1">
              או גלים מ- (מטר)
            </label>
            <input
              id="rough-wave"
              type="number"
              min={0.5}
              max={6}
              step={0.1}
              value={wave}
              onChange={(e) => setWave(Number(e.target.value))}
              className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
            />
          </div>
        </div>
        <p className="text-slate-500">
          גם משבים של {wind + 5} קשר ומעלה נחשבים סוערים. בימים כאלה פתיחת הפלגה דורשת אישור מפורש שהתחזית נראתה.
        </p>
      </div>

      {msg && (
        <p className={`rounded-xl p-2.5 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role="status">
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
      >
        <Check className="w-4 h-4" aria-hidden="true" />
        שמור הגדרות מזג אוויר
      </button>
    </form>
  );
};
