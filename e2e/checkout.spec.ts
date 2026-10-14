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
  await expect(f.locator('[data-test=upi-panel]')).toBeVisible();
  await dismissHurray(f);
}

/** The "Hurray!" popup for the offers that applied (B1G1, prepaid) shows once per checkout. */
async function dismissHurray(f: FrameLocator): Promise<void> {
  const pop = f.locator('[data-test=hurray]');
  await pop.waitFor({ timeout: 2000 }).catch(() => undefined);
  if (await pop.isVisible()) await pop.getByRole('button', { name: 'Yay, Thanks!' }).click();
}

/** The reference of the payment the page just started (from its own /pay answer). */
async function payRef(page: Page, start: () => Promise<void>): Promise<string> {
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/checkout/api/pay') && r.request().method() === 'POST'), start()]);
  return ((await res.json()) as { pay: { ref: string } }).pay.ref;
}

/** "Paying" a UPI QR locally = the Pay button on the test gateway's page for that reference. */
async function payOnTestGateway(page: Page, ref: string): Promise<void> {
  const tab = await page.context().newPage();
  await tab.goto(`${API}/checkout/dev-gateway/${ref}`);
  await tab.getByRole('button', { name: /^Pay/ }).click();
  await tab.close();
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

test('desktop: a card failure can be retried; UPI shows its QR inside the page and gets paid', async ({ page, context }) => {
  const f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);

  // UPI is open at the top of "Pay via" with a blurred QR; other methods are rows below it.
  await expect(f.locator('[data-test=pay-via] h2')).toHaveText('Pay via');
  await expect(f.locator('[data-test=show-qr]')).toBeVisible();

  const [failTab] = await Promise.all([context.waitForEvent('page'), f.locator('[data-test=method-card]').click()]);
  await failTab.waitForURL(/dev-gateway/);
  await failTab.getByRole('button', { name: 'Fail payment' }).click();
  await expect(f.locator('[data-test=payment-failed]')).toBeVisible();

  const ref = await payRef(page, () => f.locator('[data-test=show-qr]').click());
  await expect(f.locator('[data-test=upi-inline] svg')).toBeVisible();
  await expect(f.locator('[data-test=method-card]')).toBeVisible(); // still free to switch
  await payOnTestGateway(page, ref);
  await expect(f.locator('[data-test=thank-you]')).toBeVisible();
  const number = await f.locator('[data-test=order-number]').textContent();
  await expect.poll(async () => (await devStoreOrders(page)).find((o) => o.order.customAttributes.some((a) => a.value === number))?.order.financialStatus).toBe('PAID');
});

test('desktop: a coupon change while the QR is open lets the QR go first', async ({ page }) => {
  const f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);
  await f.locator('[data-test=show-qr]').click();
  await expect(f.locator('[data-test=upi-inline]')).toBeVisible();
  await f.locator('[data-test=coupon-input]').fill('NOPE');
  await f.locator('[data-test=coupon-input]').press('Enter');
  await expect(f.locator('[data-test=show-qr]')).toBeVisible(); // back to the blurred QR, no "payment in progress" error
});

test('phone: full screen, a card payment in the same tab, back to the store with an empty cart', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const f = await openCheckout(page);
  const box = await page.locator('#ck-checkout iframe').boundingBox();
  expect(box?.width).toBe(390);
  await login(page, f, newPhone());
  await address(f);
  await f.locator('[data-test=method-card]').click();
  await page.waitForURL(/dev-gateway/);
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.waitForURL(/\/checkout\/done\//);
  await expect(page.getByText('Your order is placed')).toBeVisible();
  await page.getByRole('link', { name: 'Continue shopping' }).click();
  await page.waitForURL(`${STORE}/`);
  await expect(page.locator('.cart-count-bubble')).toHaveText('0');
  await context.close();
});

test('phone: UPI app tiles; a tap starts the payment and the app links carry it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);
  await expect(f.locator('[data-test=upi-app-phonepe]')).toBeVisible();
  // The store page is asked to open PhonePe (headless has no such app: the page simply stays).
  const ref = await payRef(page, () => f.locator('[data-test=upi-app-phonepe]').click());
  await expect(f.locator('[data-test=upi-open-phonepe]')).toHaveAttribute('href', new RegExp(`^phonepe://pay\\?pa=test%40dev.*tr=${ref}`));
  await expect(f.locator('[data-test=upi-open-other]')).toHaveAttribute('href', /^upi:\/\/pay\?/);
  await payOnTestGateway(page, ref);
  await expect(f.locator('[data-test=thank-you]')).toBeVisible();
  await context.close();
});

test('a returning shopper on the same browser skips OTP and the address', async ({ page }) => {
  let f = await openCheckout(page);
  await login(page, f, newPhone());
  await address(f);
  await f.locator('[data-test=close]').click();
  // The exit popup reminds once (default: savings reminder); "Leave" closes.
  await expect(f.locator('[data-test=exit-popup]')).toBeVisible();
  await f.locator('[data-test=exit-leave]').click();
  await expect(page.locator('#ck-checkout')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { CheckoutDrawer: { open(): void } }).CheckoutDrawer.open());
  await page.locator('#ck-cart-drawer .ck-cta').click();
  f = page.frameLocator('#ck-checkout iframe');
  await expect(f.locator('[data-test=method-cod]')).toBeVisible();
  await expect(f.locator('[data-test=delivery]')).toContainText('Asha Verma');
  // "Not you?" forgets this browser.
  await dismissHurray(f);
  await f.locator('[data-test=account-toggle]').click();
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

test('upsell: the kurti checkout offers a jewellery box with a timer; adding it changes the total', async ({ page }) => {
  await page.goto(`${STORE}/products/cotton-straight-kurti`);
  await page.waitForFunction(() => 'CheckoutDrawer' in window);
  await page.click('button[name=add]');
  await page.locator('#ck-cart-drawer .ck-cta').click();
  const f = page.frameLocator('#ck-checkout iframe');
  await login(page, f, newPhone());
  await address(f);
  await expect(f.locator('[data-test=upsell]')).toContainText('Add a jewellery box');
  await expect(f.locator('[data-test=upsell-timer]')).toHaveText(/^(10:00|09:5\d)$/);
  const before = await f.locator('[data-test=summary-total]').textContent();
  await f.locator('[data-test=upsell-add-2031]').click();
  await expect(f.locator('[data-test=summary-total]')).not.toHaveText(before!);
  await f.locator('[data-test=summary-toggle]').click();
  await expect(f.getByText('White jewellery box')).toBeVisible();
  await expect(f.locator('[data-test=upsell-remove]')).toBeVisible();
  await f.locator('[data-test=method-cod]').click();
  await f.locator('[data-test=confirm-cod]').click();
  await expect(f.locator('[data-test=thank-you]')).toBeVisible();
});

test('dashboard home shows sales and the funnel', async ({ page }) => {
  await page.goto('http://localhost:5103/login');
  await page.fill('input[type=email]', 'owner@local.test');
  await page.fill('input[type=password]', 'local-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL(/\/stores\/[^/]+$/);
  await expect(page.locator('[data-test=kpi-orders]')).not.toHaveText('0'); // the tests above placed orders
  await expect(page.locator('[data-test=funnel]')).toContainText('Order placed');
  await page.click('a:has-text("Abandoned checkouts")');
  await expect(page.getByRole('heading', { name: 'Abandoned checkouts' })).toBeVisible();
});
