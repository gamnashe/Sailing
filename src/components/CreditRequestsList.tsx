import React, { useState } from 'react';
import { store } from '../services/store';
import { Coins, Check, X } from 'lucide-react';

/** Admin: members' pending requests for more credits, approved with an adjustable amount or declined. */
export const CreditRequestsList: React.FC<{ onDone: (message: string, ok: boolean) => void }> = ({ onDone }) => {
  const pending = store.getCreditRequests().filter((r) => r.status === 'pending');
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolve = async (id: string, approve: boolean, name: string) => {
    const request = pending.find((r) => r.id === id);
    if (!request) return;
    const amount = amounts[id] ?? request.amount;
    setBusyId(id);
    const res = await store.resolveCreditRequest(id, approve, amount);
    setBusyId(null);
    onDone(
      res.success
        ? approve
          ? `נוספו ${amount} קרדיטים ל${name}`
          : `הבקשה של ${name} נדחתה`
        : res.error || 'הפעולה נכשלה',
      res.success
    );
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-600" aria-hidden="true" />
            בקשות לקרדיטים נוספים
          </h2>
          <p className="text-xs text-slate-500">אפשר לשנות את הכמות לפני האישור. החבר יקבל התראה.</p>
        </div>
        <span className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">{pending.length} ממתינות</span>
      </div>

      {pending.length === 0 ? (
        <p className="text-center py-6 text-xs text-slate-400">אין בקשות קרדיט ממתינות.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => {
            const member = store.getUserById(r.userId);
            const name = member?.fullName ?? 'חבר לשעבר';
            return (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-amber-50/50 border border-amber-200 rounded-2xl gap-3 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900 text-sm">{name}</p>
                  <p className="text-slate-600">
                    ביקש/ה <strong>{r.amount}</strong> קרדיטים · יתרה נוכחית: <strong>{member?.credits ?? 0}</strong> ·{' '}
                    {new Date(r.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {r.note && <p className="text-slate-700 mt-1">"{r.note}"</p>}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <label className="sr-only" htmlFor={`amount-${r.id}`}>
                    כמות לאישור
                  </label>
                  <input
                    id={`amount-${r.id}`}
                    type="number"
                    min={1}
                    max={100}
                    value={amounts[r.id] ?? r.amount}
                    onChange={(e) => setAmounts({ ...amounts, [r.id]: Number(e.target.value) })}
                    className="w-16 p-2 bg-white border border-slate-200 rounded-xl text-center font-bold"
                  />
                  <button
                    onClick={() => resolve(r.id, true, name)}
                    disabled={busyId === r.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                    אשר
                  </button>
                  <button
                    onClick={() => resolve(r.id, false, name)}
                    disabled={busyId === r.id}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                    דחה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
