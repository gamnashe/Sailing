import React, { useEffect, useState } from 'react';
import { PlayCircle, X, Loader2 } from 'lucide-react';
import { store } from '../services/store';

// The member video is public; the management video sits in private storage and is fetched with a
// short-lived signed link that only admins and assistants can get.
const VIDEOS = {
  member: { title: 'מדריך לחבר מועדון', length: '2:21', src: '/tutorials/member.mp4', poster: '/tutorials/member.jpg' },
  admin: { title: 'מדריך למנהל ולעוזר מנהל', length: '2:34', src: null, poster: '/tutorials/admin.jpg' },
} as const;
type VideoKey = keyof typeof VIDEOS;

/** "סרטוני הדרכה" button + window. Staff also get the management video. */
export const TutorialVideosButton: React.FC<{ staff?: boolean; className?: string }> = ({ staff, className }) => {
  const [open, setOpen] = useState(false);
  const keys: VideoKey[] = staff ? ['admin', 'member'] : ['member'];
  const [current, setCurrent] = useState<VideoKey>(keys[0]);
  const [adminUrl, setAdminUrl] = useState<string | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    if (!open || !staff || adminUrl) return;
    let alive = true;
    store.getStaffTutorialUrl().then((url) => alive && setAdminUrl(url));
    return () => {
      alive = false;
    };
  }, [open, staff, adminUrl]);

  const src = current === 'admin' ? adminUrl : VIDEOS[current].src;

  // Easy to close: Escape, the phone's Back button, tapping outside, or the big button at the bottom
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.history.pushState({ tutorials: true }, '');
    const onBack = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onBack);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onBack);
      // Closed by a button rather than Back: drop the history entry we added
      if (window.history.state?.tutorials) window.history.back();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCurrent(keys[0]);
          setOpen(true);
        }}
        className={
          className ??
          'w-full bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3 text-right hover:border-sky-300 cursor-pointer'
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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorials-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl text-right flex flex-col max-h-[94vh]"
          >
            <div className="bg-sky-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
              <h2 id="tutorials-title" className="font-bold flex items-center gap-2">
                <PlayCircle className="w-5 h-5" aria-hidden="true" />
                סרטוני הדרכה
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="סגור את סרטוני ההדרכה"
                className="w-10 h-10 -m-1 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

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

            <div className="bg-black flex-1 min-h-0 flex items-center justify-center min-h-64">
              {src ? (
                <video
                  key={`${current}-${src}`}
                  src={src}
                  poster={VIDEOS[current].poster}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[70vh] w-auto max-w-full"
                  aria-label={VIDEOS[current].title}
                />
              ) : src === undefined ? (
                <Loader2 className="w-8 h-8 text-white/70 animate-spin" aria-label="טוען" />
              ) : (
                <p className="text-white/80 text-sm p-6 text-center">סרטון ההנהלה אינו זמין כרגע. נסו שוב מאוחר יותר.</p>
              )}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="shrink-0 w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
};
