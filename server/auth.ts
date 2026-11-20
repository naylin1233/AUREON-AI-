import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const sessionCookieName = 'aureon_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

export function authIsConfigured() {
  return Boolean(process.env.AUREON_ADMIN_PASSWORD);
}

export function validateAuthConfiguration(host: string) {
  const password = process.env.AUREON_ADMIN_PASSWORD || '';
  const secret = process.env.AUREON_SESSION_SECRET || '';
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!password && !isLoopback) {
    throw new Error('Refusing to listen on a public interface without AUREON_ADMIN_PASSWORD.');
  }
  if (password && password.length < 12) {
    throw new Error('AUREON_ADMIN_PASSWORD must contain at least 12 characters.');
  }
  if (password && Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUREON_SESSION_SECRET must contain at least 32 bytes when login is enabled.');
  }
}

function signature(payload: string) {
  return createHmac('sha256', process.env.AUREON_SESSION_SECRET || 'local-development-only')
    .update(payload)
    .digest('base64url');
}

export function verifyAdminPassword(candidate: unknown) {
  const expected = Buffer.from(process.env.AUREON_ADMIN_PASSWORD || '', 'utf8');
  const supplied = Buffer.from(typeof candidate === 'string' ? candidate : '', 'utf8');
  if (!expected.length || supplied.length !== expected.length) return false;
  return timingSafeEqual(expected, supplied);
}

export function createSessionToken(now = Date.now()) {
  const payload = Buffer.from(String(Math.floor(now / 1000) + sessionLifetimeSeconds)).toString('base64url');
  return payload + '.' + signature(payload);
}

export function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !authIsConfigured()) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, suppliedSignature] = parts;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(suppliedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const expiry = Number(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isSafeInteger(expiry) && expiry > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

export function clearSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function adminSessionIsValid(req: Request) {
  return verifySessionToken(readCookie(req, sessionCookieName));
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  if (!authIsConfigured() || adminSessionIsValid(req)) return next();
  res.status(401).json({ error: 'Login required.' });
}
