import React, { useRef, useState } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import { compressAvatar } from '../utils/imageCompression';

interface Props {
  /** Current picture (URL or data URL); empty shows the camera placeholder. */
  src?: string;
  name: string;
  /** Called with the cropped, compressed photo, or null to remove it. Errors are shown under the picture. */
  onChange: (imageDataUrl: string | null) => Promise<{ success: boolean; error?: string }> | void;
  /** Offer "remove photo" (only when the current picture is the member's own upload). */
  canRemove?: boolean;
  size?: 'md' | 'lg';
}

/** Profile photo with a camera button: pick from the gallery or take a selfie on the phone. */
export const AvatarPicker: React.FC<Props> = ({ src, name, onChange, canRemove, size = 'lg' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';

  const run = async (value: string | null) => {
    setError(null);
    setBusy(true);
    try {
      const res = await onChange(value);
      if (res && !res.success) setError(res.error || 'שמירת התמונה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await run(await compressAvatar(file));
    } catch (err: any) {
      setError(err?.message || 'לא ניתן לקרוא את התמונה');
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`relative ${box}`}>
        {src ? (
          <img src={src} alt={name} className={`${box} rounded-full object-cover border-4 border-sky-100 shadow-sm bg-slate-100`} />
        ) : (
          <div className={`${box} rounded-full border-2 border-dashed border-slate-300 bg-white/60 flex items-center justify-center text-slate-400`}>
            <Camera className="w-7 h-7" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={src ? 'החלף תמונת פרופיל' : 'הוסף תמונת פרופיל'}
          title={src ? 'החלף תמונה' : 'הוסף תמונה'}
          className="absolute -bottom-1 -left-1 w-9 h-9 rounded-full bg-sky-600 hover:bg-sky-700 text-white border-2 border-white shadow flex items-center justify-center cursor-pointer disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {canRemove && !busy && (
        <button
          type="button"
          onClick={() => run(null)}
          className="py-1 text-[0.6875rem] text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
          הסר תמונה
        </button>
      )}
      {error && (
        <p className="text-[0.6875rem] text-rose-700 max-w-48 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
