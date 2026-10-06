import React, { useState } from 'react';
import { store, sailUsesBoat, sailWindow } from '../services/store';
import { Sail, UserProfile, BoatReservation, isStaff, RESERVATION_KIND_ICONS, RESERVATION_KIND_LABELS } from '../types';
import { BoatReservationModal } from './BoatReservationModal';
import { useForecast, weatherLabel, windFrom, sailingConditions, CLUB_LOCATION, type Forecast } from '../services/weather';
import {
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  AlertCircle,
  Lock,
  Trash2,
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  onSelectSail: (sailId: string) => void;
  /** Opens the create-sail window on a day; absent when the person may not open sails. */
  onOpenCreateModal?: (date?: string) => void;
}

type View = 'month' | 'week' | 'day';

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HEBREW_DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const VIEW_KEY = 'sailing_club_calendar_view';
const DAY_START = 6 * 60; // the day timeline runs 06:00–22:00
const DAY_END = 22 * 60;

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shortDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

const OCCUPANCY_STYLE = {
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200 line-through',
  private: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border-indigo-200',
  full: 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300',
  guaranteed: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300',
  waiting: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200',
} as const;
type Occupancy = keyof typeof OCCUPANCY_STYLE;

/** Management reservations: a dark striped block, distinct from sails. */
const RESERVATION_STYLE =
  'bg-slate-700 text-white border-slate-800 bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)]';

const WIND_TEXT = { good: 'text-emerald-700', caution: 'text-amber-700', rough: 'text-rose-700 font-black' } as const;

function occupancy(sail: Sail): Occupancy {
  if (sail.status === 'cancelled') return 'cancelled';
  if (sail.sailType === 'private') return 'private';
  const confirmed = store.getConfirmedParticipants(sail.id).length;
  if (confirmed >= sail.maxParticipants) return 'full';
  if (confirmed >= sail.minParticipants) return 'guaranteed';
  return 'waiting';
}

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'week' || v === 'day' ? v : 'month';
  } catch {
    return 'month';
  }
}

/** One-line forecast for a day: icon, wind (coloured by conditions), wave height. */
const DayWeather: React.FC<{ forecast: Forecast | null; date: string; showWaves?: boolean }> = ({ forecast, date, showWaves = true }) => {
  const day = forecast?.days[date];
  if (!day) return null;
  const cond = sailingConditions(day.windMax, day.gustMax, day.waveMax);
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.625rem] leading-tight"
      title={`${weatherLabel(day.weatherCode).label} · רוח ${Math.round(day.windMax)} קשר (משבים ${Math.round(day.gustMax)}) מ${windFrom(day.windDir)}${day.waveMax !== null ? ` · גלים עד ${day.waveMax.toFixed(1)} מ'` : ''}`}
    >
      <span>{weatherLabel(day.weatherCode).icon}</span>
      <span className={WIND_TEXT[cond]}>{Math.round(day.windMax)}kn</span>
      {showWaves && day.waveMax !== null && <span className="text-sky-700">🌊{day.waveMax.toFixed(1)}</span>}
    </span>
  );
};

