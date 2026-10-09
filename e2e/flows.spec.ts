// The main things people do in the app, end to end, each with a budget of taps: a common task that
// suddenly takes more taps is a UX regression and fails here.
import type { Locator, Page } from '@playwright/test';
import { test, expect, home, openTab, signOut, signIn, signInAsMember, topDialog, dayKey, ROUGH_DAY, MEMBER } from './support';

/** Counts the taps a task takes. */
function tapper(page: Page) {
  let n = 0;
  const tap = async (l: Locator) => {
    n++;
    await l.click();
    await page.waitForTimeout(200);
  };
  return Object.assign(tap, { count: () => n });
}

const credits = async (page: Page) => Number((await page.locator('header button[title*="קרדיט"]').innerText()).match(/\d+/)![0]);

test('a member joins a sail in two taps', async ({ page }) => {
  await signInAsMember(page);
  const before = await credits(page);
  const tap = tapper(page);
  await tap(page.locator('[title^="הפלגת שקיעה"]').first());
  await tap(page.getByRole('button', { name: /הצטרף להפלגה/ }));
  await expect(page.getByText('נרשמת בהצלחה להפלגה').first()).toBeVisible();
  expect(tap.count()).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  expect(await credits(page)).toBe(before - 1);
});

test('a member cancels a seat and gets the credit back', async ({ page }) => {
  await signInAsMember(page);
  await page.locator('[title^="הפלגת שקיעה"]').first().click();
  await page.getByRole('button', { name: /הצטרף להפלגה/ }).click();
  const joined = await credits(page);
  await page.getByRole('button', { name: 'בטל השתתפות' }).click();
  await topDialog(page).getByRole('button', { name: 'אישור ביטול' }).click();
  await expect.poll(() => credits(page)).toBe(joined + 1);
});

test('the admin opens a sail from a calendar day, with the date filled in', async ({ page }) => {
  await home(page);
  const tap = tapper(page);
  await tap(page.getByRole('button', { name: 'יום', exact: true }));
  for (let i = 0; i < 3; i++) await tap(page.locator('button[title="הבא"]'));
  await tap(page.locator('button[title="פתח הפלגה בתאריך זה"]').first());
  await expect(topDialog(page).locator('input[type=date]').first()).toHaveValue(dayKey(3));
  await topDialog(page).getByPlaceholder('למשל: הפלגת שקיעה').fill('הפלגת בדיקה');
  await tap(topDialog(page).locator('form button[type=submit]').last());
  await expect(page.getByRole('button', { name: /הוסף חבר ידנית/ })).toBeVisible();
  // Day view, three days ahead, open, submit
  expect(tap.count()).toBeLessThanOrEqual(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('[title^="הפלגת בדיקה"]').first()).toBeVisible();
});

test('a boat that is reserved for a lesson cannot be double-booked', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: 'יום', exact: true }).click();
  await page.locator('button[title="הבא"]').click();
  await page.locator('button[title="פתח הפלגה בתאריך זה"]').first().click();
  const dialog = topDialog(page);
  await dialog.getByPlaceholder('למשל: הפלגת שקיעה').fill('התנגשות');
  const boat = dialog.locator('select').filter({ has: page.locator('option', { hasText: 'גלית' }) }).first();
  await boat.selectOption((await boat.locator('option', { hasText: 'גלית' }).first().getAttribute('value'))!);
  await dialog.locator('input[type=time]').nth(0).fill('10:00');
  await dialog.locator('input[type=time]').nth(1).fill('13:00');
  await expect(dialog.getByText('משוריינת בשעות האלה').first()).toBeVisible();
  const submit = dialog.locator('form button[type=submit]').last();
  await expect(submit).toBeDisabled();
  // A free time slot opens it up again
  await dialog.locator('input[type=time]').nth(0).fill('13:00');
  await dialog.locator('input[type=time]').nth(1).fill('15:00');
  await expect(submit).toBeEnabled();
});

test('opening a sail on a rough day asks to confirm the forecast', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: 'יום', exact: true }).click();
  for (let i = 0; i < ROUGH_DAY; i++) await page.locator('button[title="הבא"]').click();
  await expect(page.getByText('צפוי ים סוער').first()).toBeVisible();
  await page.locator('button[title="פתח הפלגה בתאריך זה"]').first().click();
  const dialog = topDialog(page);
  await dialog.getByPlaceholder('למשל: הפלגת שקיעה').fill('הפלגה בים סוער');
  const submit = dialog.locator('form button[type=submit]').last();
  await expect(submit).toBeDisabled();
  await dialog.getByText('ראיתי את התחזית ובכל זאת').click();
  await submit.click();
  await expect(page.getByRole('button', { name: /הוסף חבר ידנית/ })).toBeVisible();
});

test('the admin reserves a boat for a lesson', async ({ page }) => {
  await home(page);
  const tap = tapper(page);
  await tap(page.getByRole('button', { name: 'יום', exact: true }));
  await tap(page.locator('button[title="הבא"]'));
  await tap(page.locator('button[title="הבא"]'));
  await tap(page.getByRole('button', { name: 'שריון סירה' }));
  await page.locator('#res-title').fill('שיעור ניווט');
  await page.locator('#res-start').fill('14:00');
  await page.locator('#res-end').fill('16:00');
  await tap(page.getByRole('button', { name: /^שריין/ }));
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await expect(page.locator('[title*="שיעור ניווט"]').first()).toBeVisible();
  expect(tap.count()).toBeLessThanOrEqual(5);
});

