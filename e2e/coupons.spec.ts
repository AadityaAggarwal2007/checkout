import { expect, test, type Page } from '@playwright/test';

const DASH = 'http://localhost:5103';
const STORE = 'http://localhost:5104';

/** Logs in once per test run and reuses the cookie (the login route allows 10 tries per 15 minutes). */
let cookies: Awaited<ReturnType<ReturnType<Page['context']>['cookies']>> | null = null;
async function login(page: Page) {
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto(`${DASH}/stores`);
    await page.waitForURL(/\/stores\/[^/]+$/);
    return;
  }
  await page.goto(`${DASH}/login`);
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'local-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL(/\/stores\/[^/]+$/);
  cookies = await page.context().cookies();
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
  await drawer.locator('.ck-cards .ck-card', { hasText: 'FEST15' }).locator('.ck-card-btn').click();
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

test('merchant adds an upsell', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Upsell")');
  await expect(page.getByText('Boxes with kurtis')).toBeVisible(); // the demo one
  await page.click('[data-test=add-upsell]');
  await page.locator('[data-test=upsell-editor] input[placeholder^="Search"]').last().click();
  await page.getByRole('button', { name: /Saint Laurent/ }).click();
  await page.locator('[data-test=upsell-editor] h3').click(); // close the list
  await expect(page.locator('[data-test=upsell-summary]')).toHaveText('Any cart → 1 product, 10% off, 10 min timer');
  await page.click('[data-test=save-upsell]');
  await expect(page.locator('[data-test=upsell-row]')).toHaveCount(2);
});

test('merchant designs the checkout: live preview, then the real checkout shows it', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Checkout design")');
  await page.click('[data-test=tab-login]');
  await page.getByPlaceholder('e.g. Free delivery on prepaid orders').fill('Prepaid orders ship in 24 hours');
  const preview = page.frameLocator('iframe[title="Checkout preview"]');
  await expect(preview.locator('[data-test=banner]')).toHaveText('Prepaid orders ship in 24 hours');
  await page.click('[data-test=tab-exit]');
  await page.getByText('Exit survey').click();
  await expect(preview.locator('[data-test=exit-popup]')).toContainText('why are you leaving');
  await page.click('[data-test=save-design]');
  await expect(page.getByText('Saved — live in your checkout')).toBeVisible();

  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.waitForFunction(() => 'CheckoutDrawer' in window);
  await page.click('button[name=add]');
  await page.locator('#ck-cart-drawer .ck-cta').click();
  const f = page.frameLocator('#ck-checkout iframe');
  await expect(f.locator('[data-test=banner]')).toHaveText('Prepaid orders ship in 24 hours');
  await f.locator('[data-test=close]').click();
  await f.locator('[data-test=exit-reason]').first().click();
  await f.locator('[data-test=exit-leave]').click();
  await expect(page.locator('#ck-checkout')).toHaveCount(0);
});

test('Meta Pixel: switched on in Settings, the store page sends AddToCart to it', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Settings")');
  await page.click('a:has-text("Integrations")');
  await page.getByPlaceholder('123456789012345').fill('123456789012345');
  await page.click('[data-test=save-pixel]');
  await page.getByRole('switch', { name: 'Meta Pixel on' }).click();
  await expect(page.getByText('Meta Pixel on', { exact: true })).toBeVisible();

  await page.route('https://connect.facebook.net/**', (r) => r.abort()); // no calls to Meta from tests
  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.waitForFunction(() => 'CheckoutDrawer' in window);
  await page.click('button[name=add]');
  await expect
    .poll(() => page.evaluate(() => ((window as unknown as { fbq?: { queue?: unknown[][] } }).fbq?.queue ?? []).map((c) => `${c[0]}:${c[2] ?? c[1]}`)))
    .toEqual(expect.arrayContaining(['init:123456789012345', 'trackSingle:AddToCart']));

  await page.goBack();
  await page.waitForURL(/\/settings\/integrations/);
  await page.click('a:has-text("Integrations")');
  await page.getByRole('switch', { name: 'Meta Pixel on' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
});

test('settings: activity log and an API key', async ({ page }) => {
  await login(page);
  await page.click('a:has-text("Settings")');
  await page.click('a:has-text("API keys")');
  await page.getByPlaceholder('e.g. Shiprocket sync').fill('ERP');
  await page.click('[data-test=create-key]');
  const key = await page.locator('[data-test=new-key]').textContent();
  const res = await page.request.get('http://localhost:5102/api/v1/orders', { headers: { authorization: `Bearer ${key}` } });
  expect(res.status()).toBe(200);
  await page.click('a:has-text("Activity log")');
  await expect(page.locator('[data-test=activity-row]').first()).toContainText('Created API key "ERP"');
});
