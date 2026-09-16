import type { Request } from 'express';

export function clientIp(req: Request): string {
  // `trust proxy` тохируулсан үед Express reverse proxy-ийн X-Forwarded-For-оос зөв IP-г гаргана
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function userAgent(req: Request): string | undefined {
  return req.headers['user-agent']?.slice(0, 300);
}
