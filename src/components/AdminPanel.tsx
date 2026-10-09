import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { InviteLinkCard } from './InviteLinkCard';
import { CreditRequestsList } from './CreditRequestsList';
import { BoatReservationsList } from './BoatReservationsList';
import { QualificationLevelsEditor } from './QualificationLevelsEditor';
import { WeatherSettings } from './WeatherSettings';
import { TutorialVideosButton } from './TutorialVideos';
import { ClubsManager } from './ClubsManager';
import { BoatPermissionsEditor } from './BoatPermissionsEditor';
import { UserProfile, UserRole, ClubSettings, Boat, BoatStatus, Sail, ExperienceLevel, levelOptions, ROLE_LABELS } from '../types';
import { Overlay } from './Overlay';
import {
  Shield,
  UserCheck,
  Users,
  Settings,
  BarChart3,
  Search,
  Check,
  X,
  Award,
  Sailboat,
  AlertTriangle,
  Plus,
  Coins,
  Wrench,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Calendar,
  Clock,
  Compass,
  RotateCcw,
  MapPin,
  UserPlus,
  Copy,
  Share2,
  Mail,
  KeyRound,
  Eye,
  Building2
} from 'lucide-react';


interface Props {
  currentUser: UserProfile;
  /** Changes when a notification asks to show the requests tab. */
  requestsNonce?: number;
  /** Switches the app to show what a regular member sees. */
  onPreviewAsMember?: () => void;
}

