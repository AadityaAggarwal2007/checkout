'use client';
import { useEffect, useState, type ReactNode } from 'react';

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-ink' : 'bg-zinc-300'} disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Field({ label, hint, children, count }: { label: string; hint?: string; children: ReactNode; count?: [number, number] }) {
  return (
    <label className="block">
      <span className="label flex justify-between">
        {label}
        {count && <span className={`font-normal ${count[0] > count[1] ? 'text-red-600' : 'text-ink-3'}`}>{count[0]}/{count[1]}</span>}
      </span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, max, ...rest }: { value: string; onChange: (v: string) => void; max?: number; placeholder?: string; type?: string }) {
  return <input className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <select className="input pr-8" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="h-4 w-4 rounded accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <span className="relative h-9 w-9 overflow-hidden rounded-lg border border-ink-line" style={{ background: value }}>
        <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-xs uppercase text-ink-3">{value}</span>
      </span>
    </label>
  );
}

export function Section({ title, description, right, children }: { title: string; description?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        {right}
      </div>
      {children && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  );
}

/** Rupees typed by the merchant, kept as paise (undefined = empty). Never floats in maths. */
export function MoneyInput({ value, onChange, placeholder, label }: { value: number | undefined; onChange: (paise: number | undefined) => void; placeholder?: string; label?: string }) {
  const show = (p: number | undefined) => (p === undefined ? '' : p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));
  const [text, setText] = useState(show(value));
  useEffect(() => {
    // Follow outside changes (load, reset) without fighting the merchant's typing.
    setText((t) => (toPaiseOrUndefined(t) === value ? t : show(value)));
  }, [value]);
  return (
    <div className="flex items-center rounded-lg border border-ink-line bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <span className="pl-3 text-ink-3">₹</span>
      <input
        className="w-full rounded-lg bg-transparent px-2 py-2 text-sm outline-none"
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const p = toPaiseOrUndefined(e.target.value);
          if (p !== null) onChange(p);
        }}
      />
    </div>
  );
}

/** "" -> undefined, "199.5" -> 19950, junk -> null */
function toPaiseOrUndefined(t: string): number | undefined | null {
  const s = t.trim();
  if (!s) return undefined;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  return Number(w) * 100 + Number(f.padEnd(2, '0'));
}

export function NumberInput({ value, onChange, min = 0, placeholder, label }: { value: number | undefined; onChange: (n: number | undefined) => void; min?: number; placeholder?: string; label?: string }) {
  return (
    <input
      className="input"
      type="number"
      min={min}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(min, Number(e.target.value)))}
    />
  );
}

export function Radio<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string, string?]> }) {
  return (
    <div className="space-y-2">
      {options.map(([v, label, hint]) => (
        <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${value === v ? 'border-brand-500 bg-brand-50' : 'border-ink-line'}`}>
          <input type="radio" className="mt-1 accent-brand-600" checked={value === v} onChange={() => onChange(v)} />
          <span>
            <span className="block text-sm font-medium">{label}</span>
            {hint && <span className="text-xs text-ink-3">{hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
