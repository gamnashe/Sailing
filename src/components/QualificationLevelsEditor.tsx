import React, { useState } from 'react';
import { store } from '../services/store';
import { Award, ChevronUp, ChevronDown, Plus, Trash2, Check } from 'lucide-react';

/**
 * Edits the club's qualification levels: add, rename (members holding the level follow), reorder, remove.
 * Removing a level does not touch members who hold it; their level stays and remains selectable for them.
 */
export const QualificationLevelsEditor: React.FC = () => {
  const levels = store.getSettings().experienceLevels;
  const users = store.getUsers();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newLevel, setNewLevel] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const holders = (level: string) => users.filter((u) => u.experienceLevel === level).length;

  const run = async (action: () => Promise<{ success: boolean; error?: string } | void>, okText: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const res = await action();
    setBusy(false);
    const failed = res && !res.success;
    setMessage(failed ? { text: res.error || 'הפעולה נכשלה', ok: false } : { text: okText, ok: true });
  };

  const saveList = (next: string[]) => store.updateSettings({ experienceLevels: next });

  const rename = (oldName: string) => {
    const name = (drafts[oldName] ?? oldName).trim();
    if (!name || name === oldName) return;
    if (levels.includes(name)) {
      setMessage({ text: `הרמה "${name}" כבר קיימת`, ok: false });
      return;
    }
    void run(async () => {
      const res = await store.renameExperienceLevel(oldName, name);
      if (res.success) setDrafts(({ [oldName]: _, ...rest }) => rest);
      return res;
    }, `השם עודכן ל"${name}" (גם אצל ${holders(oldName)} חברים)`);
  };

  const move = (index: number, delta: number) => {
    const next = [...levels];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    void run(() => saveList(next), 'הסדר עודכן');
  };

  const remove = (level: string) => {
    const count = holders(level);
    const warning = count > 0 ? `\n${count} חברים מחזיקים ברמה זו; היא תישאר אצלם עד שתעדכן אותם.` : '';
    if (!confirm(`להסיר את רמת ההסמכה "${level}" מהרשימה?${warning}`)) return;
    void run(() => saveList(levels.filter((l) => l !== level)), `"${level}" הוסרה מהרשימה`);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLevel.trim();
    if (!name) return;
    if (levels.includes(name)) {
      setMessage({ text: `הרמה "${name}" כבר קיימת`, ok: false });
      return;
    }
    void run(async () => {
      await saveList([...levels, name]);
      setNewLevel('');
    }, `"${name}" נוספה לרשימה`);
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 text-xs">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Award className="w-4 h-4 text-sky-600" />
          רמות הסמכה
        </h2>
        <p className="text-slate-500">
          הרשימה שמופיעה בהרשמה, בפרופיל ובניהול החברים, מהגבוהה לנמוכה. שינוי שם מעדכן גם את כל החברים שמחזיקים ברמה.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl p-2.5 border ${
            message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        {levels.map((level, i) => {
          const draft = drafts[level] ?? level;
          const changed = draft.trim() !== level;
          return (
            <div key={level} className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                  title="הזז למעלה"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === levels.length - 1 || busy}
                  onClick={() => move(i, 1)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                  title="הזז למטה"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={draft}
                onChange={(e) => setDrafts({ ...drafts, [level]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    rename(level);
                  }
                }}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
              <span className="text-[10px] text-slate-400 w-14 text-center shrink-0">{holders(level)} חברים</span>
              {changed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => rename(level)}
                  className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl cursor-pointer"
                  title="שמור שם חדש"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                disabled={busy || levels.length <= 1}
                onClick={() => remove(level)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl disabled:opacity-30 cursor-pointer"
                title="הסר מהרשימה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="flex gap-2 pt-2 border-t border-slate-100">
        <input
          value={newLevel}
          onChange={(e) => setNewLevel(e.target.value)}
          placeholder="רמת הסמכה חדשה, למשל: משיט ים פתוח"
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={busy || !newLevel.trim()}
          className="px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          הוסף
        </button>
      </form>
    </div>
  );
};
