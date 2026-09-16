import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF-ийн хоёр дахь давхарга (SameSite=Lax cookie-ийн дээр): өөрчлөлт хийх хүсэлтэд
 * браузер илгээсэн Origin манай web-тэй таарах ёстой. Origin-гүй (curl, сервер→сервер) хүсэлтийг
 * cookie-гүй тул session-ээр ашиглах боломжгүй — нэвтрүүлнэ.
 */
export function originCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) return next();
    res.status(403).json({ statusCode: 403, code: 'origin_not_allowed' });
  };
}
