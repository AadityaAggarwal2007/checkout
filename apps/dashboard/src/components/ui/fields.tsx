'use client';
import type { ReactNode } from 'react';

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
