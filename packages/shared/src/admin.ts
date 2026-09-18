import { z } from 'zod';
import { REMOVAL_STATUSES } from './enums.js';

/**
 * Устгуулах хүсэлтийн шийдвэр:
 * - `hide` — зургийг нуух (эргүүлж болно, embedding шууд устана)
 * - `delete` — бүрмөсөн устгах (файл, embedding). Санхүүгийн бүртгэл үлдэнэ
 * - `reject` — хүсэлтийг хүлээж авахгүй
 */
export const REMOVAL_RESOLUTIONS = ['hide', 'delete', 'reject'] as const;
export type RemovalResolution = (typeof REMOVAL_RESOLUTIONS)[number];

/** Эргэлт буцалтгүй үйлдэлд админ TOTP кодоо дахин оруулна (2FA асаалттай үед) */
const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/)
  .optional();

export const resolveRemovalSchema = z.object({
  action: z.enum(REMOVAL_RESOLUTIONS),
  note: z.string().trim().max(500).optional(),
  totpCode,
});
export type ResolveRemovalInput = z.output<typeof resolveRemovalSchema>;

export const removalListQuerySchema = z.object({
  status: z.enum(REMOVAL_STATUSES).optional(),
  cursor: z.uuid().optional(),
});

export const hidePhotoSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export const deletePhotoSchema = z.object({
  reason: z.string().trim().min(3).max(200),
  totpCode,
});
