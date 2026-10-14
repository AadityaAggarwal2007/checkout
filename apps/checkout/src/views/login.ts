import { maskPhone, normalizeIndianMobile } from '@checkout/shared/india';
import { device } from '../api.js';
import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';

/** Step 1: mobile number, then the 6-digit code sent on WhatsApp. */
export function loginView(app: App): HTMLElement {
  return app.ui.challengeId ? codeView(app) : phoneView(app);
}

function phoneView(app: App): HTMLElement {
  const submit = (e: Event) => {
    e.preventDefault();
    const phone = normalizeIndianMobile(app.ui.phone);
    if (!phone) {
      app.ui.notice = { kind: 'error', text: 'Enter a valid 10-digit mobile number.' };
      return app.render();
    }
    void app.run('otp', async () => {
      const res = await app.api.sendOtp(phone);
      app.ui.challengeId = res.challengeId;
      app.ui.maskedPhone = res.phone;
      app.ui.devCode = res.devCode;
      app.ui.resendAt = Date.now() + res.resendInMs;
      app.ui.code = '';
    });
  };
  return h(
    'form',
    { class: 'card', onsubmit: submit, novalidate: true },
    h('h2', {}, 'Enter your mobile number'),
    h('p', { class: 'muted' }, 'We use it to send order updates and to find your saved addresses.'),
    h(
      'label',
      { class: 'phone-field' },
      h('span', { class: 'cc' }, '+91'),
      h('input', {
        type: 'tel',
        inputmode: 'numeric',
        autocomplete: 'tel-national',
        maxlength: 14,
        placeholder: '10-digit mobile number',
        value: app.ui.phone,
        'data-key': 'phone',
        'data-test': 'phone',
        'aria-label': 'Mobile number',
        oninput: (e: Event) => (app.ui.phone = (e.target as HTMLInputElement).value),
      }),
    ),
    h('button', { class: 'btn', type: 'submit', disabled: app.ui.busy === 'otp', 'data-test': 'send-otp' }, app.ui.busy === 'otp' ? 'Sending…' : 'Continue'),
    h('p', { class: 'hint' }, svg(ICONS.whatsapp), 'You will get a one-time code on WhatsApp'),
  );
}

function codeView(app: App): HTMLElement {
  const phone = normalizeIndianMobile(app.ui.phone)!;
  const verify = (e?: Event) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(app.ui.code)) {
      app.ui.notice = { kind: 'error', text: 'Enter the 6-digit code.' };
      return app.render();
    }
    void app.run('verify', async () => {
      const res = await app.api.verifyOtp(app.ui.challengeId!, phone, app.ui.code);
      device.set(res.deviceToken);
      app.ui.challengeId = undefined;
      app.set(res.state);
    });
  };
  const wait = Math.max(0, Math.ceil((app.ui.resendAt - Date.now()) / 1000));
  const timer = h('button', { type: 'button', class: 'link', disabled: wait > 0, 'data-test': 'resend' }, wait > 0 ? `Resend code in ${wait}s` : 'Resend code');
  if (wait > 0) {
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((app.ui.resendAt - Date.now()) / 1000));
      if (!timer.isConnected) return window.clearInterval(tick);
      timer.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code';
      if (left === 0) {
        (timer as HTMLButtonElement).disabled = false;
        window.clearInterval(tick);
      }
    }, 1000);
  }
  timer.addEventListener('click', () =>
    void app.run('otp', async () => {
      const res = await app.api.sendOtp(phone);
      app.ui.challengeId = res.challengeId;
      app.ui.resendAt = Date.now() + res.resendInMs;
      app.ui.code = '';
      app.ui.devCode = res.devCode;
      app.ui.notice = { kind: 'info', text: 'A new code is on its way.' };
    }),
  );
  return h(
    'form',
    { class: 'card', onsubmit: verify, novalidate: true },
    h('h2', {}, 'Enter the code'),
    h('p', { class: 'muted' }, 'Sent on WhatsApp to ', h('b', {}, app.ui.maskedPhone ?? maskPhone(phone)), ' ', h('button', {
      type: 'button',
      class: 'link',
      'data-test': 'change-number',
      onclick: () => {
        app.ui.challengeId = undefined;
        app.render();
      },
    }, 'Change')),
    h('input', {
      class: 'otp',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: 6,
      placeholder: '••••••',
      value: app.ui.code,
      'data-key': 'otp',
      'data-test': 'otp',
      'aria-label': '6-digit code',
      oninput: (e: Event) => {
        const el = e.target as HTMLInputElement;
        el.value = el.value.replace(/\D/g, '').slice(0, 6);
        app.ui.code = el.value;
        if (el.value.length === 6) verify();
      },
    }),
    h('button', { class: 'btn', type: 'submit', disabled: app.ui.busy === 'verify', 'data-test': 'verify-otp' }, app.ui.busy === 'verify' ? 'Checking…' : 'Verify'),
    h('div', { class: 'center' }, timer),
    app.ui.devCode ? h('p', { class: 'dev-code', 'data-test': 'dev-code' }, `Test mode (no WhatsApp yet): your code is ${app.ui.devCode}`) : null,
  );
}
