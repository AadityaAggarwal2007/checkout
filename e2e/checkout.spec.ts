import { expect, test, type FrameLocator, type Page } from '@playwright/test';

/**
 * Our checkout end to end on the local test store: drawer → iframe → WhatsApp OTP (read from the
 * dev outbox) → address → COD / UPI on the local test gateway → order in "Shopify" (dev store).
 */
const STORE = 'http://localhost:5104';
const API = 'http://localhost:5102';
const PRODUCT = `${STORE}/products/16-pcs-oxidised-jhumkas-red-cream-box`;

/** A new mobile number per test and run (OTP limits are per number). */
let n = 0;
const newPhone = () => `9${String(Date.now()).slice(-7)}${String(++n).padStart(2, '0')}`;

async function openCheckout(page: Page): Promise<FrameLocator> {
  await page.goto(PRODUCT);
  // Our script takes over add-to-cart once it has loaded (before that the theme's own cart works).
  await page.waitForFunction(() => 'CheckoutDrawer' in window);
  await page.click('button[name=add]');
  const drawer = page.locator('#ck-cart-drawer');
  await drawer.getByRole('button', { name: 'Increase' }).first().click();
  await expect(drawer.locator('.ck-total b')).toHaveText('₹117.80');
  await drawer.locator('.ck-cta').click();
  const frame = page.frameLocator('#ck-checkout iframe');
  await expect(frame.locator('[data-test=phone]')).toBeVisible();
  return frame;
}

async function login(page: Page, f: FrameLocator, phone: string): Promise<void> {
  await f.locator('[data-test=phone]').fill(phone);
  await f.locator('[data-test=send-otp]').click();
  await expect(f.locator('[data-test=otp]')).toBeVisible();
  const { code } = await (await page.request.get(`${API}/checkout/dev/otp?phone=${phone}`)).json();
  await expect(f.locator('[data-test=dev-code]')).toContainText(code); // trial mode shows the code
  await f.locator('[data-test=otp]').fill(code); // 6 digits submit by themselves
}

async function address(f: FrameLocator): Promise<void> {
  await f.locator('[data-test=f-pincode]').fill('302001');
  await expect(f.locator('[data-test=f-city]')).toHaveValue('Jaipur'); // pincode autofill
  await expect(f.locator('[data-test=f-state]')).toHaveValue('Rajasthan');
  await f.locator('[data-test=f-line1]').fill('12 MG Road');
  await f.locator('[data-test=f-name]').fill('Asha Verma');
  await f.locator('[data-test=save-address]').click();
  await expect(f.locator('[data-test=method-upi]')).toBeVisible();
}

async function devStoreOrders(page: Page): Promise<Array<{ name: string; order: { financialStatus: string; customAttributes: Array<{ key: string; value: string }> } }>> {
  return (await (await page.request.get(`${STORE}/dev-admin/orders?format=json`)).json()).orders;
}

test('desktop: COD with the confirmation popup places the order and empties the cart', async ({ page }) => {
  const f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);
  await expect(f.locator('[data-test=prepaid-banner]')).toHaveText('Pay online and save ₹6.20');
  await f.locator('[data-test=method-cod]').click();
  await f.locator('[data-test=confirm-cod]').click();
  await expect(f.locator('[data-test=thank-you]')).toBeVisible();
  const number = await f.locator('[data-test=order-number]').textContent();
  expect(number).toMatch(/^CK\d+$/);
  await expect(page.locator('.cart-count-bubble')).toHaveText('0');
  await expect.poll(async () => (await devStoreOrders(page)).some((o) => o.order.customAttributes.some((a) => a.value === number))).toBe(true);
  await f.locator('[data-test=continue-shopping]').click();
  await expect(page.locator('#ck-checkout')).toHaveCount(0);
});

test('desktop: UPI opens the gateway in a new tab; a failure can be retried, then it is paid', async ({ page, context }) => {
  const f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);

  const [failTab] = await Promise.all([context.waitForEvent('page'), f.locator('[data-test=method-upi]').click()]);
  await failTab.waitForURL(/dev-gateway/);
  await failTab.getByRole('button', { name: 'Fail payment' }).click();
  await expect(f.locator('[data-test=payment-failed]')).toBeVisible();

  const [payTab] = await Promise.all([context.waitForEvent('page'), f.locator('[data-test=method-card]').click()]);
  await payTab.waitForURL(/dev-gateway/);
  await expect(f.locator('[data-test=processing]')).toBeVisible();
  await payTab.getByRole('button', { name: /^Pay/ }).click();
  await expect(f.locator('[data-test=thank-you]')).toBeVisible();
  const number = await f.locator('[data-test=order-number]').textContent();
  await expect.poll(async () => (await devStoreOrders(page)).find((o) => o.order.customAttributes.some((a) => a.value === number))?.order.financialStatus).toBe('PAID');
});

test('phone: full screen, UPI in the same tab, back to the store with an empty cart', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const f = await openCheckout(page);
  const box = await page.locator('#ck-checkout iframe').boundingBox();
  expect(box?.width).toBe(390);
  await login(page, f, newPhone());
  await address(f);
  await f.locator('[data-test=method-upi]').click();
  await page.waitForURL(/dev-gateway/);
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.waitForURL(/\/checkout\/done\//);
  await expect(page.getByText('Your order is placed')).toBeVisible();
  await page.getByRole('link', { name: 'Continue shopping' }).click();
  await page.waitForURL(`${STORE}/`);
  await expect(page.locator('.cart-count-bubble')).toHaveText('0');
  await context.close();
});

test('a returning shopper on the same browser skips OTP and the address', async ({ page }) => {
  let f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);
  await f.locator('[data-test=close]').click();
  await expect(page.locator('#ck-checkout')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { CheckoutDrawer: { open(): void } }).CheckoutDrawer.open());
  await page.locator('#ck-cart-drawer .ck-cta').click();
  f = page.frameLocator('#ck-checkout iframe');
  await expect(f.locator('[data-test=method-cod]')).toBeVisible();
  await expect(f.getByText('Deliver to Asha Verma')).toBeVisible();
  // "Not you?" forgets this browser.
  await f.locator('[data-test=not-you]').click();
  await expect(f.locator('[data-test=phone]')).toBeVisible();
});

test('the merchant sees the orders and the payment settings', async ({ page }) => {
  await page.goto('http://localhost:5103/login');
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'local-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL(/\/stores\/[^/]+$/);
  await page.click('a:has-text("Orders")');
  await expect(page.locator('tbody tr').first()).toContainText('CK');
  await page.locator('tbody a').first().click();
  await expect(page.getByText('Ship to')).toBeVisible();
  await expect(page.getByText('Asha Verma').first()).toBeVisible();
  await page.click('a:has-text("Settings")');
  await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
  await expect(page.getByText('Test gateway (local only)')).toBeVisible();
  await page.click('a:has-text("Shipping")');
  await expect(page.locator('input[value="Standard"]')).toBeVisible();
});
