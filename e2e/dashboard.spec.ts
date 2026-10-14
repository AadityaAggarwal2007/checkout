import { expect, test } from '@playwright/test';

test('merchant edits an announcement: preview updates, save goes live on the store', async ({ page }) => {
  await page.goto('http://localhost:5103/login');
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'local-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL(/\/stores\/[^/]+$/);
  await page.click('a:has-text("Cart drawer")');
  await page.click('a:has-text("Customize")');
  const message = page.locator('input[value="Free shipping on orders above ₹199"]');
  await message.fill('Diwali sale is live');
  const preview = page.frameLocator('iframe[title="Drawer preview"]');
  await expect(preview.locator('#ck-cart-drawer .ck-ann span')).toHaveText('Diwali sale is live');
  await page.click('button:has-text("Save")');
  await expect(page.getByText('Saved — live on your store')).toBeVisible();
  const config = await (await page.request.get('http://localhost:5102/storefront/config?key=dev-widget-key')).json();
  expect(config.drawer.announcements.messages[0]).toBe('Diwali sale is live');
});

test('a wrong password is refused', async ({ page }) => {
  await page.goto('http://localhost:5103/login');
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'not-the-password');
  await page.click('button:has-text("Log in")');
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});
