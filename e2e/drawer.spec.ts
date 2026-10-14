import { expect, test, type Page } from '@playwright/test';

const STORE = 'http://localhost:5104';
const drawer = (page: Page) => page.locator('#ck-cart-drawer');

test('add to cart opens our drawer with B1G1, prepaid 5% and the theme count updated', async ({ page }) => {
  await page.goto(`${STORE}/products/16-pcs-oxidised-jhumkas-red-cream-box`);
  await page.click('button[name=add]');
  await expect(drawer(page).locator('.ck-open')).toBeAttached();
  await expect(drawer(page).getByRole('heading', { name: 'Shopping Bag (1)' })).toBeVisible();
  await drawer(page).getByRole('button', { name: 'Increase' }).first().click();
  await expect(drawer(page).getByText('B1G1 applied!')).toBeVisible();
  // ₹124 × 2, one free, 5% prepaid on the rest = ₹117.80
  await expect(drawer(page).locator('.ck-total b')).toHaveText('₹117.80');
  await expect(page.locator('.cart-count-bubble')).toHaveText('2');
});

test('a gift tier adds the free gift line; a bad code says why', async ({ page }) => {
  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.click('button[name=add]');
  await expect(drawer(page).getByText('Men Set of 4 Eau De Parfum 20 ml')).toBeVisible();
  await expect(drawer(page).getByText('Free Gift').first()).toBeVisible();
  await drawer(page).locator('.ck-code-row input').fill('save50');
  await drawer(page).locator('.ck-code-row button').click();
  await expect(drawer(page).getByText('This code is not valid.')).toBeVisible();
});

test('drawer works on a phone screen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.click('button[name=add]');
  const panel = drawer(page).locator('.ck-panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width).toBe(390);
});
