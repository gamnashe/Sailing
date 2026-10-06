import React, { useState } from 'react';
import { store, isValidUsername, normalizeUsername, USERNAME_RULE_TEXT } from '../services/store';
import { AtSign } from 'lucide-react';

/** The member's sign-in username (they can also sign in with their email). */
export const UsernameForm: React.FC<{ current: string }> = ({ current }) => {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const changed = normalizeUsername(value) !== current;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    if (!isValidUsername(value)) return setMsg({ text: USERNAME_RULE_TEXT, ok: false });
    setBusy(true);
    const res = await store.changeUsername(value);
    setBusy(false);
    setMsg(res.success ? { text: `שם המשתמש עודכן. מעכשיו אפשר להיכנס עם "${normalizeUsername(value)}"`, ok: true } : { text: res.error || 'העדכון נכשל', ok: false });
  };

  return (
    <form onSubmit={save} className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-3">
      <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
        <AtSign className="w-4 h-4 text-sky-600" aria-hidden="true" />
        שם משתמש לכניסה
      </h3>
      <p className="text-xs text-slate-500">אפשר להיכנס לאפליקציה עם שם המשתמש או עם המייל.</p>
      <div className="flex gap-2">
        <label htmlFor="profile-username" className="sr-only">
          שם משתמש
        </label>
        <input
          id="profile-username"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\s/g, ''));
            setMsg(null);
          }}
          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-left"
        />
        <button
          type="submit"
          disabled={!changed || busy}
          className="px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'שומר...' : 'עדכן'}
        </button>
      </div>
      {msg ? (
        <p role="status" className={`text-xs rounded-xl p-2.5 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {msg.text}
        </p>
      ) : (
        <p className="text-[0.6875rem] text-slate-400">{USERNAME_RULE_TEXT}</p>
      )}
    </form>
  );
};
