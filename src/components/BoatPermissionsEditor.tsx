import React, { useState } from 'react';
import { store } from '../services/store';
import { Lock, Unlock, X } from 'lucide-react';

interface Props {
  allowedLevels: string[];
  allowedMemberIds: string[];
  onChange: (next: { allowedLevels: string[]; allowedMemberIds: string[] }) => void;
}

/**
 * Who may take a boat out (skipper a club sail on it / open a private sail on it):
 * any of the chosen qualification levels, plus any specifically chosen members.
 * Nothing chosen means the boat is open to everyone.
 */
export const BoatPermissionsEditor: React.FC<Props> = ({ allowedLevels, allowedMemberIds, onChange }) => {
  const levels = store.getSettings().experienceLevels;
  const members = store.getUsers().filter((u) => u.status === 'approved');
  const [search, setSearch] = useState('');
  const isOpen = allowedLevels.length === 0 && allowedMemberIds.length === 0;

  const toggleLevel = (level: string) =>
    onChange({
      allowedMemberIds,
      allowedLevels: allowedLevels.includes(level) ? allowedLevels.filter((l) => l !== level) : [...allowedLevels, level],
    });
  const toggleMember = (id: string) =>
    onChange({
      allowedLevels,
      allowedMemberIds: allowedMemberIds.includes(id) ? allowedMemberIds.filter((m) => m !== id) : [...allowedMemberIds, id],
    });

  const matches = members.filter(
    (m) => !allowedMemberIds.includes(m.id) && search.trim() && m.fullName.includes(search.trim())
  );

  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700 flex items-center gap-1">
          {isOpen ? <Unlock className="w-3.5 h-3.5 text-emerald-600" /> : <Lock className="w-3.5 h-3.5 text-amber-600" />}
          מי רשאי להוציא את הסירה
        </span>
        {!isOpen && (
          <button
            type="button"
            onClick={() => onChange({ allowedLevels: [], allowedMemberIds: [] })}
            className="text-sky-700 font-semibold cursor-pointer hover:underline"
          >
            פתח לכולם
          </button>
        )}
      </div>
      <p className="text-[0.6875rem] text-slate-500">
        {isOpen
          ? 'פתוחה לכולם. סמן רמות הסמכה ו/או חברים כדי להגביל.'
          : 'רק סקיפר (בהפלגת מועדון) או פותח הפלגה פרטית שעומד באחד התנאים רשאי להוציא אותה.'}
      </p>

      <div>
        <div className="text-[0.6875rem] font-semibold text-slate-600 mb-1">רמות הסמכה מורשות</div>
        <div className="flex flex-wrap gap-1.5">
          {levels.map((level) => {
            const on = allowedLevels.includes(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                className={`px-2 py-1 rounded-lg border text-[0.6875rem] cursor-pointer transition ${
                  on ? 'bg-sky-600 border-sky-600 text-white font-bold' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'
                }`}
              >
                {on ? '✓ ' : ''}
                {level}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[0.6875rem] font-semibold text-slate-600 mb-1">חברים מורשים (בנוסף לרמות)</div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {allowedMemberIds.map((id) => (
            <span key={id} className="px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-semibold flex items-center gap-1">
              {store.getUserById(id)?.fullName ?? 'חבר לשעבר'}
              <button type="button" onClick={() => toggleMember(id)} className="text-sky-500 hover:text-rose-600 cursor-pointer" title="הסר">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש חבר להוספה..."
          className="w-full p-2 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
        />
        {matches.length > 0 && (
          <div className="mt-1 border border-slate-200 rounded-xl bg-white max-h-32 overflow-y-auto">
            {matches.slice(0, 8).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  toggleMember(m.id);
                  setSearch('');
                }}
                className="w-full text-right px-3 py-1.5 hover:bg-sky-50 cursor-pointer flex justify-between"
              >
                <span className="font-semibold">{m.fullName}</span>
                <span className="text-[0.625rem] text-slate-400">{m.experienceLevel}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
