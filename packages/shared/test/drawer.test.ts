import { describe, expect, it } from 'vitest';
import { defaultDrawerSettings, parseDrawerSettings } from '../src/index.js';

describe('drawer settings', () => {
  it('has sensible defaults for every section', () => {
    const d = defaultDrawerSettings();
    expect(d.colors.primary).toBe('#0A2870');
    expect(d.settings.openOnAdd).toBe(true);
    expect(d.announcements.messages).toEqual(['Free delivery across India']);
  });

  it('fills missing fields of an old saved config and drops unknown keys', () => {
    const d = parseDrawerSettings({ announcements: { messages: ['Buy 1 Get 1 Free'] }, legacy: true });
    expect(d.announcements).toMatchObject({ enabled: true, messages: ['Buy 1 Get 1 Free'], durationSec: 3 });
    expect('legacy' in d).toBe(false);
  });

  it('refuses bad values', () => {
    expect(() => parseDrawerSettings({ colors: { primary: 'blue' } })).toThrow();
    expect(() => parseDrawerSettings({ announcements: { messages: ['x'.repeat(51)] } })).toThrow();
    expect(() => parseDrawerSettings({ settings: { emptyButtonUrl: 'javascript:alert(1)' } })).toThrow();
  });
});
