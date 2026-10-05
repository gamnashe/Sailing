import React, { useState } from 'react';
import { store } from '../services/store';
import { Sail, UserProfile, isStaff } from '../types';
import { compressImage } from '../utils/imageCompression';
import { useForecast, forecastAt, weatherLabel, windFrom, sailingConditions, CONDITIONS_STYLE } from '../services/weather';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Anchor,
  Compass,
  Users,
  AlertCircle,
  CheckCircle,
  Phone,
  MessageCircle,
  UserPlus,
  Trash2,
  Camera,
  Image as ImageIcon,
  Lock,
  Unlock,
  AlertTriangle
} from 'lucide-react';

interface Props {
  sailId: string | null;
  currentUser: UserProfile;
  onClose: () => void;
  onUpdate: () => void;
}

export const SailDetailModal: React.FC<Props> = ({ sailId, currentUser, onClose, onUpdate }) => {
  if (!sailId) return null;

  const sail = store.getSailById(sailId);
  const settings = store.getSettings();
  if (!sail) return null;

  const confirmedMembers = store.getConfirmedParticipants(sail.id);
  const waitlistMembers = store.getWaitlistParticipants(sail.id);
  const userRegistration = store.getUserRegistrationForSail(sail.id, currentUser.id);
  const isConfirmed = userRegistration?.status === 'confirmed';
  const isWaitlisted = userRegistration?.status === 'waitlist';
  const isAdmin = isStaff(currentUser.role);

  const forecast = useForecast();
  const departureForecast = forecastAt(forecast, sail.date, sail.departureTime);
  const returnForecast = forecastAt(forecast, sail.date, sail.estimatedReturnTime);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelSailModal, setShowCancelSailModal] = useState(false);
  const [cancelSailReason, setCancelSailReason] = useState('');
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const availableMembers = store.getUsers().filter(
    (u) =>
      u.status === 'approved' &&
      !confirmedMembers.some((c) => c.id === u.id) &&
      !waitlistMembers.some((w) => w.user.id === u.id)
  );

  const handleJoin = async () => {
    setActionMessage(null);
    const res = await store.joinSail(sail.id, currentUser.id);
    setActionMessage({
      text: res.message,
      type: res.success ? 'success' : 'error',
    });
    onUpdate();
  };

  const handleCancelRegistration = async () => {
    setActionMessage(null);
    const res = await store.cancelRegistration(sail.id, currentUser.id, isAdmin);
    setActionMessage({
      text: res.message,
      type: res.success ? 'success' : 'error',
    });
    setShowCancelConfirm(false);
    onUpdate();
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberToAdd) return;
    const res = await store.addParticipantManually(sail.id, selectedMemberToAdd);
    setActionMessage({
      text: res.message,
      type: res.success ? 'success' : 'error',
    });
    setShowManualAddModal(false);
    setSelectedMemberToAdd('');
    onUpdate();
  };

  const handleManualRemove = async (userId: string, memberName: string) => {
    if (!confirm(`האם להסיר את ${memberName} מההפלגה?`)) return;
    const res = await store.removeParticipantManually(sail.id, userId);
    setActionMessage({
      text: res.message,
      type: res.success ? 'success' : 'error',
    });
    onUpdate();
  };

  const handleToggleSailStatus = async () => {
    const newStatus = sail.status === 'open' ? 'closed' : 'open';
    await store.editSail(sail.id, { status: newStatus });
    setActionMessage({
      text: newStatus === 'open' ? 'ההרשמה נפתחה מחדש' : 'ההרשמה ננעלה',
      type: 'success',
    });
    onUpdate();
  };

  const handleCancelSailByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.cancelSail(sail.id, cancelSailReason.trim(), currentUser.fullName);
    setShowCancelSailModal(false);
    setActionMessage({
      text: 'ההפלגה בוטלה בהצלחה וכל המשתתפים קיבלו התראה',
      type: 'success',
    });
    onUpdate();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i]);
        await store.addSailPhoto(sail.id, compressed, photoCaption, currentUser.id);
      }
      setPhotoCaption('');
      setActionMessage({ text: 'התמונות הועלו בהצלחה!', type: 'success' });
      onUpdate();
    } catch {
      setActionMessage({ text: 'שגיאה בהעלאת התמונה', type: 'error' });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const isFull = confirmedMembers.length >= sail.maxParticipants;
  const occupancyPercentage = Math.min(100, Math.round((confirmedMembers.length / sail.maxParticipants) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto text-right flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-900 via-sky-800 to-sky-700 p-5 text-white flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-white/20 text-white backdrop-blur-xs">
                {sail.boatName}
              </span>
              {sail.status === 'cancelled' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/90 text-white">
                  הפלגה בוטלה
                </span>
              )}
              {sail.status === 'closed' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/90 text-white">
                  הרשמה נעולה
                </span>
              )}
              {sail.status === 'completed' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-600/90 text-white">
                  הפלגה בארכיון
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold leading-snug">{sail.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action feedback banner */}
        {actionMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100'
                : 'bg-rose-50 text-rose-800 border-b border-rose-100'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Sail Key Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-sky-50/60 rounded-2xl p-4 border border-sky-100/80 text-xs">
            <div className="space-y-1">
              <span className="text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-sky-600" /> תאריך
              </span>
              <p className="font-bold text-slate-900 text-sm">{sail.date}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-600" /> שעות
              </span>
              <p className="font-bold text-slate-900 text-sm">
                {sail.departureTime} - {sail.estimatedReturnTime}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-sky-600" /> סקיפר
              </span>
              <p className="font-bold text-slate-900 text-sm truncate">{sail.skipperName}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-600" /> נקודת יציאה
              </span>
              <p className="font-bold text-slate-900 text-sm truncate">{sail.departurePoint}</p>
            </div>
          </div>

          {/* Sea & wind forecast for the sail window */}
          {departureForecast && (() => {
            const peakWind = Math.max(departureForecast.wind, returnForecast?.wind ?? 0);
            const peakGust = Math.max(departureForecast.gust, returnForecast?.gust ?? 0);
            const peakWave = Math.max(departureForecast.wave ?? 0, returnForecast?.wave ?? 0) || departureForecast.wave;
            const cond = CONDITIONS_STYLE[sailingConditions(peakWind, peakGust, peakWave)];
            const w = weatherLabel(departureForecast.weatherCode);
            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-slate-900 text-sm">תחזית ים ורוח בזמן ההפלגה</span>
                  <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${cond.className}`}>{cond.label}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-slate-500">מזג אוויר</div>
                    <div className="font-bold text-slate-900">{w.icon} {w.label}, {Math.round(departureForecast.temp)}°</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-slate-500">רוח</div>
                    <div className="font-bold text-slate-900">
                      {Math.round(departureForecast.wind)}
                      {returnForecast && returnForecast.time !== departureForecast.time ? `→${Math.round(returnForecast.wind)}` : ''} קשר מ{windFrom(departureForecast.windDir)}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-slate-500">משבים</div>
                    <div className="font-bold text-slate-900">עד {Math.round(peakGust)} קשר</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-slate-500">גובה גלים</div>
                    <div className="font-bold text-slate-900">
                      {departureForecast.wave !== null ? `${departureForecast.wave.toFixed(1)} מ'` : 'אין עדיין תחזית'}
                      {departureForecast.wavePeriod ? <span className="text-slate-500 font-normal"> · מחזור {Math.round(departureForecast.wavePeriod)} ש'</span> : null}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  לפי Open-Meteo לשעות {sail.departureTime}–{sail.estimatedReturnTime}. התחזית מתעדכנת כל שעה; החלטת יציאה נשארת בידי הסקיפר.
                </p>
              </div>
            );
          })()}

          {/* Sail Type, Credit Rule & Readiness Status Banner */}
          {sail.sailType === 'club' ? (
            <div className="p-3.5 rounded-2xl bg-white border border-sky-200/90 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sky-950 flex items-center gap-1.5 text-sm">
                  ⛵ הפלגת מועדון (השתתפות: 1 קרדיט)
                </span>
                <span className="bg-sky-100 text-sky-900 font-bold px-2 py-0.5 rounded-md text-[11px]">
                  מינימום 3 | מקסימום 6 משתתפים
                </span>
              </div>

              {confirmedMembers.length >= 3 ? (
                <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 font-bold text-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ההפלגה סגורה ומובטחת ליציאה לים! ({confirmedMembers.length}/6 חברים נרשמו)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    ממתין ל-{3 - confirmedMembers.length} חברים נוספים להבטחת יציאת ההפלגה (דרוש מינימום 3 משתתפים)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 shadow-2xs space-y-1.5 text-xs text-indigo-950">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-sm">
                  🚤 הפלגה פרטית
                </span>
                <span className="bg-amber-100 text-amber-900 font-black px-2.5 py-0.5 rounded-md border border-amber-300">
                  {sail.creditCost || 3} קרדיטים ({sail.durationHours || 3} שעות)
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                הפלגה זו הוזמנה ע״י {sail.creatorName} (מינימום 3 שעות = 3 קרדיטים + 1 קרדיט לכל שעה נוספת).
              </p>
            </div>
          )}

          {/* Cancellation reason if cancelled */}
          {sail.status === 'cancelled' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> ההפלגה בוטלה
              </p>
              <p>סיבת הביטול: {sail.cancellationReason || 'לא נמסרה סיבה'}</p>
            </div>
          )}

          {/* Notes */}
          {sail.notes && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-900 block mb-1">הערות ודגשים לסקיפר ולצוות:</span>
              <p className="whitespace-pre-line">{sail.notes}</p>
            </div>
          )}

          {/* Capacity & Participants Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-700" />
                <h3 className="font-bold text-slate-900 text-sm">
                  משתתפים מאושרים ({confirmedMembers.length} / {sail.maxParticipants})
                </h3>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  isFull ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isFull ? 'הפלגה מלאה' : `${sail.maxParticipants - confirmedMembers.length} מקומות פנויים`}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isFull ? 'bg-amber-500' : 'bg-sky-600'
                }`}
                style={{ width: `${occupancyPercentage}%` }}
              />
            </div>

            {/* Confirmed List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {confirmedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200/60 transition text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={member.avatar}
                      alt={member.fullName}
                      className="w-8 h-8 rounded-full object-cover border border-slate-200"
                    />
                    <div>
                      <p className="font-bold text-slate-900 flex items-center gap-1">
                        {member.fullName}
                        {member.id === sail.skipperId && (
                          <span className="text-[10px] bg-sky-100 text-sky-800 font-semibold px-1.5 py-0.2 rounded-md">
                            סקיפר
                          </span>
                        )}
                        {member.id === currentUser.id && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.2 rounded-md">
                            אתה
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500">{member.experienceLevel}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Quick WhatsApp / Phone contact for boat members */}
                    <a
                      href={`https://wa.me/972${member.phone.replace(/[^0-9]/g, '').slice(-9)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="שלח וואטסאפ"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`tel:${member.phone}`}
                      className="p-1 text-slate-600 hover:bg-slate-200 rounded-lg transition"
                      title="התקשר"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>

                    {/* Admin remove button */}
                    {isAdmin && member.id !== sail.skipperId && (
                      <button
                        onClick={() => handleManualRemove(member.id, member.fullName)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="הסר מההפלגה"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Waitlist Section */}
            {waitlistMembers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    רשימת המתנה ({waitlistMembers.length} ממתינים)
                  </span>
                  <span className="text-[10px] text-slate-500">עולים אוטומטית לפי סדר ברגע שמישהו מבטל</span>
                </div>

                <div className="space-y-1.5">
                  {waitlistMembers.map(({ user, position }) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-[10px]">
                          {position}
                        </span>
                        <img src={user.avatar} alt={user.fullName} className="w-6 h-6 rounded-full object-cover" />
                        <span className="font-medium text-slate-900">
                          {user.fullName} {user.id === currentUser.id && '(אתה)'}
                        </span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleManualRemove(user.id, user.fullName)}
                          className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                          title="הסר מההמתנה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Photo Gallery of this sail */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-700" />
                גלריית תמונות מההפלגה ({sail.photos.length})
              </h3>

              <label className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold px-3 py-1.5 rounded-xl cursor-pointer transition flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                {isUploadingPhoto ? 'מעבד תמונה...' : 'הוסף תמונות'}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={isUploadingPhoto}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            {sail.photos.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                עדיין אין תמונות מהפלגה זו. חברי הצוות מוזמנים להעלות תמונות!
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sail.photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden aspect-4/3 bg-slate-100">
                    <img src={photo.url} alt={photo.caption || 'תמונת הפלגה'} className="w-full h-full object-cover" />
                    {photo.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-white text-[10px] truncate">
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Toolbar */}
          {isAdmin && (
            <div className="bg-slate-100/90 rounded-2xl p-3.5 border border-slate-200 text-xs space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>🛡️ כלי ניהול הפלגה (מנהל מועדון)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualAddModal(true)}
                  className="bg-white hover:bg-slate-50 text-slate-800 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-sky-600" />
                  הוסף חבר ידנית
                </button>

                <button
                  type="button"
                  onClick={handleToggleSailStatus}
                  className="bg-white hover:bg-slate-50 text-slate-800 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {sail.status === 'open' ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-600" /> סגור הרשמה להפלגה
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-600" /> פתח הרשמה
                    </>
                  )}
                </button>

                {sail.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelSailModal(true)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3 py-1.5 rounded-xl border border-rose-200 transition flex items-center gap-1.5 cursor-pointer mr-auto"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    בטל הפלגה והודע לכולם
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
          {sail.status === 'cancelled' ? (
            <div className="text-center text-xs text-rose-700 font-bold py-2 bg-rose-50 rounded-xl">
              הפלגה זו בוטלה ולא ניתן להירשם אליה.
            </div>
          ) : isConfirmed ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-xs text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                אתה רשום כמשתתף מאושר בהפלגה זו!
              </div>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                בטל השתתפות
              </button>
            </div>
          ) : isWaitlisted ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                הנך ברשימת ההמתנה (מקום {userRegistration?.waitlistPosition})
              </div>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                בטל המתנה
              </button>
            </div>
          ) : sail.status === 'closed' ? (
            <div className="text-center text-xs text-amber-800 font-bold py-2 bg-amber-50 rounded-xl">
              ההרשמה להפלגה זו נעולה כעת ע״י המועדון.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                isFull
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
              }`}
            >
              <Anchor className="w-4 h-4" />
              {isFull ? `ההפלגה מלאה — הירשם לרשימת המתנה (#${waitlistMembers.length + 1})` : 'הצטרף להפלגה בלחיצה אחת ⛵'}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for user cancellation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-right">
            <h3 className="text-lg font-bold text-slate-900 mb-2">ביטול השתתפות בהפלגה</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              האם אתה בטוח שברצונך לבטל את השתתפותך בהפלגה זו?
              {isConfirmed && waitlistMembers.length > 0 && (
                <span className="block mt-2 font-bold text-emerald-700">
                  הערה: מקומך יועבר מיידית לחבר הראשון ברשימת ההמתנה ({waitlistMembers[0].user.fullName}).
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelRegistration}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                אישור ביטול
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                חזור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Cancel Entire Sail Modal */}
      {showCancelSailModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCancelSailByAdmin} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-right">
            <h3 className="text-lg font-bold text-rose-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              ביטול הפלגה ושליחת התראה
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              כל הנרשמים והממתינים יקבלו התראת ביטול דחופה. אנא ציין סיבה (למשל: תנאי מזג אוויר ורוחות עזות, תקלת מנוע, וכו׳):
            </p>
            <textarea
              required
              rows={3}
              value={cancelSailReason}
              onChange={(e) => setCancelSailReason(e.target.value)}
              placeholder="סיבת ביטול..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                בטל הפלגה עכשיו
              </button>
              <button
                type="button"
                onClick={() => setShowCancelSailModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                סגור
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Manual Add Modal */}
      {showManualAddModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleManualAdd} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-right">
            <h3 className="text-base font-bold text-slate-900 mb-2">הוספת חבר מועדון ידנית להפלגה</h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">בחר חבר מהמועדון:</label>
              <select
                required
                value={selectedMemberToAdd}
                onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                <option value="">-- בחר חבר מועדון --</option>
                {availableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.phone}) - {m.experienceLevel}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                הוסף להפלגה
              </button>
              <button
                type="button"
                onClick={() => setShowManualAddModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs cursor-pointer transition"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
