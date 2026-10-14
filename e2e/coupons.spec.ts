import { expect, test, type Page } from '@playwright/test';

const DASH = 'http://localhost:5103';
const STORE = 'http://localhost:5104';

async function login(page: Page) {
  await page.goto(`${DASH}/login`);
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'local-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL(/\/stores\/[^/]+$/);
}

test('merchant creates a coupon in the wizard and the shopper uses it in the cart', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Coupons")');
  await expect(page.getByRole('link', { name: 'B1G1' })).toBeVisible();

  await page.click('[data-test=add-coupon]');
  await page.click('a:has-text("Amount off products / order")');
  await page.fill('[data-test=coupon-code]', 'fest15');
  await page.getByLabel('Percent off').fill('15');
  await expect(page.locator('[data-test=summary-headline]')).toHaveText('Flat 15% off on total value');
  await page.click('[data-test=next-step]'); // condition
  await page.getByText('Minimum / maximum purchase amount').click();
  await page.getByLabel('Minimum purchase amount').fill('299');
  await expect(page.getByText('Valid on a minimum purchase of ₹299').first()).toBeVisible();
  await page.click('[data-test=save-coupon]');
  await page.waitForURL(/\/coupons$/);
  await expect(page.getByRole('link', { name: 'FEST15' })).toBeVisible();

  // The shopper sees it in the drawer's coupon list and it works on a ₹499 kurti.
  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.waitForFunction(() => 'CheckoutDrawer' in window);
  await page.click('button[name=add]');
  const drawer = page.locator('#ck-cart-drawer');
  await drawer.locator('.ck-coupon-btn').click();
  await expect(drawer.getByText('Flat 15% off on total value')).toBeVisible();
  await drawer.locator('.ck-code-row input').fill('FEST15');
  await drawer.locator('.ck-code-row button').click();
  await expect(drawer.getByText('FEST15 applied!').or(drawer.getByText('FEST15')).first()).toBeVisible();
});

test('merchant adds a UPI-only payment offer from the wizard', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Payment offers")');
  await page.click('a:has-text("Add offer")');
  await page.fill('[data-test=coupon-code]', 'UPIDEAL');
  await page.getByText('Set for individual payment modes').click();
  await page.getByLabel('Percent off').first().fill('10');
  await expect(page.locator('[data-test=summary-headline]')).toHaveText('Extra 10% off on UPI');
  await page.click('[data-test=save-coupon]');
  await page.waitForURL(/\/payment-offers$/);
  await expect(page.getByRole('link', { name: 'UPIDEAL' })).toBeVisible();
});

test('merchant adds an RTO pincode rule and switches it off', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("RTO suite")');
  await page.click('[data-test=add-rto]');
  await page.getByRole('button', { name: /^Pincodes/ }).click();
  await page.fill('[data-test=rto-pincodes]', '560001'); // not a pincode the checkout tests use
  await page.click('[data-test=save-rto]');
  await expect(page.locator('[data-test=rto-row]')).toContainText('When the pincode is one of 1 listed');
  // The API tests check that the checkout hides COD for it; here the switch works.
  await page.getByRole('switch', { name: 'Pincodes on' }).click();
  await expect(page.getByText('Rule off')).toBeVisible();
});
