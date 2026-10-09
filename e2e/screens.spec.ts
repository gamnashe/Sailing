// Every screen and window opens, fits the screen (nothing cut off or spilling sideways) and is saved
// as a screenshot for visual review (e2e-results/screens/<size>/<screen>.png).
import { test, expect, expectGoodLayout, snap } from './support';
import { SCREENS } from './screens';

for (const screen of SCREENS) {
  test(screen.name, async ({ page }) => {
    await screen.open(page);
    if (screen.dialog) await expect(page.locator('[role=dialog]').last()).toBeVisible();
    await page.waitForTimeout(300);
    await snap(page, screen.name);
    await expectGoodLayout(page);
  });
}
