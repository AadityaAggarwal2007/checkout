'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

/** Login and signup share one form. After success: back to ?next=, else the store list. */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/stores';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/auth/${mode}`, { body: mode === 'signup' ? { name, email, password } : { email, password } });
      router.replace(safeNext);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  const other = mode === 'login' ? 'signup' : 'login';
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7">
        <div>
          <div className="mb-5 flex items-center gap-2 text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">⚡</span> Checkout
          </div>
          <h1 className="text-xl font-semibold">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
          <p className="text-[13px] text-ink-3">{mode === 'login' ? 'Welcome back.' : 'Set up your store in a few minutes.'}</p>
        </div>
        {mode === 'signup' && (
          <label className="block">
            <span className="label">Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="block">
          <span className="label">Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <p className="text-center text-[13px] text-ink-3">
          {mode === 'login' ? 'New here?' : 'Have an account?'}{' '}
          <Link className="font-medium text-brand-600" href={`/${other}${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </Link>
        </p>
      </form>
    </main>
  );
}
