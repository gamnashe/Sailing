/// <reference types="node" />
// Accessibility (axe, WCAG 2.1 AA) and touch-friendliness on every screen:
// - no serious or critical accessibility violations (missing labels, low contrast, ...)
// - every control is at least 24×24px (WCAG 2.5.8); smaller than 40px is listed for review
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './support';
import { SCREENS } from './screens';

const SKIP = new Set(['sail-details-bottom', 'admin-requests-bottom', 'admin-settings-bottom', 'profile-bottom']);

for (const screen of SCREENS.filter((s) => !SKIP.has(s.name))) {
  test(screen.name, async ({ page }) => {
    await screen.open(page);
    await page.waitForTimeout(400);

    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    // With a window open, the blurred screen behind it isn't what the person is using
    if (screen.dialog) builder = builder.exclude('#root');
    const axe = await builder.analyze();
    const serious = axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.length}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`);

    const targets = await page.evaluate(() => {
      const small: { name: string; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button]')) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden' || el.closest('.skip-link, .sr-only')) continue;
        // Checkboxes and radios are usually wrapped by a bigger label that takes the tap
        if ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio') {
          const lab = el.closest('label');
          if (lab && lab.getBoundingClientRect().height >= 24) continue;
        }
        if (r.width < 40 || r.height < 40) {
          const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
          small.push({ name, w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return small;
    });
    const tooSmall = targets.filter((t) => t.w < 24 || t.h < 24).map((t) => `${t.name} (${t.w}×${t.h})`);

    fs.mkdirSync('e2e-results/quality', { recursive: true });
    fs.writeFileSync(
      `e2e-results/quality/${screen.name}.json`,
      JSON.stringify({ axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, where: v.nodes.slice(0, 12).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), why: n.failureSummary?.split('\n').slice(1, 2).join(' ').slice(0, 160) })) })), smallTargets: targets }, null, 1)
    );
    expect.soft(serious, 'serious accessibility problems').toEqual([]);
    expect.soft(tooSmall, 'controls smaller than 24×24px').toEqual([]);
  });
}
