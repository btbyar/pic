import { z } from 'zod';

export const PROFILE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Зурагчин өөрийн нийтийн профайлыг засна */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(PROFILE_SLUG_RE),
  city: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(1000).optional(),
});
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE_PX = 256;