export const AdminPanel: React.FC<Props> = ({ currentUser, requestsNonce = 0, onPreviewAsMember }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'members' | 'fleet' | 'sails' | 'settings' | 'stats' | 'clubs'>(
    requestsNonce > 0 ? 'pending' : 'members'
  );
  useEffect(() => {
    if (requestsNonce > 0) setActiveTab('pending');
  }, [requestsNonce]);
  const [searchMember, setSearchMember] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Add member modal state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({
    email: '',
    fullName: '',
    phone: '',
    experienceLevel: (store.getSettings().experienceLevels[3] ?? store.getSettings().experienceLevels[0] ?? '') as ExperienceLevel,
    credits: 5,
  });
  const [addMemberBusy, setAddMemberBusy] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [createdMember, setCreatedMember] = useState<{
    fullName: string;
    phone: string;
    email: string;
    password: string;
    username?: string;
    /** True when resending details to an existing member (a new temporary password was issued). */
    isResend?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Credit adjustment modal state
  const [creditModalUser, setCreditModalUser] = useState<UserProfile | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(5);
  const [creditReason, setCreditReason] = useState<string>('רכישת חבילת הפלגות');

  // Cancel sail modal state
  const [cancellingSail, setCancellingSail] = useState<Sail | null>(null);
  const [cancelSailReason, setCancelSailReason] = useState<string>('');

  // Boat editing state
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [showAddBoatModal, setShowAddBoatModal] = useState(false);
  const [newBoatName, setNewBoatName] = useState('');
  const [newBoatModel, setNewBoatModel] = useState('');
  const [newBoatStatus, setNewBoatStatus] = useState<BoatStatus>('available');
  const [newBoatNotes, setNewBoatNotes] = useState('');
  const [newBoatBerth, setNewBoatBerth] = useState('מרינה הרצליה');
  const [newBoatCapacity, setNewBoatCapacity] = useState(8);

  const users = store.getUsers();
  const sails = store.getSails();
  const boats = store.getBoats();
  const registrations = store.getRegistrations();
  const clubSettings = store.getSettings();

  // Assistants manage the club like admins, except credits, roles and other staff members' accounts.
  const isAdminUser = currentUser.role === 'admin';
  const canManageAccount = (member: UserProfile) => isAdminUser || member.role === 'member';

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const pendingCreditRequests = isAdminUser ? store.getCreditRequests().filter((r) => r.status === 'pending') : [];
  // "Forgot my password" requests addressed to me, one per member
  const passwordHelpNotifs = store
    .getNotifications(currentUser.id)
    .filter((n) => n.type === 'password_help' && !n.read && n.targetId);
  const passwordHelpMembers = [...new Set(passwordHelpNotifs.map((n) => n.targetId!))]
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserProfile => Boolean(u) && canManageAccount(u!));
  const dismissPasswordHelp = async (memberId: string) => {
    for (const n of passwordHelpNotifs.filter((n) => n.targetId === memberId)) await store.markNotificationAsRead(n.id);
  };
  const requestsCount = pendingUsers.length + pendingCreditRequests.length + passwordHelpMembers.length;
  const approvedUsers = users.filter((u) => u.status === 'approved');
  const upcomingSails = sails.filter((s) => s.status === 'open' || s.status === 'closed');

  // Form states for settings
  const [clubName, setClubName] = useState(clubSettings.clubName);
  const [defaultMaxParticipants, setDefaultMaxParticipants] = useState(clubSettings.defaultMaxParticipants);
  const [whoCanCreateSails, setWhoCanCreateSails] = useState(clubSettings.whoCanCreateSails);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState(clubSettings.cancellationDeadlineHours);

  const closeAddMember = () => {
    setShowAddMember(false);
    setCreatedMember(null);
    setAddMemberError(null);
    setCopied(false);
    setNewMember({ email: '', fullName: '', phone: '', experienceLevel: clubSettings.experienceLevels[3] ?? clubSettings.experienceLevels[0] ?? '', credits: 5 });
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addMemberBusy) return;
    setAddMemberError(null);
    setAddMemberBusy(true);
    const res = await store.createMember({ ...newMember, credits: isAdminUser ? Number(newMember.credits) || 0 : 5 });
    setAddMemberBusy(false);
    if (res.success && res.email && res.temporaryPassword) {
      setCreatedMember({ fullName: newMember.fullName, phone: newMember.phone, email: res.email, password: res.temporaryPassword, username: res.username });
    } else {
      setAddMemberError(res.error || 'הוספת החבר נכשלה');
    }
  };

  const emailSubject = `פרטי כניסה ל${clubSettings.clubName} ⛵`;
  const emailBody = createdMember
    ? `שלום ${createdMember.fullName},\n\n` +
      (createdMember.isResend
        ? `הנה פרטי כניסה מעודכנים לאפליקציית ${clubSettings.clubName}.\n\n`
        : `צורפת כחבר/ה ב${clubSettings.clubName}! מעכשיו אפשר להירשם להפלגות, לראות את לוח השנה ותחזית הים, ולהתעדכן בפיד המועדון.\n\n`) +
      `כניסה לאפליקציה: ${window.location.origin}\n` +
      `מייל: ${createdMember.email}\n` +
      (createdMember.username ? `או שם משתמש: ${createdMember.username}\n` : '') +
      `סיסמה זמנית: ${createdMember.password}\n\n` +
      `אחרי הכניסה הראשונה מומלץ להחליף סיסמה במסך "פרופיל".\n` +
      `טיפ: אפשר להוסיף את האפליקציה למסך הבית בטלפון (בתפריט הדפדפן: "הוסף למסך הבית").\n\n` +
      `נתראה במים,\n${currentUser.fullName}`
    : '';
  const mailtoLink = createdMember
    ? `mailto:${createdMember.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : '';

  const whatsappLink = createdMember
    ? `https://wa.me/${createdMember.phone.replace(/\D/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(emailBody)}`
    : '';

  const handleResendLogin = async (member: UserProfile) => {
    if (!confirm(`להנפיק ל${member.fullName} סיסמה זמנית חדשה ולשלוח לו את פרטי הכניסה? הסיסמה הקודמת שלו תפסיק לעבוד.`)) return;
    const res = await store.resetMemberPassword(member.id);
    if (res.success && res.email && res.temporaryPassword) {
      await dismissPasswordHelp(member.id);
      setCreatedMember({ fullName: member.fullName, phone: member.phone, email: res.email, password: res.temporaryPassword, username: member.username, isResend: true });
      setShowAddMember(true);
    } else {
      setFeedbackMessage({ text: res.error || 'הנפקת סיסמה חדשה נכשלה', type: 'error' });
    }
  };

  const handleApprove = async (userId: string) => {
    await store.approveMember(userId);
    setFeedbackMessage({ text: 'החבר אושר בהצלחה וקיבל הודעת ברוך הבא!', type: 'success' });
  };

  const handleReject = async (userId: string) => {
    if (confirm('האם לדחות בקשת הצטרפות זו?')) {
      await store.rejectMember(userId);
      setFeedbackMessage({ text: 'בקשת ההצטרפות נדחתה', type: 'success' });
    }
  };

  const handleToggleRole = async (userId: string, newRole: UserRole) => {
    const res = await store.toggleMemberRole(userId, newRole);
    if (res.success) {
      setFeedbackMessage({
        text: `התפקיד עודכן ל${ROLE_LABELS[newRole]}`,
        type: 'success',
      });
    } else {
      setFeedbackMessage({ text: res.error || 'שגיאה בשינוי תפקיד', type: 'error' });
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (confirm(`האם אתה בטוח שברצונך למחוק לצמיתות את המשתמש "${userName}" מהמערכת?`)) {
      const res = await store.deleteUser(userId);
      if (res.success) {
        setFeedbackMessage({ text: `המשתמש ${userName} נמחק בהצלחה מהמועדון.`, type: 'success' });
      } else {
        setFeedbackMessage({ text: res.error || 'שגיאה במחיקת המשתמש', type: 'error' });
      }
    }
  };

  const handleUpdateQualification = async (userId: string, newLevel: ExperienceLevel, userName: string) => {
    await store.updateUserQualification(userId, newLevel);
    setFeedbackMessage({ text: `רמת ההסמכה של ${userName} עודכנה ל: ${newLevel}`, type: 'success' });
  };

  const handleResetDatabase = async () => {
    if (
      confirm(
        '⚠️ אזהרה: פעולה זו תמחק את כל נתוני הטסט (הפלגות, הרשמות, פוסטים, דיווחי תקלות) ותאפס את המערכת לבסיס נתונים נקי לחלוטין. האם להמשיך?'
      )
    ) {
      await store.resetToSeed();
      setFeedbackMessage({ text: 'כל נתוני הטסט נמחקו בהצלחה! בסיס הנתונים כעת נקי לחלוטין.', type: 'success' });
    }
  };

  const handleApplyCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditModalUser) return;

    const res = await store.updateMemberCredits(
      creditModalUser.id,
      Number(creditAmount),
      creditReason.trim(),
      currentUser.fullName
    );

    if (res.success) {
      setFeedbackMessage({
        text: `עודכנו ${creditAmount > 0 ? '+' + creditAmount : creditAmount} נקודות קרדיט עבור ${creditModalUser.fullName}. יתרה חדשה: ${res.newCredits} קרדיטים.`,
        type: 'success',
      });
      setCreditModalUser(null);
    }
  };

  const handleQuickAddCredit = async (user: UserProfile, delta: number) => {
    const res = await store.updateMemberCredits(
      user.id,
      delta,
      delta > 0 ? 'הוספת קרדיט מהירה ע״י מנהל' : 'הפחתת קרדיט ע״י מנהל',
      currentUser.fullName
    );
    if (res.success) {
      setFeedbackMessage({
        text: `מאזן הקרדיטים של ${user.fullName} עודכן ל-${res.newCredits} קרדיטים.`,
        type: 'success',
      });
    }
  };

  const handleConfirmCancelSail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSail) return;

    await store.cancelSail(cancellingSail.id, cancelSailReason.trim(), currentUser.fullName);
    setFeedbackMessage({
      text: `ההפלגה "${cancellingSail.title}" בוטלה בהצלחה. כל חברי הצוות קיבלו התראה והקרדיטים הוחזרו לחשבונם!`,
      type: 'success',
    });
    setCancellingSail(null);
    setCancelSailReason('');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.updateSettings({
      clubName: clubName.trim(),
      defaultMaxParticipants: Number(defaultMaxParticipants) || 6,
      whoCanCreateSails,
      cancellationDeadlineHours: Number(cancellationDeadlineHours) || 12,
    });
    setFeedbackMessage({ text: 'הגדרות המועדון עודכנו בהצלחה!', type: 'success' });
  };

  const handleAddBoat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoatName.trim()) return;

    await store.createBoat({
      name: newBoatName.trim(),
      model: newBoatModel.trim() || 'סירת מפרש',
      status: newBoatStatus,
      statusNotes: newBoatNotes.trim() || undefined,
      berthLocation: newBoatBerth.trim() || 'מרינה הרצליה',
      capacity: Number(newBoatCapacity) || 8,
    });

    setFeedbackMessage({ text: `כלי השייט "${newBoatName}" נוסף בהצלחה לצי המועדון.`, type: 'success' });
    setNewBoatName('');
    setNewBoatModel('');
    setNewBoatNotes('');
    setShowAddBoatModal(false);
  };

  const handleUpdateBoat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBoat) return;

    await store.updateBoat(editingBoat.id, {
      name: editingBoat.name,
      model: editingBoat.model,
      status: editingBoat.status,
      statusNotes: editingBoat.statusNotes,
      berthLocation: editingBoat.berthLocation,
      capacity: editingBoat.capacity,
      allowedLevels: editingBoat.allowedLevels ?? [],
      allowedMemberIds: editingBoat.allowedMemberIds ?? [],
    });

    setFeedbackMessage({ text: `פרטי וסטטוס כלי השייט "${editingBoat.name}" עודכנו בהצלחה.`, type: 'success' });
    setEditingBoat(null);
  };

  const filteredMembers = approvedUsers.filter(
    (m) =>
      m.fullName.toLowerCase().includes(searchMember.toLowerCase()) ||
      m.phone.includes(searchMember) ||
      m.username.toLowerCase().includes(searchMember.toLowerCase())
  );

  // Statistics
  const totalSails = sails.length;
  const currentMonthSails = sails.filter((s) => {
    const sailDate = new Date(s.date);
    const now = new Date();
    return sailDate.getMonth() === now.getMonth() && sailDate.getFullYear() === now.getFullYear();
  }).length;

  const memberCounts: Record<string, number> = {};
  registrations.filter((r) => r.status === 'confirmed').forEach((r) => {
    memberCounts[r.userId] = (memberCounts[r.userId] || 0) + 1;
  });

  const sortedActiveMembers = Object.entries(memberCounts)
    .map(([userId, count]) => ({
      user: users.find((u) => u.id === userId),
      count,
    }))
    .filter((item): item is { user: UserProfile; count: number } => Boolean(item.user))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="max-w-4xl mx-auto space-y-5 text-right">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-sky-500/20 border border-sky-400/40 rounded-2xl flex items-center justify-center text-sky-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">פאנל ניהול המועדון</h1>
            <p className="text-xs text-sky-300">
              ניהול קרדיטים, כלי שייט והספנות, ביטול הפלגות, הרשאות חברים והגדרות
            </p>
          </div>
        </div>

        {/* Quick Tabs */}
        <div className="flex flex-wrap bg-slate-800/80 p-1 rounded-2xl text-xs font-semibold gap-1">
          <button
            onClick={() => setActiveTab('members')}
            aria-pressed={activeTab === 'members'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            חברים וקרדיטים ({approvedUsers.length})
          </button>

          <button
            onClick={() => setActiveTab('fleet')}
            aria-pressed={activeTab === 'fleet'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'fleet'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sailboat className="w-3.5 h-3.5" />
            צי כלי שייט ({boats.length})
          </button>

          <button
            onClick={() => setActiveTab('sails')}
            aria-pressed={activeTab === 'sails'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sails'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            ביטול הפלגות ({upcomingSails.length})
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            aria-pressed={activeTab === 'pending'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            בקשות והצטרפות ({requestsCount})
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            aria-pressed={activeTab === 'settings'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            הגדרות
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            aria-pressed={activeTab === 'stats'}
            className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'stats'
                ? 'bg-sky-600 text-white shadow-xs font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            סטטיסטיקה
          </button>

          {currentUser.isPlatformAdmin && (
            <button
              onClick={() => setActiveTab('clubs')}
              aria-pressed={activeTab === 'clubs'}
              className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'clubs' ? 'bg-amber-600 text-white shadow-xs font-bold' : 'text-amber-300 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              מועדונים (מנהל מערכת)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TutorialVideosButton staff />
        {onPreviewAsMember && (
          <button
            type="button"
            onClick={onPreviewAsMember}
            className="w-full glass rounded-3xl p-4 flex items-center gap-3 text-right hover:border-amber-300 cursor-pointer"
          >
            <Eye className="w-8 h-8 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-bold text-slate-900 text-sm">צפייה כחבר רגיל</span>
              <span className="block text-xs text-slate-500">לראות את האפליקציה כמו שחבר מועדון רואה אותה</span>
            </span>
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button aria-label="סגור"
            onClick={() => setFeedbackMessage(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: Members & Credits List */}
      {activeTab === 'members' && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">חברי מועדון רשומים</h2>
              <p className="text-xs text-slate-500">
                ניהול תפקידים, הוספת נקודות קרדיט לכל חבר, או קידום להרשאות מנהל
              </p>
            </div>
            <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              הוספת חבר
            </button>
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                placeholder="חפש חבר לפי שם או טלפון..."
                className="w-full bg-white/60 border border-slate-200 rounded-xl py-2 px-3 text-xs pr-8 focus:ring-2 focus:ring-sky-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/55 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl gap-3 text-xs transition"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={member.avatar}
                    alt={member.fullName}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 shadow-2xs"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{member.fullName}</p>
                      {member.role === 'admin' ? (
                        <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-full text-[0.625rem] flex items-center gap-1">
                          <Shield className="w-3 h-3 text-sky-600" /> {ROLE_LABELS.admin}
                        </span>
                      ) : member.role === 'assistant' ? (
                        <span className="bg-violet-100 text-violet-800 font-bold px-2 py-0.5 rounded-full text-[0.625rem] flex items-center gap-1">
                          <Shield className="w-3 h-3 text-violet-600" /> {ROLE_LABELS.assistant}
                        </span>
                      ) : (
                        <span className="bg-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded-full text-[0.625rem]">
                          חבר מועדון
                        </span>
                      )}

                      {/* PROMINENT CREDITS BADGE (matching user request image) */}
                      <span className="bg-amber-100 text-amber-900 border border-amber-300/80 font-black px-2.5 py-0.5 rounded-lg text-xs flex items-center gap-1 shadow-2xs">
                        <Coins className="w-3.5 h-3.5 text-amber-600" />
                        <span>{member.credits ?? 5} נקודות קרדיט</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-slate-500 text-[0.6875rem]">{member.phone} •</span>
                      {/* Qualification Level Selector */}
                      <div className="flex items-center gap-1">
                        <Compass className="w-3 h-3 text-sky-600" />
                        <select aria-label={`רמת הסמכה של ${member.fullName}`}
                          value={member.experienceLevel}
                          onChange={(e) =>
                            handleUpdateQualification(member.id, e.target.value as ExperienceLevel, member.fullName)
                          }
                          className="bg-white border border-slate-200 text-slate-700 text-[0.6875rem] font-semibold rounded-lg px-2 py-1 hover:border-sky-400 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                          title="עדכן רמת הסמכה של המשיט"
                        >
                          {levelOptions(clubSettings.experienceLevels, member.experienceLevel).map((lvl) => (
                            <option key={lvl} value={lvl}>{lvl}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Role Switcher & Credit Modifiers & Delete */}
                <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
                  {/* Credits Adjust Buttons (admin only) */}
                  {isAdminUser && (
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleQuickAddCredit(member, 1)}
                      className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded-lg font-bold text-xs cursor-pointer transition"
                      title="הוסף 1 קרדיט"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddCredit(member, 5)}
                      className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded-lg font-bold text-xs cursor-pointer transition border-r border-slate-100"
                      title="הוסף 5 קרדיטים"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddCredit(member, -1)}
                      className="px-2 py-1 text-slate-500 hover:bg-slate-50 rounded-lg font-bold text-xs cursor-pointer transition border-r border-slate-100"
                      title="הפחת 1 קרדיט"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreditModalUser(member);
                        setCreditAmount(5);
                        setCreditReason('רכישת חבילת הפלגות');
                      }}
                      className="px-2.5 py-1 text-sky-700 hover:bg-sky-50 rounded-lg font-bold text-xs cursor-pointer transition border-r border-slate-100 flex items-center gap-1"
                    >
                      <Coins className="w-3 h-3 text-amber-500" />
                      הגדר קרדיטים
                    </button>
                  </div>
                  )}

                  {/* Role (admin only) */}
                  {isAdminUser && (
                    <select
                      value={member.role}
                      onChange={(e) => handleToggleRole(member.id, e.target.value as UserRole)}
                      className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-2 py-1.5 cursor-pointer hover:border-sky-400"
                      title="תפקיד במועדון"
                    >
                      <option value="member">{ROLE_LABELS.member}</option>
                      <option value="assistant">{ROLE_LABELS.assistant}</option>
                      <option value="admin">{ROLE_LABELS.admin}</option>
                    </select>
                  )}

                  {/* Resend login details (new temporary password) */}
                  {member.id !== currentUser.id && canManageAccount(member) && (
                    <button
                      type="button"
                      onClick={() => handleResendLogin(member)}
                      className="bg-white/60 hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                      title="הנפק סיסמה זמנית חדשה ושלח פרטי כניסה במייל / וואטסאפ"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      שלח פרטי כניסה
                    </button>
                  )}

                  {/* Delete User Button */}
                  {canManageAccount(member) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(member.id, member.fullName)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer border border-transparent hover:border-rose-200"
                    title={`מחק את ${member.fullName} לצמיתות`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Fleet Management (צי כלי שייט והספנות) */}
      {activeTab === 'fleet' && <BoatReservationsList />}

      {activeTab === 'fleet' && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">הגדרת וניהול צי כלי השייט</h2>
              <p className="text-xs text-slate-500">
                שינוי שמות סירות, הגדרת קיבולת ועדכון סטטוס: זמין להפלגה / בהספנה ותיקון / לא זמין
              </p>
            </div>
            <button
              onClick={() => setShowAddBoatModal(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              הוסף כלי שייט חדש
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {boats.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl border border-slate-200 bg-white/55 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                      <Sailboat className="w-4 h-4 text-sky-600" />
                      {b.name}
                    </h3>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        b.status === 'available'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'maintenance'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {b.status === 'available'
                        ? '🟢 זמין להפלגה'
                        : b.status === 'maintenance'
                        ? '🟠 בהספנה / תיקון'
                        : '🔴 לא זמין'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    דגם: <strong>{b.model}</strong> | קיבולת: <strong>עד {b.capacity} משתתפים</strong>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    מיקום רציף: {b.berthLocation || 'מרינה הרצליה'}
                  </p>
                  <p className="text-xs mt-0.5">
                    {(b.allowedLevels?.length ?? 0) + (b.allowedMemberIds?.length ?? 0) === 0 ? (
                      <span className="text-emerald-700">🔓 פתוחה לכל הסקיפרים</span>
                    ) : (
                      <span className="text-amber-800">
                        🔒 מורשים:{' '}
                        {[
                          ...(b.allowedLevels ?? []),
                          ...(b.allowedMemberIds ?? []).map((id) => store.getUserById(id)?.fullName ?? 'חבר לשעבר'),
                        ].join(', ')}
                      </span>
                    )}
                  </p>

                  {b.statusNotes && (
                    <div className="mt-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">הערת סטטוס: </span>
                      {b.statusNotes}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-xs">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingBoat(b)}
                      className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold px-3 py-1.5 rounded-xl cursor-pointer transition flex items-center gap-1"
                    >
                      <Wrench className="w-3 h-3 text-sky-600" />
                      ערוך סירה וסטטוס
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`האם למחוק את כלי השייט ${b.name}?`)) {
                        await store.deleteBoat(b.id);
                        setFeedbackMessage({ text: `כלי השייט ${b.name} הוסר מהמערכת`, type: 'success' });
                      }
                    }}
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-2 rounded-lg cursor-pointer"
                    title="מחק כלי שייט"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Cancel Active Sails (ביטול הפלגות ע״י מנהל) */}
      {activeTab === 'sails' && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">ניהול וביטול הפלגות פעילות</h2>
            <p className="text-xs text-slate-500">
              מנהל יכול לבטל כל הפלגה מתוכננת (למשל עקב תנאי ים, רוחות עזות, או הספנת כלי השייט).
              הביטול שולח התראה מיידית ומחזיר אוטומטית את נקודות הקרדיט לכל הנרשמים.
            </p>
          </div>

          {upcomingSails.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">אין כרגע הפלגות עתידיות פתוחות לביטול.</p>
          ) : (
            <div className="space-y-3">
              {upcomingSails.map((sail) => {
                const confirmed = store.getConfirmedParticipants(sail.id);
                const waitlist = store.getWaitlistParticipants(sail.id);

                return (
                  <div
                    key={sail.id}
                    className="p-4 bg-white/60 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-900">{sail.title}</span>
                        <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded-md font-semibold text-[0.625rem]">
                          ⛵ {sail.boatName}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        {sail.date} | שעות: {sail.departureTime} - {sail.estimatedReturnTime} | סקיפר: {sail.skipperName}
                      </p>
                      <p className="text-slate-500 text-[0.6875rem] mt-0.5">
                        רשומים: <strong>{confirmed.length}/{sail.maxParticipants}</strong>
                        {waitlist.length > 0 && ` (+${waitlist.length} בהמתנה)`}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setCancellingSail(sail);
                        setCancelSailReason('');
                      }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3.5 py-2 rounded-xl border border-rose-200 transition flex items-center gap-1.5 cursor-pointer self-end sm:self-center"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      בטל הפלגה והחזר קרדיטים
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Requests — invite link, sign-ups to approve, password and credit requests */}
      {activeTab === 'pending' && <InviteLinkCard />}

      {activeTab === 'pending' && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">משתמשים הממתינים לאישור הצטרפות</h2>
              <p className="text-xs text-slate-500">
                רק משתמשים שאושרו כאן יוכלו לראות את ההפלגות, להירשם אליהן ולפרסם בפיד
              </p>
            </div>
            <span className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
              {pendingUsers.length} בקשות ממתינות
            </span>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800 text-sm">אין בקשות ממתינות כרגע</p>
              <p className="text-xs text-slate-400">כל חברי המועדון שנרשמו טופלו ואושרו.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/60 border border-slate-200 rounded-2xl gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.fullName}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200"
                    />
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{user.fullName}</p>
                      <p className="text-slate-500">
                        שם משתמש: <strong>{user.username}</strong> | טלפון: <strong>{user.phone}</strong>
                      </p>
                      <span className="inline-block mt-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md font-semibold text-[0.625rem]">
                        ניסיון: {user.experienceLevel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      אשר חברות
                    </button>
                    <button
                      onClick={() => handleReject(user.id)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && passwordHelpMembers.length > 0 && (
        <div className="glass rounded-3xl p-4 sm:p-6 space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-700" aria-hidden="true" />
              בקשות לאיפוס סיסמה
            </h2>
            <p className="text-xs text-slate-500">
              הנפק סיסמה זמנית ושלח אותה לחבר בוואטסאפ או במייל. אחרי הכניסה הוא יוכל לבחור סיסמה משלו בפרופיל.
            </p>
          </div>
          {passwordHelpMembers.map((member) => (
            <div
              key={member.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-sky-50/50 border border-sky-200 rounded-2xl gap-3 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900 text-sm">{member.fullName}</p>
                <p className="text-slate-500" dir="ltr">
                  {member.email}
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => handleResendLogin(member)}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  הנפק סיסמה זמנית ושלח
                </button>
                <button
                  onClick={() => dismissPasswordHelp(member.id)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl cursor-pointer"
                >
                  התעלם
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'pending' && isAdminUser && (
        <CreditRequestsList onDone={(text, ok) => setFeedbackMessage({ text, type: ok ? 'success' : 'error' })} />
      )}

      {/* TAB 5: Club Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
        <form onSubmit={handleSaveSettings} className="glass rounded-3xl p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">הגדרות מועדון ומדיניות הפלגות</h2>
            <p className="text-xs text-slate-500">קביעת פרמטרים רוחביים המשפיעים על כלל המשתתפים</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label htmlFor="admin-field-1" className="block font-semibold text-slate-700 mb-1">שם המועדון</label>
              <input id="admin-field-1"
                type="text"
                required
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs"
              />
            </div>

            <div>
              <label htmlFor="admin-field-2" className="block font-semibold text-slate-700 mb-1">מספר משתתפים מקסימלי (ברירת מחדל)</label>
              <input id="admin-field-2"
                type="number"
                min="2"
                max="20"
                required
                value={defaultMaxParticipants}
                onChange={(e) => setDefaultMaxParticipants(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs"
              />
            </div>

            <div>
              <label htmlFor="admin-field-3" className="block font-semibold text-slate-700 mb-1">מי רשאי לפתוח הפלגות חדשות?</label>
              <select id="admin-field-3"
                value={whoCanCreateSails}
                onChange={(e) => setWhoCanCreateSails(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs cursor-pointer"
              >
                <option value="admin_only">מנהלים בלבד</option>
                <option value="all_members">כל החברים המאושרים</option>
              </select>
            </div>

            <div>
              <label htmlFor="admin-field-4" className="block font-semibold text-slate-700 mb-1">
                חלון ביטול: מינימום שעות לפני הפלגה (ללא מנהל)
              </label>
              <input id="admin-field-4"
                type="number"
                min="0"
                max="72"
                required
                value={cancellationDeadlineHours}
                onChange={(e) => setCancellationDeadlineHours(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 text-xs"
              />
            </div>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {isAdminUser && (
              <button
                type="button"
                onClick={handleResetDatabase}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-4 py-2.5 rounded-xl text-xs border border-rose-200 transition flex items-center gap-1.5 cursor-pointer"
                title="מחיקת כל נתוני הטסט ואיפוס המערכת לדטה בייס נקי לחלוטין"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                מחק נתוני טסט (דטה בייס נקי)
              </button>
              )}
            </div>

            <button
              type="submit"
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer"
            >
              שמור שינויים
            </button>
          </div>
        </form>

        <WeatherSettings />
        <QualificationLevelsEditor />
        </div>
      )}

      {/* TAB 6: Statistics */}
      {activeTab === 'clubs' && currentUser.isPlatformAdmin && <ClubsManager />}

      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass rounded-2xl p-4">
              <span className="text-xs text-slate-500 block mb-1">סך הפלגות במערכת</span>
              <p className="text-2xl font-black text-sky-800">{totalSails}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <span className="text-xs text-slate-500 block mb-1">הפלגות החודש</span>
              <p className="text-2xl font-black text-emerald-700">{currentMonthSails}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <span className="text-xs text-slate-500 block mb-1">חברים פעילים</span>
              <p className="text-2xl font-black text-indigo-700">{approvedUsers.length}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <span className="text-xs text-slate-500 block mb-1">צי כלי שייט</span>
              <p className="text-2xl font-black text-amber-600">{boats.length}</p>
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Award className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">חברי המועדון הפעילים ביותר (השתתפות בהפלגות)</h2>
            </div>

            <div className="space-y-2">
              {sortedActiveMembers.map(({ user, count }, idx) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-800'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-800'
                          : idx === 2
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <img src={user.avatar} alt={user.fullName} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <p className="font-bold text-slate-900">{user.fullName}</p>
                      <p className="text-[0.625rem] text-slate-400">{user.experienceLevel}</p>
                    </div>
                  </div>

                  <span className="font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-xl">
                    {count} הפלגות
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Credit Adjustment */}
      {creditModalUser && (
        <Overlay onClose={() => setCreditModalUser(null)}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4">
          <form
            onSubmit={handleApplyCredits}
            className="w-full max-w-sm glass-sheet rounded-3xl p-4 sm:p-6 text-right space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                <Coins className="w-5 h-5 text-amber-500" />
                עדכון נקודות קרדיט
              </h3>
              <button aria-label="סגור"
                type="button"
                onClick={() => setCreditModalUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/80 text-xs text-amber-900">
              <p className="font-bold text-sm">{creditModalUser.fullName}</p>
              <p>
                יתרה נוכחית: <strong>{creditModalUser.credits ?? 5} נקודות קרדיט</strong>
              </p>
            </div>

            <div>
              <label htmlFor="admin-field-5" className="block text-xs font-semibold text-slate-700 mb-1">
                כמות קרדיטים להוספה / הפחתה
              </label>
              <input id="admin-field-5"
                type="number"
                required
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
                placeholder="למשל: 5 להוספה, או 1- להפחתה"
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-sky-500"
              />
              <span className="text-[0.625rem] text-slate-400 mt-1 block">
                ניתן להזין מספר חיובי להוספה, או שלילי להפחתה.
              </span>
            </div>

            <div>
              <label htmlFor="admin-field-6" className="block text-xs font-semibold text-slate-700 mb-1">סיבת העדכון</label>
              <input id="admin-field-6"
                type="text"
                required
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="למשל: תשלום דמי מועדון שנתיים, השתתפות במבצע..."
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                שמור ועדכן חבר
              </button>
              <button
                type="button"
                onClick={() => setCreditModalUser(null)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
        </Overlay>
      )}

      {/* MODAL: Cancel Sail with Credit Refund */}
      {cancellingSail && (
        <Overlay onClose={() => setCancellingSail(null)}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4">
          <form
            onSubmit={handleConfirmCancelSail}
            className="w-full max-w-sm glass-sheet rounded-3xl p-4 sm:p-6 text-right space-y-4 animate-in fade-in"
          >
            <h3 className="text-base font-bold text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              ביטול הפלגה ע״י מנהל
            </h3>
            <p className="text-xs text-slate-600">
              ההפלגה: <strong>{cancellingSail.title}</strong> ({cancellingSail.date})
              <br />
              כל המשתתפים יקבלו התראה מיידית, ונקודות הקרדיט שלהם יוחזרו אוטומטית!
            </p>

            <div>
              <label htmlFor="admin-field-7" className="block text-xs font-semibold text-slate-700 mb-1">
                סיבת הביטול (תוצג לכל החברים) *
              </label>
              <textarea id="admin-field-7"
                required
                rows={3}
                value={cancelSailReason}
                onChange={(e) => setCancelSailReason(e.target.value)}
                placeholder="למשל: רוחות צפוניות עזות מעל 25 קשר, כלי השייט נכנס להספנה דחופה..."
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                אשר ביטול והחזר קרדיטים
              </button>
              <button
                type="button"
                onClick={() => setCancellingSail(null)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                סגור
              </button>
            </div>
          </form>
        </div>
        </Overlay>
      )}

      {/* MODAL: Add New Boat */}
      {showAddMember && (
        <Overlay onClose={closeAddMember}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4">
          <div className="w-full max-w-md glass-sheet rounded-3xl p-4 sm:p-6 text-right space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-5 h-5 text-sky-600" />
                {createdMember ? (createdMember.isResend ? 'פרטי כניסה חדשים' : 'החבר נוסף בהצלחה') : 'הוספת חבר מועדון'}
              </h3>
              <button aria-label="סגור" type="button" onClick={closeAddMember} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdMember ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-600">
                  {createdMember.isResend ? (
                    <>הונפקה סיסמה זמנית חדשה ל<strong>{createdMember.fullName}</strong>. שלח לו את פרטי הכניסה:</>
                  ) : (
                    <>החשבון של <strong>{createdMember.fullName}</strong> נוצר ומאושר. שלח לו את פרטי הכניסה:</>
                  )}
                </p>
                <div className="p-3 bg-white/60 rounded-xl border border-slate-200 space-y-1 font-medium">
                  <div>מייל: <span className="font-mono">{createdMember.email}</span></div>
                  <div>סיסמה זמנית: <span className="font-mono font-black text-sm tracking-wider">{createdMember.password}</span></div>
                </div>
                <p className="text-[0.6875rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                  הסיסמה מוצגת פעם אחת בלבד. החבר יכול להחליף אותה במסך הפרופיל.
                </p>
                <a
                  href={mailtoLink}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Mail className="w-4 h-4" />
                  שלח במייל
                  <span dir="ltr" className="font-mono font-normal opacity-90">({createdMember.email})</span>
                </a>
                <div className="flex gap-2">
                  {createdMember.phone.replace(/\D/g, '').length >= 9 && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-4 h-4" />
                      שלח בוואטסאפ
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${emailSubject}\n\n${emailBody}`);
                        setCopied(true);
                      } catch {
                        setCopied(false);
                      }
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'הועתק!' : 'העתק הודעה'}
                  </button>
                </div>
                <button type="button" onClick={closeAddMember} className="w-full text-sky-700 font-bold py-2 cursor-pointer">
                  סיום
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="space-y-3 text-xs">
                <p className="text-slate-500">
                  החבר יקבל חשבון מאושר עם סיסמה זמנית, שתעביר לו בוואטסאפ או בהודעה. לא נשלח מייל.
                </p>
                {addMemberError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-2.5">{addMemberError}</div>
                )}
                <label className="block">
                  <span className="font-semibold text-slate-700">שם מלא *</span>
                  <input
                    required
                    value={newMember.fullName}
                    onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700">מייל *</span>
                  <input
                    required
                    type="email"
                    dir="ltr"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm text-left"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700">טלפון (לשליחה בוואטסאפ)</span>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="050-1234567"
                    value={newMember.phone}
                    onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm text-left"
                  />
                </label>
                <div className={`grid gap-2 ${isAdminUser ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <label className="block">
                    <span className="font-semibold text-slate-700">רמת הסמכה</span>
                    <select
                      value={newMember.experienceLevel}
                      onChange={(e) => setNewMember({ ...newMember, experienceLevel: e.target.value as ExperienceLevel })}
                      className="mt-1 w-full px-2 py-2 bg-white/60 border border-slate-200 rounded-xl text-xs"
                    >
                      {clubSettings.experienceLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </label>
                  {isAdminUser && (
                  <label className="block">
                    <span className="font-semibold text-slate-700">קרדיטים התחלתיים</span>
                    <input
                      type="number"
                      min={0}
                      value={newMember.credits}
                      onChange={(e) => setNewMember({ ...newMember, credits: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={addMemberBusy}
                  className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  {addMemberBusy ? 'יוצר חשבון...' : 'צור חבר'}
                </button>
              </form>
            )}
          </div>
        </div>
        </Overlay>
      )}

      {showAddBoatModal && (
        <Overlay onClose={() => setShowAddBoatModal(false)}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4">
          <form
            onSubmit={handleAddBoat}
            className="w-full max-w-md glass-sheet rounded-3xl p-4 sm:p-6 text-right space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Sailboat className="w-5 h-5 text-sky-600" />
                הוספת כלי שייט לצי
              </h3>
              <button aria-label="סגור"
                type="button"
                onClick={() => setShowAddBoatModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label htmlFor="admin-field-8" className="block text-xs font-semibold text-slate-700 mb-1">שם כלי השייט *</label>
              <input id="admin-field-8"
                type="text"
                required
                value={newBoatName}
                onChange={(e) => setNewBoatName(e.target.value)}
                placeholder="גלית / רוח ים / סולאר..."
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="admin-field-9" className="block font-semibold text-slate-700 mb-1">דגם ויצרן</label>
                <input id="admin-field-9"
                  type="text"
                  value={newBoatModel}
                  onChange={(e) => setNewBoatModel(e.target.value)}
                  placeholder="Bavaria 38 Cruiser..."
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label htmlFor="admin-field-10" className="block font-semibold text-slate-700 mb-1">קיבולת מקסימלית</label>
                <input id="admin-field-10"
                  type="number"
                  min="2"
                  max="20"
                  value={newBoatCapacity}
                  onChange={(e) => setNewBoatCapacity(Number(e.target.value))}
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="admin-field-11" className="block font-semibold text-slate-700 mb-1">סטטוס התחלתי</label>
                <select id="admin-field-11"
                  value={newBoatStatus}
                  onChange={(e) => setNewBoatStatus(e.target.value as any)}
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="available">🟢 זמין להפלגה</option>
                  <option value="maintenance">🟠 בהספנה / תיקון</option>
                  <option value="unavailable">🔴 לא זמין</option>
                </select>
              </div>

              <div>
                <label htmlFor="admin-field-12" className="block font-semibold text-slate-700 mb-1">מיקום רציף</label>
                <input id="admin-field-12"
                  type="text"
                  value={newBoatBerth}
                  onChange={(e) => setNewBoatBerth(e.target.value)}
                  placeholder="מרינה הרצליה רציף B..."
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                הוסף כלי שייט
              </button>
              <button
                type="button"
                onClick={() => setShowAddBoatModal(false)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
        </Overlay>
      )}

      {/* MODAL: Edit Existing Boat */}
      {editingBoat && (
        <Overlay onClose={() => setEditingBoat(null)}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop p-4">
          <form
            onSubmit={handleUpdateBoat}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto glass-sheet rounded-3xl p-4 sm:p-6 text-right space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                עריכת כלי שייט: {editingBoat.name}
              </h3>
              <button aria-label="סגור"
                type="button"
                onClick={() => setEditingBoat(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label htmlFor="admin-field-13" className="block text-xs font-semibold text-slate-700 mb-1">שם כלי השייט</label>
              <input id="admin-field-13"
                type="text"
                required
                value={editingBoat.name}
                onChange={(e) => setEditingBoat({ ...editingBoat, name: e.target.value })}
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="admin-field-14" className="block font-semibold text-slate-700 mb-1">סטטוס כלי שייט *</label>
                <select id="admin-field-14"
                  value={editingBoat.status}
                  onChange={(e) => setEditingBoat({ ...editingBoat, status: e.target.value as any })}
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 font-bold cursor-pointer"
                >
                  <option value="available">🟢 זמין להפלגה</option>
                  <option value="maintenance">🟠 בהספנה / תיקון</option>
                  <option value="unavailable">🔴 לא זמין</option>
                </select>
              </div>

              <div>
                <label htmlFor="admin-field-15" className="block font-semibold text-slate-700 mb-1">דגם</label>
                <input id="admin-field-15"
                  type="text"
                  value={editingBoat.model}
                  onChange={(e) => setEditingBoat({ ...editingBoat, model: e.target.value })}
                  className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-field-16" className="block text-xs font-semibold text-slate-700 mb-1">
                הערת סטטוס / פירוט עבודות הספנה
              </label>
              <input id="admin-field-16"
                type="text"
                value={editingBoat.statusNotes || ''}
                onChange={(e) => setEditingBoat({ ...editingBoat, statusNotes: e.target.value })}
                placeholder="למשל: טיפול אנטי-פאולינג ושיפוץ מנוע..."
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label htmlFor="admin-field-17" className="block text-xs font-semibold text-slate-700 mb-1">מיקום רציף</label>
              <input id="admin-field-17"
                type="text"
                value={editingBoat.berthLocation || ''}
                onChange={(e) => setEditingBoat({ ...editingBoat, berthLocation: e.target.value })}
                className="w-full p-2.5 bg-white/60 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white/45">
              <BoatPermissionsEditor
                allowedLevels={editingBoat.allowedLevels ?? []}
                allowedMemberIds={editingBoat.allowedMemberIds ?? []}
                onChange={(next) => setEditingBoat({ ...editingBoat, ...next })}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                שמור שינויים
              </button>
              <button
                type="button"
                onClick={() => setEditingBoat(null)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
        </Overlay>
      )}
    </div>
  );
};
