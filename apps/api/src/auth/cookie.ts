import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'pic_session';

function baseOptions(secure: boolean): CookieOptions {
  // httpOnly: JS (XSS) токеныг уншиж чадахгүй. SameSite=Lax + Origin шалгалт = CSRF хамгаалалт.
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(secure), expires: expiresAt });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(secure));
}
