// Builds the demo club every other test starts from, through the UI (so it doubles as a smoke test):
// three sails, a boat reservation, a pending sign-up, an approved member with a credit request and a
// password-help request, and a feed post. Saves it as the storage state, signed in as the admin.
import { test, expect, home, signOut, openTab, MEMBER } from './support';
import type { Page } from '@playwright/test';

const W = (page: Page, ms = 250) => page.waitForTimeout(ms);

async function goToDay(page: Page, offset: number) {
  await page.getByRole('button', { name: 'יום', exact: true }).click();
  await page.getByRole('button', { name: 'היום', exact: true }).click();
  for (let i = 0; i < offset; i++) await page.locator('button[title="הבא"]').click();
  await W(page);
}

async function createSail(page: Page, offset: number, title: string, from: string, to: string, boat: string) {
  await goToDay(page, offset);
  await page.locator('button[title="פתח הפלגה בתאריך זה"]').first().click();
  await page.getByPlaceholder('למשל: הפלגת שקיעה').fill(title);
  await page.locator('[role=dialog] input[type=time]').nth(0).fill(from);
  await page.locator('[role=dialog] input[type=time]').nth(1).fill(to);
  const boatSelect = page.locator('[role=dialog] select').filter({ has: page.locator('option', { hasText: boat }) }).first();
  const value = await boatSelect.locator('option', { hasText: boat }).first().getAttribute('value');
  await boatSelect.selectOption(value!);
  await page.locator('[role=dialog] form button[type=submit]').last().click();
  // Opening a sail shows its details
  await expect(page.getByRole('button', { name: /הוסף חבר ידנית/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
}

async function join(page: Page, name: string, email: string, phone: string, username: string) {
  await page.goto('/?join=demo-join');
  await page.locator('#join-username').fill(username);
  await expect(page.getByText(`"${username}" פנוי`)).toBeVisible();
  await page.getByPlaceholder('שם פרטי ומשפחה').fill(name);
  await page.getByPlaceholder('050-1234567').fill(phone);
  await page.locator('#auth-identifier').fill(email);
  await page.getByPlaceholder('8 תווים לפחות, אותיות ומספרים').fill(MEMBER.password);
  await page.getByRole('button', { name: 'שלח בקשת הצטרפות' }).click();
  await expect(page.getByText('ממתין לאישור מנהל מועדון')).toBeVisible();
  await page.getByRole('button', { name: /התנתק/ }).first().click();
  await expect(page.getByRole('button', { name: 'התחבר למערכת' })).toBeVisible();
}

test('build the demo club', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByText('כניסה כמנהל').click();
  await expect(page.locator('header')).toBeVisible();

  await createSail(page, 1, 'הפלגת שקיעה', '16:30', '19:30', 'רוח ים');
  await createSail(page, 2, 'הפלגת בוקר רגועה', '08:00', '11:00', 'גלית');
  await createSail(page, 4, 'הפלגת סוף שבוע', '10:00', '14:00', 'רוח ים');

  // A lesson that blocks "גלית" tomorrow morning
  await goToDay(page, 1);
  await page.getByRole('button', { name: 'שריון סירה' }).click();
  await page.locator('#res-title').fill('קורס משיט 30 – מפגש 3');
  await page.locator('#res-start').fill('09:00');
  await page.locator('#res-end').fill('12:00');
  await page.getByRole('button', { name: /^שריין/ }).click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.getByRole('button', { name: 'חודש', exact: true }).click();

  await signOut(page);
  await join(page, 'נועה ברק', 'noa@example.com', '052-7654321', 'noa.barak');
  await join(page, MEMBER.name, MEMBER.email, '054-3332211', MEMBER.username);

  // The admin approves דני; נועה stays pending
  await page.getByText('כניסה כמנהל').click();
  await page.evaluate((email) => {
    const d = JSON.parse(localStorage.getItem('sailing_club_v2_clean')!);
    d.users = d.users.map((u: { email: string }) => (u.email === email ? { ...u, status: 'approved' } : u));
    localStorage.setItem('sailing_club_v2_clean', JSON.stringify(d));
  }, MEMBER.email);
  await signOut(page);

  // דני asks for credits and posts in the feed
  await page.locator('#auth-identifier').fill(MEMBER.username);
  await page.locator('input[type=password]').first().fill(MEMBER.password);
  await page.getByRole('button', { name: 'התחבר למערכת' }).click();
  await expect(page.locator('header')).toBeVisible();
  await openTab(page, 'profile');
  await page.getByRole('button', { name: 'בקש קרדיטים' }).click();
  await page.locator('#credit-amount').fill('6');
  await page.getByLabel('הערה למנהל').fill('שילמתי בביט');
  await page.getByRole('button', { name: 'שלח בקשה' }).click();
  await expect(page.getByText(/ממתינה לאישור/).first()).toBeVisible();
  await openTab(page, 'feed');
  await page.locator('textarea').first().fill('יצאנו אתמול לשקיעה, ים שקט ורוח נעימה ⛵');
  await page.getByRole('button', { name: /פרסם/ }).first().click();
  await expect(page.getByText('יצאנו אתמול לשקיעה').first()).toBeVisible();

  // ...and later forgets the password
  await signOut(page);
  await page.getByRole('button', { name: 'שכחת סיסמה?' }).click();
  await page.getByPlaceholder('name@example.com').fill(MEMBER.email);
  await page.getByRole('button', { name: 'בקש מההנהלה סיסמה חדשה' }).click();
  await expect(page.getByText('הבקשה נשלחה').first()).toBeVisible();

  // Back to the admin for every other test
  await page.goto('/');
  await page.getByText('כניסה כמנהל').click();
  await home(page);
  await page.evaluate(() => localStorage.setItem('sailing_club_calendar_view', 'month'));
  await page.context().storageState({ path: 'e2e/.state/seed.json' });
});
