/// <reference types="node" />
// Shared fixtures and helpers for the browser tests.
import { test as base, expect, type Page, type Locator } from '@playwright/test';

export { expect };

const pad = (n: number) => String(n).padStart(2, '0');
/** yyyy-mm-dd for today + offset days. */
export const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Days (from today) with a rough forecast in the fake weather below. */
export const ROUGH_DAY = 5;

/** A fixed forecast so weather badges and the rough-day marking are always the same. */
export async function fakeWeather(page: Page) {
  const days = Array.from({ length: 16 }, (_, i) => dayKey(i));
  const wind = [9, 12, 14, 11, 18, 22, 13, 8, 10, 15, 12, 9, 16, 19, 11, 10];
  const codes = [0, 1, 2, 1, 3, 61, 1, 0, 0, 2, 1, 0, 3, 2, 1, 0];
  await page.route('**/api.open-meteo.com/**', (r) => {
    const hourly: Record<string, (string | number)[]> = {
      time: [], weather_code: [], temperature_2m: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [],
    };
    days.forEach((d, i) => {
      for (let h = 0; h < 24; h++) {
        const w = wind[i] * (0.6 + 0.5 * Math.sin(((h - 6) / 24) * Math.PI));
        hourly.time.push(`${d}T${pad(h)}:00`);
        hourly.weather_code.push(codes[i]);
        hourly.temperature_2m.push(22 + Math.sin(h / 4) * 4);
        hourly.wind_speed_10m.push(Math.max(3, w));
        hourly.wind_gusts_10m.push(Math.max(5, w * 1.35));
        hourly.wind_direction_10m.push(290);
      }
    });
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: days,
          weather_code: codes,
          temperature_2m_max: days.map((_, i) => 26 + (i % 3)),
          wind_speed_10m_max: wind,
          wind_gusts_10m_max: wind.map((w) => Math.round(w * 1.35)),
          wind_direction_10m_dominant: days.map(() => 290),
        },
        hourly,
      }),
    });
  });
  await page.route('**/marine-api.open-meteo.com/**', (r) => {
    const md = days.slice(0, 8);
    const hourly: Record<string, (string | number)[]> = { time: [], wave_height: [], wave_period: [] };
    md.forEach((d, i) => {
      for (let h = 0; h < 24; h++) {
        hourly.time.push(`${d}T${pad(h)}:00`);
        hourly.wave_height.push(0.4 + wind[i] / 30);
        hourly.wave_period.push(6);
      }
    });
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ daily: { time: md, wave_height_max: md.map((_, i) => +(0.5 + wind[i] / 25).toFixed(1)) }, hourly }),
    });
  });
  // Avatars from external sites: a local placeholder, so tests don't depend on the network
  await page.route(/dicebear\.com|unsplash\.com|fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.request().resourceType() === 'image'
      ? r.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#bae6fd"/><circle cx="32" cy="25" r="12" fill="#0369a1"/></svg>',
        })
      : r.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );
}

/** Errors the page logged; every test fails if any appear. */
type Watch = { errors: string[] };

export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ page }, use) => {
      const watch: Watch = { errors: [] };
      page.on('pageerror', (e) => watch.errors.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/Failed to load resource|net::ERR|favicon|ServiceWorker|workbox/i.test(t)) return;
        watch.errors.push(`console error: ${t}`);
      });
      page.on('dialog', (d) => d.accept().catch(() => {}));
      await fakeWeather(page);
      await use(watch);
      expect(watch.errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

// ---------- Navigation ----------

const TAB_NAMES = {
  sails: /^הפלגות/,
  boats: /^(סירות|כלי שייט)/,
  feed: /^פיד/,
  admin: /^ניהול/,
  profile: /^פרופיל/,
} as const;
export type Tab = keyof typeof TAB_NAMES;

/** Opens a main tab from whichever navigation bar is visible (bottom bar on phones, tabs on desktop). */
export async function openTab(page: Page, tab: Tab) {
  await page.locator('nav[aria-label="ניווט ראשי"]:visible').getByRole('button', { name: TAB_NAMES[tab] }).click();
  await page.waitForTimeout(250);
}

/** Opens the app signed in as the seeded admin (storage state already holds the session). */
export async function home(page: Page) {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
}

export async function signOut(page: Page) {
  if (!page.url().startsWith('http')) await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('sailing_club_current_user_id'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'התחבר למערכת' })).toBeVisible();
}

/** Signs in through the sign-in form. */
export async function signIn(page: Page, identifier: string, password: string) {
  await page.locator('#auth-identifier').fill(identifier);
  await page.locator('input[type=password]').first().fill(password);
  await page.getByRole('button', { name: 'התחבר למערכת' }).click();
}

export const MEMBER = { username: 'dani.levi', email: 'dani@example.com', password: 'Sailing2026', name: 'דני לוי' };

