import type { CheckoutAddress } from '@checkout/shared';
import { INDIAN_STATES } from '@checkout/shared/india';
import { device } from '../api.js';
import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { formatPhone } from '../format.js';
import { ICONS } from '../icons.js';

/** Step 2: pick a saved address (only shown after OTP) or add a new one. */
export function addressView(app: App): HTMLElement {
  const s = app.state;
  const showForm = app.ui.addressForm || s.addresses.length === 0;
  return h(
    'div',
    { class: 'card' },
    h('h2', {}, 'Delivery address'),
    s.customer ? h('p', { class: 'muted' }, 'Delivering to ', h('b', {}, formatPhone(s.customer.phone)), ' ', notYou(app)) : null,
    showForm ? formView(app) : savedView(app),
  );
}

export function notYou(app: App): HTMLElement {
  return h(
    'button',
    {
      class: 'link',
      'data-test': 'not-you',
      onclick: () =>
        void app.run('logout', async () => {
          const res = await app.api.logout();
          device.set(undefined);
          app.ui.challengeId = undefined;
          app.ui.phone = '';
          app.set(res.state);
        }),
    },
    'Not you?',
  );
}

export const addressLine = (a: CheckoutAddress) => [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`].filter(Boolean).join(', ');

function savedView(app: App): HTMLElement {
  return h(
    'div',
    { class: 'addresses' },
    ...app.state.addresses.map((a) =>
      h(
        'button',
        {
          class: 'address',
          'data-test': 'saved-address',
          disabled: !!app.ui.busy,
          onclick: () => void app.run('address', async () => app.set((await app.api.chooseAddress({ addressId: a.id })).state)),
        },
        svg(ICONS.pin),
        h('span', { class: 'addr-text' }, h('b', {}, a.name), h('span', { class: 'tagchip' }, a.tag), h('span', { class: 'muted' }, addressLine(a))),
        svg(ICONS.chevron),
      ),
    ),
    h('button', {
      class: 'btn alt',
      'data-test': 'add-address',
      onclick: () => {
        app.ui.addressForm = true;
        app.render();
      },
    }, '+ Add a new address'),
  );
}

function field(app: App, key: string, label: string, opts: Record<string, string | number | boolean> = {}): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', {}, label),
    h('input', {
      value: app.ui.form[key] ?? '',
      'data-key': `f-${key}`,
      'data-test': `f-${key}`,
      name: key,
      ...opts,
      oninput: (e: Event) => {
        app.ui.form[key] = (e.target as HTMLInputElement).value;
        if (key === 'pincode') void pincodeLookup(app, (e.target as HTMLInputElement).value);
      },
    }),
  );
}

async function pincodeLookup(app: App, pin: string): Promise<void> {
  if (!/^[1-9]\d{5}$/.test(pin)) return;
  try {
    const info = await app.api.pincode(pin);
    if (app.ui.form.pincode !== pin) return;
    app.ui.form.city = info.city;
    app.ui.form.state = info.state;
    app.render();
  } catch {
    /* unknown pincode: the shopper types city and state */
  }
}

function formView(app: App): HTMLElement {
  const f = app.ui.form;
  const ask = app.state.settings.askEmail;
  f.name ??= app.state.customer?.name ?? '';
  f.email ??= app.state.email ?? '';
  const submit = (e: Event) => {
    e.preventDefault();
    void app.run('address', async () => {
      const res = await app.api.chooseAddress({
        address: { name: f.name, email: ask === 'hidden' ? '' : f.email, line1: f.line1, line2: f.line2, landmark: f.landmark, city: f.city, state: f.state, pincode: f.pincode, tag: f.tag || 'HOME' },
      });
      app.ui.addressForm = false;
      app.ui.form = { tag: 'HOME' };
      app.set(res.state);
    });
  };
  return h(
    'form',
    { class: 'address-form', onsubmit: submit, novalidate: true },
    field(app, 'pincode', 'Pincode', { inputmode: 'numeric', maxlength: 6, autocomplete: 'postal-code', required: true }),
    h('div', { class: 'two' }, field(app, 'city', 'City', { autocomplete: 'address-level2', required: true }), stateSelect(app)),
    field(app, 'line1', 'House no., building, street', { autocomplete: 'address-line1', required: true, maxlength: 120 }),
    field(app, 'line2', 'Area, colony (optional)', { autocomplete: 'address-line2', maxlength: 120 }),
    field(app, 'landmark', 'Landmark (optional)', { maxlength: 80 }),
    field(app, 'name', 'Full name', { autocomplete: 'name', required: true, maxlength: 60 }),
    ask === 'hidden' ? null : field(app, 'email', ask === 'required' ? 'Email' : 'Email (optional)', { type: 'email', autocomplete: 'email', maxlength: 120 }),
    h(
      'div',
      { class: 'chips', role: 'radiogroup', 'aria-label': 'Save address as' },
      ...(['HOME', 'WORK', 'OTHER'] as const).map((t) =>
        h('button', {
          type: 'button',
          class: `chip${(f.tag || 'HOME') === t ? ' on' : ''}`,
          role: 'radio',
          'aria-checked': String((f.tag || 'HOME') === t),
          onclick: () => {
            f.tag = t;
            app.render();
          },
        }, t[0] + t.slice(1).toLowerCase()),
      ),
    ),
    h('button', { class: 'btn', type: 'submit', disabled: app.ui.busy === 'address', 'data-test': 'save-address' }, app.ui.busy === 'address' ? 'Saving…' : 'Continue to payment'),
    app.state.addresses.length > 0
      ? h('button', {
          type: 'button',
          class: 'btn alt',
          onclick: () => {
            app.ui.addressForm = false;
            app.render();
          },
        }, 'Use a saved address')
      : null,
  );
}

function stateSelect(app: App): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', {}, 'State'),
    h(
      'select',
      {
        'data-key': 'f-state',
        'data-test': 'f-state',
        autocomplete: 'address-level1',
        onchange: (e: Event) => (app.ui.form.state = (e.target as HTMLSelectElement).value),
      },
      h('option', { value: '' }, 'Choose'),
      ...INDIAN_STATES.map((st) => h('option', { value: st, selected: app.ui.form.state === st }, st)),
    ),
  );
}
