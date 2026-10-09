/// <reference types="node" />
// Presses every button on every screen, one at a time from a fresh copy of the demo club, and checks:
// - nothing throws or logs an error
// - a window it opens fits the screen and closes again (Escape or its close button)
// - the screen still fits afterwards
// - something visibly happens (otherwise the press is reported as "no visible response")
// A report per screen is written to e2e-results/buttons/<screen>.json.
import fs from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect, layoutIssues, closeTopDialog, home } from './support';
import { SCREENS, type Screen } from './screens';

const SKIP_SCREENS = new Set([
  'tutorial-link-signed-out', // same window as "tutorials"
  'calendar-month-rough-day',
  'calendar-day-rough',
  'create-sail-rough-day',
  'sail-details-bottom',
  'sail-add-member',
  'sail-cancel-by-admin',
  'accessibility-statement',
  'admin-requests-bottom',
  'admin-settings-bottom',
  'profile-bottom',
  'member-credit-request',
]);

// The header and tab bars are the same on every screen: pressed once, on their own screen
const HEADER: Screen = { name: 'header-and-tabs', open: home };
const CRAWL = [HEADER, ...SCREENS.filter((s) => !SKIP_SCREENS.has(s.name))];

type Seed = { origins: { localStorage: { name: string; value: string }[] }[] };

async function reset(page: Page) {
  const seed: Seed = JSON.parse(fs.readFileSync('e2e/.state/seed.json', 'utf8'));
  if (!page.url().startsWith('http')) await page.goto('/');
  await page.evaluate((items) => {
    localStorage.clear();
    sessionStorage.clear();
    for (const { name, value } of items) localStorage.setItem(name, value);
  }, seed.origins[0].localStorage);
}

/** The controls a person can press on this screen. */
function controls(page: Page, screen: Screen): Locator {
  const sel = 'button:visible, a[href]:visible, [role=button]:visible, summary:visible';
  if (screen.scope) return page.locator(screen.scope).locator(sel);
  if (screen.dialog) return page.locator('[role=dialog]').last().locator(sel);
  if (screen === HEADER) return page.locator(`header :is(${sel}), nav[aria-label="ניווט ראשי"]:visible :is(${sel}), button[aria-controls="a11y-menu"]`);
  // Everything except the header, tab bars and accessibility tab (pressed on their own screen)
  return page.locator(sel).and(page.locator(':not(.skip-link)')).filter({
    hasNot: page.locator('xpath=ancestor-or-self::header | ancestor-or-self::nav[@aria-label="ניווט ראשי"] | ancestor-or-self::button[@aria-controls="a11y-menu"]'),
  });
}

const label = (el: Locator) =>
  el.evaluate((e) =>
    (e.getAttribute('aria-label') || (e as HTMLElement).innerText || e.getAttribute('title') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 60)
  );

/** What the screen looks like, to tell whether a press did anything. */
const signature = (page: Page) =>
  page.evaluate(() => {
    const pressed = [...document.querySelectorAll('[aria-pressed=true], [aria-expanded=true], [aria-current], :checked')]
      .map((e) => (e as HTMLElement).innerText || e.id)
      .join(',');
    const focus = document.activeElement ? document.activeElement.outerHTML.slice(0, 80) : '';
    return [location.href, document.body.innerHTML.length, document.querySelectorAll('[role=dialog]').length, pressed, scrollY, focus].join('|');
  });

type Row = { control: string; result: string; problem?: string };

