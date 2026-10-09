// Every screen and window of the app, as steps that open it from a fresh, seeded browser.
// Shared by the layout tests (screens.spec.ts) and the every-button crawler (buttons.spec.ts).
import type { Page } from '@playwright/test';
import { expect, home, openTab, signOut, signInAsMember, topDialog, ROUGH_DAY } from './support';

export type Screen = {
  name: string;
  open: (page: Page) => Promise<void>;
  /** a window is open */
  dialog?: boolean;
  /** CSS selector of an open menu: the button crawler presses only inside it */
  scope?: string;
};

const upcoming = async (page: Page) => {
  await home(page);
  await page.getByRole('button', { name: /קרובות/ }).first().click();
};
const firstSail = async (page: Page) => {
  await upcoming(page);
  await page.locator('main [class*="cursor-pointer"]').filter({ hasText: 'הפלגת שקיעה' }).first().click();
  await expect(topDialog(page)).toBeVisible();
};
const adminTab = async (page: Page, name: RegExp) => {
  await home(page);
  await openTab(page, 'admin');
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(200);
};
const view = async (page: Page, name: 'חודש' | 'שבוע' | 'יום') => {
  await home(page);
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(200);
};

export const SCREENS: Screen[] = [
  // Signed out
  { name: 'sign-in', open: (p) => signOut(p) },
  { name: 'forgot-password', open: async (p) => { await signOut(p); await p.getByRole('button', { name: 'שכחת סיסמה?' }).click(); } },
  { name: 'join-form', open: async (p) => { await signOut(p); await p.goto('/?join=demo-join'); await expect(p.locator('#join-username')).toBeVisible(); } },
  { name: 'tutorial-link-signed-out', dialog: true, open: async (p) => { await signOut(p); await p.goto('/?video=member'); await expect(topDialog(p)).toBeVisible(); } },

  // Sails
  { name: 'calendar-month', open: (p) => view(p, 'חודש') },
  { name: 'calendar-month-rough-day', open: async (p) => {
      await view(p, 'חודש');
      await p.locator('[title^="ים סוער"]').first().click();
      await p.getByText('צפוי ים סוער – לא מומלץ לפתוח הפלגות').first().scrollIntoViewIfNeeded();
    } },
  { name: 'calendar-week', open: (p) => view(p, 'שבוע') },
  { name: 'calendar-day', open: async (p) => { await view(p, 'יום'); await p.locator('button[title="הבא"]').click(); } },
  { name: 'calendar-day-rough', open: async (p) => {
      await view(p, 'יום');
      for (let i = 0; i < ROUGH_DAY; i++) await p.locator('button[title="הבא"]').click();
    } },
  { name: 'sails-upcoming', open: upcoming },
  { name: 'sails-archive', open: async (p) => { await home(p); await p.getByRole('button', { name: /ארכיון/ }).click(); } },
  { name: 'create-sail', dialog: true, open: async (p) => { await home(p); await p.getByRole('button', { name: /הפלגה חדשה/ }).first().click(); } },
  { name: 'create-sail-rough-day', dialog: true, open: async (p) => {
      await view(p, 'יום');
      for (let i = 0; i < ROUGH_DAY; i++) await p.locator('button[title="הבא"]').click();
      await p.locator('button[title="פתח הפלגה בתאריך זה"]').first().click();
      await expect(p.getByText('ראיתי את התחזית ובכל זאת')).toBeVisible();
    } },
  { name: 'sail-details', dialog: true, open: firstSail },
  { name: 'sail-details-bottom', dialog: true, open: async (p) => {
      await firstSail(p);
      await topDialog(p).locator('[class*="overflow-y-auto"]').first().evaluate((e) => e.scrollTo(0, 1e5));
    } },
  { name: 'sail-add-member', dialog: true, open: async (p) => { await firstSail(p); await p.getByRole('button', { name: /הוסף חבר ידנית/ }).click(); } },
  { name: 'sail-cancel-by-admin', dialog: true, open: async (p) => { await firstSail(p); await p.getByRole('button', { name: /בטל הפלגה והודע לכולם/ }).click(); } },
  { name: 'boat-reservation', dialog: true, open: async (p) => { await view(p, 'יום'); await p.getByRole('button', { name: 'שריון סירה' }).click(); } },

  // Header
  { name: 'notifications', dialog: true, open: async (p) => { await home(p); await p.getByRole('button', { name: /מרכז התראות/ }).click(); } },
  { name: 'user-menu', scope: 'header .glass-sheet', open: async (p) => { await home(p); await p.getByRole('button', { name: 'תפריט משתמש' }).click(); } },
  { name: 'accessibility-menu', scope: '#a11y-menu', open: async (p) => { await home(p); await p.getByRole('button', { name: 'תפריט נגישות' }).click(); } },
  { name: 'accessibility-statement', dialog: true, open: async (p) => {
      await home(p);
      await p.getByRole('button', { name: 'תפריט נגישות' }).click();
      await p.getByRole('button', { name: /הצהרת נגישות/ }).click();
    } },

  // Boats
  { name: 'boats', open: async (p) => { await home(p); await openTab(p, 'boats'); } },
  { name: 'boats-issues-board', open: async (p) => { await home(p); await openTab(p, 'boats'); await p.getByRole('button', { name: /לוח מודעות תקלות/ }).click(); } },
  { name: 'report-issue', dialog: true, open: async (p) => { await home(p); await openTab(p, 'boats'); await p.getByRole('button', { name: /דווח על תקלה/ }).first().click(); } },
  { name: 'boats-add-boat', dialog: true, open: async (p) => { await home(p); await openTab(p, 'boats'); await p.getByRole('button', { name: /הוסף כלי שייט/ }).first().click(); } },
  { name: 'boats-update-status', dialog: true, open: async (p) => { await home(p); await openTab(p, 'boats'); await p.getByRole('button', { name: /עדכן סטטוס/ }).first().click(); } },

  // Feed
  { name: 'feed', open: async (p) => { await home(p); await openTab(p, 'feed'); } },

  // Management
  { name: 'admin-members', open: (p) => adminTab(p, /חברים וקרדיטים/) },
  { name: 'admin-add-member', dialog: true, open: async (p) => { await adminTab(p, /חברים וקרדיטים/); await p.getByRole('button', { name: /הוספת חבר/ }).first().click(); } },
  { name: 'admin-credits', dialog: true, open: async (p) => { await adminTab(p, /חברים וקרדיטים/); await p.getByRole('button', { name: /הגדר קרדיטים/ }).first().click(); } },
  { name: 'admin-fleet', open: (p) => adminTab(p, /צי כלי שייט/) },
  { name: 'admin-edit-boat', dialog: true, open: async (p) => { await adminTab(p, /צי כלי שייט/); await p.getByRole('button', { name: 'ערוך סירה וסטטוס' }).first().click(); } },
  { name: 'admin-add-boat', dialog: true, open: async (p) => { await adminTab(p, /צי כלי שייט/); await p.getByRole('button', { name: /הוסף כלי שייט חדש/ }).first().click(); } },
  { name: 'admin-cancel-sails', open: (p) => adminTab(p, /ביטול הפלגות/) },
  { name: 'admin-requests', open: (p) => adminTab(p, /בקשות והצטרפות/) },
  { name: 'admin-requests-bottom', open: async (p) => { await adminTab(p, /בקשות והצטרפות/); await p.evaluate(() => window.scrollTo(0, 1e6)); } },
  { name: 'admin-temp-password', dialog: true, open: async (p) => {
      await adminTab(p, /בקשות והצטרפות/);
      await p.getByRole('button', { name: 'הנפק סיסמה זמנית ושלח' }).first().click();
    } },
  { name: 'admin-settings', open: (p) => adminTab(p, /^הגדרות$/) },
  { name: 'admin-settings-bottom', open: async (p) => { await adminTab(p, /^הגדרות$/); await p.evaluate(() => window.scrollTo(0, 1e6)); } },
  { name: 'admin-stats', open: (p) => adminTab(p, /סטטיסטיקה/) },
  { name: 'admin-clubs', open: (p) => adminTab(p, /מועדונים/) },
  { name: 'tutorials', dialog: true, open: async (p) => { await home(p); await openTab(p, 'admin'); await p.getByRole('button', { name: /סרטוני הדרכה/ }).first().click(); } },
  { name: 'preview-as-member', open: async (p) => { await home(p); await openTab(p, 'admin'); await p.getByRole('button', { name: /צפייה כחבר רגיל/ }).click(); } },

  // Profile
  { name: 'profile', open: async (p) => { await home(p); await openTab(p, 'profile'); } },
  { name: 'profile-bottom', open: async (p) => { await home(p); await openTab(p, 'profile'); await p.evaluate(() => window.scrollTo(0, 1e6)); } },

  // A regular member
  { name: 'member-calendar', open: (p) => signInAsMember(p) },
  { name: 'member-sail-details', dialog: true, open: async (p) => {
      await signInAsMember(p);
      await p.getByRole('button', { name: /קרובות/ }).first().click();
      await p.locator('main [class*="cursor-pointer"]').filter({ hasText: 'הפלגת שקיעה' }).first().click();
    } },
  { name: 'member-profile', open: async (p) => { await signInAsMember(p); await openTab(p, 'profile'); } },
  { name: 'member-credit-request', open: async (p) => {
      await signInAsMember(p);
      await openTab(p, 'profile');
      await p.getByRole('button', { name: 'בקש קרדיטים' }).click().catch(() => {});
    } },
];
