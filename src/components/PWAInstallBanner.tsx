import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, X, Smartphone, CheckCircle } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // If already installed or dismissed, hide
  if (isInstalled || dismissed) {
    return null;
  }

  // If neither installable nor iOS, return null
  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 p-1 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold leading-tight">התקן את האפליקציה למסך הבית</p>
            <p className="text-xs text-sky-100">גישה מהירה, מסך מלא והתראות בזמן אמת בלי חנות אפליקציות</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isInstallable && (
            <button
              onClick={install}
              className="bg-white text-sky-800 hover:bg-sky-50 font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              התקן עכשיו
            </button>
          )}

          {isIOS && (
            <button
              onClick={() => setShowIOSModal(true)}
              className="bg-white/20 hover:bg-white/30 text-white font-medium px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Share className="w-3.5 h-3.5" />
              התקנה ב-iPhone
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/10 rounded-full text-sky-200 hover:text-white cursor-pointer"
            title="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-slate-800 text-right animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sky-600" />
                התקנה ב-iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 my-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <p>
                  לחץ על כפתור <strong>השיתוף (Share)</strong> בתחתית מסך Safari בדפדפן (סמל ריבוע עם חץ כלפי מעלה).
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <p>
                  גלול מטה בתפריט ובחר באפשרות <strong>״הוסף למסך הבית״ (Add to Home Screen)</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <p>
                  לחץ על <strong>״הוסף״ (Add)</strong> בפינה העליונה. האפליקציה תופיע במסך הבית שלכם כאפליקציה מלאה!
                </p>
              </div>
            </div>

            <div className="bg-sky-50 rounded-xl p-3 text-xs text-sky-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
              <span>תומך בעבודה מלאה, קבלת התראות וטעינה מהירה.</span>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full rounded-xl bg-sky-600 hover:bg-sky-700 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-98 cursor-pointer"
            >
              הבנתי, תודה
            </button>
          </div>
        </div>
      )}
    </>
  );
};
