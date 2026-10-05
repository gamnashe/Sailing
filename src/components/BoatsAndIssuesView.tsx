import React, { useState } from 'react';
import { store } from '../services/store';
import { Boat, BoatIssue, BoatStatus, IssueSeverity, UserProfile } from '../types';
import { compressImage } from '../utils/imageCompression';
import {
  Anchor,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  Plus,
  AlertCircle,
  Camera,
  MapPin,
  Users,
  Shield,
  X,
  Send,
  Sailboat,
  ChevronDown,
  Info
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  onSelectSail?: (sailId: string) => void;
}

export const BoatsAndIssuesView: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'issues'>('fleet');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAddBoatModal, setShowAddBoatModal] = useState(false);
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const boats = store.getBoats();
  const issues = store.getBoatIssues();
  const isAdmin = currentUser.role === 'admin';

  // --- Report Issue Form State ---
  const [selectedBoatId, setSelectedBoatId] = useState(boats[0]?.id || '');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueCategory, setIssueCategory] = useState<BoatIssue['category']>('מנוע');
  const [issueSeverity, setIssueSeverity] = useState<IssueSeverity>('medium');
  const [issuePhoto, setIssuePhoto] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // --- Admin Add Boat State ---
  const [newBoatName, setNewBoatName] = useState('');
  const [newBoatModel, setNewBoatModel] = useState('');
  const [newBoatStatus, setNewBoatStatus] = useState<BoatStatus>('available');
  const [newBoatNotes, setNewBoatNotes] = useState('');
  const [newBoatBerth, setNewBoatBerth] = useState('');
  const [newBoatCapacity, setNewBoatCapacity] = useState(8);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setIssuePhoto(compressed);
    } catch {
      alert('שגיאה בדחיסת התמונה');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim() || !selectedBoatId) return;

    const boat = store.getBoatById(selectedBoatId);
    if (!boat) return;

    await store.reportBoatIssue({
      boatId: boat.id,
      boatName: boat.name,
      reporterId: currentUser.id,
      reporterName: currentUser.fullName,
      reporterPhone: currentUser.phone,
      title: issueTitle.trim(),
      description: issueDesc.trim(),
      category: issueCategory,
      severity: issueSeverity,
      photoUrl: issuePhoto || undefined,
    });

    setFeedbackMsg({
      text: `התקלה דווחה בהצלחה ופורסמה בלוח המודעות לכל חברי המועדון והמנהלים.`,
      type: 'success',
    });

    // Reset form
    setIssueTitle('');
    setIssueDesc('');
    setIssuePhoto(null);
    setShowReportModal(false);
    setActiveTab('issues');
  };

  const handleAddBoatSubmit = async (e: React.FormEvent) => {
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

    setFeedbackMsg({ text: `כלי השייט "${newBoatName}" נוסף בהצלחה למערכת.`, type: 'success' });
    setNewBoatName('');
    setNewBoatModel('');
    setNewBoatNotes('');
    setShowAddBoatModal(false);
  };

  const handleUpdateBoatStatus = async (boat: Boat, newStatus: BoatStatus, notes?: string) => {
    await store.updateBoat(boat.id, {
      status: newStatus,
      statusNotes: notes !== undefined ? notes : boat.statusNotes,
    });
    setEditingBoat(null);
    setFeedbackMsg({ text: `סטטוס הסירה "${boat.name}" עודכן בהצלחה.`, type: 'success' });
  };

  const handleResolveIssue = async (issueId: string) => {
    const adminNote = prompt('הערת סגירה / פירוט התיקון שבוצע (אופציונלי):') || 'התקלה טופלה ותוקנה';
    await store.updateBoatIssueStatus(issueId, 'resolved', adminNote, currentUser.fullName);
    setFeedbackMsg({ text: 'התקלה סומנה כתוקנה!', type: 'success' });
  };

  const filteredIssues = issues.filter((i) => {
    if (statusFilter === 'open') return i.status !== 'resolved';
    if (statusFilter === 'resolved') return i.status === 'resolved';
    return true;
  });

  const getStatusBadge = (status: BoatStatus) => {
    switch (status) {
      case 'available':
        return (
          <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            זמין להפלגה
          </span>
        );
      case 'maintenance':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-200">
            <Wrench className="w-3.5 h-3.5 text-amber-600" />
            בהספנה / תיקון
          </span>
        );
      case 'unavailable':
        return (
          <span className="bg-rose-100 text-rose-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            לא זמין
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: IssueSeverity) => {
    switch (sev) {
      case 'critical':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-md">משביתה סירה</span>;
      case 'high':
        return <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-md">חמורה</span>;
      case 'medium':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">בינונית</span>;
      case 'low':
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">קלה</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 text-right">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-sky-950 via-sky-900 to-slate-900 text-white rounded-3xl p-6 border border-sky-800/80 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-sky-500/20 border border-sky-400/40 rounded-2xl flex items-center justify-center text-sky-400">
            <Sailboat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">צי כלי השייט ולוח תקלות</h1>
            <p className="text-xs text-sky-200">
              סטטוס זמינות הסירות, הספנות ודיווח תקלות שוטף לכלל חברי המועדון
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReportModal(true)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            דווח על תקלה
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddBoatModal(true)}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-white/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              הוסף כלי שייט
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-200/80 p-1 rounded-2xl font-medium text-xs">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'fleet'
                ? 'bg-white text-sky-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sailboat className="w-3.5 h-3.5" />
            צי הסירות ({boats.length})
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'issues'
                ? 'bg-white text-sky-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            לוח מודעות תקלות ({issues.filter(i => i.status !== 'resolved').length} פתוחות)
          </button>
        </div>

        {activeTab === 'issues' && (
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg ${statusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-600'}`}
            >
              הכל
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-2.5 py-1 rounded-lg ${statusFilter === 'open' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-100 text-slate-600'}`}
            >
              פתוחות
            </button>
            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-2.5 py-1 rounded-lg ${statusFilter === 'resolved' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-100 text-slate-600'}`}
            >
              טופלו
            </button>
          </div>
        )}
      </div>

      {/* Feedback banner */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: Fleet Cards */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {boats.map((boat) => {
            const boatOpenIssues = issues.filter((i) => i.boatId === boat.id && i.status !== 'resolved');

            return (
              <div
                key={boat.id}
                className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs text-right space-y-4 hover:shadow-md transition"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-extrabold text-lg text-slate-900">{boat.name}</h3>
                      <span className="text-xs text-slate-500 font-medium">({boat.model})</span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      {boat.berthLocation || 'מרינה הרצליה'}
                    </p>
                  </div>
                  {getStatusBadge(boat.status)}
                </div>

                {/* Status notes if any */}
                {boat.statusNotes && (
                  <div className={`p-3 rounded-2xl text-xs border ${
                    boat.status === 'maintenance'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : boat.status === 'unavailable'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <span className="font-bold block mb-0.5">הערת מועדון / תחזוקה:</span>
                    <p>{boat.statusNotes}</p>
                  </div>
                )}

                {/* Open issues badge on this boat */}
                {boatOpenIssues.length > 0 && (
                  <div
                    onClick={() => {
                      setActiveTab('issues');
                      setStatusFilter('open');
                    }}
                    className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-300/80 rounded-xl text-xs text-amber-900 cursor-pointer hover:bg-amber-500/20 transition"
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      יש {boatOpenIssues.length} דיווחי תקלות פתוחים לסירה זו
                    </span>
                    <span className="text-[10px] text-amber-700 underline font-semibold">צפה בלוח</span>
                  </div>
                )}

                {/* Footer details */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    קיבולת: עד {boat.capacity || 8} משתתפים
                  </span>

                  {isAdmin && (
                    <button
                      onClick={() => setEditingBoat(boat)}
                      className="text-sky-700 hover:text-sky-900 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      עדכן סטטוס
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Issues Board */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">לוח דיווחי תקלות צי הסירות</h2>
              <p className="text-xs text-slate-500">
                שקיפות מלאה לכל חברי המועדון על מצב הציוד, המנוע והמפרשים
              </p>
            </div>
            <button
              onClick={() => setShowReportModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              דווח על תקלה
            </button>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">אין תקלות מדווחות</h3>
              <p className="text-xs text-slate-500">כל כלי השייט מתוחזקים ותקינים.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`bg-white rounded-3xl p-5 border shadow-xs text-right space-y-3 transition ${
                    issue.status === 'resolved'
                      ? 'border-slate-200/70 opacity-75'
                      : issue.severity === 'critical'
                      ? 'border-rose-300 ring-2 ring-rose-100'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Issue Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-sky-950 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-lg">
                        ⛵ {issue.boatName}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md">
                        {issue.category}
                      </span>
                      {getSeverityBadge(issue.severity)}
                    </div>

                    <div className="flex items-center gap-2">
                      {issue.status === 'resolved' ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          תוקן ונסגר
                        </span>
                      ) : issue.status === 'in_progress' ? (
                        <span className="text-xs font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          בטיפול מוסך / מספנה
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          פתוח - ממתין לטיפול
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">{issue.title}</h4>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {issue.description}
                    </p>
                  </div>

                  {/* Photo if provided */}
                  {issue.photoUrl && (
                    <div className="w-36 h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <img src={issue.photoUrl} alt="תמונת תקלה" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Admin notes if resolved/in progress */}
                  {issue.adminNotes && (
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-700">
                      <span className="font-bold block text-slate-900">הערת מנהל / טיפול:</span>
                      <p>{issue.adminNotes}</p>
                    </div>
                  )}

                  {/* Reporter info & admin action */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <div>
                      דווח ע״י <strong>{issue.reporterName}</strong> ({issue.reporterPhone}) ב-
                      {new Date(issue.createdAt).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    {isAdmin && issue.status !== 'resolved' && (
                      <button
                        onClick={() => handleResolveIssue(issue.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        סמן כתוקן וסגור תקלה
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Report Issue */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleReportSubmit}
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto text-right space-y-4 p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                דיווח תקלה בכלי שייט
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">בחר כלי שייט *</label>
                <select
                  required
                  value={selectedBoatId}
                  onChange={(e) => setSelectedBoatId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {boats.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">תחום התקלה *</label>
                <select
                  value={issueCategory}
                  onChange={(e) => setIssueCategory(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="מנוע">מנוע</option>
                  <option value="מפרשים וחבלים">מפרשים וחבלים</option>
                  <option value="חשמל ואלקטרוניקה">חשמל ואלקטרוניקה</option>
                  <option value="משאבות ושיפוליים">משאבות ושיפוליים</option>
                  <option value="ציוד בטיחות">ציוד בטיחות</option>
                  <option value="גוף סירה וסיפון">גוף סירה וסיפון</option>
                  <option value="אחר">אחר</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">רמת חומרה *</label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'low', label: 'קלה (לא מפריע)' },
                  { id: 'medium', label: 'בינונית' },
                  { id: 'high', label: 'חמורה' },
                  { id: 'critical', label: 'משביתה סירה!' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIssueSeverity(item.id as any)}
                    className={`py-2 px-1 rounded-xl font-bold border transition cursor-pointer text-center ${
                      issueSeverity === item.id
                        ? item.id === 'critical'
                          ? 'bg-rose-600 text-white border-rose-700'
                          : 'bg-sky-600 text-white border-sky-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">כותרת קצרה של התקלה *</label>
              <input
                type="text"
                required
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="למשל: נורת ניווט אדומה שרופה, נזילת מים קלה בכיור..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">פירוט התקלה ונסיבות האירוע</label>
              <textarea
                rows={3}
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
                placeholder="מתי התגלתה התקלה, האם בוצע תיקון שדה זמני, המלצות לטיפול..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>

            {/* Photo upload with compression */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">תמונה של התקלה (אופציונלי)</label>
              <div className="flex items-center gap-3">
                <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-slate-500" />
                  <span>{isCompressing ? 'דוחס תמונה...' : 'צלם / בחר תמונה'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isCompressing}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                {issuePhoto && (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200">
                    <img src={issuePhoto} alt="תצוגה מקדימה" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setIssuePhoto(null)}
                      className="absolute top-0 right-0 bg-black/70 text-white p-0.5 rounded-bl cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={isCompressing || !issueTitle.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                שלח דיווח ללוח התקלות
              </button>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Admin Add Boat */}
      {showAddBoatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleAddBoatSubmit}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto text-right space-y-4 p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sailboat className="w-5 h-5 text-sky-600" />
                הוספת כלי שייט חדש למועדון
              </h3>
              <button
                type="button"
                onClick={() => setShowAddBoatModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">שם כלי השייט *</label>
              <input
                type="text"
                required
                value={newBoatName}
                onChange={(e) => setNewBoatName(e.target.value)}
                placeholder="למשל: ים כחול, גלית, רוח סתיו..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">דגם ויצרן</label>
                <input
                  type="text"
                  value={newBoatModel}
                  onChange={(e) => setNewBoatModel(e.target.value)}
                  placeholder="Bavaria 38 / Beneteau 41..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">קיבולת משתתפים</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={newBoatCapacity}
                  onChange={(e) => setNewBoatCapacity(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">סטטוס התחלתי</label>
                <select
                  value={newBoatStatus}
                  onChange={(e) => setNewBoatStatus(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  <option value="available">זמין להפלגה</option>
                  <option value="maintenance">בהספנה / תיקון</option>
                  <option value="unavailable">לא זמין</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">מיקום רציף / מרינה</label>
                <input
                  type="text"
                  value={newBoatBerth}
                  onChange={(e) => setNewBoatBerth(e.target.value)}
                  placeholder="מרינה הרצליה, רציף B..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">הערות נוספות</label>
              <input
                type="text"
                value={newBoatNotes}
                onChange={(e) => setNewBoatNotes(e.target.value)}
                placeholder="ציוד מיוחד, שנת ייצור, שעות מנוע..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500"
              />
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
      )}

      {/* MODAL 3: Admin Edit Boat Status */}
      {editingBoat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 text-right space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              עדכון סטטוס כלי שייט: {editingBoat.name}
            </h3>
            <p className="text-xs text-slate-500">
              שינוי הסטטוס יתעדכן מיידית לחברי המועדון ובמסך יצירת ההפלגות
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleUpdateBoatStatus(editingBoat, 'available', 'תקינה ומוכנה להפלגות')}
                className={`w-full p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                  editingBoat.status === 'available'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>🟢 זמין להפלגה</span>
                {editingBoat.status === 'available' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const reason = prompt('פירוט עבודות הספנה / תיקון (אופציונלי):', editingBoat.statusNotes || '') || 'בהספנה / טיפול תקופתי';
                  handleUpdateBoatStatus(editingBoat, 'maintenance', reason);
                }}
                className={`w-full p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                  editingBoat.status === 'maintenance'
                    ? 'bg-amber-50 border-amber-400 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>🟠 בהספנה / תיקון</span>
                {editingBoat.status === 'maintenance' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const reason = prompt('סיבת אי-זמינות (אופציונלי):', editingBoat.statusNotes || '') || 'לא זמין להפלגות';
                  handleUpdateBoatStatus(editingBoat, 'unavailable', reason);
                }}
                className={`w-full p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                  editingBoat.status === 'unavailable'
                    ? 'bg-rose-50 border-rose-400 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>🔴 לא זמין</span>
                {editingBoat.status === 'unavailable' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setEditingBoat(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition cursor-pointer"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