for (const screen of CRAWL) {
  test(screen.name, async ({ page, watch }) => {
    test.setTimeout(15 * 60_000);
    await reset(page);
    await screen.open(page);
    await page.waitForTimeout(300);

    // List the controls once, then press each from a fresh start
    const all = controls(page, screen);
    const labels: string[] = [];
    for (let i = 0; i < (await all.count()); i++) labels.push(await label(all.nth(i)));
    // Rows of identical controls (calendar days, "+" buttons): one of each is enough
    const seen = new Map<string, number>();
    const key = (l: string) => l.replace(/\d+/g, '#'); // day numbers 1..31 do the same thing
    const picks = labels.map((l, i) => ({ l, i })).filter(({ l }) => (seen.set(key(l), (seen.get(key(l)) ?? 0) + 1).get(key(l)) ?? 0) <= 1);

    const rows: Row[] = [];
    for (const { l, i } of picks) {
      await reset(page);
      await screen.open(page);
      await page.waitForTimeout(250);
      const el = controls(page, screen).nth(i);
      if ((await el.count()) === 0 || (await label(el)) !== l) {
        rows.push({ control: l, result: 'skipped: screen changed' });
        continue;
      }
      const info = await el.evaluate((e) => ({
        selected: e.getAttribute('aria-pressed') === 'true' || e.hasAttribute('aria-current'),
        tag: e.tagName,
        disabled: (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true',
        external: e.tagName === 'A' && ((e as HTMLAnchorElement).target === '_blank' || !(e as HTMLAnchorElement).href.startsWith(location.origin)),
        href: (e as HTMLAnchorElement).href || '',
        submitInvalid: (e as HTMLButtonElement).type === 'submit' && !!(e as HTMLButtonElement).form && !(e as HTMLButtonElement).form!.checkValidity(),
      }));
      if (info.disabled) { rows.push({ control: l, result: 'disabled' }); continue; }
      if (info.external) {
        rows.push({ control: l, result: info.href ? `external link: ${info.href.slice(0, 60)}` : 'external link', problem: info.href ? undefined : 'link without an address' });
        continue;
      }

      const errorsBefore = watch.errors.length;
      const dialogsBefore = await page.locator('[role=dialog]').count();
      const before = await signature(page);
      const chooser = page.waitForEvent('filechooser', { timeout: 1200 }).catch(() => null);
      const clickError = await el.click({ timeout: 4000 }).then(() => null, (e) => String(e).split('\n')[0]);
      if (clickError) {
        rows.push({ control: l, result: 'not clickable', problem: clickError });
        continue;
      }
      await page.waitForTimeout(400);
      const opened = await chooser;
      const row: Row = { control: l, result: 'ok' };

      const newErrors = watch.errors.slice(errorsBefore);
      if (newErrors.length) row.problem = newErrors.join(' | ');

      const dialogsAfter = await page.locator('[role=dialog]').count();
      const signedOut = await page.getByRole('button', { name: 'התחבר למערכת' }).isVisible();
      if (opened) row.result = 'opened the file picker';
      else if (signedOut && screen.name !== 'sign-in' && !screen.name.startsWith('forgot') && !screen.name.startsWith('join')) row.result = 'signed out';
      else if (dialogsAfter > dialogsBefore) {
        row.result = 'opened a window';
        const layout = await layoutIssues(page);
        if (layout.length) row.problem = [row.problem, ...layout].filter(Boolean).join(' | ');
        const how = await closeTopDialog(page).catch(() => 'failed');
        if ((await page.locator('[role=dialog]').count()) >= dialogsAfter) row.problem = [row.problem, 'the window does not close'].filter(Boolean).join(' | ');
        else row.result += how === 'escape' ? ', closes with Escape' : ', closes with its button (not Escape)';
      } else if (dialogsAfter < dialogsBefore) row.result = 'closed the window';
      else if (info.submitInvalid) row.result = 'form asks to fill required fields';
      else if ((await signature(page)) === before) row.result = info.selected ? 'already selected' : 'no visible response';
      else {
        const layout = await layoutIssues(page);
        if (layout.length) row.problem = [row.problem, ...layout].filter(Boolean).join(' | ');
      }
      rows.push(row);
    }

    fs.mkdirSync('e2e-results/buttons', { recursive: true });
    fs.writeFileSync(`e2e-results/buttons/${screen.name}.json`, JSON.stringify(rows, null, 1));
    // The fixture's error check covers the whole run; problems are listed per button here
    watch.errors.length = 0;
    const problems = rows.filter((r) => r.problem).map((r) => `${r.control}: ${r.problem}`);
    expect(problems, `${rows.length} controls pressed`).toEqual([]);
  });
}
