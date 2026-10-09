import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { ReservationKind, RESERVATION_KIND_ICONS, RESERVATION_KIND_LABELS } from '../types';
import { X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Overlay } from './Overlay';

interface Props {
  isOpen: boolean;
  initialDate?: string;
  onClose: () => void;
}

const KINDS: ReservationKind[] = ['lesson', 'special', 'maintenance'];
const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** The same weekday, `weeks` weeks later. */
const plusWeeks = (key: string, weeks: number) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + weeks * 7);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/** Staff: block one or more boats for a lesson, special event or maintenance, optionally every week. */
export const BoatReservationModal: React.FC<Props> = ({ isOpen, initialDate, onClose }) => {
  const boats = store.getBoats();
  const [boatIds, setBoatIds] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [kind, setKind] = useState<ReservationKind>('lesson');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; total: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDate(initialDate ?? todayKey());
    setBoatIds(boats[0] ? [boats[0].id] : []);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  const toggleBoat = (id: string) =>
    setBoatIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const allSelected = boats.length > 0 && boatIds.length === boats.length;
  const total = boatIds.length * weeks;
  const timeError = endTime <= startTime ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || timeError || boatIds.length === 0) return;
    setBusy(true);
    const errors: string[] = [];
    let created = 0;
    for (let w = 0; w < weeks; w++) {
      for (const boatId of boatIds) {
        const res = await store.createBoatReservation({
          boatId,
          date: plusWeeks(date, w),
          startTime,
          endTime,
          kind,
          title: title.trim() || RESERVATION_KIND_LABELS[kind],
          notes: notes.trim() || undefined,
        });
        if (res.success) created++;
        else errors.push(res.error || 'השריון נכשל');
      }
    }
    setBusy(false);
    if (errors.length === 0) onClose();
    else setResult({ created, total, errors });
  };

  return (
    <Overlay onClose={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-title"
      className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4 overflow-y-auto"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md glass-sheet rounded-3xl my-auto text-right max-h-[92vh] overflow-y-auto"
      >
        <div className="bg-slate-800 text-white p-5 flex items-center justify-between rounded-t-3xl">
          <h2 id="reservation-title" className="text-base font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-300" aria-hidden="true" />
            שריון כלי שייט
          </h2>
          <button type="button" onClick={onClose} aria-label="סגור" className="p-1 text-slate-300 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600">
            בזמן השריון אי אפשר לפתוח הפלגה על הסירה. השריון מופיע בלוח השנה לכל החברים.
          </p>

          {/* Kind */}
          <div className="grid grid-cols-3 gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`py-2 rounded-xl border-2 font-bold cursor-pointer ${
                  kind === k ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                }`}
              >
                {RESERVATION_KIND_ICONS[k]} {RESERVATION_KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="res-title" className="block font-semibold text-slate-700 mb-1">
              שם השריון
            </label>
            <input
              id="res-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={kind === 'lesson' ? 'למשל: קורס משיט 30 – מפגש 3' : kind === 'special' ? 'למשל: שייט קבוצתי לחברה' : 'למשל: החלפת שמן מנוע'}
              className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Boats */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-700">כלי שייט</span>
              <button
                type="button"
                onClick={() => setBoatIds(allSelected ? [] : boats.map((b) => b.id))}
                className="py-1 text-sky-700 font-semibold hover:underline cursor-pointer"
              >
                {allSelected ? 'נקה' : 'כל הסירות'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {boats.map((b) => {
                const on = boatIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBoat(b.id)}
                    aria-pressed={on}
                    className={`px-2.5 py-1.5 rounded-xl border cursor-pointer ${
                      on ? 'bg-sky-600 border-sky-600 text-white font-bold' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* When */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="res-date" className="block font-semibold text-slate-700 mb-1">
                תאריך
              </label>
              <input
                id="res-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 bg-white/60 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label htmlFor="res-start" className="block font-semibold text-slate-700 mb-1">
                משעה
              </label>
              <input
                id="res-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2 bg-white/60 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label htmlFor="res-end" className="block font-semibold text-slate-700 mb-1">
                עד שעה
              </label>
              <input
                id="res-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2 bg-white/60 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="res-weeks" className="font-semibold text-slate-700">
              חזרה שבועית:
            </label>
            <select
              id="res-weeks"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="p-2 bg-white/60 border border-slate-200 rounded-xl cursor-pointer"
            >
              <option value={1}>פעם אחת</option>
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} שבועות ברצף
                </option>
              ))}
            </select>
          </div>

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="הערות (לא חובה), למשל: מדריך – רון"
            aria-label="הערות"
            className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
          />

          {timeError && (
            <p className="text-rose-700 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {timeError}
            </p>
          )}

          {result && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1" role="alert">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                נוצרו {result.created} מתוך {result.total} שריונים. אלה לא נוצרו:
              </p>
              <ul className="list-disc pr-5 space-y-0.5">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || Boolean(timeError) || boatIds.length === 0}
              className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'משריין...' : total > 1 ? `שריין (${total} שריונים)` : 'שריין'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl cursor-pointer"
            >
              {result ? 'סגור' : 'ביטול'}
            </button>
          </div>
        </div>
      </form>
    </div>
    </Overlay>
  );
};
