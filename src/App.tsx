import React, { useState, useEffect } from 'react';
import { store } from './services/store';
import { UserProfile, isStaff, ROLE_LABELS } from './types';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthModal, inviteCodeFromUrl } from './components/AuthModal';
import { PendingApprovalView } from './components/PendingApprovalView';
import { SailsList } from './components/SailsList';
import { SailDetailModal } from './components/SailDetailModal';
import { CreateSailModal } from './components/CreateSailModal';
import { BoatsAndIssuesView } from './components/BoatsAndIssuesView';
import { CommunityFeed } from './components/CommunityFeed';
import { AdminPanel } from './components/AdminPanel';
import { UserProfileView } from './components/UserProfileView';
import { NotificationsModal } from './components/NotificationsModal';
import {
  Sailboat,
  MessageSquare,
  Shield,
  User,
  Bell,
  Anchor,
  Users,
  ChevronDown,
  Coins,
  Wrench,
  LogOut,
  AlertCircle,
  X,
  Eye,
  EyeOff
} from 'lucide-react';

export default function App() {
  const [, setTick] = useState(0);

  // Subscribe to store updates
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => {
      unsub();
    };
  }, []);

  const currentUser = store.getCurrentUser();
  const settings = store.getSettings();
  const users = store.getUsers();

  const [activeTab, setActiveTab] = useState<'sails' | 'boats' | 'feed' | 'admin' | 'profile'>('sails');
  const [selectedSailId, setSelectedSailId] = useState<string | null>(null);
  const [showCreateSailModal, setShowCreateSailModal] = useState(false);
  const [createSailDate, setCreateSailDate] = useState<string | undefined>(undefined);
  const openCreateSail = (date?: string) => {
    setCreateSailDate(date);
    setShowCreateSailModal(true);
  };
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);
  // Arrived through the club's invite link (?join=code)
  const [inviteCode, setInviteCode] = useState(inviteCodeFromUrl);
  // Staff can preview the app as a regular member sees it (display only; their permissions don't change)
  const [previewAsMember, setPreviewAsMemberState] = useState(() => {
    try {
      return sessionStorage.getItem('sailing_club_preview_member') === '1';
    } catch {
      return false;
    }
  });
  const setPreviewAsMember = (on: boolean) => {
    setPreviewAsMemberState(on);
    setShowUserSwitcher(false);
    if (on) setActiveTab((t) => (t === 'admin' ? 'sails' : t));
    try {
      if (on) sessionStorage.setItem('sailing_club_preview_member', '1');
      else sessionStorage.removeItem('sailing_club_preview_member');
    } catch {
      // storage blocked: the preview still works for this page
    }
  };
  // Bumped to make the admin panel jump to its requests tab (from a notification)
  const [adminRequestsNonce, setAdminRequestsNonce] = useState(0);

  // The invite code is only needed until the visitor has an account
  useEffect(() => {
    if (!store.getCurrentUser()) return;
    if (inviteCodeFromUrl()) window.history.replaceState(null, '', window.location.pathname);
    if (inviteCode) setInviteCode(undefined);
  });

  const isDemo = store.mode === 'local';
  const lastError = store.getLastError();
  const handleLogout = async () => {
    setShowUserSwitcher(false);
    setActiveTab('sails');
    await store.logout();
  };

  // Background error toast (failed server writes / loads, expired email links); shown on every screen
  const errorToast = lastError && (
        <div role="alert" className="fixed bottom-20 sm:bottom-6 inset-x-4 sm:inset-x-auto sm:left-6 sm:max-w-sm z-[60] bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-2xl p-3 shadow-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="flex-1">{lastError}</span>
          <button onClick={() => store.clearLastError()} className="text-rose-500 hover:text-rose-800 cursor-pointer" title="סגור" aria-label="סגור הודעה">
            <X className="w-4 h-4" />
          </button>
        </div>
      );

  if (store.isLoading()) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-sky-100">
        <Anchor className="w-10 h-10 text-sky-400 animate-pulse" />
        <p className="text-sm font-semibold">טוען את נתוני המועדון...</p>
      </div>
    );
  }

  // Arrived from a password-recovery email link: choose a new password first
  if (store.isPasswordRecovery()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <AuthModal isOpen={true} initialMode="enter_new_password" onSuccess={() => setTick((t) => t + 1)} />
      </div>
    );
  }

  // If no user is logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        {errorToast}
        <AuthModal
          isOpen={true}
          inviteCode={inviteCode}
          onSuccess={() => setTick((t) => t + 1)}
        />
      </div>
    );
  }

  // If user status is pending approval
  if (currentUser.status === 'pending') {
    return (
      <PendingApprovalView
        user={currentUser}
        onRefresh={() => void store.refresh()}
        onLogout={handleLogout}
      />
    );
  }

  // What the screens are built for: the real user, or the same user shown as a regular member
  const realIsStaff = isStaff(currentUser.role);
  const previewing = previewAsMember && realIsStaff;
  const viewer: UserProfile = previewing ? { ...currentUser, role: 'member' } : currentUser;

  const unreadNotifications = store.getNotifications(viewer.id).filter((n) => !n.read).length;
  // Badge on the management tab: sign-ups waiting for approval, plus credit requests for admins
  const pendingApprovalsCount = isStaff(viewer.role)
    ? users.filter((u) => u.status === 'pending').length +
      (viewer.role === 'admin' ? store.getCreditRequests().filter((r) => r.status === 'pending').length : 0)
    : 0;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans pb-20 sm:pb-8">
      {errorToast}

      {/* PWA In-App Install Prompt Banner */}
      <PWAInstallBanner />

      {/* Offline Status Toast */}
      <OfflineIndicator />

      {/* Top Application Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-700 to-sky-500 flex items-center justify-center text-white shadow-sm shadow-sky-600/20">
              <Anchor className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                {settings.clubName}
              </h1>
              <p className="text-[0.6875rem] text-slate-500 font-medium">מועדון והפלגות שייט</p>
            </div>
          </div>

          {/* Right Header Actions: User Credits, Notifications & Profile / Switcher */}
          <div className="flex items-center gap-2">
            {/* Member Credits Badge */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-black px-2.5 py-1.5 rounded-2xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition active:scale-95"
              title="יתרת נקודות הקרדיט שלך להפלגות"
            >
              <Coins className="w-4 h-4 text-amber-600" />
              <span>{viewer.credits ?? 5} קרדיטים</span>
            </button>

            {/* Notifications Bell */}
            <button
              onClick={() => setShowNotificationsModal(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition cursor-pointer"
              title="מרכז התראות"
              aria-label={unreadNotifications > 0 ? `מרכז התראות, ${unreadNotifications} חדשות` : 'מרכז התראות'}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-600 text-white font-bold text-[0.625rem] rounded-full flex items-center justify-center animate-pulse">
                  {unreadNotifications}
                </span>
              )}
            </button>

            {/* Demo User Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserSwitcher(!showUserSwitcher)}
                aria-label="תפריט משתמש"
                aria-expanded={showUserSwitcher}
                className="flex items-center gap-2 p-1.5 pr-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-xs transition cursor-pointer"
              >
                <img
                  src={viewer.avatar}
                  alt={viewer.fullName}
                  className="w-7 h-7 rounded-full object-cover border border-slate-300"
                />
                <span className="font-bold text-slate-800 hidden sm:inline max-w-28 truncate">
                  {viewer.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showUserSwitcher && !isDemo && (
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-right text-xs">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[0.6875rem] text-slate-400 font-semibold truncate">
                    {viewer.email}
                  </div>
                  {realIsStaff && (
                    <button
                      onClick={() => setPreviewAsMember(!previewing)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-sky-800 hover:bg-sky-50 font-semibold cursor-pointer"
                    >
                      {previewing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {previewing ? 'חזרה לתצוגת מנהל' : 'צפייה כחבר רגיל'}
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full px-3 py-2 flex items-center gap-2 text-rose-700 hover:bg-rose-50 font-semibold cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    התנתקות
                  </button>
                </div>
              )}

              {showUserSwitcher && isDemo && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-right text-xs">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[0.6875rem] text-slate-400 font-semibold">
                    החלף משתמש לבדיקה מהירה:
                  </div>
                  {realIsStaff && (
                    <button
                      onClick={() => setPreviewAsMember(!previewing)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-sky-800 hover:bg-sky-50 font-semibold cursor-pointer border-b border-slate-100"
                    >
                      {previewing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {previewing ? 'חזרה לתצוגת מנהל' : 'צפייה כחבר רגיל'}
                    </button>
                  )}
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        store.setCurrentUser(u.id);
                        setShowUserSwitcher(false);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer ${
                        u.id === viewer.id ? 'bg-sky-50 text-sky-900 font-bold' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={u.avatar} alt={u.fullName} className="w-6 h-6 rounded-full object-cover" />
                        <span className="truncate">{u.fullName}</span>
                      </div>
                      <span className="text-[0.625rem] text-slate-400 font-medium">
                        {isStaff(u.role) ? ROLE_LABELS[u.role] : u.status === 'pending' ? 'ממתין' : `${u.credits ?? 5} קרד'`}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setShowUserSwitcher(false);
                        setShowAuthModal(true);
                      }}
                      className="w-full px-3 py-2 text-sky-700 hover:bg-sky-50 text-right font-semibold cursor-pointer"
                    >
                      + התחבר / רשום משתמש אחר
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Tabs Header Bar */}
        <nav aria-label="ניווט ראשי" className="hidden sm:block border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-5xl mx-auto px-4 flex gap-2">
            <button
              onClick={() => setActiveTab('sails')}
              aria-current={activeTab === 'sails' ? 'page' : undefined}
              className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'sails'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sailboat className="w-4 h-4" />
              הפלגות מועדון
            </button>

            <button
              onClick={() => setActiveTab('boats')}
              aria-current={activeTab === 'boats' ? 'page' : undefined}
              className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'boats'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-4 h-4" />
              כלי שייט ותקלות
            </button>

            <button
              onClick={() => setActiveTab('feed')}
              aria-current={activeTab === 'feed' ? 'page' : undefined}
              className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'feed'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              פיד וקהילה
            </button>

            {isStaff(viewer.role) && (
              <button
                onClick={() => setActiveTab('admin')}
                aria-current={activeTab === 'admin' ? 'page' : undefined}
                className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer relative ${
                  activeTab === 'admin'
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-4 h-4" />
                ניהול מועדון
                {pendingApprovalsCount > 0 && (
                  <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[0.625rem] flex items-center justify-center font-bold">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('profile')}
              aria-current={activeTab === 'profile' ? 'page' : undefined}
              className={`py-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" />
              פרופיל ({viewer.credits ?? 5} קרד')
            </button>
          </div>
        </nav>

        {previewing && (
          <div role="status" className="bg-amber-400 text-amber-950 text-xs font-bold px-4 py-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
              מצב צפייה כחבר רגיל – כך חבר מועדון רואה את האפליקציה
            </span>
            <button
              onClick={() => setPreviewAsMember(false)}
              className="bg-amber-950 text-amber-50 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-black shrink-0"
            >
              חזרה לתצוגת מנהל
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 focus:outline-none">
        {activeTab === 'sails' && (
          <SailsList
            currentUser={viewer}
            onSelectSail={(id) => setSelectedSailId(id)}
            onOpenCreateModal={openCreateSail}
          />
        )}

        {activeTab === 'boats' && (
          <BoatsAndIssuesView
            currentUser={viewer}
            onSelectSail={(id) => {
              setSelectedSailId(id);
              setActiveTab('sails');
            }}
          />
        )}

        {activeTab === 'feed' && (
          <CommunityFeed
            currentUser={viewer}
            onSelectSail={(id) => {
              setSelectedSailId(id);
              setActiveTab('sails');
            }}
          />
        )}

        {activeTab === 'admin' && isStaff(viewer.role) && (
          <AdminPanel currentUser={viewer} requestsNonce={adminRequestsNonce} onPreviewAsMember={() => setPreviewAsMember(true)} />
        )}

        {activeTab === 'profile' && (
          <UserProfileView
            user={viewer}
            onLogout={handleLogout}
            onUpdate={() => setTick((t) => t + 1)}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav aria-label="ניווט ראשי" className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 py-1.5 px-3 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('sails')}
          aria-current={activeTab === 'sails' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition cursor-pointer ${
            activeTab === 'sails' ? 'text-sky-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Sailboat className="w-5 h-5" />
          <span className="text-[0.625rem]">הפלגות</span>
        </button>

        <button
          onClick={() => setActiveTab('boats')}
          aria-current={activeTab === 'boats' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition cursor-pointer ${
            activeTab === 'boats' ? 'text-sky-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Wrench className="w-5 h-5" />
          <span className="text-[0.625rem]">סירות</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          aria-current={activeTab === 'feed' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition cursor-pointer ${
            activeTab === 'feed' ? 'text-sky-700 font-bold' : 'text-slate-500'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[0.625rem]">פיד</span>
        </button>

        {isStaff(viewer.role) && (
          <button
            onClick={() => setActiveTab('admin')}
            aria-current={activeTab === 'admin' ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition cursor-pointer relative ${
              activeTab === 'admin' ? 'text-sky-700 font-bold' : 'text-slate-500'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[0.625rem]">ניהול</span>
            {pendingApprovalsCount > 0 && (
              <span className="absolute top-0 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[0.5625rem] flex items-center justify-center font-bold">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('profile')}
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition cursor-pointer ${
            activeTab === 'profile' ? 'text-sky-700 font-bold' : 'text-slate-500'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[0.625rem]">פרופיל</span>
        </button>
      </nav>

      {/* Modals */}
      <SailDetailModal
        sailId={selectedSailId}
        currentUser={viewer}
        onClose={() => setSelectedSailId(null)}
        onUpdate={() => setTick((t) => t + 1)}
      />

      <CreateSailModal
        isOpen={showCreateSailModal}
        initialDate={createSailDate}
        currentUser={viewer}
        onClose={() => setShowCreateSailModal(false)}
        onCreated={(sail) => {
          setSelectedSailId(sail.id);
          setTick((t) => t + 1);
        }}
      />

      <NotificationsModal
        isOpen={showNotificationsModal}
        userId={viewer.id}
        onClose={() => setShowNotificationsModal(false)}
        onSelectSail={(id) => {
          setSelectedSailId(id);
          setActiveTab('sails');
        }}
        onOpenRequests={
          isStaff(viewer.role)
            ? () => {
                setActiveTab('admin');
                setAdminRequestsNonce((n) => n + 1);
              }
            : undefined
        }
      />

      <AuthModal
        isOpen={isDemo && showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          setTick((t) => t + 1);
        }}
      />
    </div>
  );
}
