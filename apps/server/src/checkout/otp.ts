import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, type CheckoutSession, type Customer, type PrismaClient } from '@prisma/client';
import type { Deps } from '../context.js';
import { pepperedHash, randomToken, safeEqual, sha256Hex } from '../lib/crypto.js';
import { HttpError, badRequest } from '../lib/errors.js';

/** WhatsApp OTP and remembered devices (design rule 4: a phone number alone reveals nothing). */
export const OTP = {
  ttlMs: 5 * 60_000,
  maxAttempts: 5,
  resendAfterMs: 30_000,
  perPhone10Min: 3,
  perPhoneDay: 10,
  perIpHour: 20,
  deviceDays: 60,
} as const;

const tooMany = (message: string) => new HttpError(429, 'too_many', message);

export function phoneHash(deps: Pick<Deps, 'env'>, storeId: string, phone: string): string {
  return pepperedHash(deps.env.HASH_PEPPER, `phone:${storeId}:${phone}`);
}

const codeHash = (deps: Pick<Deps, 'env'>, challengeId: string, code: string) => pepperedHash(deps.env.HASH_PEPPER, `otp:${challengeId}:${code}`);

export async function sendOtp(deps: Deps, storeId: string, phone: string, ip: string | undefined): Promise<{ challengeId: string; resendInMs: number }> {
  const { prisma } = deps;
  const ph = phoneHash(deps, storeId, phone);
  const now = Date.now();
  const [last10, lastDay, ipHour, latest] = await Promise.all([
    prisma.otpChallenge.count({ where: { storeId, phoneHash: ph, createdAt: { gt: new Date(now - 10 * 60_000) } } }),
    prisma.otpChallenge.count({ where: { storeId, phoneHash: ph, createdAt: { gt: new Date(now - 86_400_000) } } }),
    ip ? prisma.otpChallenge.count({ where: { ip, createdAt: { gt: new Date(now - 3_600_000) } } }) : Promise.resolve(0),
    prisma.otpChallenge.findFirst({ where: { storeId, phoneHash: ph }, orderBy: { createdAt: 'desc' } }),
  ]);
  if (latest && now - latest.createdAt.getTime() < OTP.resendAfterMs) {
    throw tooMany(`Please wait ${Math.ceil((OTP.resendAfterMs - (now - latest.createdAt.getTime())) / 1000)} seconds before asking for a new code.`);
  }
  if (last10 >= OTP.perPhone10Min || lastDay >= OTP.perPhoneDay) throw tooMany('Too many codes sent to this number. Please try again later.');
  if (ipHour >= OTP.perIpHour) throw tooMany('Too many attempts. Please try again later.');

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpChallenge.create({
    data: { id, storeId, phoneHash: ph, codeHash: codeHash(deps, id, code), channel: deps.otp.channel, ip, expiresAt: new Date(now + OTP.ttlMs) },
  });
  try {
    await deps.otp.send(phone, code);
  } catch (err) {
    await prisma.otpChallenge.update({ where: { id }, data: { status: 'FAILED' } });
    throw new HttpError(502, 'otp_send_failed', 'Could not send the code on WhatsApp. Please check the number and try again.', { cause: err });
  }
  return { challengeId: id, resendInMs: OTP.resendAfterMs };
}

/** Checks the code; on success returns the customer and a new device token (shown once, stored hashed). */
export async function verifyOtp(
  deps: Deps,
  storeId: string,
  input: { challengeId: string; phone: string; code: string; userAgent?: string },
): Promise<{ customer: Customer; deviceToken: string }> {
  const { prisma } = deps;
  const wrong = badRequest('The code is not correct.', 'otp_wrong');
  const challenge = await prisma.otpChallenge.findFirst({
    where: { id: input.challengeId, storeId, phoneHash: phoneHash(deps, storeId, input.phone) },
  });
  if (!challenge) throw wrong;
  if (challenge.status !== 'SENT') throw badRequest('This code is no longer valid. Ask for a new one.', 'otp_used');
  if (challenge.expiresAt.getTime() < Date.now()) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: 'EXPIRED' } });
    throw badRequest('The code has expired. Ask for a new one.', 'otp_expired');
  }
  // Count the attempt first (atomically), so parallel guesses cannot pass the limit.
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, status: 'SENT', attempts: { lt: OTP.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw badRequest('Too many wrong codes. Ask for a new one.', 'otp_locked');
  if (!/^\d{6}$/.test(input.code) || !safeEqual(codeHash(deps, challenge.id, input.code), challenge.codeHash)) {
    if (challenge.attempts + 1 >= OTP.maxAttempts) await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: 'FAILED' } });
    throw wrong;
  }
  const used = await prisma.otpChallenge.updateMany({ where: { id: challenge.id, status: 'SENT' }, data: { status: 'VERIFIED' } });
  if (used.count === 0) throw badRequest('This code is no longer valid. Ask for a new one.', 'otp_used');

  const customer = await prisma.customer.upsert({
    where: { storeId_phone: { storeId, phone: input.phone } },
    create: { storeId, phone: input.phone },
    update: {},
  });
  const deviceToken = randomToken(32);
  await prisma.customerDevice.create({
    data: {
      customerId: customer.id,
      tokenHash: sha256Hex(deviceToken),
      userAgent: input.userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + OTP.deviceDays * 86_400_000),
    },
  });
  return { customer, deviceToken };
}

/** The customer this browser proved (OTP) for this store, or null. */
export async function customerForDevice(prisma: PrismaClient, storeId: string, deviceToken: string | undefined): Promise<Customer | null> {
  if (!deviceToken || deviceToken.length < 20 || deviceToken.length > 100) return null;
  const device = await prisma.customerDevice.findUnique({ where: { tokenHash: sha256Hex(deviceToken) }, include: { customer: true } });
  if (!device || device.revokedAt || device.expiresAt.getTime() < Date.now() || device.customer.storeId !== storeId) return null;
  if (Date.now() - device.lastSeenAt.getTime() > 3_600_000) {
    await prisma.customerDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return device.customer;
}

/** "Not you?": forget this device and take the shopper off the session. */
export async function forgetDevice(prisma: PrismaClient, session: CheckoutSession, deviceToken: string | undefined): Promise<void> {
  if (deviceToken) {
    await prisma.customerDevice.updateMany({ where: { tokenHash: sha256Hex(deviceToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await prisma.checkoutSession.update({
    where: { id: session.id },
    data: { customerId: null, address: Prisma.DbNull, contactPhone: null, contactName: null, contactEmail: null, step: 'LOGIN' },
  });
}
