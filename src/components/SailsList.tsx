import React, { useState } from 'react';
import { store } from '../services/store';
import { Sail, UserProfile } from '../types';
import { SailsCalendar } from './SailsCalendar';
import {
  Calendar,
  Clock,
  MapPin,
  Anchor,
  Compass,
  Users,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Filter,
  History,
  Sailboat,
  Coins,
  CheckCircle2
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  onSelectSail: (sailId: string) => void;
  onOpenCreateModal: () => void;
}

export const SailsList: React.FC<Props> = ({ currentUser, onSelectSail, onOpenCreateModal }) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'calendar' | 'archive'>('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const settings = store.getSettings();
  const allSails = store.getSails();

  const today = new Date().toISOString().split('T')[0];

  // Distinguish upcoming vs past/archive
  const upcomingSails = allSails.filter(s => s.status !== 'completed' && s.date >= today);
  const archiveSails = allSails.filter(s => s.status === 'completed' || s.date < today);

  const displayList = activeTab === 'upcoming' ? upcomingSails : archiveSails;

  const filteredSails = displayList.filter(s => {
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.boatName.toLowerCase().includes(q) ||
      s.skipperName.toLowerCase().includes(q) ||
      s.departurePoint.toLowerCase().includes(q)
    );
  });

  const canCreateSail =
    currentUser.role === 'admin' ||
    (settings.whoCanCreateSails === 'all_members' && currentUser.status === 'approved');

  return (
    <div className="space-y-4">
      {/* Top action & search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Tabs: Calendar / Upcoming / Archive */}
        <div className="flex bg-slate-200/80 p-1 rounded-2xl w-full sm:w-auto font-medium text-xs">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'calendar'
                ? 'bg-white text-sky-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            לוח שנה
          </button>

          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'upcoming'
                ? 'bg-white text-sky-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sailboat className="w-3.5 h-3.5" />
            הפלגות קרובות ({upcomingSails.length})
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'archive'
                ? 'bg-white text-sky-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            ארכיון ({archiveSails.length})
          </button>
        </div>

        <div className="flex gap-2">
          {activeTab !== 'calendar' && (
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש לפי סירה, סקיפר, כותרת..."
                className="w-full bg-white border border-slate-200 rounded-2xl py-2 px-3 text-xs pr-8 focus:ring-2 focus:ring-sky-500 shadow-xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            </div>
          )}

          {/* Create sail button */}
          {canCreateSail && (
            <button
              onClick={onOpenCreateModal}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-sm shadow-sky-600/20 transition active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>הפלגה חדשה</span>
            </button>
          )}
        </div>
      </div>

      {/* Calendar View */}
      {activeTab === 'calendar' && (
        <SailsCalendar
          currentUser={currentUser}
          onSelectSail={onSelectSail}
          onOpenCreateModal={onOpenCreateModal}
        />
      )}

      {/* Sails Grid / List */}
      {activeTab !== 'calendar' && filteredSails.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mx-auto">
            <Sailboat className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">
            {activeTab === 'upcoming' ? 'אין כרגע הפלגות קרובות מתוכננות' : 'אין הפלגות בארכיון'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === 'upcoming'
              ? 'חברי המועדון והסקיפרים פותחים הפלגות באופן שוטף. חזרו לבדוק בקרוב או פתחו הפלגה חדשה!'
              : 'הפלגות שהסתיימו יוצגו כאן עם תמונות ויומן מסע.'}
          </p>
          {canCreateSail && activeTab === 'upcoming' && (
            <button
              onClick={onOpenCreateModal}
              className="mt-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              פתח הפלגת מועדון ראשונה
            </button>
          )}
        </div>
      ) : activeTab !== 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredSails.map((sail) => {
            const confirmedMembers = store.getConfirmedParticipants(sail.id);
            const waitlist = store.getWaitlistParticipants(sail.id);
            const isFull = confirmedMembers.length >= sail.maxParticipants;
            const userReg = store.getUserRegistrationForSail(sail.id, currentUser.id);
            const isUserConfirmed = userReg?.status === 'confirmed';
            const isUserWaitlist = userReg?.status === 'waitlist';
            const isClub = sail.sailType === 'club';
            const isClubGuaranteed = isClub && confirmedMembers.length >= 3;

            return (
              <div
                key={sail.id}
                onClick={() => onSelectSail(sail.id)}
                className="bg-white hover:bg-sky-50/20 border border-slate-200/80 hover:border-sky-300 rounded-3xl p-5 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between text-right group relative overflow-hidden"
              >
                {/* Visual side accent border */}
                <div
                  className={`absolute top-0 bottom-0 right-0 w-1.5 ${
                    isUserConfirmed
                      ? 'bg-emerald-500'
                      : isUserWaitlist
                      ? 'bg-amber-500'
                      : sail.status === 'cancelled'
                      ? 'bg-rose-500'
                      : isClub
                      ? 'bg-sky-500'
                      : 'bg-indigo-500'
                  }`}
                />

                <div>
                  {/* Top tags */}
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          isClub
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {isClub ? '⛵ הפלגת מועדון' : '🚤 הפלגה פרטית'}
                      </span>

                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md truncate max-w-36">
                        {sail.boatName}
                      </span>
                    </div>

                    {/* Status badges */}
                    {sail.status === 'cancelled' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        בוטלה
                      </span>
                    ) : sail.status === 'closed' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        סגורה
                      </span>
                    ) : isUserConfirmed ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        אתה רשום!
                      </span>
                    ) : isUserWaitlist ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        ממתין #{userReg?.waitlistPosition}
                      </span>
                    ) : isFull ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        הפלגה מלאה
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        פתוחה להרשמה
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-sky-700 transition mb-2">
                    {sail.title}
                  </h3>

                  {/* Sailing Cost & Rules Banner */}
                  <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1 font-semibold text-amber-800">
                      <Coins className="w-3.5 h-3.5 text-amber-600" />
                      {isClub ? '1 קרדיט למשתתף' : `${sail.creditCost || 3} קרדיטים (${sail.durationHours || 3} שעות)`}
                    </span>

                    {isClub ? (
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${
                        isClubGuaranteed ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        {isClubGuaranteed ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            יציאה מובטחת (3+ נרשמו)
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            מינימום 3 לסגירה ויציאה (חסרים {3 - confirmedMembers.length})
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-indigo-700">
                        הפלגה פרטית נעולה
                      </span>
                    )}
                  </div>

                  {/* Key metadata grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-4 bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="font-semibold text-slate-800">{sail.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>
                        {sail.departureTime} - {sail.estimatedReturnTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="truncate">סקיפר: {sail.skipperName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="truncate">{sail.departurePoint}</span>
                    </div>
                  </div>
                </div>

                {/* Footer: Capacity counter & Crew Avatars */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {/* Avatars */}
                  <div className="flex items-center -space-x-1.5 space-x-reverse overflow-hidden">
                    {confirmedMembers.slice(0, 4).map((member) => (
                      <img
                        key={member.id}
                        src={member.avatar}
                        alt={member.fullName}
                        title={member.fullName}
                        className="w-6 h-6 rounded-full border-2 border-white object-cover"
                      />
                    ))}
                    {confirmedMembers.length > 4 && (
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center border-2 border-white">
                        +{confirmedMembers.length - 4}
                      </div>
                    )}
                    {confirmedMembers.length === 0 && (
                      <span className="text-[11px] text-slate-400">טרם נרשמו משתתפים</span>
                    )}
                  </div>

                  {/* Seat counter indicator */}
                  <div className="flex items-center gap-1.5 font-bold">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className={isFull ? 'text-amber-700 font-black' : 'text-slate-800'}>
                      {confirmedMembers.length}/{sail.maxParticipants} משתתפים
                    </span>
                    {waitlist.length > 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                        +{waitlist.length} בהמתנה
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
