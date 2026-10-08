import React, { useEffect, useRef, useState } from 'react';
import {
  Accessibility,
  X,
  Type,
  Contrast,
  SunMoon,
  Palette,
  Link2,
  BookOpen,
  AlignJustify,
  PauseCircle,
  MousePointer2,
  RotateCcw,
  FileText,
  Minus,
  Plus,
} from 'lucide-react';
import {
  AccessibilitySettings,
  DEFAULT_ACCESSIBILITY,
  TEXT_SCALES,
  isDefaultAccessibility,
  useAccessibility,
} from '../services/accessibility';
import { store } from '../services/store';

type ToggleKey = Exclude<keyof AccessibilitySettings, 'textScale'>;

const TOGGLES: { key: ToggleKey; label: string; icon: React.ElementType }[] = [
  { key: 'highContrast', label: 'ניגודיות גבוהה', icon: Contrast },
  { key: 'invertColors', label: 'מצב כהה (היפוך צבעים)', icon: SunMoon },
  { key: 'grayscale', label: 'גווני אפור', icon: Palette },
  { key: 'highlightLinks', label: 'הדגשת קישורים וכפתורים', icon: Link2 },
  { key: 'readableFont', label: 'גופן קריא', icon: BookOpen },
  { key: 'textSpacing', label: 'ריווח טקסט', icon: AlignJustify },
  { key: 'stopAnimations', label: 'עצירת אנימציות', icon: PauseCircle },
  { key: 'bigCursor', label: 'סמן עכבר גדול', icon: MousePointer2 },
];

const SCALE_LABELS = ['רגיל', 'גדול', 'גדול מאוד', 'ענק'];

/** Floating accessibility button + menu, shown on every screen (including sign-in). */
export const AccessibilityMenu: React.FC = () => {
  const [settings, setSettings] = useAccessibility();
  const [open, setOpen] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Escape closes; focus moves into the menu when it opens
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showStatement) setShowStatement(false);
      else close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, showStatement]);

  const update = (patch: Partial<AccessibilitySettings>) => setSettings({ ...settings, ...patch });
  const active = !isDefaultAccessibility(settings);
  const clubName = store.getSettings()?.clubName || 'המועדון';

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-menu"
        aria-label="תפריט נגישות"
        title="נגישות"
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[70] bg-sky-800 hover:bg-sky-900 text-white rounded-r-2xl py-2.5 pl-1.5 pr-2 shadow-lg cursor-pointer"
      >
        <Accessibility className="w-6 h-6" aria-hidden="true" />
        {active && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]" onClick={close}>
          <div
            id="a11y-menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-menu-title"
            onClick={(e) => e.stopPropagation()}
            className="absolute left-2 top-2 bottom-2 w-[min(22rem,calc(100vw-1rem))] glass-sheet rounded-3xl flex flex-col overflow-hidden text-right"
          >
            <div className="bg-sky-800 text-white px-4 py-3 flex items-center justify-between">
              <h2 id="a11y-menu-title" className="font-extrabold text-base flex items-center gap-2">
                <Accessibility className="w-5 h-5" aria-hidden="true" />
                תפריט נגישות
              </h2>
              <button onClick={close} aria-label="סגור תפריט נגישות" className="p-1.5 rounded-xl hover:bg-sky-700 cursor-pointer">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Text size */}
              <div className="bg-white/60 border border-slate-200 rounded-2xl p-3">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-800 mb-2">
                  <Type className="w-4 h-4 text-sky-700" aria-hidden="true" />
                  גודל טקסט
                  <span className="mr-auto text-xs font-semibold text-sky-800" aria-live="polite">
                    {SCALE_LABELS[settings.textScale]} ({Math.round(TEXT_SCALES[settings.textScale] * 100)}%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => update({ textScale: Math.max(0, settings.textScale - 1) })}
                    disabled={settings.textScale === 0}
                    aria-label="הקטן טקסט"
                    className="flex-1 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-800 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" /> א
                  </button>
                  <button
                    onClick={() => update({ textScale: Math.min(TEXT_SCALES.length - 1, settings.textScale + 1) })}
                    disabled={settings.textScale === TEXT_SCALES.length - 1}
                    aria-label="הגדל טקסט"
                    className="flex-1 py-2 rounded-xl bg-white border border-slate-300 font-bold text-lg text-slate-800 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" /> א
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2">
                {TOGGLES.map(({ key, label, icon: Icon }) => {
                  const on = settings[key];
                  return (
                    <button
                      key={key}
                      onClick={() => update({ [key]: !on })}
                      aria-pressed={on}
                      className={`min-h-20 p-2.5 rounded-2xl border-2 text-xs font-bold flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition ${
                        on ? 'bg-sky-800 border-sky-800 text-white' : 'bg-white border-slate-200 text-slate-800 hover:border-sky-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 p-3 flex gap-2">
              <button
                onClick={() => setSettings({ ...DEFAULT_ACCESSIBILITY })}
                disabled={!active}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                איפוס הגדרות
              </button>
              <button
                onClick={() => setShowStatement(true)}
                className="flex-1 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                הצהרת נגישות
              </button>
            </div>
          </div>

          {showStatement && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="a11y-statement-title"
              className="fixed inset-0 z-[90] flex items-center justify-center glass-backdrop p-4"
              onClick={(e) => {
                e.stopPropagation();
                setShowStatement(false);
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="glass-sheet rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 text-right text-sm text-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 id="a11y-statement-title" className="font-extrabold text-lg text-slate-900">
                    הצהרת נגישות
                  </h2>
                  <button
                    onClick={() => setShowStatement(false)}
                    aria-label="סגור הצהרת נגישות"
                    className="p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
                    autoFocus
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>
                <p>
                  {clubName} רואה חשיבות רבה בהנגשת האפליקציה לכלל החברים, כולל אנשים עם מוגבלות. האפליקציה הותאמה ברוח
                  תקן הנגישות הישראלי (ת"י 5568) המבוסס על הנחיות WCAG 2.1 ברמה AA.
                </p>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">מה הונגש</h3>
                  <ul className="list-disc pr-5 space-y-0.5">
                    <li>תפריט נגישות: הגדלת טקסט, ניגודיות גבוהה, מצב כהה, גווני אפור, גופן קריא, ריווח טקסט, הדגשת קישורים, עצירת אנימציות וסמן גדול.</li>
                    <li>ניווט מלא במקלדת עם סימון מיקוד בולט, וקישור "דלג לתוכן הראשי".</li>
                    <li>תמיכה בהגדלת המסך (צביטה) בטלפון.</li>
                    <li>תוויות לקוראי מסך לכפתורים, חלונות וניווט.</li>
                    <li>כיבוד הגדרת "הפחתת תנועה" של מערכת ההפעלה.</li>
                  </ul>
                </div>
                <p>
                  ההגדרות נשמרות במכשיר זה בלבד. ייתכן שחלקים מסוימים עדיין אינם נגישים במלואם; אנו ממשיכים לשפר.
                </p>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">נתקלתם בבעיה?</h3>
                  <p>
                    נשמח לשמוע ולתקן. פנו להנהלת {clubName} דרך ערוצי הקשר של המועדון, ותארו את הבעיה, המסך שבו נתקלתם בה
                    והמכשיר שבו השתמשתם.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
