import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';

export default function Signup() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
