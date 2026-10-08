import React, { useEffect, useState } from 'react';
import { PlayCircle, X, Loader2, Copy, Check, Share2, MessageCircle } from 'lucide-react';
import { store } from '../services/store';
import { isStaff } from '../types';
import { Overlay } from './Overlay';

// The member video is public; the management video sits in private storage and is fetched with a
// short-lived signed link that only admins and assistants can get.
const VIDEOS = {
  member: { title: 'מדריך לחבר מועדון', length: '2:49', src: '/tutorials/member.mp4', poster: '/tutorials/member.jpg' },
  admin: { title: 'מדריך למנהל ולעוזר מנהל', length: '2:53', src: null, poster: '/tutorials/admin.jpg' },
} as const;
type VideoKey = keyof typeof VIDEOS;

/** Link that opens a tutorial straight away: ?video=member (anyone) or ?video=admin (staff, after signing in). */
export const tutorialLink = (key: VideoKey) => `${window.location.origin}/?video=${key}`;

export function tutorialFromUrl(): VideoKey | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('video');
  return v === 'member' || v === 'admin' ? v : null;
}

function shareMessage(key: VideoKey) {
  const club = store.getSettings()?.clubName || 'מועדון השייט';
  const v = VIDEOS[key];
  return key === 'admin'
    ? `🎬 סרטון הדרכה למנהלים ולעוזרי מנהל – ${club} (${v.length} דק')\nנפתח אחרי התחברות כמנהל או עוזר מנהל: ${tutorialLink(key)}`
    : `🎬 סרטון הדרכה: איך משתמשים באפליקציית ${club} ⛵ (${v.length} דק')\n${tutorialLink(key)}`;
}

/** Send a tutorial's link: WhatsApp, the phone's share sheet, or copy. */
const ShareTutorial: React.FC<{ videoKey: VideoKey }> = ({ videoKey }) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = shareMessage(videoKey);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`ההעתקה נחסמה בדפדפן. הקישור: ${tutorialLink(videoKey)}`);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: VIDEOS[videoKey].title, text: message });
    } catch {
      // closed the share sheet
    }
  };

  const btn = 'py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition';
  return (
    <div className="shrink-0 px-3 pt-3 pb-2 space-y-2 border-t border-slate-200/70">
      <p className="text-xs font-bold text-slate-700">שליחת הסרטון בקישור</p>
      <div className="flex gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} flex-1 bg-emerald-600 hover:bg-emerald-700 text-white`}
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          וואטסאפ
        </a>
        <button type="button" onClick={copy} className={`${btn} flex-1 bg-white/70 border border-slate-200 hover:bg-white text-slate-800`}>
          {copied ? <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          {copied ? 'הועתק!' : 'העתק קישור'}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={`${btn} bg-white/70 border border-slate-200 hover:bg-white text-slate-800`}>
            <Share2 className="w-4 h-4" aria-hidden="true" />
            שתף
          </button>
        )}
      </div>
      {videoKey === 'admin' && (
        <p className="text-[0.6875rem] text-slate-500">הסרטון נפתח רק למנהלים ולעוזרי מנהל מחוברים. חברים רגילים יראו את סרטון החברים.</p>
      )}
      {error && (
        <p role="alert" className="text-[0.6875rem] text-rose-700 break-all">
          {error}
        </p>
      )}
    </div>
  );
};

