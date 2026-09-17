import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  email,
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/)
    .optional(),
});
export type RegisterInput = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.output<typeof loginSchema>;

export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
});

export const mfaVerifySchema = z.union([
  z.object({ code: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ recoveryCode: z.string().trim().min(10).max(20) }),
]);
export type MfaVerifyInput = z.output<typeof mfaVerifySchema>;

export const passwordResetRequestSchema = z.object({ email });
export type PasswordResetRequestInput = z.output<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  password: registerSchema.shape.password,
});
export type PasswordResetConfirmInput = z.output<typeof passwordResetConfirmSchema>;
