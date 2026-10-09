import React, { useState } from 'react';
import { store } from '../services/store';
import { Coins, Send, Clock } from 'lucide-react';

const STATUS_LABEL = { pending: 'ממתינה לאישור', approved: 'אושרה', rejected: 'לא אושרה' } as const;

/** A member asks the admins for more credits; the admins get a notification. */
export const CreditRequestCard: React.FC = () => {
  const requests = store.getCreditRequests();
  const pending = requests.find((r) => r.status === 'pending');
  const last = requests.find((r) => r.status !== 'pending');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(5);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await store.requestCredits(amount, note);
    setBusy(false);
    if (res.success) {
      setOpen(false);
      setNote('');
      setMessage({ text: 'הבקשה נשלחה למנהל המועדון. תקבל/י התראה כשהיא תטופל.', ok: true });
    } else {
      setMessage({ text: res.error || 'שליחת הבקשה נכשלה', ok: false });
    }
  };

  return (
    <div className="glass rounded-3xl p-5 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-amber-600" aria-hidden="true" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm">צריך עוד קרדיטים?</h3>
            <p className="text-slate-500">שלח בקשה למנהל המועדון והוא יוסיף לך קרדיטים.</p>
          </div>
        </div>
        {!pending && !open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setMessage(null);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer shrink-0"
          >
            בקש קרדיטים
          </button>
        )}
      </div>

      {message && (
        <p className={`rounded-xl p-2.5 ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role="status">
          {message.text}
        </p>
      )}

      {pending && (
        <p className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5">
          <Clock className="w-4 h-4" aria-hidden="true" />
          בקשה ל-{pending.amount} קרדיטים ממתינה לאישור המנהל.
        </p>
      )}

      {!pending && last && !open && (
        <p className="text-slate-500">
          בקשה אחרונה: {last.status === 'approved' ? `${last.granted ?? last.amount} קרדיטים` : `${last.amount} קרדיטים`} —{' '}
          {STATUS_LABEL[last.status]}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <label htmlFor="credit-amount" className="font-semibold text-slate-700">
              כמה קרדיטים?
            </label>
            <input
              id="credit-amount"
              type="number"
              min={1}
              max={100}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-20 p-2 bg-white/60 border border-slate-200 rounded-xl text-center font-bold"
            />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="הערה למנהל (לא חובה), למשל: שילמתי בהעברה"
            aria-label="הערה למנהל"
            className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {busy ? 'שולח...' : 'שלח בקשה'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl cursor-pointer"
            >
              ביטול
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