export async function signInAsMember(page: Page) {
  await signOut(page);
  await signIn(page, MEMBER.username, MEMBER.password);
  await expect(page.locator('header')).toBeVisible();
}

/** The top-most open window. */
export const topDialog = (page: Page) => page.locator('[role=dialog]').last();

/** Closes the top window the way a user would (Escape, then the X / "סגור" button). */
export async function closeTopDialog(page: Page) {
  const before = await page.locator('[role=dialog]').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if ((await page.locator('[role=dialog]').count()) < before) return 'escape';
  const close = topDialog(page)
    .locator('button[aria-label*="סגור"], button[title*="סגור"], button:has(svg.lucide-x)')
    .or(topDialog(page).getByRole('button', { name: /^(סגור|ביטול)$/ }))
    .first();
  await close.click();
  await page.waitForTimeout(200);
  return 'button';
}

// ---------- Layout checks ----------

/**
 * Layout problems on the current screen: anything spilling past the screen's edge, text overflowing
 * its box, or a window that is cut off and can't scroll.
 */
export async function layoutIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // On phones an over-wide element makes the browser zoom out, so measure against the device width
    const W = Math.min(document.documentElement.clientWidth, window.screen.width || Infinity);
    const H = window.innerHeight;
    const issues: string[] = [];
    const desc = (el: Element) => {
      const c = (el.getAttribute('class') || '').split(/\s+/).slice(0, 5).join('.');
      const t = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `<${el.tagName.toLowerCase()}.${c}> "${t}"`;
    };
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
          const r = p.getBoundingClientRect();
          if (r.right <= W + 1 && r.left >= -1) return true;
        }
      }
      return false;
    };
    if (document.documentElement.scrollWidth > W + 1)
      issues.push(`page is wider than the screen (${document.documentElement.scrollWidth}px > ${W}px)`);
    // When the page is too wide the phone zooms out; lay it out at the device width to find the culprit
    const html = document.documentElement;
    const tooWide = html.scrollWidth > W + 1;
    if (tooWide) {
      html.style.width = `${W}px`;
      html.style.overflow = 'hidden';
    }
    const out: Element[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('.skip-link, .sr-only')) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      // The accessibility tab deliberately hugs the left edge
      if (el.closest('button[aria-controls="a11y-menu"]')) continue;
      if ((r.right > W + 1 || r.left < -1) && !clipped(el)) out.push(el);
    }
    for (const el of out.filter((e) => !out.some((o) => o !== e && o.contains(e))).slice(0, 6)) {
      const r = el.getBoundingClientRect();
      issues.push(`spills past the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${W}): ${desc(el)}`);
    }
    // ...and the innermost elements that stick out (the ones to fix)
    const leaves = out.filter((e) => !out.some((o) => o !== e && e.contains(o)));
    for (const el of leaves.slice(0, 4)) {
      if (issues.some((i) => i.endsWith(desc(el)))) continue;
      const r = el.getBoundingClientRect();
      issues.push(`sticks out (${Math.round(r.left)}..${Math.round(r.right)} of ${W}): ${desc(el.closest('button, a, input, select, p, h2, h3, span') || el)}`);
    }
    if (tooWide) {
      html.style.width = '';
      html.style.overflow = '';
    }
    for (const el of document.querySelectorAll('button, a, h1, h2, h3, label, p')) {
      const he = el as HTMLElement;
      const s = getComputedStyle(he);
      if (!he.clientWidth || s.overflowX !== 'visible' || he.scrollWidth - he.clientWidth <= 6) continue;
      if (clipped(he)) continue;
      issues.push(`text overflows its box by ${he.scrollWidth - he.clientWidth}px: ${desc(he)}`);
    }
    for (const d of document.querySelectorAll('[role=dialog]')) {
      const panel = d.firstElementChild || d;
      const r = panel.getBoundingClientRect();
      if (!r.width) continue;
      const scrolls = (el: Element | null) => {
        for (let p = el; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return true;
          if (p === d) break;
        }
        return false;
      };
      if (r.width > W + 1) issues.push(`window is wider than the screen: ${desc(panel)}`);
      if ((r.bottom > H + 2 || r.top < -2) && !scrolls(panel) && !scrolls(d)) issues.push(`window is cut off and can't scroll: ${desc(panel)}`);
    }
    return issues;
  });
}

export async function expectGoodLayout(page: Page) {
  expect(await layoutIssues(page), 'layout problems').toEqual([]);
}

/** Saves a screenshot for visual review (e2e-results/screens/<project>/<name>.png). */
export async function snap(page: Page, name: string) {
  const project = test.info().project.name;
  await page.screenshot({ path: `e2e-results/screens/${project}/${name}.png` });
}

/** Clicks with a small pause, like a person would, and waits for the UI to settle. */
export async function tap(locator: Locator) {
  await locator.click();
  await locator.page().waitForTimeout(250);
}
