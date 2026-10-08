import React, { useEffect } from 'react';
import { UserProfile } from '../types';
import { store } from '../services/store';
import { Clock, ShieldAlert, LogOut, CheckCircle2, RefreshCw } from 'lucide-react';

interface Props {
  user: UserProfile;
  onLogout: () => void;
  onRefresh: () => void;
}

export const PendingApprovalView: React.FC<Props> = ({ user, onLogout, onRefresh }) => {
  // Check every 30 seconds, so the app opens by itself once a manager approves
  useEffect(() => {
    const id = setInterval(onRefresh, 30_000);
    return () => clearInterval(id);
  }, [onRefresh]);

  return (
    <div className="min-h-screen glass-scene text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Nautical background wave effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-400">
          <Clock className="w-10 h-10 animate-pulse" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-3">
          ממתין לאישור מנהל מועדון
        </span>

        <h1 className="text-2xl font-bold mb-2">שלום, {user.fullName}!</h1>
        <p className="text-slate-300 text-sm leading-relaxed mb-6">
          הרשמתך למועדון השייט נקלטה בהצלחה. על מנת לשמור על פרטיות חברי המועדון ובטיחות ההפלגות, כל חשבון חדש מאושר ידנית על ידי הנהלת המועדון.
        </p>

        <div className="bg-slate-700/50 rounded-2xl p-4 text-right mb-6 border border-slate-600/50 space-y-2 text-xs text-slate-300">
          <div className="flex justify-between items-center py-1 border-b border-slate-600/40">
            <span className="text-slate-400">שם משתמש:</span>
            <span className="font-semibold text-white">{user.username}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-600/40">
            <span className="text-slate-400">טלפון:</span>
            <span className="font-semibold text-white">{user.phone}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-slate-400">רמת ניסיון:</span>
            <span className="font-semibold text-white">{user.experienceLevel}</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onRefresh}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 active:scale-98 cursor-pointer text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            בדוק סטטוס אישור
          </button>

          {/* Helper button for testing (demo mode only) */}
          {store.mode === 'local' && (
          <button
            onClick={async () => {
              await store.approveMember(user.id);
              onRefresh();
            }}
            className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-medium py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            (בדיקת פיתוח: אשר את עצמי כמנהל כעת)
          </button>
          )}

          <button
            onClick={onLogout}
            className="w-full bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            התנתק וחזור מאוחר יותר
          </button>
        </div>
      </div>
    </div>
  );
};
