import React from 'react';
import { store } from '../services/store';
import { AppNotification, STAFF_NOTIFICATION_TYPES } from '../types';
import { Bell, CheckCheck, X, Sailboat, AlertTriangle, Sparkles, UserCheck, UserPlus, Coins, KeyRound } from 'lucide-react';
import { Overlay } from './Overlay';

interface Props {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onSelectSail?: (sailId: string) => void;
  /** Staff: opens the management requests (sign-ups, credit and password requests). */
  onOpenRequests?: () => void;
}

export const NotificationsModal: React.FC<Props> = ({ isOpen, userId, onClose, onSelectSail, onOpenRequests }) => {
  if (!isOpen) return null;

  const notifications = store.getNotifications(userId);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    await store.markAllNotificationsAsRead(userId);
  };

  const handleNotificationClick = async (n: AppNotification) => {
    await store.markNotificationAsRead(n.id);
    if (STAFF_NOTIFICATION_TYPES.includes(n.type)) {
      if (onOpenRequests) {
        onOpenRequests();
        onClose();
      }
      return;
    }
    if (n.targetId && onSelectSail) {
      onSelectSail(n.targetId);
      onClose();
    }
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'new_sail':
        return <Sailboat className="w-4 h-4 text-sky-600" />;
      case 'waitlist_promoted':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      case 'sail_cancelled':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'member_approved':
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      case 'member_request':
        return <UserPlus className="w-4 h-4 text-amber-600" />;
      case 'credit_request':
      case 'credit_update':
        return <Coins className="w-4 h-4 text-amber-600" />;
      case 'password_help':
        return <KeyRound className="w-4 h-4 text-sky-700" />;
      default:
        return <Bell className="w-4 h-4 text-sky-600" />;
    }
  };

  return (
    <Overlay>
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4 overflow-y-auto">
      <div className="w-full max-w-md glass-sheet rounded-3xl overflow-hidden my-auto text-right flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">מרכז התראות</h2>
              <p className="text-[0.6875rem] text-slate-300">{unreadCount} התראות חדשות שלא נקראו</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[0.6875rem] text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer transition"
                title="סמן הכל כנקרא"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                סמן הכל כנקרא
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
              אין התראות כרגע.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-3.5 rounded-2xl border transition text-xs cursor-pointer flex gap-3 ${
                  n.read
                    ? 'bg-white/60 border-slate-100 text-slate-600'
                    : 'bg-sky-50/70 border-sky-200/80 text-slate-900 shadow-xs'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-white shadow-2xs flex items-center justify-center shrink-0 border border-slate-100">
                  {getIcon(n.type)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`font-bold ${n.read ? 'text-slate-800' : 'text-sky-950 font-black'}`}>
                      {n.title}
                    </p>
                    <span className="text-[0.625rem] text-slate-400">
                      {new Date(n.createdAt).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[0.6875rem] text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </Overlay>
  );
};
