import React, { useState } from 'react';
import { store } from '../services/store';
import { Sail, UserProfile } from '../types';
import { useForecast, weatherLabel, windFrom, sailingConditions, CLUB_LOCATION } from '../services/weather';
import {
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  Sailboat,
  Anchor,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  onSelectSail: (sailId: string) => void;
  onOpenCreateModal?: () => void;
}

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HEBREW_DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

export const SailsCalendar: React.FC<Props> = ({ currentUser, onSelectSail, onOpenCreateModal }) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [filterType, setFilterType] = useState<'all' | 'club' | 'private'>('all');
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const allSails = store.getSails();
  const forecast = useForecast();

  /** Occupancy of a sail, for its colour in the grid. */
  const occupancy = (sail: Sail) => {
    if (sail.status === 'cancelled') return 'cancelled' as const;
    if (sail.sailType === 'private') return 'private' as const;
    const confirmed = store.getConfirmedParticipants(sail.id).length;
    if (confirmed >= sail.maxParticipants) return 'full' as const;
    if (confirmed >= sail.minParticipants) return 'guaranteed' as const;
    return 'waiting' as const;
  };

  const OCCUPANCY_STYLE = {
    cancelled: 'bg-slate-100 text-slate-400 border-slate-200 line-through',
    private: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border-indigo-200',
    full: 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300',
    guaranteed: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300',
    waiting: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200',
  } as const;

  const WIND_TEXT = { good: 'text-emerald-700', caution: 'text-amber-700', rough: 'text-rose-700 font-black' } as const;

  // Filter sails by type
  const sails = allSails.filter((s) => {
    if (filterType === 'all') return true;
    return s.sailType === filterType;
  });

  // Calculate calendar grid days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const totalDays = lastDayOfMonth.getDate();
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const resetToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Group sails by date string 'YYYY-MM-DD'
  const sailsByDate: Record<string, Sail[]> = {};
  sails.forEach((sail) => {
    if (!sailsByDate[sail.date]) {
      sailsByDate[sail.date] = [];
    }
    sailsByDate[sail.date].push(sail);
  });

  // Helper to format date key YYYY-MM-DD
  const formatDateKey = (dayNum: number) => {
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(dayNum).padStart(2, '0');
    return `${currentYear}-${m}-${d}`;
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const selectedDateSails = selectedDateStr ? sailsByDate[selectedDateStr] || [] : [];

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
      {/* Calendar Header Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>{HEBREW_MONTHS[currentMonth]}</span>
              <span>{currentYear}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">מועדי הפלגות מועדון והפלגות פרטיות</p>
          </div>
        </div>

        {/* Filter & Month Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sail type filters */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                filterType === 'all' ? 'bg-white text-sky-900 shadow-2xs font-bold' : 'text-slate-600'
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setFilterType('club')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                filterType === 'club' ? 'bg-white text-sky-900 shadow-2xs font-bold' : 'text-slate-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              מועדון
            </button>
            <button
              onClick={() => setFilterType('private')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                filterType === 'private' ? 'bg-white text-indigo-900 shadow-2xs font-bold' : 'text-slate-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              פרטית
            </button>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition cursor-pointer"
              title="חודש קודם"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={resetToToday}
              className="px-2.5 py-1 text-xs font-bold hover:bg-white text-slate-800 rounded-lg transition cursor-pointer"
            >
              היום
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition cursor-pointer"
              title="חודש הבא"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekdays Header (RTL: Sunday to Saturday) */}
      <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 py-1">
        {HEBREW_DAYS_SHORT.map((day, idx) => (
          <div key={idx} className="py-1">
            <span className="hidden sm:inline">{HEBREW_DAYS[idx]}</span>
            <span className="sm:hidden">{day}</span>
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {/* Leading empty cells for days before the 1st of the month */}
        {Array.from({ length: startDayOfWeek }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="min-h-20 sm:min-h-28 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/50 opacity-40 p-1"
          />
        ))}

        {/* Month Day Cells */}
        {Array.from({ length: totalDays }).map((_, idx) => {
          const dayNum = idx + 1;
          const dateKey = formatDateKey(dayNum);
          const daySails = sailsByDate[dateKey] || [];
          const isToday = dateKey === todayStr;
          const isSelected = dateKey === selectedDateStr;

          return (
            <div
              key={dateKey}
              onClick={() => setSelectedDateStr(dateKey === selectedDateStr ? null : dateKey)}
              className={`min-h-20 sm:min-h-28 p-1.5 sm:p-2 rounded-2xl border transition flex flex-col justify-between cursor-pointer relative ${
                isSelected
                  ? 'border-sky-500 bg-sky-50/40 ring-2 ring-sky-400/30'
                  : isToday
                  ? 'border-sky-300 bg-sky-50/20'
                  : daySails.length > 0
                  ? 'border-slate-200 hover:border-sky-300 bg-white hover:bg-slate-50/80 shadow-2xs'
                  : 'border-slate-100 bg-slate-50/30 hover:bg-white'
              }`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    isToday
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700'
                  }`}
                >
                  {dayNum}
                </span>

                {daySails.length > 0 && (
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded-full">
                    {daySails.length}
                  </span>
                )}
              </div>

              {/* Forecast for the day (Open-Meteo, up to 16 days ahead) */}
              {forecast?.days[dateKey] && (() => {
                const day = forecast.days[dateKey];
                const cond = sailingConditions(day.windMax, day.gustMax, day.waveMax);
                return (
                  <div
                    className="flex items-center gap-1 text-[9px] sm:text-[10px] leading-tight mt-0.5"
                    title={`${weatherLabel(day.weatherCode).label} · רוח ${Math.round(day.windMax)} קשר (משבים ${Math.round(day.gustMax)}) מ${windFrom(day.windDir)}${day.waveMax !== null ? ` · גלים עד ${day.waveMax.toFixed(1)} מ'` : ''}`}
                  >
                    <span>{weatherLabel(day.weatherCode).icon}</span>
                    <span className={WIND_TEXT[cond]}>{Math.round(day.windMax)}kn</span>
                    {day.waveMax !== null && <span className="text-sky-700 hidden sm:inline">🌊{day.waveMax.toFixed(1)}</span>}
                  </div>
                );
              })()}

              {/* Sails inside day box */}
              <div className="space-y-1 my-1 overflow-hidden flex-1">
                {daySails.slice(0, 2).map((sail) => {
                  const confirmed = store.getConfirmedParticipants(sail.id);
                  const isFull = confirmed.length >= sail.maxParticipants;
                  const isClub = sail.sailType === 'club';
                  const occ = occupancy(sail);

                  return (
                    <button
                      key={sail.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSail(sail.id);
                      }}
                      className={`w-full text-right p-1 rounded-lg text-[10px] sm:text-xs font-semibold truncate block transition cursor-pointer border ${OCCUPANCY_STYLE[occ]}`}
                      title={`${sail.title} (${sail.departureTime}) - סקיפר: ${sail.skipperName}`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-bold">{sail.departureTime}</span>
                        <span className="truncate">{sail.title}</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-500 font-normal mt-0.5">
                        <span className="truncate">{sail.boatName.split(' ')[0]}</span>
                        {isClub && (
                          <span className={isFull ? 'text-rose-700 font-black' : 'text-slate-600'}>
                            {isFull ? 'מלא' : `${confirmed.length}/${sail.maxParticipants}`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {daySails.length > 2 && (
                  <div className="text-[10px] font-bold text-slate-500 text-center">
                    +{daySails.length - 2} נוספות
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend & Details Drawer for Selected Date */}
      {selectedDateStr && (
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-in fade-in space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-sky-600" />
              הפלגות ביום {selectedDateStr.split('-').reverse().join('/')}:
            </h3>
            <span className="text-xs text-slate-500">
              {selectedDateSails.length} הפלגות מתוכננות
            </span>
          </div>

          {forecast?.days[selectedDateStr] && (() => {
            const day = forecast.days[selectedDateStr];
            const w = weatherLabel(day.weatherCode);
            return (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 bg-white rounded-xl border border-slate-200 p-2.5">
                <span className="font-bold">{w.icon} {w.label}, עד {Math.round(day.tempMax)}°</span>
                <span>💨 רוח עד {Math.round(day.windMax)} קשר, משבים {Math.round(day.gustMax)} (מ{windFrom(day.windDir)})</span>
                {day.waveMax !== null && <span>🌊 גלים עד {day.waveMax.toFixed(1)} מ'</span>}
                <span className="text-[10px] text-slate-400">תחזית ל{CLUB_LOCATION.name}</span>
              </div>
            );
          })()}

          {selectedDateSails.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">אין הפלגות מתוזמנות בתאריך זה.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {selectedDateSails.map((sail) => {
                const confirmed = store.getConfirmedParticipants(sail.id);
                const isClub = sail.sailType === 'club';
                const isReady = isClub && confirmed.length >= 3;

                return (
                  <div
                    key={sail.id}
                    onClick={() => onSelectSail(sail.id)}
                    className="p-3 bg-white rounded-xl border border-slate-200 hover:border-sky-300 shadow-2xs cursor-pointer transition flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isClub ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {isClub ? '⛵ הפלגת מועדון' : '🚤 הפלגה פרטית'}
                        </span>
                        <h4 className="font-bold text-slate-900">{sail.title}</h4>
                      </div>

                      <p className="text-slate-500 text-[11px]">
                        שעות: {sail.departureTime} - {sail.estimatedReturnTime} | סירה: {sail.boatName}
                      </p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        סקיפר: <strong>{sail.skipperName}</strong> • {isClub ? `${confirmed.length}/${sail.maxParticipants} רשומים` : 'הפלגה פרטית סגורה'}
                      </p>

                      {isClub && (
                        <div className="mt-1">
                          {isReady ? (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> יציאה מובטחת (מינימום 3 הגיעו)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-amber-500" /> ממתין ל-{3 - confirmed.length} חברים לסגירה
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer shadow-2xs"
                    >
                      פרטים
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Calendar Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100 flex-wrap">
        <span className="font-bold text-slate-700">מקרא צבעים:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-300"></span>
          <span>ממתינה למשתתפים</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
          <span>יציאה מובטחת (יש מקום)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500"></span>
          <span>מלאה (רשימת המתנה)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
          <span>הפלגה פרטית (הסירה תפוסה)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-300"></span>
          <span>הפלגה מבוטלת / הושלמה</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>💨 רוח בקשר:</span>
          <span className="text-emerald-700 font-bold">עד 17</span>
          <span className="text-amber-700 font-bold">18-24</span>
          <span className="text-rose-700 font-black">25+</span>
          <span>· 🌊 גובה גלים במטרים</span>
        </div>
      </div>
    </div>
  );
};
