import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { ClubSummary, WEATHER_PRESETS, WeatherLocation } from '../types';
import { Building2, Plus, MapPin, Users, KeyRound, Pencil, X, Copy, Share2, Mail, Check, UserPlus, Loader2 } from 'lucide-react';

type Credentials = { clubName: string; fullName: string; phone: string; email: string; password: string; isNewClub: boolean };

const inputCls = 'w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs';

const LocationSelect: React.FC<{ value: WeatherLocation; onChange: (l: WeatherLocation) => void; id: string }> = ({ value, onChange, id }) => {
  const idx = WEATHER_PRESETS.findIndex((p) => p.lat === value.lat && p.lon === value.lon);
  return (
    <select
      id={id}
      value={idx >= 0 ? idx : 0}
      onChange={(e) => onChange(WEATHER_PRESETS[Number(e.target.value)])}
      className={`${inputCls} cursor-pointer`}
    >
      {WEATHER_PRESETS.map((p, i) => (
        <option key={p.name} value={i}>
          {p.name}
        </option>
      ))}
    </select>
  );
};

/**
 * Platform admin: opens new clubs (each starts empty, with its own first admin) and configures their name and
 * location. Nothing from inside a club (members, sails, feed) is shown here.
 */
export const ClubsManager: React.FC = () => {
  const [clubs, setClubs] = useState<ClubSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ClubSummary | null>(null);
  const [addingAdminTo, setAddingAdminTo] = useState<ClubSummary | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({ name: '', location: WEATHER_PRESETS[0], adminName: '', adminEmail: '', adminPhone: '' });
  const [adminForm, setAdminForm] = useState({ fullName: '', email: '', phone: '' });

  const load = async () => {
    const r = await store.listClubs();
    if (r.success) setClubs(r.clubs ?? []);
    else setError(r.error ?? 'טעינת המועדונים נכשלה');
  };
  useEffect(() => {
    void load();
  }, []);

  const createClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await store.createClub(form);
    setBusy(false);
    if (r.success && r.email && r.temporaryPassword) {
      setCreds({ clubName: form.name, fullName: form.adminName, phone: form.adminPhone, email: r.email, password: r.temporaryPassword, isNewClub: true });
      setShowNew(false);
      setForm({ name: '', location: WEATHER_PRESETS[0], adminName: '', adminEmail: '', adminPhone: '' });
      void load();
    } else setError(r.error ?? 'פתיחת המועדון נכשלה');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    const r = await store.updateClub(editing.id, { name: editing.name, location: editing.location ?? undefined });
    setBusy(false);
    if (r.success) {
      setEditing(null);
      void load();
    } else setError(r.error ?? 'השמירה נכשלה');
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingAdminTo || busy) return;
    setBusy(true);
    const r = await store.addClubAdmin(addingAdminTo.id, adminForm);
    setBusy(false);
    if (r.success && r.email && r.temporaryPassword) {
      setCreds({ clubName: addingAdminTo.name, fullName: adminForm.fullName, phone: adminForm.phone, email: r.email, password: r.temporaryPassword, isNewClub: false });
      setAddingAdminTo(null);
      setAdminForm({ fullName: '', email: '', phone: '' });
      void load();
    } else setError(r.error ?? 'הוספת המנהל נכשלה');
  };

  const resetAdmin = async (club: ClubSummary, a: ClubSummary['admins'][number]) => {
    if (!confirm(`להנפיק ל${a.fullName} סיסמה זמנית חדשה? הסיסמה הקודמת תפסיק לעבוד.`)) return;
    const r = await store.resetClubAdminPassword(club.id, a.id);
    if (r.success && r.email && r.temporaryPassword) {
      setCreds({ clubName: club.name, fullName: a.fullName, phone: '', email: r.email, password: r.temporaryPassword, isNewClub: false });
    } else setError(r.error ?? 'איפוס הסיסמה נכשל');
  };

  const message = creds
    ? `שלום ${creds.fullName},\n\n` +
      (creds.isNewClub
        ? `פתחנו עבורך את "${creds.clubName}" באפליקציית ניהול מועדוני השייט, ואת/ה מנהל/ת המועדון.\n\n`
        : `הנה פרטי כניסה כמנהל/ת "${creds.clubName}".\n\n`) +
      `כניסה: ${window.location.origin}\nמייל: ${creds.email}\nסיסמה זמנית: ${creds.password}\n\n` +
      `צעדים ראשונים: הוסף/י את כלי השייט (ניהול ← צי כלי שייט), בדוק/י את ההגדרות, ושלח/י לחברים את קישור ההצטרפות (ניהול ← בקשות והצטרפות).\n` +
      `אחרי הכניסה הראשונה מומלץ להחליף סיסמה במסך "פרופיל".`
    : '';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" aria-hidden="true" />
              מועדונים במערכת
            </h2>
            <p className="text-xs text-slate-500">
              כמנהל מערכת אתה פותח מועדונים ומגדיר אותם. כל מועדון עצמאי: חברים, סירות והפלגות משלו, ומנהל שמנהל רק אותו.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            פתיחת מועדון חדש
          </button>
        </div>

        {error && (
          <p role="alert" className="p-2.5 rounded-xl bg-rose-50 text-rose-800 text-xs flex justify-between gap-2">
            {error}
            <button onClick={() => setError(null)} aria-label="סגור" className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </p>
        )}

        {clubs === null ? (
          <p className="text-center py-6 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin inline" aria-label="טוען" />
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clubs.map((c) => (
              <div key={c.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{c.name}</p>
                    <p className="text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" aria-hidden="true" /> {c.location?.name ?? '—'} ·{' '}
                      <Users className="w-3 h-3" aria-hidden="true" /> {c.memberCount} חברים
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing({ ...c })}
                    aria-label={`ערוך את ${c.name}`}
                    className="p-1.5 rounded-lg hover:bg-white text-slate-500 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">מנהלי המועדון:</p>
                  {c.admins.length === 0 && <p className="text-slate-400">אין מנהל פעיל</p>}
                  {c.admins.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 bg-white rounded-xl px-2.5 py-1.5 border border-slate-100">
                      <span className="truncate">
                        <strong>{a.fullName}</strong> <span className="text-slate-400" dir="ltr">{a.email}</span>
                      </span>
                      <button
                        onClick={() => resetAdmin(c, a)}
                        title="שלח פרטי כניסה חדשים"
                        aria-label={`שלח פרטי כניסה חדשים ל${a.fullName}`}
                        className="p-1 text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer shrink-0"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setAddingAdminTo(c)}
                  className="text-sky-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> הוסף מנהל למועדון
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New club */}
      {showNew && (
        <Modal title="פתיחת מועדון חדש" onClose={() => setShowNew(false)}>
          <form onSubmit={createClub} className="space-y-3 text-xs">
            <p className="text-slate-500">המועדון נפתח ריק – בלי סירות ובלי חברים. מנהל המועדון יוסיף אותם.</p>
            <Field label="שם המועדון" id="nc-name">
              <input id="nc-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="למשל: מועדון שייט אשדוד" />
            </Field>
            <Field label="מיקום (לתחזית מזג האוויר)" id="nc-loc">
              <LocationSelect id="nc-loc" value={form.location} onChange={(l) => setForm({ ...form, location: l })} />
            </Field>
            <p className="font-bold text-slate-800 pt-2 border-t border-slate-100">מנהל המועדון</p>
            <Field label="שם מלא" id="nc-admin">
              <input id="nc-admin" required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="מייל" id="nc-email">
              <input id="nc-email" type="email" required dir="ltr" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className={inputCls} />
            </Field>
            <Field label="טלפון (לשליחת הפרטים בוואטסאפ)" id="nc-phone">
              <input id="nc-phone" type="tel" value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} className={inputCls} />
            </Field>
            <button type="submit" disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50">
              {busy ? 'פותח...' : 'פתח מועדון וצור מנהל'}
            </button>
          </form>
        </Modal>
      )}

      {/* Edit club */}
      {editing && (
        <Modal title={`עריכת ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3 text-xs">
            <Field label="שם המועדון" id="ec-name">
              <input id="ec-name" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="מיקום (לתחזית מזג האוויר)" id="ec-loc">
              <LocationSelect id="ec-loc" value={editing.location ?? WEATHER_PRESETS[0]} onChange={(l) => setEditing({ ...editing, location: l })} />
            </Field>
            <p className="text-slate-500">מנהל המועדון יכול לכוון את המיקום המדויק ואת שאר ההגדרות במסך ההגדרות שלו.</p>
            <button type="submit" disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50">
              שמור
            </button>
          </form>
        </Modal>
      )}

      {/* Add admin */}
      {addingAdminTo && (
        <Modal title={`מנהל נוסף ל${addingAdminTo.name}`} onClose={() => setAddingAdminTo(null)}>
          <form onSubmit={addAdmin} className="space-y-3 text-xs">
            <Field label="שם מלא" id="aa-name">
              <input id="aa-name" required value={adminForm.fullName} onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="מייל" id="aa-email">
              <input id="aa-email" type="email" required dir="ltr" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label="טלפון" id="aa-phone">
              <input id="aa-phone" type="tel" value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })} className={inputCls} />
            </Field>
            <button type="submit" disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50">
              צור מנהל
            </button>
          </form>
        </Modal>
      )}

      {/* Credentials to send */}
      {creds && (
        <Modal title={creds.isNewClub ? `"${creds.clubName}" נפתח! 🎉` : 'פרטי כניסה למנהל'} onClose={() => { setCreds(null); setCopied(false); }}>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
              <p>
                מנהל: <strong>{creds.fullName}</strong>
              </p>
              <p>
                מייל: <span dir="ltr" className="font-mono">{creds.email}</span>
              </p>
              <p>
                סיסמה זמנית: <span dir="ltr" className="font-mono font-bold text-sm">{creds.password}</span>
              </p>
            </div>
            <p className="text-slate-500">שלח למנהל את פרטי הכניסה. הם מוצגים רק עכשיו.</p>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`mailto:${creds.email}?subject=${encodeURIComponent(`פרטי כניסה – ${creds.clubName}`)}&body=${encodeURIComponent(message)}`}
                className="py-2.5 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center gap-1"
              >
                <Mail className="w-4 h-4" aria-hidden="true" /> מייל
              </a>
              <a
                href={`https://wa.me/${creds.phone.replace(/\D/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-1"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" /> וואטסאפ
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    setCopied(true);
                  } catch {
                    setError('ההעתקה נחסמה בדפדפן');
                  }
                }}
                className="py-2.5 rounded-xl bg-slate-100 text-slate-800 font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                {copied ? 'הועתק' : 'העתק'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; id: string; children: React.ReactNode }> = ({ label, id, children }) => (
  <div>
    <label htmlFor={id} className="block font-semibold text-slate-700 mb-1">
      {label}
    </label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-3xl shadow-2xl my-auto text-right overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} aria-label="סגור" className="p-1 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