export const SailsCalendar: React.FC<Props> = ({ currentUser, onSelectSail, onOpenCreateModal }) => {
  const today = new Date();
  const todayStr = dateKey(today);
  const [view, setViewState] = useState<View>(readView);
  const [cursor, setCursor] = useState<Date>(today);
  const [filterType, setFilterType] = useState<'all' | 'club' | 'private'>('all');
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const forecast = useForecast();

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // the choice just isn't remembered
    }
  };

  const sails = store.getSails().filter((s) => filterType === 'all' || s.sailType === filterType);
  const sailsByDate: Record<string, Sail[]> = {};
  for (const sail of sails) (sailsByDate[sail.date] ??= []).push(sail);
  const boats = store.getBoats();
  const boatName = (id: string) => boats.find((b) => b.id === id)?.name ?? 'סירה';
  const reservationsByDate: Record<string, BoatReservation[]> = {};
  for (const r of store.getBoatReservations()) (reservationsByDate[r.date] ??= []).push(r);
  const staff = isStaff(currentUser.role);
  const [reserveDate, setReserveDate] = useState<string | null>(null);
  const canReserveOn = (key: string) => staff && key >= todayStr;

  const removeReservation = async (r: BoatReservation) => {
    if (!confirm(`לבטל את השריון "${r.title}" (${boatName(r.boatId)}, ${r.startTime}–${r.endTime})?`)) return;
    await store.deleteBoatReservation(r.id);
  };

  const canCreateOn = (key: string) => Boolean(onOpenCreateModal) && key >= todayStr;
  const openDay = (key: string) => {
    setCursor(fromKey(key));
    setView('day');
  };

  // Navigation steps by the visible period.
  const move = (dir: -1 | 1) => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else setCursor(addDays(cursor, view === 'week' ? 7 * dir : dir));
    setSelectedDateStr(null);
  };

  const weekStart = addDays(cursor, -cursor.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const title =
    view === 'month'
      ? `${HEBREW_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === 'week'
      ? `${shortDate(weekDays[0])} – ${shortDate(weekDays[6])}/${weekDays[6].getFullYear()}`
      : `יום ${HEBREW_DAYS[cursor.getDay()]}, ${cursor.getDate()} ב${HEBREW_MONTHS[cursor.getMonth()]}`;

  const AddButton: React.FC<{ date: string; label?: boolean }> = ({ date, label }) =>
    canCreateOn(date) ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenCreateModal!(date);
        }}
        className={
          label
            ? 'px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs'
            : 'w-5 h-5 rounded-full bg-sky-100 hover:bg-sky-600 text-sky-700 hover:text-white flex items-center justify-center cursor-pointer transition'
        }
        title="פתח הפלגה בתאריך זה"
      >
        <Plus className={label ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        {label && 'הפלגה חדשה'}
      </button>
    ) : null;

  const ReserveButton: React.FC<{ date: string }> = ({ date }) =>
    canReserveOn(date) ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setReserveDate(date);
        }}
        className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
        title="שריון סירה לשיעור / פעילות מיוחדת / תחזוקה"
      >
        <Lock className="w-3.5 h-3.5" />
        שריון סירה
      </button>
    ) : null;

  const ReservationChip: React.FC<{ r: BoatReservation }> = ({ r }) => (
    <div
      className={`w-full text-right p-1 rounded-lg text-[0.625rem] sm:text-xs font-semibold truncate border ${RESERVATION_STYLE}`}
      title={`${RESERVATION_KIND_LABELS[r.kind]}: ${r.title} (${r.startTime}–${r.endTime}) · ${boatName(r.boatId)}`}
    >
      <div className="flex items-center gap-1 truncate">
        <span>{RESERVATION_KIND_ICONS[r.kind]}</span>
        <span className="font-bold">{r.startTime}</span>
        <span className="truncate">{r.title}</span>
      </div>
      <div className="text-[0.5625rem] sm:text-[0.625rem] text-slate-200 font-normal truncate">🔒 {boatName(r.boatId)}</div>
    </div>
  );

  const ReservationCard: React.FC<{ r: BoatReservation }> = ({ r }) => (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 text-xs flex items-start justify-between gap-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded text-[0.625rem] font-bold bg-slate-700 text-white">
            {RESERVATION_KIND_ICONS[r.kind]} {RESERVATION_KIND_LABELS[r.kind]}
          </span>
          <h4 className="font-bold text-slate-900">{r.title}</h4>
        </div>
        <p className="text-slate-500 text-[0.6875rem]">
          {r.startTime}–{r.endTime} · 🔒 {boatName(r.boatId)} משוריינת על ידי ההנהלה
        </p>
        {r.notes && <p className="text-slate-600 text-[0.6875rem]">{r.notes}</p>}
      </div>
      {staff && (
        <button
          type="button"
          onClick={() => removeReservation(r)}
          aria-label={`בטל שריון ${r.title}`}
          title="בטל שריון"
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  const SailChip: React.FC<{ sail: Sail; compact?: boolean }> = ({ sail, compact }) => {
    const confirmed = store.getConfirmedParticipants(sail.id).length;
    const occ = occupancy(sail);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectSail(sail.id);
        }}
        className={`w-full text-right p-1 rounded-lg ${compact ? 'text-[0.625rem] sm:text-xs' : 'text-xs p-2'} font-semibold truncate block transition cursor-pointer border ${OCCUPANCY_STYLE[occ]}`}
        title={`${sail.title} (${sail.departureTime}–${sail.estimatedReturnTime}) · ${sail.boatName} · סקיפר: ${sail.skipperName}`}
      >
        <div className="flex items-center gap-1 truncate">
          <span className="font-bold">{sail.departureTime}</span>
          {!compact && <span className="font-normal">–{sail.estimatedReturnTime}</span>}
          <span className="truncate">{sail.title}</span>
        </div>
        <div className="flex items-center justify-between text-[0.5625rem] sm:text-[0.625rem] text-slate-500 font-normal mt-0.5">
          <span className="truncate">{sail.boatName.split(' (')[0]}</span>
          {sail.sailType === 'club' && occ !== 'cancelled' && (
            <span className={occ === 'full' ? 'text-rose-700 font-black' : 'text-slate-600'}>
              {occ === 'full' ? 'מלא' : `${confirmed}/${sail.maxParticipants}`}
            </span>
          )}
        </div>
      </button>
    );
  };

  // ---------- Month view ----------
  const renderMonth = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();
    const selectedSails = selectedDateStr ? sailsByDate[selectedDateStr] ?? [] : [];

    return (
      <>
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 py-1">
          {HEBREW_DAYS_SHORT.map((day, idx) => (
            <div key={idx} className="py-1">
              <span className="hidden sm:inline">{HEBREW_DAYS[idx]}</span>
              <span className="sm:hidden">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }).map((_, idx) => (
            <div key={`empty-${idx}`} className="min-h-20 sm:min-h-28 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/50 opacity-40" />
          ))}
          {Array.from({ length: totalDays }).map((_, idx) => {
            const key = dateKey(new Date(year, month, idx + 1));
            const daySails = sailsByDate[key] ?? [];
            const dayReservations = reservationsByDate[key] ?? [];
            const isToday = key === todayStr;
            const isSelected = key === selectedDateStr;
            return (
              <div
                key={key}
                onClick={() => setSelectedDateStr(isSelected ? null : key)}
                className={`min-h-20 sm:min-h-28 p-1 sm:p-2 rounded-2xl border transition flex flex-col cursor-pointer ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/40 ring-2 ring-sky-400/30'
                    : isToday
                    ? 'border-sky-300 bg-sky-50/20'
                    : daySails.length > 0
                    ? 'border-slate-200 hover:border-sky-300 bg-white shadow-2xs'
                    : 'border-slate-100 bg-slate-50/30 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDay(key);
                    }}
                    className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-sky-300 ${
                      isToday ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-700'
                    }`}
                    title="תצוגת יום"
                  >
                    {idx + 1}
                  </button>
                  <AddButton date={key} />
                </div>
                <div className="mt-0.5">
                  <DayWeather forecast={forecast} date={key} showWaves={false} />
                </div>
                <div className="space-y-1 my-1 overflow-hidden flex-1">
                  {daySails.slice(0, 2).map((sail) => (
                    <SailChip key={sail.id} sail={sail} compact />
                  ))}
                  {daySails.length > 2 && (
                    <div className="text-[0.625rem] font-bold text-slate-500 text-center">+{daySails.length - 2} נוספות</div>
                  )}
                  {dayReservations.length > 0 &&
                    (dayReservations.length === 1 && daySails.length < 2 ? (
                      <ReservationChip r={dayReservations[0]} />
                    ) : (
                      <div
                        className={`text-[0.625rem] font-bold text-center rounded-lg py-0.5 ${RESERVATION_STYLE}`}
                        title={dayReservations.map((r) => `${r.startTime}–${r.endTime} ${r.title} (${boatName(r.boatId)})`).join('\n')}
                      >
                        🔒 {dayReservations.length} שריונים
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        {selectedDateStr && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2 flex-wrap">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-sky-600" />
                {selectedDateStr.split('-').reverse().join('/')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDay(selectedDateStr)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-sky-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
                >
                  תצוגת יום
                </button>
                <ReserveButton date={selectedDateStr} />
                <AddButton date={selectedDateStr} label />
              </div>
            </div>
            <DaySummary date={selectedDateStr} />
            {(reservationsByDate[selectedDateStr] ?? []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(reservationsByDate[selectedDateStr] ?? []).map((r) => (
                  <ReservationCard key={r.id} r={r} />
                ))}
              </div>
            )}
            {selectedSails.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">אין הפלגות בתאריך זה.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedSails.map((sail) => (
                  <SailCard key={sail.id} sail={sail} />
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  // ---------- Week view ----------
  const renderWeek = () => (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {weekDays.map((d) => {
        const key = dateKey(d);
        const daySails = sailsByDate[key] ?? [];
        const isToday = key === todayStr;
        return (
          <div
            key={key}
            className={`rounded-2xl border p-2 flex flex-col gap-1.5 min-h-24 ${
              isToday ? 'border-sky-300 bg-sky-50/30' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => openDay(key)}
                className="text-right cursor-pointer hover:text-sky-700"
                title="תצוגת יום"
              >
                <span className={`text-xs font-black ${isToday ? 'text-sky-700' : 'text-slate-800'}`}>
                  {HEBREW_DAYS[d.getDay()]} {shortDate(d)}
                </span>
              </button>
              <AddButton date={key} />
            </div>
            <DayWeather forecast={forecast} date={key} />
            <div className="space-y-1">
              {daySails.length === 0 && !(reservationsByDate[key] ?? []).length ? (
                <p className="text-[0.625rem] text-slate-400">אין הפלגות</p>
              ) : (
                daySails.map((sail) => <SailChip key={sail.id} sail={sail} compact />)
              )}
              {(reservationsByDate[key] ?? []).map((r) => (
                <ReservationChip key={r.id} r={r} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ---------- Day view: a timeline per boat ----------
  const renderDay = () => {
    const key = dateKey(cursor);
    const daySails = sailsByDate[key] ?? [];
    const pct = (minutes: number) => ((Math.min(Math.max(minutes, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100;
    const hours = [6, 9, 12, 15, 18, 21];
    // Hourly forecast every 3 hours for the strip above the timeline.
    const strip = hours
      .map((h) => forecast?.hours[`${key}T${String(h).padStart(2, '0')}:00`])
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <DaySummary date={key} />
          <div className="flex items-center gap-2">
            <ReserveButton date={key} />
            <AddButton date={key} label />
          </div>
        </div>

        {strip.length > 0 && (
          <div className="grid grid-cols-6 gap-1 text-center text-[0.625rem] bg-slate-50 rounded-2xl border border-slate-200 p-2">
            {strip.map((h) => {
              const cond = sailingConditions(h.wind, h.gust, h.wave);
              return (
                <div key={h.time} className="space-y-0.5">
                  <div className="font-bold text-slate-600">{h.time.slice(11, 16)}</div>
                  <div>{weatherLabel(h.weatherCode).icon}</div>
                  <div className={WIND_TEXT[cond]}>{Math.round(h.wind)}kn</div>
                  <div className="text-slate-400">{windFrom(h.windDir)}</div>
                  {h.wave !== null && <div className="text-sky-700">🌊{h.wave.toFixed(1)}</div>}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <div className="relative h-4 mr-24 sm:mr-32 text-[0.5625rem] text-slate-400">
            {hours.map((h) => (
              <span key={h} className="absolute translate-x-1/2" style={{ right: `${pct(h * 60)}%` }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {boats.map((boat) => {
            const boatSails = daySails.filter((s) => s.status !== 'cancelled' && sailUsesBoat(s, boat));
            const boatReservations = (reservationsByDate[key] ?? []).filter((r) => r.boatId === boat.id);
            const restricted = (boat.allowedLevels?.length ?? 0) > 0 || (boat.allowedMemberIds?.length ?? 0) > 0;
            return (
              <div key={boat.id} className="flex items-stretch gap-2">
                <div className="w-22 sm:w-30 shrink-0 text-xs">
                  <div className="font-bold text-slate-800 flex items-center gap-1 truncate">
                    {restricted && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                    {boat.name}
                  </div>
                  <div className={`text-[0.625rem] ${boat.status === 'available' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {boat.status === 'available' ? 'זמינה' : boat.status === 'maintenance' ? 'בתיקון' : 'לא זמינה'}
                  </div>
                </div>
                <div
                  className={`relative flex-1 h-12 rounded-xl border overflow-hidden ${
                    boat.status === 'available' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/60 border-amber-200 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.03)_6px,rgba(0,0,0,0.03)_12px)]'
                  }`}
                >
                  {hours.map((h) => (
                    <span key={h} className="absolute top-0 bottom-0 border-r border-dashed border-slate-200" style={{ right: `${pct(h * 60)}%` }} />
                  ))}
                  {boatSails.map((sail) => {
                    const [start, end] = sailWindow(sail.departureTime, sail.estimatedReturnTime);
                    return (
                      <button
                        key={sail.id}
                        type="button"
                        onClick={() => onSelectSail(sail.id)}
                        className={`absolute top-1 bottom-1 rounded-lg border px-1 text-[0.625rem] font-bold truncate text-right cursor-pointer ${OCCUPANCY_STYLE[occupancy(sail)]}`}
                        style={{ right: `${pct(start)}%`, width: `${Math.max(pct(end) - pct(start), 4)}%` }}
                        title={`${sail.title} ${sail.departureTime}–${sail.estimatedReturnTime}`}
                      >
                        {sail.departureTime} {sail.title}
                      </button>
                    );
                  })}
                  {boatReservations.map((r) => {
                    const [start, end] = sailWindow(r.startTime, r.endTime);
                    return (
                      <div
                        key={r.id}
                        className={`absolute top-1 bottom-1 rounded-lg border px-1 text-[0.625rem] font-bold truncate text-right ${RESERVATION_STYLE}`}
                        style={{ right: `${pct(start)}%`, width: `${Math.max(pct(end) - pct(start), 4)}%` }}
                        title={`${RESERVATION_KIND_LABELS[r.kind]}: ${r.title} ${r.startTime}–${r.endTime}`}
                      >
                        {RESERVATION_KIND_ICONS[r.kind]} {r.title}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {(daySails.length > 0 || (reservationsByDate[key] ?? []).length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(reservationsByDate[key] ?? []).map((r) => (
              <ReservationCard key={r.id} r={r} />
            ))}
            {daySails.map((sail) => (
              <SailCard key={sail.id} sail={sail} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const DaySummary: React.FC<{ date: string }> = ({ date }) => {
    const day = forecast?.days[date];
    if (!day) return <span className="text-[0.6875rem] text-slate-400">אין עדיין תחזית לתאריך זה</span>;
    const w = weatherLabel(day.weatherCode);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
        <span className="font-bold">
          {w.icon} {w.label}, עד {Math.round(day.tempMax)}°
        </span>
        <span>
          💨 עד {Math.round(day.windMax)} קשר, משבים {Math.round(day.gustMax)} (מ{windFrom(day.windDir)})
        </span>
        {day.waveMax !== null && <span>🌊 גלים עד {day.waveMax.toFixed(1)} מ'</span>}
        <span className="text-[0.625rem] text-slate-400">{CLUB_LOCATION.name}</span>
      </div>
    );
  };

  const SailCard: React.FC<{ sail: Sail }> = ({ sail }) => {
    const confirmed = store.getConfirmedParticipants(sail.id).length;
    const isClub = sail.sailType === 'club';
    return (
      <div
        onClick={() => onSelectSail(sail.id)}
        className="p-3 bg-white rounded-xl border border-slate-200 hover:border-sky-300 shadow-2xs cursor-pointer transition text-xs space-y-1"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded text-[0.625rem] font-bold ${isClub ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}`}>
            {isClub ? '⛵ מועדון' : '🚤 פרטית'}
          </span>
          <h4 className="font-bold text-slate-900">{sail.title}</h4>
        </div>
        <p className="text-slate-500 text-[0.6875rem]">
          {sail.departureTime}–{sail.estimatedReturnTime} · {sail.boatName} · סקיפר: <strong>{sail.skipperName}</strong>
        </p>
        {isClub && sail.status !== 'cancelled' && (
          confirmed >= sail.minParticipants ? (
            <span className="text-[0.625rem] font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> יציאה מובטחת · {confirmed}/{sail.maxParticipants}
            </span>
          ) : (
            <span className="text-[0.625rem] font-bold text-amber-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> ממתין ל-{sail.minParticipants - confirmed} חברים · {confirmed}/{sail.maxParticipants}
            </span>
          )
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-3 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
      {/* Header: title, view switch, filters, navigation */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">{title}</h2>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
            <button onClick={() => move(-1)} className="p-1.5 hover:bg-white text-slate-700 rounded-lg cursor-pointer" title="הקודם">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setCursor(today);
                setSelectedDateStr(null);
              }}
              className="px-2.5 py-1 text-xs font-bold hover:bg-white text-slate-800 rounded-lg cursor-pointer"
            >
              היום
            </button>
            <button onClick={() => move(1)} className="p-1.5 hover:bg-white text-slate-700 rounded-lg cursor-pointer" title="הבא">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${view === v ? 'bg-white text-sky-900 shadow-2xs font-bold' : 'text-slate-600'}`}
              >
                {v === 'month' ? 'חודש' : v === 'week' ? 'שבוע' : 'יום'}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            {(['all', 'club', 'private'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${filterType === f ? 'bg-white text-sky-900 shadow-2xs font-bold' : 'text-slate-600'}`}
              >
                {f === 'all' ? 'הכל' : f === 'club' ? 'מועדון' : 'פרטית'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' && renderMonth()}
      {view === 'week' && renderWeek()}
      {view === 'day' && renderDay()}

      <BoatReservationModal isOpen={reserveDate !== null} initialDate={reserveDate ?? undefined} onClose={() => setReserveDate(null)} />

      {/* Legend */}
      <div className="flex items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 pt-2 border-t border-slate-100 flex-wrap">
        <span className="font-bold text-slate-700">מקרא:</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-300" />ממתינה למשתתפים</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" />יציאה מובטחת</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" />מלאה</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500" />פרטית</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-300" />מבוטלת</span>
        {onOpenCreateModal && (
          <span className="flex items-center gap-1.5"><Plus className="w-3 h-3 text-sky-700" />פתיחת הפלגה ביום</span>
        )}
        <span className="flex items-center gap-1.5"><span className={`w-4 h-3 rounded ${RESERVATION_STYLE}`} />שריון הנהלה (שיעור / מיוחדת / תחזוקה)</span>
        <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" />סירה עם הרשאות</span>
        <span>
          💨 <span className="text-emerald-700 font-bold">עד 17</span> · <span className="text-amber-700 font-bold">18-24</span> ·{' '}
          <span className="text-rose-700 font-black">25+</span> קשר · 🌊 מטרים
        </span>
      </div>
    </div>
  );
};
