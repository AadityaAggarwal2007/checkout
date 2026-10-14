import { execSync } from 'node:child_process';

/** Applies the migrations to the test database once per run. */
export default function setup(): void {
  process.env.DATABASE_URL ??= 'postgresql://checkout:checkout@localhost:5432/checkout_test';
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
