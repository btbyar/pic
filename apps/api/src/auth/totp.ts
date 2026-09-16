import { generateSecret, generateURI, verifySync } from 'otplib';

const PERIOD_SEC = 30;
/** Утасны цаг ±30 секунд зөрөхийг зөвшөөрнө */
const TOLERANCE_SEC = 30;

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, accountEmail: string): string {
  return generateURI({ issuer: 'Pic', label: accountEmail, secret });
}

export type TotpCheck = { ok: true; step: number } | { ok: false };

/**
 * TOTP код шалгана. `lastStep` нь өмнө амжилттай ашигласан time step —
 * ижил эсвэл түүнээс өмнөх step-ийн кодыг дахин хүлээж авахгүй (replay хамгаалалт).
 */
export function checkTotp(secret: string, code: string, lastStep: number | null, nowMs = Date.now()): TotpCheck {
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const epoch = Math.floor(nowMs / 1000);
  const result = verifySync({
    secret,
    token: code,
    epoch,
    period: PERIOD_SEC,
    epochTolerance: TOLERANCE_SEC,
    ...(lastStep !== null ? { afterTimeStep: lastStep } : {}),
  });
  if (!result.valid) return { ok: false };
  const step = Math.floor(epoch / PERIOD_SEC) + result.delta;
  if (lastStep !== null && step <= lastStep) return { ok: false };
  return { ok: true, step };
}
