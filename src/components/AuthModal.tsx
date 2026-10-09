import React, { useEffect, useState } from 'react';
import { store, validatePasswordComplexity, isValidUsername, normalizeUsername, USERNAME_RULE_TEXT } from '../services/store';
import { UserProfile, ExperienceLevel } from '../types';
import { AvatarPicker } from './AvatarPicker';
import { Overlay } from './Overlay';
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
  X,
  Eye,
  EyeOff,
  Send,
  Link2
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onSuccess: (user: UserProfile) => void;
  onClose?: () => void;
  /** Opens directly on a given step, e.g. 'enter_new_password' after following a password-recovery link. */
  initialMode?: 'login' | 'register' | 'enter_new_password';
  /** Code from the club's invite link (?join=...); sign-up is only possible with it. */
  inviteCode?: string;
}

/** The invite code in the current URL, if the visitor arrived through the club's invite link. */
export function inviteCodeFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('join')?.trim() || undefined;
}


export const AuthModal: React.FC<Props> = ({ isOpen, onSuccess, onClose, initialMode, inviteCode: inviteCodeProp }) => {
  const isDemo = store.mode === 'local';
  // Demo mode has a fixed invite code so sign-up can be tried without a link
  const inviteCode = inviteCodeProp ?? (isDemo ? 'demo-join' : undefined);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password' | 'enter_new_password'>(
    initialMode ?? (inviteCodeProp ? 'register' : 'login')
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);

  // The club the invite link belongs to (every club has its own link)
  const [inviteClub, setInviteClub] = useState<string | null>(null);
  useEffect(() => {
    if (!inviteCode) return;
    let alive = true;
    store.inviteClubName(inviteCode).then((n) => alive && setInviteClub(n));
    return () => {
      alive = false;
    };
  }, [inviteCode]);
  const clubTitle = inviteClub ?? store.getSettings().clubName;

  // Optional photo chosen in the join form; saved right after the account is created
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  // Arrived via the emailed recovery link: Supabase already verified it, so no code is needed.
  const viaRecoveryLink = store.isPasswordRecovery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  // null = not checked yet; checked as the member types (sign-up only)
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  useEffect(() => {
    if (mode !== 'register' || !username) {
      setUsernameFree(null);
      return;
    }
    if (!isValidUsername(username)) {
      setUsernameFree(false);
      return;
    }
    setUsernameFree(null);
    let alive = true;
    const t = setTimeout(() => {
      store.isUsernameAvailable(username).then((ok) => alive && setUsernameFree(ok));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [username, mode]);
  const [phone, setPhone] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(() => store.getSettings().experienceLevels[1] ?? store.getSettings().experienceLevels[0] ?? '');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccessNotice(null);
    setBusy(true);
    try {
      await submitLoginOrRegister();
    } finally {
      setBusy(false);
    }
  };

  const submitLoginOrRegister = async () => {
    if (mode === 'login') {
      const res = await store.login(email, password);
      if (res.success && res.user) {
        onSuccess(res.user);
      } else {
        setError(res.error || 'שגיאה בהתחברות. ודא שהמייל / שם המשתמש והסיסמה נכונים.');
      }
    } else if (mode === 'register') {
      if (!inviteCode) return;
      const pwCheck = validatePasswordComplexity(password);
      if (!pwCheck.valid) {
        setError(pwCheck.error || 'הסיסמה אינה עומדת בדרישות האבטחה');
        return;
      }
      if (!isValidUsername(username)) {
        setError(`שם משתמש: ${USERNAME_RULE_TEXT}`);
        return;
      }
      if (usernameFree === false) {
        setError(`שם המשתמש "${normalizeUsername(username)}" כבר תפוס. בחר שם אחר.`);
        return;
      }
      const res = await store.joinWithInvite(inviteCode, { username, email, password, fullName, phone, experienceLevel });
      if (res.success && res.user) {
        // The account exists either way; a failed photo upload can be retried from the profile screen
        if (avatarDraft) await store.setMyAvatar(avatarDraft).catch(() => undefined);
        onSuccess(store.getCurrentUser() ?? res.user);
      } else {
        setError(res.error || 'שגיאה בהרשמה');
      }
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setError('יש להזין כתובת מייל תקינה');
      return;
    }

    if (busy) return;
    setBusy(true);
    const res = await store.requestPasswordReset(resetEmail).finally(() => setBusy(false));
    if (res.success && !isDemo) {
      setSuccessNotice(`אם הכתובת ${resetEmail} רשומה במועדון, נשלח אליה מייל עם קישור וקוד לאיפוס הסיסמה.`);
      setResetTokenOrCode('');
      setMode('enter_new_password');
    } else if (res.success && res.resetCode && res.resetLink) {
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

  /** No email needed: the managers get a notification and send a temporary password (WhatsApp / email). */
  const handleRequestHelp = async () => {
    setError(null);
    setSuccessNotice(null);
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setError('יש להזין את כתובת המייל שאיתה נרשמת');
      return;
    }
    if (busy) return;
    setBusy(true);
    const res = await store.requestPasswordHelp(resetEmail).finally(() => setBusy(false));
    if (res.success) {
      setHelpRequested(true);
      setSuccessNotice('הבקשה נשלחה להנהלת המועדון. תקבל/י סיסמה זמנית חדשה בוואטסאפ או במייל, ואיתה תוכל/י להיכנס ולבחור סיסמה משלך במסך "פרופיל".');
    } else {
      setError(res.error || 'שליחת הבקשה נכשלה');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) {
      setError(pwCheck.error || 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים ולשלב אותיות ומספרים');
      return;
    }

    if (busy) return;
    setBusy(true);
    const res = await store
      .resetPassword(resetEmail, resetTokenOrCode.trim(), newPassword)
      .finally(() => setBusy(false));
    if (res.success) {
      setSuccessNotice('הסיסמה אופסה בהצלחה! כעת תוכל להתחבר עם הסיסמה החדשה.');
      setMode('login');
      setPassword(newPassword);
      setEmail(simulatedEmail?.email || resetEmail);
      setSimulatedEmail(null);
    } else {
      setError(res.error || 'קוד האיפוס אינו תקין או שפג תוקפו');
    }
  };

  return (
    <Overlay onClose={onClose}>
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4 overflow-y-auto">
      <div className="w-full max-w-md glass-sheet rounded-3xl overflow-hidden my-auto text-right">
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-900 via-sky-800 to-slate-900 p-6 text-white text-center relative">
          {onClose && (
            <button aria-label="סגור"
              onClick={onClose}
              className="absolute left-4 top-4 p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Anchor className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-xl font-black">{mode === 'register' && inviteCode ? clubTitle : isDemo ? store.getSettings().clubName : 'מועדוני שייט'}</h2>
          <p className="text-xs text-sky-200 mt-1">
            {mode === 'login' && 'התחברות לחשבון חבר מועדון'}
            {mode === 'register' && (inviteCode ? 'הצטרפות למועדון – פחות מדקה' : 'הרשמה לחברות במועדון השייט')}
            {mode === 'forgot_password' && 'שכחתי סיסמה'}
            {mode === 'enter_new_password' && 'הגדרת סיסמה חדשה ומאובטחת'}
          </p>
        </div>

        {/* Tab Switcher (Only in login/register mode) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex border-b border-slate-100 bg-white/60 text-sm font-semibold">
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
                <span className="text-[0.625rem] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  הודעת שחזור
                </span>
              </div>
              <p className="text-[0.6875rem] text-slate-700">
                קיבלת בקשה לאיפוס סיסמתך במועדון השייט. קוד האימות בן 6 ספרות הוא:
              </p>
              <div className="text-center py-1.5 bg-white rounded-xl border border-amber-300 font-mono text-base font-black tracking-widest text-slate-900">
                {simulatedEmail.code}
              </div>
              <div className="text-[0.6875rem] text-slate-600 flex items-center justify-between pt-1">
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
                הזן את כתובת המייל שאיתה נרשמת. הנהלת המועדון תקבל התראה ותשלח לך סיסמה זמנית חדשה.
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
                    className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleRequestHelp}
                  disabled={busy || helpRequested}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {helpRequested ? 'הבקשה נשלחה להנהלה' : 'בקש מההנהלה סיסמה חדשה'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    {isDemo ? 'שלח קוד איפוס (הדגמה)' : 'או: שלח לי קישור איפוס במייל'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccessNotice(null);
                      setHelpRequested(false);
                    }}
                    className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    חזרה
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* MODE: ENTER NEW PASSWORD */}
          {mode === 'enter_new_password' && (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              {!isDemo && !viaRecoveryLink && (
                <p className="text-xs text-slate-600">
                  ניתן ללחוץ על הקישור שבמייל, או להזין כאן את הקוד בן 6 הספרות שקיבלת.
                </p>
              )}
              {!viaRecoveryLink && (
              <div>
                <label htmlFor="auth-field-1" className="block text-xs font-semibold text-slate-700 mb-1">
                  קוד אימות מהמייל (או מזהה הקישור) *
                </label>
                <input id="auth-field-1"
                  type="text"
                  required
                  value={resetTokenOrCode}
                  onChange={(e) => setResetTokenOrCode(e.target.value)}
                  placeholder="למשל: 489210"
                  className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-sky-500"
                />
              </div>
              )}

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
                    className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
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

          {/* Sign-up needs the club's invite link */}
          {mode === 'register' && !inviteCode && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-xs text-sky-950 space-y-1.5 text-center">
              <Link2 className="w-6 h-6 text-sky-600 mx-auto" />
              <p className="font-bold text-sm">ההצטרפות למועדון היא בהזמנה</p>
              <p>בקש מהנהלת המועדון את קישור ההצטרפות. פתיחת הקישור תוביל אותך לטופס הרשמה קצר.</p>
            </div>
          )}

          {mode === 'register' && inviteCode && (
            <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              👋 הוזמנת להצטרף ל<strong>{clubTitle}</strong>. ממלאים פרטים, ואחרי שמנהל יאשר אותך אפשר
              להתחיל להפליג.
            </p>
          )}

          {/* MODE: LOGIN & REGISTER */}
          {(mode === 'login' || (mode === 'register' && inviteCode)) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="flex items-center gap-3">
                    <AvatarPicker
                      src={avatarDraft ?? undefined}
                      name={fullName || 'תמונת פרופיל'}
                      size="md"
                      canRemove={Boolean(avatarDraft)}
                      onChange={(img) => setAvatarDraft(img)}
                    />
                    <p className="text-[0.6875rem] text-slate-500">תמונת פרופיל (לא חובה) – כדי שחברי המועדון יזהו אותך בהפלגות ובפיד.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">שם מלא *</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="שם פרטי ומשפחה"
                        className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 font-medium"
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
                        className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="join-level" className="block text-xs font-semibold text-slate-700 mb-1">רמת הסמכה / ניסיון בשייט *</label>
                    <div className="relative">
                      <select id="join-level"
                        value={experienceLevel}
                        onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                        className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 cursor-pointer"
                      >
                        {store.getSettings().experienceLevels.map((opt) => (
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

              {mode === 'register' && (
                <div>
                  <label htmlFor="join-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    שם משתמש לכניסה *
                  </label>
                  <div className="relative">
                    <input
                      id="join-username"
                      type="text"
                      required
                      dir="ltr"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                      placeholder="למשל: dani.cohen"
                      aria-describedby="join-username-hint"
                      className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 font-medium text-left ${
                        usernameFree === false ? 'border-rose-300' : usernameFree ? 'border-emerald-300' : 'border-slate-200'
                      }`}
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                  <p id="join-username-hint" className="text-[0.6875rem] mt-1" aria-live="polite">
                    {!username ? (
                      <span className="text-slate-500">{USERNAME_RULE_TEXT}. תוכל/י להיכנס איתו או עם המייל.</span>
                    ) : !isValidUsername(username) ? (
                      <span className="text-rose-700">{USERNAME_RULE_TEXT}</span>
                    ) : usernameFree === null ? (
                      <span className="text-slate-500">בודק זמינות...</span>
                    ) : usernameFree ? (
                      <span className="text-emerald-700 font-semibold">✓ "{normalizeUsername(username)}" פנוי</span>
                    ) : (
                      <span className="text-rose-700 font-semibold">✗ "{normalizeUsername(username)}" כבר תפוס – בחר/י שם אחר</span>
                    )}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="auth-identifier" className="block text-xs font-semibold text-slate-700 mb-1">
                  {mode === 'login' ? 'מייל או שם משתמש *' : 'כתובת מייל *'}
                </label>
                <div className="relative">
                  <input
                    id="auth-identifier"
                    type={mode === 'login' ? 'text' : 'email'}
                    required
                    dir="ltr"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete={mode === 'login' ? 'username' : 'email'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={mode === 'login' ? 'name@example.com או dani.cohen' : 'your-email@example.com'}
                    className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 font-medium text-left"
                  />
                  {mode === 'login' ? (
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  ) : (
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">סיסמה *</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email.includes('@') ? email : '');
                        setMode('forgot_password');
                        setError(null);
                      }}
                      className="py-1 text-[0.6875rem] font-semibold text-sky-700 hover:underline cursor-pointer"
                    >
                      שכחת סיסמה?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? '8 תווים לפחות, אותיות ומספרים' : '••••••••'}
                    className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 pr-10 pl-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    className="absolute left-1 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password rules for sign-up */}
              {mode === 'register' && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem]" aria-live="polite">
                  {[
                    { ok: pwLength, label: '8 תווים לפחות' },
                    { ok: pwHasLetter, label: 'אותיות' },
                    { ok: pwHasDigit, label: 'ספרות' },
                  ].map((rule) => (
                    <span key={rule.label} className={rule.ok ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {rule.ok ? '✓' : '•'} {rule.label}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || (mode === 'register' && (!isComplex || usernameFree === false || !isValidUsername(username)))}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-sky-600/20 active:scale-98 cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mode === 'login' ? 'התחבר למערכת' : busy ? 'נרשם...' : 'שלח בקשת הצטרפות'}
              </button>
            </form>
          )}

          {/* Clean Admin Credentials Quick Login for easy testing (demo mode only) */}
          {isDemo && (
          <div className="p-3 bg-white/60 rounded-2xl border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">כניסת מנהל ראשי (ברירת מחדל נקייה):</p>
              <p className="text-[0.6875rem] text-slate-500">admin@sailingclub.co.il • Admin1234!</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setEmail('admin@sailingclub.co.il');
                setPassword('Admin1234!');
                const res = await store.login('admin@sailingclub.co.il', 'Admin1234!');
                if (res.success && res.user) {
                  onSuccess(res.user);
                }
              }}
              className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold rounded-xl transition cursor-pointer text-[0.6875rem]"
            >
              כניסה כמנהל
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
    </Overlay>
  );
};
