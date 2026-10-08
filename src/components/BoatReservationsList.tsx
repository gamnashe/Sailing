import React, { useState } from 'react';
import { store } from '../services/store';
import { RESERVATION_KIND_ICONS, RESERVATION_KIND_LABELS } from '../types';
import { BoatReservationModal } from './BoatReservationModal';
import { Lock, Plus, Trash2 } from 'lucide-react';

/** Staff: upcoming boat reservations with a button to add more. */
export const BoatReservationsList: React.FC = () => {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const upcoming = store.getBoatReservations().filter((r) => r.date >= today);
  const boatName = (id: string) => store.getBoatById(id)?.name ?? 'סירה';

  const remove = async (id: string, title: string) => {
    if (!confirm(`לבטל את השריון "${title}"?`)) return;
    await store.deleteBoatReservation(id);
  };

  return (
    <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-600" aria-hidden="true" />
            שריונים קרובים
          </h2>
          <p className="text-xs text-slate-500">
            סירות שההנהלה שמרה לשיעורים, פעילויות מיוחדות או תחזוקה. אפשר לשריין גם מתוך לוח השנה.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          שריון חדש
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-center py-6 text-xs text-slate-400">אין שריונים קרובים.</p>
      ) : (
        <div className="divide-y divide-slate-100 text-xs">
          {upcoming.slice(0, 40).map((r) => (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900">
                  {RESERVATION_KIND_ICONS[r.kind]} {r.title}
                </span>
                <span className="text-slate-500">
                  {' '}
                  · {r.date.split('-').reverse().join('/')} {r.startTime}–{r.endTime} · {boatName(r.boatId)} ·{' '}
                  {RESERVATION_KIND_LABELS[r.kind]}
                </span>
              </div>
              <button
                onClick={() => remove(r.id, r.title)}
                aria-label={`בטל שריון ${r.title}`}
                title="בטל שריון"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BoatReservationModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
};