test('a new member joins with a username, is approved, and signs in with it', async ({ page }) => {
  await signOut(page);
  await page.goto('/?join=demo-join');
  await page.locator('#join-username').fill('noa.barak');
  await expect(page.getByText('כבר תפוס')).toBeVisible();
  await expect(page.getByRole('button', { name: 'שלח בקשת הצטרפות' })).toBeDisabled();
  await page.locator('#join-username').fill('Shira.Sail');
  await expect(page.getByText('"shira.sail" פנוי')).toBeVisible();
  await page.getByPlaceholder('שם פרטי ומשפחה').fill('שירה גל');
  await page.getByPlaceholder('050-1234567').fill('050-1112233');
  await page.locator('#auth-identifier').fill('shira@example.com');
  await page.getByPlaceholder('8 תווים לפחות, אותיות ומספרים').fill('Sailing2026');
  await page.getByRole('button', { name: 'שלח בקשת הצטרפות' }).click();
  await expect(page.getByText('ממתין לאישור מנהל מועדון')).toBeVisible();

  // The admin approves from the requests tab
  await page.getByRole('button', { name: /התנתק/ }).first().click();
  await page.getByText('כניסה כמנהל').click();
  await openTab(page, 'admin');
  await page.getByRole('button', { name: /בקשות והצטרפות/ }).click();
  const card = page.locator('div').filter({ hasText: 'שירה גל' }).filter({ has: page.getByRole('button', { name: 'אשר חברות' }) }).last();
  await card.getByRole('button', { name: 'אשר חברות' }).click();
  await expect(page.getByRole('button', { name: 'אשר חברות' })).toHaveCount(1); // only נועה is left

  await signOut(page);
  await signIn(page, 'SHIRA.sail', 'Sailing2026');
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('ממתין לאישור')).toHaveCount(0);
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await signOut(page);
  await signIn(page, MEMBER.username, 'wrong-pass-1');
  await expect(page.getByText(/שגויים/).first()).toBeVisible();
});

test('a member asks for credits and the admin approves them', async ({ page }) => {
  // The seed already has דני's request for 6 credits
  await home(page);
  await openTab(page, 'admin');
  await page.getByRole('button', { name: /בקשות והצטרפות/ }).click();
  await page.locator('input[id^="amount-"]').first().fill('4');
  await page.getByRole('button', { name: 'אשר', exact: true }).click();
  await expect(page.locator('input[id^="amount-"]')).toHaveCount(0);
  await signInAsMember(page);
  expect(await credits(page)).toBe(5 + 4);
});

test('a forgotten password: the admin issues a temporary one and the member signs in with it', async ({ page }) => {
  await home(page);
  await openTab(page, 'admin');
  await page.getByRole('button', { name: /בקשות והצטרפות/ }).click();
  await page.getByRole('button', { name: 'הנפק סיסמה זמנית ושלח' }).first().click();
  const password = (await topDialog(page).locator('.font-mono.font-black').innerText()).trim();
  expect(password).toMatch(/^[A-Za-z0-9]{8,}$/);
  await signOut(page);
  await signIn(page, MEMBER.email, password);
  await expect(page.locator('header')).toBeVisible();
});

test('a member changes the username and signs in with the new one', async ({ page }) => {
  await signInAsMember(page);
  await openTab(page, 'profile');
  const field = page.locator('#profile-username');
  const save = field.locator('xpath=..').getByRole('button', { name: 'עדכן' });
  await field.fill('noa.barak');
  await save.click();
  await expect(page.getByText('כבר תפוס').first()).toBeVisible();
  await field.fill('dani.sails');
  await save.click();
  await expect(page.getByText('שם המשתמש עודכן').first()).toBeVisible();
  await signOut(page);
  await signIn(page, 'dani.sails', MEMBER.password);
  await expect(page.locator('header')).toBeVisible();
});

test('a tutorial link opens the video, even before signing in', async ({ page }) => {
  await signOut(page);
  await page.goto('/?video=member');
  const win = page.getByRole('dialog', { name: 'סרטוני הדרכה' });
  await expect(win.locator('video')).toBeVisible();
  expect(decodeURIComponent((await win.getByRole('link', { name: /וואטסאפ/ }).getAttribute('href'))!)).toContain('/?video=member');
  await page.keyboard.press('Escape');
  await expect(win).toHaveCount(0);
});

test('the admin previews the app as a regular member and comes back', async ({ page }) => {
  await home(page);
  await openTab(page, 'admin');
  await page.getByRole('button', { name: /צפייה כחבר רגיל/ }).click();
  await expect(page.getByText('מצב צפייה כחבר רגיל')).toBeVisible();
  await expect(page.locator('nav[aria-label="ניווט ראשי"]:visible').getByRole('button', { name: /^ניהול/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'חזרה לתצוגת מנהל' }).click();
  await expect(page.locator('nav[aria-label="ניווט ראשי"]:visible').getByRole('button', { name: /^ניהול/ })).toBeVisible();
});

test('a member posts in the feed', async ({ page }) => {
  await signInAsMember(page);
  await openTab(page, 'feed');
  await page.locator('textarea').first().fill('מישהו מצטרף מחר בבוקר?');
  await page.getByRole('button', { name: /פרסם/ }).first().click();
  await expect(page.getByText('מישהו מצטרף מחר בבוקר?').first()).toBeVisible();
});

test('a member reports a boat issue', async ({ page }) => {
  await signInAsMember(page);
  await openTab(page, 'boats');
  await page.getByRole('button', { name: /דווח על תקלה/ }).first().click();
  const dialog = topDialog(page);
  await dialog.locator('input[type=text], input:not([type])').first().fill('נורת ניווט שרופה');
  await dialog.locator('textarea').first().fill('הנורה הירוקה בצד ימין לא נדלקת');
  await dialog.locator('button[type=submit]').last().click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.getByRole('button', { name: /לוח מודעות תקלות/ }).click();
  await expect(page.getByText('נורת ניווט שרופה').first()).toBeVisible();
});