/** The tutorials window. Easy to close: Escape, the phone's Back button, tapping outside, or the big button. */
const TutorialVideosWindow: React.FC<{ keys: VideoKey[]; initial: VideoKey; notice?: string; onClose: () => void }> = ({
  keys,
  initial,
  notice,
  onClose,
}) => {
  const [current, setCurrent] = useState<VideoKey>(initial);
  const [adminUrl, setAdminUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const withAdmin = keys.includes('admin');

  useEffect(() => {
    if (!withAdmin) return;
    let alive = true;
    store.getStaffTutorialUrl().then((url) => alive && setAdminUrl(url));
    return () => {
      alive = false;
    };
  }, [withAdmin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.history.pushState({ tutorials: true }, '');
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onClose);
      // Closed by a button rather than Back: drop the history entry we added
      if (window.history.state?.tutorials) window.history.back();
    };
  }, []);

  const src = current === 'admin' ? adminUrl : VIDEOS[current].src;

  return (
    <Overlay>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorials-title"
        className="fixed inset-0 z-[60] flex items-center justify-center glass-backdrop p-3"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md glass-sheet rounded-3xl overflow-hidden text-right flex flex-col max-h-[94vh]"
        >
          <div className="bg-sky-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <h2 id="tutorials-title" className="font-bold flex items-center gap-2">
              <PlayCircle className="w-5 h-5" aria-hidden="true" />
              סרטוני הדרכה
            </h2>
            <button
              onClick={onClose}
              aria-label="סגור את סרטוני ההדרכה"
              className="w-10 h-10 -m-1 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {notice && <p className="shrink-0 bg-amber-50 text-amber-900 text-xs font-semibold px-4 py-2">{notice}</p>}

          {keys.length > 1 && (
            <div className="flex gap-1 p-2 bg-slate-100 text-xs font-semibold shrink-0">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => setCurrent(k)}
                  aria-pressed={current === k}
                  className={`flex-1 py-2 rounded-xl cursor-pointer ${current === k ? 'bg-white text-sky-900 font-bold shadow-2xs' : 'text-slate-600'}`}
                >
                  {VIDEOS[k].title} ({VIDEOS[k].length})
                </button>
              ))}
            </div>
          )}

          <div className="bg-black flex-1 min-h-0 flex items-center justify-center min-h-56">
            {src ? (
              <video
                key={`${current}-${src}`}
                src={src}
                poster={VIDEOS[current].poster}
                controls
                playsInline
                preload="metadata"
                className="max-h-[58vh] w-auto max-w-full"
                aria-label={VIDEOS[current].title}
              />
            ) : src === undefined ? (
              <Loader2 className="w-8 h-8 text-white/70 animate-spin" aria-label="טוען" />
            ) : (
              <p className="text-white/80 text-sm p-6 text-center">סרטון ההנהלה אינו זמין כרגע. נסו שוב מאוחר יותר.</p>
            )}
          </div>

          <ShareTutorial videoKey={current} />

          <button
            onClick={onClose}
            className="shrink-0 w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            סגור
          </button>
        </div>
      </div>
    </Overlay>
  );
};

/** "סרטוני הדרכה" button + window. Staff also get the management video. */
export const TutorialVideosButton: React.FC<{ staff?: boolean; className?: string }> = ({ staff, className }) => {
  const [open, setOpen] = useState(false);
  const keys: VideoKey[] = staff ? ['admin', 'member'] : ['member'];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'w-full glass rounded-3xl p-4 flex items-center gap-3 text-right hover:border-sky-300 cursor-pointer'
        }
      >
        <PlayCircle className="w-8 h-8 text-sky-600 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-bold text-slate-900 text-sm">סרטוני הדרכה</span>
          <span className="block text-xs text-slate-500">
            {staff ? 'איך מנהלים את המועדון באפליקציה, ואיך החברים משתמשים בה' : 'איך נרשמים להפלגות, מבקשים קרדיטים ועוד'}
          </span>
        </span>
      </button>

      {open && <TutorialVideosWindow keys={keys} initial={keys[0]} onClose={() => setOpen(false)} />}
    </>
  );
};

/**
 * Opens the tutorial a shared link points to (?video=…), on any screen. The member video plays even
 * before signing in; the management video waits for sign-in and only opens for admins and assistants.
 */
export const TutorialLinkOpener: React.FC = () => {
  const [wanted, setWanted] = useState<VideoKey | null>(tutorialFromUrl);
  const [urlCleaned, setUrlCleaned] = useState(false);
  const [, setTick] = useState(0);

  // Take ?video= out of the address first (so a reload doesn't reopen it), then open the window,
  // whose Back-button handling adds its own history entry
  useEffect(() => {
    if (tutorialFromUrl()) {
      const url = new URL(window.location.href);
      url.searchParams.delete('video');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    setUrlCleaned(true);
  }, []);

  // Re-check after sign-in
  useEffect(() => (wanted ? store.subscribe(() => setTick((t) => t + 1)) : undefined), [wanted]);

  if (!wanted || !urlCleaned || store.isLoading()) return null;
  const user = store.getCurrentUser();
  if (wanted === 'admin' && !user) return null; // the sign-in screen shows first
  const staff = !!user && user.status === 'approved' && isStaff(user.role);
  const keys: VideoKey[] = staff ? ['admin', 'member'] : ['member'];
  const notice =
    wanted === 'admin' && !staff ? 'סרטון ההנהלה זמין למנהלים ולעוזרי מנהל בלבד. הנה סרטון ההדרכה לחברי המועדון.' : undefined;
  return (
    <TutorialVideosWindow
      keys={keys}
      initial={wanted === 'admin' && staff ? 'admin' : 'member'}
      notice={notice}
      onClose={() => setWanted(null)}
    />
  );
};
