import React, { useState } from 'react';
import { store } from '../services/store';
import { Link2, Copy, Share2, RefreshCw, Check } from 'lucide-react';

/** The club's invite link: anyone who opens it gets a short sign-up form, then waits for approval. */
export const InviteLinkCard: React.FC = () => {
  const code = store.getInviteCode();
  const clubName = store.getSettings().clubName;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!code) return null;
  const link = `${window.location.origin}/?join=${encodeURIComponent(code)}`;
  const message = `הוזמנת להצטרף ל${clubName} ⛵\nלהרשמה (פחות מדקה): ${link}\nאחרי ההרשמה ההנהלה תאשר אותך ואפשר להתחיל להפליג.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('ההעתקה נחסמה בדפדפן. סמן את הקישור והעתק ידנית.');
    }
  };

  const regenerate = async () => {
    if (!confirm('ליצור קישור חדש? הקישור הנוכחי יפסיק לעבוד, גם אצל מי שכבר קיבל אותו ועוד לא נרשם.')) return;
    setBusy(true);
    setError(null);
    const res = await store.regenerateInviteCode();
    setBusy(false);
    if (!res.success) setError(res.error || 'יצירת קישור חדש נכשלה');
  };

  return (
    <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-3xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">קישור הצטרפות למועדון</h2>
          <p className="text-xs text-slate-600">
            שלח את הקישור למצטרפים חדשים. הם ממלאים פרטים ובוחרים סיסמה, ואתה (או עוזר מנהל) מאשר אותם כאן למטה. עד
            האישור אין להם גישה לאפליקציה.
          </p>
        </div>
      </div>

      <div
        dir="ltr"
        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 break-all select-all"
      >
        {link}
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 min-w-32 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          {copied ? 'הועתק!' : 'העתק הזמנה'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-w-32 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
          שלח בוואטסאפ
        </a>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          קישור חדש
        </button>
      </div>
    </div>
  );
};
