import { useEffect, useState } from 'react';

/** Per-device display preferences for the accessibility menu (stored in this browser only). */
export interface AccessibilitySettings {
  /** Text size step: 0 = normal, up to TEXT_SCALES.length - 1. */
  textScale: number;
  highContrast: boolean;
  invertColors: boolean;
  grayscale: boolean;
  highlightLinks: boolean;
  readableFont: boolean;
  textSpacing: boolean;
  stopAnimations: boolean;
  bigCursor: boolean;
}

export const TEXT_SCALES = [1, 1.15, 1.3, 1.5];

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  textScale: 0,
  highContrast: false,
  invertColors: false,
  grayscale: false,
  highlightLinks: false,
  readableFont: false,
  textSpacing: false,
  stopAnimations: false,
  bigCursor: false,
};

const STORAGE_KEY = 'sailing_club_accessibility';

/** Toggle setting → class on <html> (styles live in index.css). */
const CLASS_FOR: Partial<Record<keyof AccessibilitySettings, string>> = {
  highContrast: 'a11y-contrast',
  invertColors: 'a11y-invert',
  grayscale: 'a11y-grayscale',
  highlightLinks: 'a11y-links',
  readableFont: 'a11y-readable',
  textSpacing: 'a11y-spacing',
  stopAnimations: 'a11y-no-motion',
  bigCursor: 'a11y-cursor',
};

export function loadAccessibility(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACCESSIBILITY };
    const parsed = { ...DEFAULT_ACCESSIBILITY, ...JSON.parse(raw) } as AccessibilitySettings;
    parsed.textScale = Math.min(TEXT_SCALES.length - 1, Math.max(0, Math.round(Number(parsed.textScale) || 0)));
    return parsed;
  } catch {
    return { ...DEFAULT_ACCESSIBILITY };
  }
}

export function isDefaultAccessibility(s: AccessibilitySettings): boolean {
  return (Object.keys(DEFAULT_ACCESSIBILITY) as (keyof AccessibilitySettings)[]).every(
    (k) => s[k] === DEFAULT_ACCESSIBILITY[k]
  );
}

export function applyAccessibility(s: AccessibilitySettings, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--a11y-text-scale', String(TEXT_SCALES[s.textScale] ?? 1));
  for (const [key, cls] of Object.entries(CLASS_FOR)) {
    root.classList.toggle(cls!, Boolean(s[key as keyof AccessibilitySettings]));
  }
}

const listeners = new Set<(s: AccessibilitySettings) => void>();
let current: AccessibilitySettings = DEFAULT_ACCESSIBILITY;

/** Read the saved preferences and apply them; call once before the first render to avoid a flash. */
export function initAccessibility() {
  current = loadAccessibility();
  applyAccessibility(current);
}

export function setAccessibility(next: AccessibilitySettings) {
  current = next;
  applyAccessibility(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage blocked: the choice still applies for this visit.
  }
  listeners.forEach((l) => l(next));
}

export function useAccessibility(): [AccessibilitySettings, (next: AccessibilitySettings) => void] {
  const [settings, setSettings] = useState(current);
  useEffect(() => {
    listeners.add(setSettings);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);
  return [settings, setAccessibility];
}
