import React, { useState } from 'react';
import { store, validatePasswordComplexity } from '../services/store';
import { UserProfile, ExperienceLevel } from '../types';
import {
  Anchor,
  User,
  Lock,
  Phone,
  Compass,
  ShieldCheck,
  ArrowRight,
  UserPlus,
  LogIn,
  Mail,
  KeyRound,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  X
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onSuccess: (user: UserProfile) => void;
  onClose?: () => void;
}

const EXPERIENCE_OPTIONS: ExperienceLevel[] = [
  'משיט 60 (סקיפר בינלאומי)',
  'משיט 30 (סקיפר חופי)',
  'משיט 40 (סקיפר מסחרי)',
  'איש צוות מנוסה',
  'סקיפר מתלמד',
  'חובב / מתחיל',
];

export const AuthModal: React.FC<Props> = ({ isOpen, onSuccess, onClose }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password' | 'enter_new_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('משיט 30 (סקיפר חופי)');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Password reset simulation state
  const [resetEmail, setResetEmail] = useState('');
  const [resetTokenOrCode, setResetTokenOrCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [simulatedEmail, setSimulatedEmail] = useState<{ code: string; link: string; email: string } | null>(null);

  if (!isOpen) return null;

  // Password complexity live checks
  const pwLength = password.length >= 8;
  const pwHasLetter = /[a-zA-Zא-ת]/.test(password);
  const pwHasDigit = /[0-9]/.test(password);
  const isComplex = pwLength && pwHasLetter && pwHasDigit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (mode === 'login') {
      const res = store.login(email, password);
      if (res.success && res.user) {
        onSuccess(res.user);
      } else {
        setError(res.error || 'שגיאה בהתחברות. ודא שכתובת המייל והסיסמה נכונים.');
      }
    } else if (mode === 'register') {
      const pwCheck = validatePasswordComplexity(password);
      if (!pwCheck.valid) {
        setError(pwCheck.error || 'הסיסמה אינה עומדת בדרישות האבטחה');
        return;
      }

      if (password !== confirmPassword) {
        setError('הסיסמאות שהוזנו אינן תואמות');
        return;
      }

      const res = store.register(email, password, fullName, phone, experienceLevel);
      if (res.success && res.user) {
        onSuccess(res.user);
      } else {
        setError(res.error || 'שגיאה בהרשמה');
      }
    }
  };

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setError('יש להזין כתובת מייל תקינה');
      return;
    }

    const res = store.requestPasswordReset(resetEmail);
    if (res.success && res.resetCode && res.resetLink) {
      setSimulatedEmail({
        code: res.resetCode,
        link: res.resetLink,
        email: resetEmail,
      });
      setResetTokenOrCode(res.resetCode);
      setSuccessNotice(`קישור וקוד איפוס סיסמה נשלחו אל ${resetEmail}!`);
      setMode('enter_new_password');
    } else {
      setError(res.error || 'לא נמצא משתמש המשויך לכתובת מייל זו');
    }
  };

  const handleConfirmReset = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) {
      setError(pwCheck.error || 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים ולשלב אותיות ומספרים');
      return;
    }

    const res = store.resetPassword(resetTokenOrCode.trim(), newPassword);
    if (res.success) {
      setSuccessNotice('הסיסמה אופסה בהצלחה! כעת תוכל להתחבר עם הסיסמה החדשה.');
      setMode('login');
      setPassword(newPassword);
      setEmail(simulatedEmail?.email || '');
      setSimulatedEmail(null);
    } else {
      setError(res.error || 'קוד האיפוס אינו תקין או שפג תוקפו');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto text-right">
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-900 via-sky-800 to-slate-900 p-6 text-white text-center relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute left-4 top-4 p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Anchor className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-xl font-black">מועדון שייט גלי ים</h2>
          <p className="text-xs text-sky-200 mt-1">
            {mode === 'login' && 'התחברות לחשבון חבר מועדון'}
            {mode === 'register' && 'הרשמה לחברות במועדון השייט'}
            {mode === 'forgot_password' && 'איפוס ושחזור סיסמה באמצעות מייל'}
            {mode === 'enter_new_password' && 'הגדרת סיסמה חדשה ומאובטחת'}
          </p>
        </div>

        {/* Tab Switcher (Only in login/register mode) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex border-b border-slate-100 bg-slate-50 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessNotice(null);
              }}
              className={`flex-1 py-3 text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-sky-700 border-b-2 border-sky-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              התחברות
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessNotice(null);
              }}
              className={`flex-1 py-3 text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-sky-700 border-b-2 border-sky-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              הרשמה חדשה
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* SIMULATED INCOMING EMAIL CARD */}
          {simulatedEmail && mode === 'enter_new_password' && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
              <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                <span className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Mail className="w-4 h-4 text-amber-600" />
                  מייל שנשלח אל: {simulatedEmail.email}
                </span>
                <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  הודעת שחזור
                </span>
              </div>
              <p className="text-[11px] text-slate-700">
                קיבלת בקשה לאיפוס סיסמתך במועדון השייט. קוד האימות בן 6 ספרות הוא:
              </p>
              <div className="text-center py-1.5 bg-white rounded-xl border border-amber-300 font-mono text-base font-black tracking-widest text-slate-900">
                {simulatedEmail.code}
              </div>
              <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1">
                <span>או השתמש בקישור המאובטח:</span>
                <button
                  type="button"
                  onClick={() => {
                    setResetTokenOrCode(simulatedEmail.code);
                  }}
                  className="font-bold text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  הזן קוד אוטומטית <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* MODE: FORGOT PASSWORD */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <p className="text-xs text-slate-600">
                הזן את כתובת המייל שאיתה נרשמת למועדון. אנו נשלח אליך קישור וקוד בן 6 ספרות לאיפוס סיסמתך.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">כתובת מייל *</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer shadow-sm"
                >
                  שלח קישור לאיפוס סיסמה למייל
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  חזרה
                </button>
              </div>
            </form>
          )}

          {/* MODE: ENTER NEW PASSWORD */}
          {mode === 'enter_new_password' && (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  קוד אימות מהמייל (או מזהה הקישור) *
                </label>
                <input
                  type="text"
                  required
                  value={resetTokenOrCode}
                  onChange={(e) => setResetTokenOrCode(e.target.value)}
                  placeholder="למשל: 489210"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  סיסמה חדשה (מורכבת, לפחות 8 תווים) *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="לפחות 8 תווים עם אותיות ומספרים"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition cursor-pointer shadow-sm"
              >
                עדכן סיסמה חדשה והתחבר
              </button>
            </form>
          )}

          {/* MODE: LOGIN & REGISTER */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">שם מלא *</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="שם פרטי ומשפחה"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 font-medium"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      מספר טלפון (לתיאומים וקשר) *
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="050-1234567"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">רמת הסמכה / ניסיון בשייט *</label>
                    <div className="relative">
                      <select
                        value={experienceLevel}
                        onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 cursor-pointer"
                      >
                        {EXPERIENCE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <Compass className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">כתובת מייל *</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your-email@example.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 font-medium"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">סיסמה *</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setMode('forgot_password');
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                    >
                      שכחת סיסמה?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {/* Password complexity checklist for registration */}
              {mode === 'register' && (
                <>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] space-y-1">
                    <p className="font-bold text-slate-700">דרישות מורכבות סיסמה:</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                        pwLength ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {pwLength ? '✓' : '•'}
                      </span>
                      <span className={pwLength ? 'text-emerald-800 font-semibold' : 'text-slate-500'}>
                        לפחות 8 תווים
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                        pwHasLetter ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {pwHasLetter ? '✓' : '•'}
                      </span>
                      <span className={pwHasLetter ? 'text-emerald-800 font-semibold' : 'text-slate-500'}>
                        שילוב אותיות
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                        pwHasDigit ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {pwHasDigit ? '✓' : '•'}
                      </span>
                      <span className={pwHasDigit ? 'text-emerald-800 font-semibold' : 'text-slate-500'}>
                        שילוב ספרות (0-9)
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">אימות סיסמה *</label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="הזן שוב את הסיסמה"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-sky-600/20 active:scale-98 cursor-pointer text-sm"
              >
                {mode === 'login' ? 'התחבר למערכת' : 'הירשם והמתן לאישור מנהל'}
              </button>
            </form>
          )}

          {/* Clean Admin Credentials Quick Login for easy testing */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">כניסת מנהל ראשי (ברירת מחדל נקייה):</p>
              <p className="text-[11px] text-slate-500">admin@sailingclub.co.il • Admin1234!</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail('admin@sailingclub.co.il');
                setPassword('Admin1234!');
                const res = store.login('admin@sailingclub.co.il', 'Admin1234!');
                if (res.success && res.user) {
                  onSuccess(res.user);
                }
              }}
              className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold rounded-xl transition cursor-pointer text-[11px]"
            >
              כניסה כמנהל
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
