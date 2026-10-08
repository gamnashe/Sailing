import React, { useState, useEffect } from 'react';
import {
  store,
  calculateDurationHours,
  calculatePrivateSailCredits,
  mayTakeBoat,
  boatBusyMessage,
} from '../services/store';
import { UserProfile, Sail, SailType, isStaff } from '../types';
import { useForecast, forecastAt, sailingConditions, roughReason } from '../services/weather';
import { Overlay } from './Overlay';
import {
  X,
  Calendar,
  Clock,
  Anchor,
  Compass,
  MapPin,
  Users,
  FileText,
  Coins,
  Sailboat,
  AlertCircle,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  currentUser: UserProfile;
  onClose: () => void;
  onCreated: (sail: Sail) => void;
  /** YYYY-MM-DD the sail opens on, e.g. the calendar day the person pressed + on. */
  initialDate?: string;
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const CreateSailModal: React.FC<Props> = ({ isOpen, currentUser, onClose, onCreated, initialDate }) => {
  const members = store.getUsers().filter((u) => u.status === 'approved');
  const skippers = members.filter((u) => u.experienceLevel.includes('סקיפר') || isStaff(u.role));
  const boats = store.getBoats();

  const [sailType, setSailType] = useState<SailType>('club');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => {
    if (initialDate) return initialDate;
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return isoDate(d);
  });
  // Opening from a calendar day sets that day each time the window opens.
  useEffect(() => {
    if (isOpen && initialDate) setDate(initialDate);
  }, [isOpen, initialDate]);
  const [departureTime, setDepartureTime] = useState('16:00');
  const [estimatedReturnTime, setEstimatedReturnTime] = useState('19:00');
  const [durationHours, setDurationHours] = useState(3);
  const [boatId, setBoatId] = useState(boats.find((b) => b.status === 'available')?.id ?? boats[0]?.id ?? '');
  const [selectedSkipperId, setSelectedSkipperId] = useState(currentUser.id);
  const [customSkipperName, setCustomSkipperName] = useState('');
  const [departurePoint, setDeparturePoint] = useState('מרינה הרצליה, רציף B');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Weather at the club's spot: rough days need an explicit confirmation before opening a sail
  const clubSettings = store.getSettings();
  const forecast = useForecast(clubSettings.weatherLocation);
  const [roughAck, setRoughAck] = useState(false);
  useEffect(() => setRoughAck(false), [date]);

  // Recalculate duration when departure or return time changes
  useEffect(() => {
    const calc = calculateDurationHours(departureTime, estimatedReturnTime);
    setDurationHours(calc);
  }, [departureTime, estimatedReturnTime]);

  if (!isOpen) return null;

  const boat = boats.find((b) => b.id === boatId);
  const boatName = boat ? `${boat.name} (${boat.model})` : '';
  const reservations = store.getBoatReservations();
  const busyMessage = boat ? boatBusyMessage(store.getSails(), reservations, boat, date, departureTime, estimatedReturnTime) : null;
  const restricted = Boolean(boat && ((boat.allowedLevels?.length ?? 0) > 0 || (boat.allowedMemberIds?.length ?? 0) > 0));
  const skipperUser = selectedSkipperId === 'custom' ? undefined : members.find((m) => m.id === selectedSkipperId);
  const taker = sailType === 'private' ? currentUser : skipperUser;
  const permissionProblem =
    boat && restricted
      ? sailType === 'private'
        ? !mayTakeBoat(boat, currentUser) && `אין לך הרשאה להוציא את ${boat.name}. פנה להנהלת המועדון.`
        : selectedSkipperId === 'custom'
        ? !isStaff(currentUser.role) && `${boat.name} מוגבלת לסקיפרים מורשים; בחר סקיפר מורשה מהרשימה`
        : !mayTakeBoat(boat, taker) && `${taker?.fullName ?? 'הסקיפר'} אינו מורשה להוציא את ${boat.name}`
      : false;
  const blockReason = busyMessage ?? (permissionProblem || null);

  // Worst conditions over the sail (departure and return hours), or the whole day when hours aren't forecast yet
  const forecastDay = forecast?.days[date];
  const hoursAt = [forecastAt(forecast, date, departureTime), forecastAt(forecast, date, estimatedReturnTime)].filter(
    (h): h is NonNullable<typeof h> => Boolean(h)
  );
  const weatherCond = hoursAt.length
    ? sailingConditions(
        Math.max(...hoursAt.map((h) => h.wind)),
        Math.max(...hoursAt.map((h) => h.gust)),
        Math.max(...hoursAt.map((h) => h.wave ?? 0)) || null,
        clubSettings
      )
    : forecastDay
    ? sailingConditions(forecastDay.windMax, forecastDay.gustMax, forecastDay.waveMax, clubSettings)
    : null;
  const needsRoughAck = weatherCond === 'rough' && !roughAck;

  // Credits calculation
  const privateCreditCost = calculatePrivateSailCredits(durationHours);
  const userCredits = currentUser.credits ?? 5;
  const canAffordPrivate = userCredits >= privateCreditCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (blockReason) {
      setErrorMsg(blockReason);
      return;
    }
    if (needsRoughAck) {
      setErrorMsg('צפוי ים סוער ביום הזה. סמן שראית את התחזית כדי לפתוח בכל זאת.');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('יש להזין כותרת / מטרת ההפלגה');
      return;
    }

    if (sailType === 'private') {
      if (durationHours < 3) {
        setErrorMsg('מינימום משך הפלגה פרטית הוא 3 שעות');
        return;
      }
      if (!canAffordPrivate) {
        setErrorMsg(`אין ברשותך מספיק קרדיטים עבור הפלגה פרטית (נדרש: ${privateCreditCost}, יתרה: ${userCredits})`);
        return;
      }
    }

    let finalSkipperName = currentUser.fullName;
    let finalSkipperId: string | undefined = undefined;

    if (selectedSkipperId === 'custom') {
      finalSkipperName = customSkipperName.trim() || 'סקיפר מועדון';
    } else {
      const found = members.find((m) => m.id === selectedSkipperId);
      if (found) {
        finalSkipperName = found.fullName;
        finalSkipperId = found.id;
      }
    }

    try {
      const created = await store.createSail({
        title: title.trim(),
        sailType,
        date,
        departureTime,
        estimatedReturnTime,
        durationHours: Math.max(3, Math.round(durationHours * 10) / 10),
        boatName,
        boatId: boat?.id,
        skipperName: finalSkipperName,
        skipperId: finalSkipperId,
        departurePoint,
        notes: notes.trim(),
        minParticipants: sailType === 'club' ? 3 : 1,
        maxParticipants: 6, // Enforced 6 participants max
        creditCost: sailType === 'club' ? 1 : privateCreditCost,
        status: 'open',
        createdBy: currentUser.id,
        creatorName: currentUser.fullName,
      });

      onCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'שגיאה ביצירת ההפלגה');
    }
  };

  return (
    <Overlay>
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4 overflow-y-auto">
      <div className="w-full max-w-lg glass-sheet rounded-3xl overflow-hidden my-auto text-right">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-800 to-sky-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Anchor className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">פתיחת הפלגה חדשה</h2>
              <p className="text-xs text-sky-200">הפלגת מועדון משותפת או הפלגה פרטית לחברים</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sail Type Tabs */}
        <div className="p-4 bg-white/60 border-b border-slate-100">
          <label className="block text-xs font-bold text-slate-700 mb-2">בחר סוג הפלגה:</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Club Sail Button */}
            <button
              type="button"
              onClick={() => setSailType('club')}
              className={`p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col justify-between ${
                sailType === 'club'
                  ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 text-sky-950 font-bold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-black text-sm text-sky-900">
                  <Sailboat className="w-4 h-4 text-sky-600" />
                  הפלגת מועדון
                </span>
                <span className="bg-sky-100 text-sky-800 text-[0.625rem] font-bold px-2 py-0.5 rounded-full">
                  1 קרדיט
                </span>
              </div>
              <p className="text-[0.6875rem] font-normal text-slate-500">
                סגירה: מינימום 3 אנשים ומקסימום 6 אנשים. יורד קרדיט 1 לכל חבר שנרשם.
              </p>
            </button>

            {/* Private Sail Button */}
            <button
              type="button"
              onClick={() => setSailType('private')}
              className={`p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col justify-between ${
                sailType === 'private'
                  ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 font-bold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-black text-sm text-indigo-950">
                  <Anchor className="w-4 h-4 text-indigo-600" />
                  הפלגה פרטית
                </span>
                <span className="bg-indigo-100 text-indigo-800 text-[0.625rem] font-bold px-2 py-0.5 rounded-full">
                  3+ קרדיטים
                </span>
              </div>
              <p className="text-[0.6875rem] font-normal text-slate-500">
                מינימום 3 שעות (3 קרדיטים), ו-1 קרדיט נוסף לכל שעה מעבר לכך.
              </p>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pricing Notice Banner */}
          {sailType === 'club' ? (
            <div className="p-3 rounded-2xl bg-sky-50/80 border border-sky-200 text-xs text-sky-950 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  כללי סגירת הפלגת מועדון:
                </span>
                <span className="bg-sky-200/80 text-sky-900 font-black px-2 py-0.5 rounded-lg text-[0.6875rem]">
                  3 עד 6 משתתפים
                </span>
              </div>
              <p className="text-[0.6875rem] text-slate-600">
                ההפלגה תאושר ליציאה החל מ-3 נרשמים. לכל משתמש יורד קרדיט 1 מחשבונו בעת אישור הרשמה.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  <Coins className="w-4 h-4 text-amber-500" />
                  עלות הפלגה פרטית:
                </span>
                <span className="bg-amber-100 text-amber-950 font-black px-2.5 py-0.5 rounded-lg text-xs border border-amber-300">
                  {privateCreditCost} קרדיטים ({durationHours} שעות)
                </span>
              </div>
              <p className="text-[0.6875rem] text-slate-600">
                3 קרדיטים עבור 3 שעות ראשונות (מינימום) + 1 קרדיט לכל שעה נוספת.
                <br />
                יתרת הקרדיטים שלך: <strong>{userCredits} קרדיטים</strong>.{' '}
                {canAffordPrivate ? (
                  <span className="text-emerald-700 font-bold">יתרה מספקת ✓</span>
                ) : (
                  <span className="text-rose-600 font-bold">חסרים {privateCreditCost - userCredits} קרדיטים!</span>
                )}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              שם ההפלגה / מטרת היציאה לים *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                sailType === 'club'
                  ? 'למשל: הפלגת שקיעה ותרגול תמרוני מפרש'
                  : 'למשל: הפלגה פרטית למשפחה / חברים לחוף געש'
              }
              className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> תאריך
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> שעת יציאה
              </label>
              <input
                type="time"
                required
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> שעת חזרה
              </label>
              <input
                type="time"
                required
                value={estimatedReturnTime}
                onChange={(e) => setEstimatedReturnTime(e.target.value)}
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Anchor className="w-3.5 h-3.5 text-slate-400" /> סירה
              </label>
              <select
                value={boatId}
                onChange={(e) => setBoatId(e.target.value)}
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                {boats.map((b) => {
                  const busy = boatBusyMessage(store.getSails(), reservations, b, date, departureTime, estimatedReturnTime);
                  return (
                    <option key={b.id} value={b.id}>
                      {busy ? '⛔ (תפוסה בשעות אלה)' : b.status === 'available' ? '🟢' : b.status === 'maintenance' ? '🟠 (בהספנה/תיקון)' : '🔴 (לא זמין)'}{' '}
                      {b.name} ({b.model})
                      {(b.allowedLevels?.length || b.allowedMemberIds?.length) ? ' 🔒' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-slate-400" /> סקיפר אחראי
              </label>
              <select
                value={selectedSkipperId}
                onChange={(e) => setSelectedSkipperId(e.target.value)}
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                {skippers.map((s) => {
                  const allowed = !boat || mayTakeBoat(boat, s);
                  return (
                    <option key={s.id} value={s.id} disabled={!allowed}>
                      {s.fullName} ({s.experienceLevel}){allowed ? '' : ' — לא מורשה לסירה זו'}
                    </option>
                  );
                })}
                <option value="custom">סקיפר אורח / אחר...</option>
              </select>
            </div>
          </div>

          {weatherCond === 'rough' && forecastDay && (
            <div role="alert" className="p-3 rounded-xl bg-rose-600 text-white text-xs space-y-2">
              <p className="font-black text-sm">⛈️ צפוי ים סוער – לא מומלץ לפתוח הפלגה</p>
              <p className="opacity-95">
                {roughReason(forecastDay, clubSettings) || 'רוח וגלים מעל הסף שקבע המועדון'} ({clubSettings.weatherLocation.name}).
              </p>
              <label className="flex items-center gap-2 bg-white/15 rounded-lg p-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={roughAck}
                  onChange={(e) => setRoughAck(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
                ראיתי את התחזית ובכל זאת אני פותח/ת את ההפלגה
              </label>
            </div>
          )}
          {weatherCond === 'caution' && (
            <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              💨 רוח/ים ערים בשעות האלה – מתאים לשייטים מנוסים.
            </p>
          )}

          {blockReason && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{blockReason}</span>
            </div>
          )}
          {!blockReason && restricted && boat && (
            <p className="text-[0.6875rem] text-slate-500">
              🔒 {boat.name} מוגבלת:
              {boat.allowedLevels?.length ? ` רמות ${boat.allowedLevels.join(', ')}` : ''}
              {boat.allowedMemberIds?.length
                ? ` · ${boat.allowedMemberIds.map((id) => store.getUserById(id)?.fullName).filter(Boolean).join(', ')}`
                : ''}
            </p>
          )}

          {selectedSkipperId === 'custom' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">שם הסקיפר האורח</label>
              <input
                type="text"
                value={customSkipperName}
                onChange={(e) => setCustomSkipperName(e.target.value)}
                placeholder="הזן שם סקיפר מלא"
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" /> נקודת יציאה
              </label>
              <input
                type="text"
                required
                value={departurePoint}
                onChange={(e) => setDeparturePoint(e.target.value)}
                placeholder="מרינה הרצליה / תל אביב..."
                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" /> הגבלת משתתפים
              </label>
              <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold flex items-center justify-between">
                <span>{sailType === 'club' ? 'מינימום 3 עד מקסימום 6 משתתפים' : 'עד 6 משתתפים (פרטית)'}</span>
                <ShieldCheck className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> הערות, ציוד נדרש ודגשים
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="למשל: להביא בגד ים ומגבת, כיבוד קל לשיתוף, נעלי סירה עם סוליה בהירה בלבד..."
              className="w-full px-3.5 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={(sailType === 'private' && !canAffordPrivate) || Boolean(blockReason) || needsRoughAck}
              className={`w-full font-bold py-3 rounded-xl transition shadow-md cursor-pointer text-sm flex items-center justify-center gap-2 ${
                (sailType === 'private' && !canAffordPrivate) || blockReason || needsRoughAck
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20 active:scale-98'
              }`}
            >
              <Anchor className="w-4 h-4" />
              {sailType === 'club'
                ? 'פרסם הפלגת מועדון (1 קרדיט למשתתף)'
                : `הזמן הפלגה פרטית (${privateCreditCost} קרדיטים)`}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Overlay>
  );
};
