import type { App } from '../app.js';
import { h } from '../dom.js';
import { money } from '../format.js';

/** Should closing the checkout ask first? Not after the order, not while paying, once per visit. */
export function wantsExitPrompt(app: App): boolean {
  const s = app.state;
  return !!s && s.settings.exit.mode !== 'off' && !app.ui.exitAsked && (s.step === 'login' || s.step === 'address' || s.step === 'payment');
}

/** The exit popup: a reminder (with the savings when there are any) or a one-tap survey. */
export function exitView(app: App): HTMLElement {
  const s = app.state;
  const e = s.settings.exit;
  const stay = () => {
    app.ui.exitOpen = false;
    app.render();
  };
  const leave = () => {
    app.ui.exitOpen = false;
    app.close(true);
  };
  const survey = e.mode === 'survey';
  const saving = e.mode === 'savings' && s.summary.savings > 0 ? s.summary.savings : 0;
  return h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': e.title, 'data-test': 'exit-popup' },
    h(
      'div',
      { class: 'sheet' },
      h('h2', {}, survey ? 'Before you go, why are you leaving?' : e.title),
      survey ? null : saving ? h('p', { class: 'exit-save' }, `You are saving ${money(saving)} on this order. Leave anyway?`) : e.text ? h('p', { class: 'muted' }, e.text) : null,
      survey
        ? h(
            'div',
            { class: 'reasons' },
            ...e.reasons.map((r) =>
              h('button', {
                class: `chip${app.ui.exitReason === r ? ' on' : ''}`,
                'data-test': 'exit-reason',
                onclick: () => {
                  app.ui.exitReason = r;
                  app.render();
                },
              }, r),
            ),
          )
        : null,
      h('button', { class: 'btn', 'data-test': 'exit-stay', onclick: stay }, 'Continue checkout'),
      h('button', {
        class: 'btn alt',
        'data-test': 'exit-leave',
        disabled: survey && !app.ui.exitReason,
        onclick: () => {
          if (survey && app.ui.exitReason) void app.api.exit(app.ui.exitReason).catch(() => undefined);
          leave();
        },
      }, survey ? 'Submit & leave' : 'Leave'),
    ),
  );
}
