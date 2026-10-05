import React from 'react';
import { store } from '../services/store';
import { AppNotification } from '../types';
import { Bell, CheckCheck, X, Sailboat, AlertTriangle, Sparkles, UserCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onSelectSail?: (sailId: string) => void;
}

export const NotificationsModal: React.FC<Props> = ({ isOpen, userId, onClose, onSelectSail }) => {
  if (!isOpen) return null;

  const notifications = store.getNotifications(userId);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    store.markAllNotificationsAsRead(userId);
  };

  const handleNotificationClick = (n: AppNotification) => {
    store.markNotificationAsRead(n.id);
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
      default:
        return <Bell className="w-4 h-4 text-sky-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto text-right flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">מרכז התראות</h2>
              <p className="text-[11px] text-slate-300">{unreadCount} התראות חדשות שלא נקראו</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer transition"
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
                    ? 'bg-slate-50 border-slate-100 text-slate-600'
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
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
