import React, { useState } from 'react';
import { store } from '../services/store';
import { UserProfile, ExperienceLevel, levelOptions, ROLE_LABELS, isStaff } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CreditRequestCard } from './CreditRequestCard';
import { AvatarPicker } from './AvatarPicker';
import { TutorialVideosButton } from './TutorialVideos';
import {
  User,
  Phone,
  Compass,
  Bell,
  Smartphone,
  LogOut,
  Check,
  RotateCcw,
  Shield,
  Download,
  KeyRound
} from 'lucide-react';

interface Props {
  user: UserProfile;
  onLogout: () => void;
  onUpdate: () => void;
}


export const UserProfileView: React.FC<Props> = ({ user, onLogout, onUpdate }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(user.experienceLevel);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordBusy) return;
    setPasswordBusy(true);
    const res = await store.changePassword(newPassword);
    setPasswordBusy(false);
    setPasswordMsg(res.success ? { text: 'הסיסמה עודכנה בהצלחה', ok: true } : { text: res.error || 'עדכון הסיסמה נכשל', ok: false });
    if (res.success) setNewPassword('');
  };

  // Push notifications state
  const [pushEnabled, setPushEnabled] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.updateUserProfile(user.id, {
      fullName: fullName.trim(),
      phone: phone.trim(),
      experienceLevel,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    onUpdate();
  };

  const handleRequestPush = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setPushEnabled(true);
          new Notification('התראות מועדון השייט הופעלו!', {
            body: 'מעתה תקבל עדכונים ישירים על הפלגות חדשות ומקומות שמתפנים.',
            icon: '/icon.svg',
          });
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }
  };

  const handleResetData = async () => {
    if (confirm('האם לאפס את נתוני המערכת לנתוני ההדגמה הראשוניים?')) {
      await store.resetToSeed();
      onUpdate();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 text-right">
      {/* Profile Card Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
        <AvatarPicker
          src={user.avatar}
          name={user.fullName}
          canRemove={!user.avatar.includes('dicebear.com')}
          onChange={(img) => store.setMyAvatar(img)}
        />
        <div className="flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <h2 className="text-xl font-bold text-slate-900">{user.fullName}</h2>
            {isStaff(user.role) ? (
              <span className="text-xs bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Shield className="w-3 h-3 text-sky-600" /> {user.role === 'admin' ? 'מנהל מועדון' : ROLE_LABELS.assistant}
              </span>
            ) : (
              <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                חבר מועדון
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-2">
            שם משתמש: <strong>@{user.username}</strong> | חבר מאז{' '}
            {new Date(user.joinedAt).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })}
          </p>
          <span className="inline-block bg-sky-50 text-sky-800 border border-sky-200/60 font-semibold text-xs px-3 py-1 rounded-xl">
            ⚓ {user.experienceLevel}
          </span>
        </div>
      </div>

      {/* Credits Card */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 rounded-3xl p-5 text-amber-950 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-white/30 backdrop-blur-xs rounded-2xl flex items-center justify-center font-bold text-2xl shadow-inner">
            🪙
          </div>
          <div>
            <h3 className="font-extrabold text-base leading-tight">מאזן נקודות קרדיט להפלגות</h3>
            <p className="text-xs text-amber-900/80">
              הפלגת מועדון: 1 קרדיט למשתתף • הפלגה פרטית: 3 קרדיטים ל-3 שעות (ו-1 קרדיט לכל שעה נוספת)
            </p>
          </div>
        </div>

        <div className="text-left bg-white/40 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/40">
          <span className="text-2xl font-black text-amber-950">{user.credits ?? 5}</span>
          <span className="text-[0.625rem] font-bold block text-amber-900">קרדיטים</span>
        </div>
      </div>

      {user.role !== 'admin' && <CreditRequestCard />}

      <TutorialVideosButton staff={isStaff(user.role)} />

      {/* Edit Details Form */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3">עריכת פרטים אישיים</h3>

        {savedSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>הפרטים עודכנו בהצלחה!</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">שם מלא</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">מספר טלפון</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">רמת ניסיון בשייט</label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs cursor-pointer font-medium"
            >
              {levelOptions(store.getSettings().experienceLevels, user.experienceLevel).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition active:scale-95 cursor-pointer"
          >
            שמור שינויים
          </button>
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-sky-600" />
          החלפת סיסמה
        </h3>
        <p className="text-xs text-slate-500">לפחות 8 תווים, שילוב של אותיות ומספרים. מומלץ אם קיבלת סיסמה זמנית מהמנהל.</p>
        {passwordMsg && (
          <div className={`text-xs rounded-xl p-2.5 border ${passwordMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {passwordMsg.text}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="סיסמה חדשה"
            className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <button
            type="submit"
            disabled={passwordBusy}
            className="px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs cursor-pointer"
          >
            {passwordBusy ? 'מעדכן...' : 'עדכן'}
          </button>
        </div>
      </form>

      {/* Notifications & Push Settings */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">התראות Push ישירות למכשיר</h3>
            <p className="text-slate-500">קבלת עדכונים כשנפתחת הפלגה, או כשמקום מתפנה ברשימת ההמתנה</p>
          </div>
          <Bell className="w-5 h-5 text-sky-600" />
        </div>

        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <p className="font-bold text-slate-800">התראות דפדפן / מערכת</p>
            <p className="text-[0.6875rem] text-slate-500">
              {pushEnabled ? 'התראות פעילות במכשיר זה' : 'טרם אושרו התראות במכשיר זה'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRequestPush}
            className={`px-4 py-2 rounded-xl font-bold transition cursor-pointer text-xs ${
              pushEnabled
                ? 'bg-emerald-100 text-emerald-800 cursor-default'
                : 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
            }`}
          >
            {pushEnabled ? 'התראות מופעלות ✓' : 'הפעל התראות עכשיו'}
          </button>
        </div>
      </div>

      {/* PWA Home Screen Installation Section */}
      <div className="bg-gradient-to-br from-sky-900 to-slate-900 text-white rounded-3xl p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h3 className="font-bold text-base">התקנת האפליקציה בטלפון (PWA)</h3>
            <p className="text-xs text-sky-200">
              התקן ישירות למסך הבית שלך ללא תלות בחנויות אפליקציות
            </p>
          </div>
        </div>

        {isInstalled ? (
          <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-2xl p-3 text-xs text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>האפליקציה כבר מותקנת ופועלת כמסך מלא על מכשירך!</span>
          </div>
        ) : isInstallable ? (
          <button
            onClick={install}
            className="w-full bg-white hover:bg-sky-50 text-sky-900 font-bold py-3 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <Download className="w-4 h-4" />
            התקן למסך הבית עכשיו
          </button>
        ) : isIOS ? (
          <div className="bg-white/10 rounded-2xl p-4 text-xs space-y-2 text-sky-100">
            <p className="font-bold text-white">איך מתקינים ב-iPhone / iPad:</p>
            <p>1. פתח דפדפן Safari ולחץ על כפתור השיתוף (Share) בתחתית המסך.</p>
            <p>2. בחר ״הוסף למסך הבית״ (Add to Home Screen) ולחץ ״הוסף״.</p>
          </div>
        ) : (
          <p className="text-xs text-sky-200">
            ניתן להוסיף את האפליקציה למסך הבית דרך תפריט הדפדפן (שלוש הנקודות).
          </p>
        )}
      </div>

      {/* Developer demo reset & Log out */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        {store.mode === 'local' && (
        <button
          onClick={handleResetData}
          className="flex-1 py-3 px-4 rounded-2xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
          איפוס לנתוני הדגמה ראשוניים
        </button>
        )}

        <button
          onClick={onLogout}
          className="flex-1 py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-600" />
          התנתק מהחשבון
        </button>
      </div>
    </div>
  );
};
