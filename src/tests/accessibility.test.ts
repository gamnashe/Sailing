/**
 * Accessibility preferences: loading saved values safely and applying them to <html>.
 * Run via: bun run test
 */
import {
  DEFAULT_ACCESSIBILITY,
  applyAccessibility,
  isDefaultAccessibility,
  loadAccessibility,
} from '../services/accessibility';

let failures = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failures++;
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

// Minimal localStorage / element stand-ins for Node
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
};
function fakeRoot() {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  return {
    classes,
    props,
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    style: { setProperty: (k: string, v: string) => void props.set(k, v) },
  };
}

assert(isDefaultAccessibility(loadAccessibility()), 'nothing saved → defaults');

storage.set('sailing_club_accessibility', '{not json');
assert(isDefaultAccessibility(loadAccessibility()), 'corrupt saved value → defaults');

storage.set('sailing_club_accessibility', JSON.stringify({ textScale: 99, highContrast: true }));
const loaded = loadAccessibility();
assert(loaded.textScale === 3, 'an out-of-range text size is clamped to the largest step');
assert(loaded.highContrast && !loaded.grayscale, 'saved toggles merge over the defaults');

const root = fakeRoot();
applyAccessibility({ ...DEFAULT_ACCESSIBILITY, textScale: 2, highContrast: true, stopAnimations: true }, root as any);
assert(root.props.get('--a11y-text-scale') === '1.3', 'text size step sets the scale variable');
assert(root.classes.has('a11y-contrast') && root.classes.has('a11y-no-motion'), 'enabled options add their classes');
applyAccessibility(DEFAULT_ACCESSIBILITY, root as any);
assert(root.classes.size === 0 && root.props.get('--a11y-text-scale') === '1', 'reset removes every class and scale');

if (failures) {
  console.error(`\n${failures} accessibility test(s) failed`);
  process.exit(1);
}
console.log('\nAll accessibility tests passed');
